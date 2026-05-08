import type {
  AiLayoutRequest,
  AiLayoutResponse,
  AiSourceContext,
} from '../../../shared/schemas/ai.schema';
import type {
  GeneratedScreen,
  ScreenJson,
  ScreenResponse,
} from '../../../shared/schemas/screen-history.schema';
import {
  type AppAction,
  type AppUiSchema,
  appUiSchemaSchema,
} from '../../../shared/schemas/ui-schema.schema';
import { config } from '../../config';
import { ValidationError } from '../../lib/errors';
import { layoutSystemContext } from '../ai/ai.provider';
import { checkpointMetadata } from './screen-history.conversation';
import { componentRegistryVersion, screenJsonAsGeneratedScreen } from './screen-history.mapper';
import type {
  PromptSessionRecord,
  ScreenHistoryRepository,
  ScreenJsonRecord,
} from './screen-history.repository';

export const editPromptTokenLimit = 24_000;

export type ScreenHistoryAiService = {
  generateLayout: (input: AiLayoutRequest) => Promise<AiLayoutResponse>;
};

export type ScreenHistoryContextReader = {
  getLayoutContext: () => Promise<AiSourceContext>;
};

export function providerMeta(): GeneratedScreen['providerMeta'] {
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

  if (config.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      model: config.ANTHROPIC_MODEL,
      componentRegistryVersion,
    };
  }

  if (config.GOOGLE_AI_API_KEY) {
    return {
      provider: 'google-ai',
      model: config.GOOGLE_AI_MODEL,
      componentRegistryVersion,
    };
  }

  return { provider: 'mock', componentRegistryVersion };
}

export function titleFromPrompt(prompt: string) {
  const compact = prompt.trim();
  if (compact.length <= 80) return compact;
  return `${compact.slice(0, 77)}...`;
}

export function estimateTokens(text: string) {
  return Math.ceil(text.length / 3);
}

export function buildEditPrompt(currentSchema: AppUiSchema, instruction: string) {
  const currentSchemaJson = JSON.stringify(currentSchema);
  const prompt = [
    layoutSystemContext,
    '',
    'Edit the existing App UI Schema below. Return the complete updated App UI Schema JSON only.',
    'Keep the current structure, data, navigation, and visual tone unless the latest instruction requires changing them.',
    'Do not use prior conversation history. Use only the catalog constraints, current minified schema JSON, and latest user instruction in this prompt.',
    '',
    'Current App UI Schema JSON (minified):',
    currentSchemaJson,
    '',
    'Latest user instruction:',
    instruction.trim(),
  ].join('\n');
  const estimatedTokens = estimateTokens(prompt);
  if (estimatedTokens > editPromptTokenLimit) {
    throw new ValidationError('Edit prompt exceeds the 24k token budget', {
      estimatedTokens,
      maxTokens: editPromptTokenLimit,
    });
  }
  return prompt;
}

export async function contextSnapshot(
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

export function promptForAction(
  parent: ScreenJson | GeneratedScreen,
  action: AppAction,
  overridePrompt?: string
) {
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

export async function nextVersionAfter(
  repo: ScreenHistoryRepository,
  userId: string,
  sessionId: string,
  version?: number
) {
  if (version) {
    await repo.deleteMessagesAfterVersion(sessionId, version);
    await repo.deleteScreenJsonsAfterVersion(sessionId, version);
    return version + 1;
  }
  const rows = await repo.listSessionScreenJsons(userId, sessionId);
  return Math.max(0, ...rows.map((row) => row.screenJson.version)) + 1;
}

export async function saveScreenJson(
  repo: ScreenHistoryRepository,
  layoutService: ScreenHistoryAiService,
  params: {
    action?: AppAction | null;
    assistantContent: (screenJson: ScreenJsonRecord) => string;
    layoutPrompt: string;
    providerContext?: AiSourceContext;
    session?: PromptSessionRecord;
    sessionId: string;
    snapshot: any;
    storedPrompt: string;
    trigger: ScreenJson['trigger'];
    userContent: string;
    version: number;
  }
): Promise<ScreenResponse> {
  const {
    action,
    assistantContent,
    layoutPrompt,
    providerContext,
    session,
    sessionId,
    snapshot,
    storedPrompt,
    trigger,
    userContent,
    version,
  } = params;

  const generated = await layoutService.generateLayout({
    context: providerContext,
    prompt: layoutPrompt,
  });
  const screenJson = await repo.createScreenJson({
    action: action ? { ...action } : null,
    contextSnapshot: snapshot,
    inferredIntent: generated.schema.intent,
    prompt: storedPrompt,
    providerMeta: providerMeta(),
    schema: generated.schema,
    sessionId,
    trigger,
    version,
  });

  await repo.updateSessionActiveScreenJson(sessionId, screenJson.id);
  await repo.createMessages([
    {
      content: userContent,
      metadata: {},
      role: 'user',
      screenJsonId: screenJson.id,
      sessionId,
    },
    {
      content: assistantContent(screenJson),
      metadata: checkpointMetadata(screenJson),
      role: 'assistant',
      screenJsonId: screenJson.id,
      sessionId,
    },
  ]);

  return {
    screen: screenJsonAsGeneratedScreen(screenJson, session),
    activities: generated.activities,
  };
}

export async function saveSchemaScreenJson(
  repo: ScreenHistoryRepository,
  params: {
    assistantContent: (screenJson: ScreenJsonRecord) => string;
    current: ScreenJson;
    prompt: string;
    schema: AppUiSchema;
    session?: PromptSessionRecord;
    sessionId: string;
    userContent: string;
    userId: string;
  }
): Promise<ScreenResponse> {
  const { assistantContent, current, prompt, schema, session, sessionId, userContent, userId } =
    params;

  const parsedSchema = appUiSchemaSchema.parse(schema);
  const version = await nextVersionAfter(repo, userId, sessionId, current.version);
  const screenJson = await repo.createScreenJson({
    action: current.action ?? null,
    contextSnapshot: {
      ...current.contextSnapshot,
      previousScreen: current.schema,
    },
    dataBindings: current.dataBindings,
    databaseSchemaJsonId: current.databaseSchemaJsonId,
    inferredIntent: parsedSchema.intent,
    prompt,
    providerMeta: current.providerMeta,
    schema: parsedSchema,
    sessionId,
    trigger: 'chat-edit',
    version,
  });

  await repo.updateSessionActiveScreenJson(sessionId, screenJson.id);
  await repo.createMessages([
    {
      content: userContent,
      metadata: {},
      role: 'user',
      screenJsonId: screenJson.id,
      sessionId,
    },
    {
      content: assistantContent(screenJson),
      metadata: checkpointMetadata(screenJson),
      role: 'assistant',
      screenJsonId: screenJson.id,
      sessionId,
    },
  ]);

  return {
    screen: screenJsonAsGeneratedScreen(screenJson, session),
    activities: [],
  };
}
