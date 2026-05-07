import type {
  AiActivity,
  AiLayoutRequest,
  AiLayoutResponse,
  AiSourceContext,
} from '../../../shared/schemas/ai.schema';
import type {
  GeneratedScreen,
  GeneratedScreenSummary,
  ScreenActionGenerateRequest,
  ScreenGenerateRequest,
  ScreenRegenerateRequest,
  ScreenResponse,
} from '../../../shared/schemas/screen-history.schema';
import type { AppAction, AppUiSchema } from '../../../shared/schemas/ui-schema.schema';
import { appUiSchemaSchema } from '../../../shared/schemas/ui-schema.schema';
import { config } from '../../config';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { layoutSystemContextVersion } from '../ai/ai.provider';
import { aiService, createDefaultAiLayoutContextReader } from '../ai/ai.service';
import {
  type GeneratedScreenRecord,
  type GeneratedScreenWithSessionRecord,
  type ScreenHistoryRepository,
  screenHistoryRepository,
} from './screen-history.repository';

const componentRegistryVersion = `component-registry-v2:${layoutSystemContextVersion}`;

type ScreenHistoryAiService = {
  generateLayout: (input: AiLayoutRequest) => Promise<AiLayoutResponse>;
};

type ScreenHistoryContextReader = {
  getLayoutContext: () => Promise<AiSourceContext>;
};

function providerMeta(): GeneratedScreen['providerMeta'] {
  if (
    config.AZURE_OPENAI_API_KEY &&
    config.AZURE_OPENAI_ENDPOINT &&
    config.AZURE_OPENAI_DEPLOYMENT_NAME
  ) {
    return {
      provider: 'azure-openai',
      model: config.AZURE_OPENAI_DEPLOYMENT_NAME,
      componentRegistryVersion,
    };
  }

  if (config.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      model: config.OPENAI_MODEL,
      componentRegistryVersion,
    };
  }

  return { provider: 'mock', componentRegistryVersion };
}

function dateIso(value: Date) {
  return value.toISOString();
}

function titleFromPrompt(prompt: string) {
  const compact = prompt.trim();
  if (compact.length <= 80) return compact;
  return `${compact.slice(0, 77)}...`;
}

function mapScreen(row: GeneratedScreenRecord): GeneratedScreen {
  return {
    id: row.id,
    sessionId: row.sessionId,
    parentScreenId: row.parentScreenId,
    trigger: row.trigger as GeneratedScreen['trigger'],
    prompt: row.prompt,
    inferredIntent: row.inferredIntent,
    action: row.action ?? null,
    schema: appUiSchemaSchema.parse(row.schema),
    contextSnapshot: row.contextSnapshot,
    providerMeta: row.providerMeta,
    createdAt: dateIso(row.createdAt),
    updatedAt: dateIso(row.updatedAt),
  };
}

function mapSummary(row: GeneratedScreenWithSessionRecord): GeneratedScreenSummary {
  const screen = mapScreen(row.screen);
  return {
    id: screen.id,
    sessionId: screen.sessionId,
    parentScreenId: screen.parentScreenId,
    trigger: screen.trigger,
    prompt: screen.prompt,
    inferredIntent: screen.inferredIntent,
    action: screen.action,
    page: screen.schema.page,
    sessionTitle: row.session.title,
    sections: screen.schema.sections.length,
    createdAt: screen.createdAt,
    updatedAt: screen.updatedAt,
  };
}

function findAction(schema: AppUiSchema, actionId: string): AppAction {
  for (const section of schema.sections) {
    const found = section.actions?.find((action) => action.id === actionId);
    if (found) return found;
  }

  throw new NotFoundError('Screen action not found');
}

function promptForAction(parent: GeneratedScreen, action: AppAction, overridePrompt?: string) {
  if (overridePrompt) return overridePrompt;

  return [
    'Generate the next screen expected after the user clicked an action in an AI-generated UI.',
    '',
    `Original prompt: ${parent.prompt}`,
    `Current screen page: ${parent.schema.page}`,
    `Current screen intent: ${parent.schema.intent}`,
    `Clicked action label: ${action.label}`,
    action.intentHint ? `Action intent hint: ${action.intentHint}` : null,
    action.target ? `Action target: ${action.target}` : null,
    '',
    'Infer what the user expects next and return a new App UI Schema for that next screen.',
    'Preserve useful navigation, visual tone, and source context when appropriate.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function contextSnapshot(
  reader: ScreenHistoryContextReader | undefined,
  previousScreen?: AppUiSchema
) {
  const context = await reader?.getLayoutContext().catch(() => undefined);
  return {
    providerContext: context,
    snapshot: {
      ...(context ?? {}),
      ...(previousScreen ? { previousScreen } : {}),
    },
  };
}

export function createScreenHistoryService(
  repo: ScreenHistoryRepository,
  layoutService: ScreenHistoryAiService,
  contextReader?: ScreenHistoryContextReader
) {
  const saveGeneratedScreen = async ({
    action,
    parentScreenId,
    prompt,
    providerContext,
    sessionId,
    snapshot,
    trigger,
  }: {
    action?: AppAction | null;
    parentScreenId?: string | null;
    prompt: string;
    providerContext?: AiSourceContext;
    sessionId: string;
    snapshot: Awaited<ReturnType<typeof contextSnapshot>>['snapshot'];
    trigger: GeneratedScreen['trigger'];
  }): Promise<ScreenResponse> => {
    const generated = await layoutService.generateLayout({ context: providerContext, prompt });
    const screen = await repo.createScreen({
      action: action ? { ...action } : null,
      contextSnapshot: snapshot,
      inferredIntent: generated.schema.intent,
      parentScreenId,
      prompt,
      providerMeta: providerMeta(),
      schema: generated.schema,
      sessionId,
      trigger,
    });

    return {
      screen: mapScreen(screen),
      activities: generated.activities,
    };
  };

  return {
    children: async (userId: string, screenId: string) => ({
      screens: (await repo.listChildren(userId, screenId)).map(mapSummary),
    }),
    delete: async (userId: string, screenId: string) => {
      await repo.deleteScreen(userId, screenId);
      return { success: true };
    },
    generate: async (userId: string, input: ScreenGenerateRequest): Promise<ScreenResponse> => {
      const session = await repo.createSession({
        createdBy: userId,
        title: input.title ?? titleFromPrompt(input.prompt),
      });
      const context = await contextSnapshot(contextReader);
      return saveGeneratedScreen({
        prompt: input.prompt,
        providerContext: context.providerContext,
        sessionId: session.id,
        snapshot: context.snapshot,
        trigger: 'initial-prompt',
      });
    },
    generateFromAction: async (
      userId: string,
      screenId: string,
      actionId: string,
      input: ScreenActionGenerateRequest
    ): Promise<ScreenResponse> => {
      const parentRow = await repo.findScreenById(userId, screenId);
      if (!parentRow) throw new NotFoundError('Generated screen not found');

      const parent = mapScreen(parentRow.screen);
      const action = findAction(parent.schema, actionId);
      if (action.kind !== 'generate-screen') {
        throw new ValidationError('Action does not generate a screen');
      }

      const context = await contextSnapshot(contextReader, parent.schema);
      return saveGeneratedScreen({
        action,
        parentScreenId: parent.id,
        prompt: promptForAction(parent, action, input.prompt),
        providerContext: context.providerContext,
        sessionId: parent.sessionId,
        snapshot: context.snapshot,
        trigger: 'action-click',
      });
    },
    get: async (userId: string, screenId: string): Promise<ScreenResponse> => {
      const row = await repo.findScreenById(userId, screenId);
      if (!row) throw new NotFoundError('Generated screen not found');
      return { screen: mapScreen(row.screen), activities: [] as AiActivity[] };
    },
    list: async (userId: string) => ({
      screens: (await repo.listScreens(userId)).map(mapSummary),
    }),
    regenerate: async (
      userId: string,
      screenId: string,
      input: ScreenRegenerateRequest
    ): Promise<ScreenResponse> => {
      const currentRow = await repo.findScreenById(userId, screenId);
      if (!currentRow) throw new NotFoundError('Generated screen not found');

      const current = mapScreen(currentRow.screen);
      const context = await contextSnapshot(contextReader, current.schema);
      return saveGeneratedScreen({
        action: current.action ?? null,
        parentScreenId: current.parentScreenId ?? current.id,
        prompt: input.prompt ?? current.prompt,
        providerContext: context.providerContext,
        sessionId: current.sessionId,
        snapshot: context.snapshot,
        trigger: 'regenerate',
      });
    },
  };
}

export const screenHistoryService = createScreenHistoryService(
  screenHistoryRepository,
  aiService,
  createDefaultAiLayoutContextReader()
);
