import type {
  AiActivity,
  AiLayoutRequest,
  AiLayoutResponse,
  AiSourceContext,
} from '../../../shared/schemas/ai.schema';
import type {
  GeneratedScreen,
  GeneratedScreenSummary,
  PromptSession,
  PromptSessionMessage,
  PromptSessionSummary,
  ScreenActionGenerateRequest,
  ScreenCheckpointRestoreResponse,
  ScreenConversationResponse,
  ScreenEditRequest,
  ScreenGenerateRequest,
  ScreenJson,
  ScreenJsonResponse,
  ScreenListQuery,
  ScreenRegenerateRequest,
  ScreenResponse,
} from '../../../shared/schemas/screen-history.schema';
import type { AppAction, AppUiSchema } from '../../../shared/schemas/ui-schema.schema';
import { appUiSchemaSchema } from '../../../shared/schemas/ui-schema.schema';
import { config } from '../../config';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { layoutSystemContext, layoutSystemContextVersion } from '../ai/ai.provider';
import { aiService, createDefaultAiLayoutContextReader } from '../ai/ai.service';
import {
  type GeneratedScreenRecord,
  type GeneratedScreenWithSessionRecord,
  type PromptSessionMessageRecord,
  type PromptSessionRecord,
  type ScreenHistoryRepository,
  type ScreenJsonRecord,
  type ScreenJsonWithSessionRecord,
  screenHistoryRepository,
} from './screen-history.repository';

const componentRegistryVersion = `component-registry-v2:${layoutSystemContextVersion}`;
const checkpointLabel = 'このバージョンへ戻る';
const editPromptTokenLimit = 24_000;

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

function mapSession(row: PromptSessionRecord): PromptSession {
  return {
    id: row.id,
    title: row.title,
    createdBy: row.createdBy,
    activeScreenJsonId: row.activeScreenJsonId ?? null,
    createdAt: dateIso(row.createdAt),
    updatedAt: dateIso(row.updatedAt),
  };
}

function mapLegacyScreen(row: GeneratedScreenRecord): GeneratedScreen {
  return {
    id: row.id,
    sessionId: row.sessionId,
    parentScreenId: row.parentScreenId,
    version: 1,
    trigger: row.trigger as GeneratedScreen['trigger'],
    prompt: row.prompt,
    inferredIntent: row.inferredIntent,
    action: row.action ?? null,
    schema: appUiSchemaSchema.parse(row.schema),
    databaseSchemaJsonId: null,
    dataBindings: [],
    contextSnapshot: row.contextSnapshot,
    providerMeta: row.providerMeta,
    createdAt: dateIso(row.createdAt),
    updatedAt: dateIso(row.updatedAt),
  };
}

function mapScreenJson(row: ScreenJsonRecord): ScreenJson {
  return {
    id: row.id,
    sessionId: row.sessionId,
    version: row.version,
    trigger: row.trigger as ScreenJson['trigger'],
    prompt: row.prompt,
    inferredIntent: row.inferredIntent,
    action: row.action ?? null,
    schema: appUiSchemaSchema.parse(row.schema),
    databaseSchemaJsonId: row.databaseSchemaJsonId ?? null,
    dataBindings: row.dataBindings ?? [],
    contextSnapshot: row.contextSnapshot,
    providerMeta: row.providerMeta,
    createdAt: dateIso(row.createdAt),
    updatedAt: dateIso(row.updatedAt),
  };
}

function screenJsonAsGeneratedScreen(row: ScreenJsonRecord): GeneratedScreen {
  const screenJson = mapScreenJson(row);
  return {
    ...screenJson,
    parentScreenId: null,
  };
}

function mapMessage(row: PromptSessionMessageRecord): PromptSessionMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    screenJsonId: row.screenJsonId,
    role: row.role as PromptSessionMessage['role'],
    content: row.content,
    metadata: row.metadata ?? {},
    createdAt: dateIso(row.createdAt),
    updatedAt: dateIso(row.updatedAt),
  };
}

function checkpointMetadata(screenJson: ScreenJsonRecord): PromptSessionMessage['metadata'] {
  return {
    checkpointScreenJsonId: screenJson.id,
    checkpointLabel,
    generatedPage: appUiSchemaSchema.parse(screenJson.schema).page,
    version: screenJson.version,
    trigger: screenJson.trigger as ScreenJson['trigger'],
  };
}

function mapScreenJsonSummary(row: ScreenJsonWithSessionRecord): GeneratedScreenSummary {
  const screenJson = mapScreenJson(row.screenJson);
  return {
    id: screenJson.id,
    sessionId: screenJson.sessionId,
    parentScreenId: null,
    version: screenJson.version,
    trigger: screenJson.trigger,
    prompt: screenJson.prompt,
    inferredIntent: screenJson.inferredIntent,
    action: screenJson.action,
    page: screenJson.schema.page,
    sessionTitle: row.session.title,
    activeScreenJsonId: row.session.activeScreenJsonId ?? null,
    sections: screenJson.schema.sections.length,
    createdAt: screenJson.createdAt,
    updatedAt: screenJson.updatedAt,
  };
}

function mapLegacySummary(row: GeneratedScreenWithSessionRecord): GeneratedScreenSummary {
  const screen = mapLegacyScreen(row.screen);
  return {
    id: screen.id,
    sessionId: screen.sessionId,
    parentScreenId: screen.parentScreenId,
    version: screen.version,
    trigger: screen.trigger,
    prompt: screen.prompt,
    inferredIntent: screen.inferredIntent,
    action: screen.action,
    page: screen.schema.page,
    sessionTitle: row.session.title,
    activeScreenJsonId: row.session.activeScreenJsonId ?? null,
    sections: screen.schema.sections.length,
    createdAt: screen.createdAt,
    updatedAt: screen.updatedAt,
  };
}

function summarizeSessions(
  rows: ScreenJsonWithSessionRecord[],
  messageStats = new Map<string, { count: number; searchText: string | null }>()
): PromptSessionSummary[] {
  const grouped = new Map<string, ScreenJsonWithSessionRecord[]>();
  for (const row of rows) {
    grouped.set(row.session.id, [...(grouped.get(row.session.id) ?? []), row]);
  }

  return Array.from(grouped.values())
    .map((sessionRows) => {
      const sorted = [...sessionRows].sort((a, b) => a.screenJson.version - b.screenJson.version);
      const session = sorted[0]?.session;
      if (!session) return null;
      const active =
        sorted.find((row) => row.screenJson.id === session.activeScreenJsonId) ??
        sorted.at(-1) ??
        null;
      const activeScreenJson = active ? mapScreenJson(active.screenJson) : null;
      const latestUpdatedAt = sorted.reduce(
        (latest, row) => (row.screenJson.updatedAt > latest ? row.screenJson.updatedAt : latest),
        session.updatedAt
      );
      const sessionMessageStats = messageStats.get(session.id);

      return {
        id: session.id,
        title: session.title,
        activeScreenJsonId: activeScreenJson?.id ?? null,
        activeVersion: activeScreenJson?.version ?? null,
        page: activeScreenJson?.schema.page ?? null,
        prompt: activeScreenJson?.prompt ?? null,
        inferredIntent: activeScreenJson?.inferredIntent ?? null,
        screenCount: sorted.length,
        messageCount: sessionMessageStats?.count ?? 0,
        messageSearchText: sessionMessageStats?.searchText ?? null,
        createdAt: dateIso(session.createdAt),
        updatedAt: dateIso(latestUpdatedAt),
      };
    })
    .filter((summary): summary is PromptSessionSummary => Boolean(summary))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function findAction(schema: AppUiSchema, actionId: string): AppAction {
  for (const section of schema.sections) {
    const found = section.actions?.find((action) => action.id === actionId);
    if (found) return found;
  }

  throw new NotFoundError('Screen action not found');
}

function promptForAction(
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

function estimateTokens(text: string) {
  return Math.ceil(text.length / 3);
}

function buildEditPrompt(currentSchema: AppUiSchema, instruction: string) {
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

function fallbackMessages(screenJsons: ScreenJson[]): PromptSessionMessage[] {
  return screenJsons.flatMap((screenJson) => {
    const createdAt = screenJson.createdAt;
    return [
      {
        id: `00000000-0000-4000-8000-${screenJson.version.toString().padStart(12, '0')}`,
        sessionId: screenJson.sessionId,
        screenJsonId: screenJson.id,
        role: 'user' as const,
        content: screenJson.prompt,
        metadata: {},
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: `00000000-0000-4000-8001-${screenJson.version.toString().padStart(12, '0')}`,
        sessionId: screenJson.sessionId,
        screenJsonId: screenJson.id,
        role: 'assistant' as const,
        content: `${screenJson.schema.page} を保存しました。`,
        metadata: {
          checkpointScreenJsonId: screenJson.id,
          checkpointLabel,
          generatedPage: screenJson.schema.page,
          version: screenJson.version,
          trigger: screenJson.trigger,
        },
        createdAt,
        updatedAt: createdAt,
      },
    ];
  });
}

function messagesWithFallbacks(
  screenJsons: ScreenJson[],
  storedMessages: PromptSessionMessage[]
): PromptSessionMessage[] {
  const messagesByScreenJsonId = new Map<string, PromptSessionMessage[]>();
  for (const message of storedMessages) {
    messagesByScreenJsonId.set(message.screenJsonId, [
      ...(messagesByScreenJsonId.get(message.screenJsonId) ?? []),
      message,
    ]);
  }

  return screenJsons.flatMap((screenJson) => {
    const messages = messagesByScreenJsonId.get(screenJson.id);
    return messages && messages.length > 0 ? messages : fallbackMessages([screenJson]);
  });
}

export function createScreenHistoryService(
  repo: ScreenHistoryRepository,
  layoutService: ScreenHistoryAiService,
  contextReader?: ScreenHistoryContextReader
) {
  const sessionConversation = async (
    userId: string,
    sessionId: string
  ): Promise<ScreenConversationResponse> => {
    const session = await repo.findSessionById(userId, sessionId);
    if (!session) throw new NotFoundError('Prompt session not found');

    const rows = await repo.listSessionScreenJsons(userId, sessionId);
    const screenJsons = rows.map((row) => mapScreenJson(row.screenJson));
    const active =
      screenJsons.find((screenJson) => screenJson.id === session.activeScreenJsonId) ??
      screenJsons.at(-1) ??
      null;
    const storedMessages = (await repo.listSessionMessages(userId, sessionId)).map(mapMessage);

    return {
      session: mapSession({ ...session, activeScreenJsonId: active?.id ?? null }),
      activeScreenJsonId: active?.id ?? null,
      activeVersion: active?.version ?? null,
      screenJsons,
      messages: messagesWithFallbacks(screenJsons, storedMessages),
    };
  };

  const saveScreenJson = async ({
    action,
    assistantContent,
    layoutPrompt,
    providerContext,
    sessionId,
    snapshot,
    storedPrompt,
    trigger,
    userContent,
    version,
  }: {
    action?: AppAction | null;
    assistantContent: (screenJson: ScreenJsonRecord) => string;
    layoutPrompt: string;
    providerContext?: AiSourceContext;
    sessionId: string;
    snapshot: Awaited<ReturnType<typeof contextSnapshot>>['snapshot'];
    storedPrompt: string;
    trigger: ScreenJson['trigger'];
    userContent: string;
    version: number;
  }): Promise<ScreenResponse> => {
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
      screen: screenJsonAsGeneratedScreen(screenJson),
      activities: generated.activities,
    };
  };

  const activeScreenJsonForSession = async (userId: string, sessionId: string) => {
    const conversation = await sessionConversation(userId, sessionId);
    const active = conversation.screenJsons.find(
      (screenJson) => screenJson.id === conversation.activeScreenJsonId
    );
    if (!active) throw new NotFoundError('Active ScreenJSON not found');
    return active;
  };

  const nextVersionAfter = async (userId: string, sessionId: string, version?: number) => {
    if (version) {
      await repo.deleteMessagesAfterVersion(sessionId, version);
      await repo.deleteScreenJsonsAfterVersion(sessionId, version);
      return version + 1;
    }
    const rows = await repo.listSessionScreenJsons(userId, sessionId);
    return Math.max(0, ...rows.map((row) => row.screenJson.version)) + 1;
  };

  const getScreenJsonOrLegacy = async (userId: string, screenId: string) => {
    const screenJsonRow = await repo.findScreenJsonById(userId, screenId);
    if (screenJsonRow) {
      return {
        kind: 'screen-json' as const,
        row: screenJsonRow,
        screen: screenJsonAsGeneratedScreen(screenJsonRow.screenJson),
      };
    }

    const legacyRow = await repo.findLegacyScreenById(userId, screenId);
    if (!legacyRow) throw new NotFoundError('Generated screen not found');
    return {
      kind: 'legacy' as const,
      row: legacyRow,
      screen: mapLegacyScreen(legacyRow.screen),
    };
  };

  return {
    children: async (userId: string, screenId: string) => {
      const screenJsonRow = await repo.findScreenJsonById(userId, screenId);
      if (screenJsonRow) return { screens: [] };
      return {
        screens: (await repo.listLegacyChildren(userId, screenId)).map(mapLegacySummary),
      };
    },
    conversation: sessionConversation,
    delete: async (userId: string, screenId: string) => {
      const screenJsonRow = await repo.findScreenJsonById(userId, screenId);
      if (!screenJsonRow) {
        await repo.deleteLegacyScreen(userId, screenId);
        return { success: true };
      }

      await repo.deleteScreenJson(userId, screenId);
      const remaining = await repo.listSessionScreenJsons(userId, screenJsonRow.session.id);
      await repo.updateSessionActiveScreenJson(
        screenJsonRow.session.id,
        remaining.at(-1)?.screenJson.id ?? null
      );
      return { success: true };
    },
    edit: async (
      userId: string,
      sessionId: string,
      input: ScreenEditRequest
    ): Promise<ScreenResponse> => {
      const current = await activeScreenJsonForSession(userId, sessionId);
      const editPrompt = buildEditPrompt(current.schema, input.prompt);
      const version = await nextVersionAfter(userId, sessionId, current.version);
      return saveScreenJson({
        action: current.action ?? null,
        assistantContent: (screenJson) =>
          `${appUiSchemaSchema.parse(screenJson.schema).page} を更新しました。`,
        layoutPrompt: editPrompt,
        sessionId,
        snapshot: { previousScreen: current.schema },
        storedPrompt: input.prompt,
        trigger: 'chat-edit',
        userContent: input.prompt,
        version,
      });
    },
    generate: async (userId: string, input: ScreenGenerateRequest): Promise<ScreenResponse> => {
      const session = await repo.createSession({
        activeScreenJsonId: null,
        createdBy: userId,
        title: input.title ?? titleFromPrompt(input.prompt),
      });
      const context = await contextSnapshot(contextReader);
      return saveScreenJson({
        assistantContent: (screenJson) =>
          `${appUiSchemaSchema.parse(screenJson.schema).page} を保存しました。${
            appUiSchemaSchema.parse(screenJson.schema).sections.length
          } sections`,
        layoutPrompt: input.prompt,
        providerContext: context.providerContext,
        sessionId: session.id,
        snapshot: context.snapshot,
        storedPrompt: input.prompt,
        trigger: 'initial-prompt',
        userContent: input.prompt,
        version: 1,
      });
    },
    generateFromAction: async (
      userId: string,
      screenId: string,
      actionId: string,
      input: ScreenActionGenerateRequest
    ): Promise<ScreenResponse> => {
      const current = await getScreenJsonOrLegacy(userId, screenId);
      const action = findAction(current.screen.schema, actionId);
      if (action.kind !== 'generate-screen') {
        throw new ValidationError('Action does not generate a screen');
      }

      const context = await contextSnapshot(contextReader, current.screen.schema);
      const version =
        current.kind === 'screen-json'
          ? await nextVersionAfter(userId, current.screen.sessionId, current.screen.version)
          : await nextVersionAfter(userId, current.screen.sessionId);
      return saveScreenJson({
        action,
        assistantContent: (screenJson) =>
          `${appUiSchemaSchema.parse(screenJson.schema).page} を生成しました。`,
        layoutPrompt: promptForAction(current.screen, action, input.prompt),
        providerContext: context.providerContext,
        sessionId: current.screen.sessionId,
        snapshot: context.snapshot,
        storedPrompt: input.prompt ?? action.label,
        trigger: 'action-click',
        userContent: action.label,
        version,
      });
    },
    generateFromSessionAction: async (
      userId: string,
      sessionId: string,
      actionId: string,
      input: ScreenActionGenerateRequest
    ): Promise<ScreenResponse> => {
      const current = await activeScreenJsonForSession(userId, sessionId);
      const action = findAction(current.schema, actionId);
      if (action.kind !== 'generate-screen') {
        throw new ValidationError('Action does not generate a screen');
      }

      const context = await contextSnapshot(contextReader, current.schema);
      const version = await nextVersionAfter(userId, sessionId, current.version);
      return saveScreenJson({
        action,
        assistantContent: (screenJson) =>
          `${appUiSchemaSchema.parse(screenJson.schema).page} を生成しました。`,
        layoutPrompt: promptForAction(current, action, input.prompt),
        providerContext: context.providerContext,
        sessionId,
        snapshot: context.snapshot,
        storedPrompt: input.prompt ?? action.label,
        trigger: 'action-click',
        userContent: action.label,
        version,
      });
    },
    get: async (userId: string, screenId: string): Promise<ScreenResponse> => {
      const current = await getScreenJsonOrLegacy(userId, screenId);
      return { screen: current.screen, activities: [] as AiActivity[] };
    },
    list: async (userId: string, _query?: ScreenListQuery) => {
      const screenJsonRows = await repo.listScreenJsons(userId);
      const sessionIds = Array.from(new Set(screenJsonRows.map((row) => row.session.id)));
      const messageStatEntries = await Promise.all(
        sessionIds.map(
          async (
            sessionId
          ): Promise<readonly [string, { count: number; searchText: string | null }]> => {
            const messages = await repo.listSessionMessages(userId, sessionId);
            return [
              sessionId,
              {
                count: messages.length,
                searchText:
                  messages.length > 0
                    ? messages.map((message) => message.content).join('\n')
                    : null,
              },
            ];
          }
        )
      );
      const messageStats = new Map<string, { count: number; searchText: string | null }>(
        messageStatEntries
      );
      const screenJsonIds = new Set(screenJsonRows.map((row) => row.screenJson.id));
      const legacyRows = (await repo.listLegacyScreens(userId)).filter(
        (row) => !screenJsonIds.has(row.screen.id)
      );

      const sessions = summarizeSessions(screenJsonRows, messageStats);
      const screenSummaries = [
        ...screenJsonRows.map(mapScreenJsonSummary),
        ...legacyRows.map(mapLegacySummary),
      ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

      // Note: Real filtering and pagination should be done at the repository level.
      // For now, we return the total count based on the session list if available, otherwise screens.
      const total = sessions.length > 0 ? sessions.length : screenSummaries.length;

      return {
        screens: screenSummaries,
        sessions: sessions,
        total,
      };
    },
    regenerate: async (
      userId: string,
      screenId: string,
      input: ScreenRegenerateRequest
    ): Promise<ScreenResponse> => {
      const current = await getScreenJsonOrLegacy(userId, screenId);
      const context = await contextSnapshot(contextReader, current.screen.schema);
      const version =
        current.kind === 'screen-json'
          ? await nextVersionAfter(userId, current.screen.sessionId, current.screen.version)
          : await nextVersionAfter(userId, current.screen.sessionId);
      return saveScreenJson({
        action: current.screen.action ?? null,
        assistantContent: (screenJson) =>
          `${appUiSchemaSchema.parse(screenJson.schema).page} を再生成しました。`,
        layoutPrompt: input.prompt ?? current.screen.prompt,
        providerContext: context.providerContext,
        sessionId: current.screen.sessionId,
        snapshot: context.snapshot,
        storedPrompt: input.prompt ?? current.screen.prompt,
        trigger: 'regenerate',
        userContent: input.prompt ?? 'Regenerate',
        version,
      });
    },
    regenerateSession: async (
      userId: string,
      sessionId: string,
      input: ScreenRegenerateRequest
    ): Promise<ScreenResponse> => {
      const current = await activeScreenJsonForSession(userId, sessionId);
      const context = await contextSnapshot(contextReader, current.schema);
      const version = await nextVersionAfter(userId, sessionId, current.version);
      return saveScreenJson({
        action: current.action ?? null,
        assistantContent: (screenJson) =>
          `${appUiSchemaSchema.parse(screenJson.schema).page} を再生成しました。`,
        layoutPrompt: input.prompt ?? current.prompt,
        providerContext: context.providerContext,
        sessionId,
        snapshot: context.snapshot,
        storedPrompt: input.prompt ?? current.prompt,
        trigger: 'regenerate',
        userContent: input.prompt ?? 'Regenerate',
        version,
      });
    },
    restoreCheckpoint: async (
      userId: string,
      sessionId: string,
      screenJsonId: string
    ): Promise<ScreenCheckpointRestoreResponse> => {
      const found = await repo.findScreenJsonById(userId, screenJsonId);
      if (!found || found.screenJson.sessionId !== sessionId) {
        throw new NotFoundError('ScreenJSON checkpoint not found');
      }

      await repo.updateSessionActiveScreenJson(sessionId, screenJsonId);
      return {
        screen: screenJsonAsGeneratedScreen(found.screenJson),
        conversation: await sessionConversation(userId, sessionId),
      };
    },
    screenJson: async (userId: string, screenJsonId: string): Promise<ScreenJsonResponse> => {
      const found = await repo.findScreenJsonById(userId, screenJsonId);
      if (!found) throw new NotFoundError('ScreenJSON not found');
      const screenJson = mapScreenJson(found.screenJson);
      return {
        screenJson,
        schemaJson: JSON.stringify(screenJson.schema),
      };
    },
  };
}

export const screenHistoryService = createScreenHistoryService(
  screenHistoryRepository,
  aiService,
  createDefaultAiLayoutContextReader()
);
