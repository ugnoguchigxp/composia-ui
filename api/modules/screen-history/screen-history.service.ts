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
  PromptSessionVisibilityResponse,
  PromptSessionVisibilityUpdateRequest,
  ScreenActionGenerateRequest,
  ScreenActionLink,
  ScreenActionLinkDeleteResponse,
  ScreenActionLinkResponse,
  ScreenActionLinkUpsertRequest,
  ScreenCheckpoint,
  ScreenCheckpointRestoreResponse,
  ScreenConversationResponse,
  ScreenEditRequest,
  ScreenGenerateRequest,
  ScreenJson,
  ScreenJsonResponse,
  ScreenJsonSaveRequest,
  ScreenListQuery,
  ScreenProjectPageResponse,
  ScreenRegenerateRequest,
  ScreenResponse,
} from '../../../shared/schemas/screen-history.schema';
import {
  collectRenderableActions,
  updateRenderableActionTarget,
} from '../../../shared/schemas/ui-action-collector';
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
  type ScreenActionLinkRecord,
  type ScreenHistoryRepository,
  type ScreenJsonCheckpointRecord,
  type ScreenJsonRecord,
  type ScreenJsonWithSessionRecord,
  screenHistoryRepository,
} from './screen-history.repository';
import { renderPublishedScreenHtml } from './screen-static-publisher';

const componentRegistryVersion = `component-registry-v2:${layoutSystemContextVersion}`;
const checkpointLabel = 'このバージョンへ戻る';
const editPromptTokenLimit = 24_000;

function projectRoutePath(projectId: string, pagePath: string, pageSessionId: string) {
  return `/prompt/project/${projectId}/${pagePath}?id=${pageSessionId}`;
}

type ScreenHistoryAiService = {
  generateLayout: (input: AiLayoutRequest) => Promise<AiLayoutResponse>;
};

type ScreenHistoryContextReader = {
  getLayoutContext: () => Promise<AiSourceContext>;
};

type MessageCheckpoint = Pick<
  ScreenCheckpoint,
  'createdAt' | 'id' | 'page' | 'prompt' | 'sessionId' | 'trigger' | 'updatedAt' | 'version'
>;

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

function canonicalPathForSession(row: Pick<PromptSessionRecord, 'id' | 'pagePath' | 'projectId'>) {
  if (!row.projectId || !row.pagePath) return null;
  return projectRoutePath(row.projectId, row.pagePath, row.id);
}

function slugifyPagePath(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'page';
}

function parseProjectRoutePath(
  value: string
): { pagePath: string; projectId: string; sessionId: string | null } | null {
  const trimmed = value.trim();
  const [pathname, search = ''] = trimmed.split('?');
  const match = pathname.match(/^\/prompt\/project\/([^/]+)\/(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  const id = new URLSearchParams(search).get('id');
  return {
    projectId: match[1],
    pagePath: normalizeProjectPagePath(`/${match[2]}`),
    sessionId: id,
  };
}

function normalizeProjectPagePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') return 'index';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('//')) {
    throw new ValidationError('External links cannot be used as UIDesign project pages');
  }
  if (trimmed.includes('\\')) {
    throw new ValidationError('UIDesign project page paths cannot contain backslashes');
  }
  if (trimmed.startsWith('/prompt/project/')) {
    const parsed = parseProjectRoutePath(trimmed);
    if (!parsed) throw new ValidationError('Invalid UIDesign project route');
    return parsed.pagePath;
  }
  if (trimmed.startsWith('/prompt/session/')) {
    throw new ValidationError('Prompt session routes are already concrete routes');
  }

  const withoutQuery = trimmed.split(/[?#]/)[0] ?? '';
  const withoutLeadingSlash = withoutQuery.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!withoutLeadingSlash) return 'index';
  if (withoutLeadingSlash.includes('//')) {
    throw new ValidationError('UIDesign project page paths cannot contain empty segments');
  }
  const canonicalName = withoutLeadingSlash.toLowerCase();
  if (canonicalName === 'home' || canonicalName === 'index' || canonicalName === 'index.html') {
    return 'index';
  }
  return withoutLeadingSlash;
}

function pagePathForAction(action: AppAction) {
  if (action.target) {
    try {
      return normalizeProjectPagePath(action.target);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
    }
  }
  return slugifyPagePath(action.label ?? action.intentHint ?? action.id);
}

function projectLocalPathForPage(pagePath: string) {
  return pagePath === 'index' ? '/' : `/${pagePath}`;
}

function mapSession(row: PromptSessionRecord): PromptSession {
  return {
    id: row.id,
    title: row.title,
    createdBy: row.createdBy,
    activeScreenJsonId: row.activeScreenJsonId ?? null,
    visibility: row.visibility ?? 'private',
    publishedAt: row.publishedAt ? dateIso(row.publishedAt) : null,
    projectId: row.projectId ?? null,
    pagePath: row.pagePath ?? null,
    canonicalPath: canonicalPathForSession(row),
    createdAt: dateIso(row.createdAt),
    updatedAt: dateIso(row.updatedAt),
  };
}

function mapLegacyScreen(
  row: GeneratedScreenRecord,
  session?: PromptSessionRecord
): GeneratedScreen {
  return {
    id: row.id,
    sessionId: row.sessionId,
    projectId: session?.projectId ?? null,
    pagePath: session?.pagePath ?? null,
    canonicalPath: session ? canonicalPathForSession(session) : null,
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

function mapScreenJson(
  row: ScreenJsonRecord,
  options: { includeContextSnapshot?: boolean } = {},
  session?: PromptSessionRecord
): ScreenJson {
  return {
    id: row.id,
    sessionId: row.sessionId,
    projectId: session?.projectId ?? null,
    pagePath: session?.pagePath ?? null,
    canonicalPath: session ? canonicalPathForSession(session) : null,
    version: row.version,
    trigger: row.trigger as ScreenJson['trigger'],
    prompt: row.prompt,
    inferredIntent: row.inferredIntent,
    action: row.action ?? null,
    schema: appUiSchemaSchema.parse(row.schema),
    databaseSchemaJsonId: row.databaseSchemaJsonId ?? null,
    dataBindings: row.dataBindings ?? [],
    contextSnapshot: options.includeContextSnapshot === false ? {} : row.contextSnapshot,
    providerMeta: row.providerMeta,
    createdAt: dateIso(row.createdAt),
    updatedAt: dateIso(row.updatedAt),
  };
}

function mapScreenCheckpoint(row: ScreenJsonCheckpointRecord): ScreenCheckpoint {
  return {
    id: row.id,
    sessionId: row.sessionId,
    projectId: row.projectId ?? null,
    pagePath: row.pagePath ?? null,
    canonicalPath:
      row.projectId && row.pagePath
        ? projectRoutePath(row.projectId, row.pagePath, row.sessionId)
        : null,
    version: row.version,
    trigger: row.trigger as ScreenCheckpoint['trigger'],
    prompt: row.prompt,
    inferredIntent: row.inferredIntent,
    action: row.action ?? null,
    page: row.page ?? row.inferredIntent,
    databaseSchemaJsonId: row.databaseSchemaJsonId ?? null,
    dataBindings: row.dataBindings ?? [],
    createdAt: dateIso(row.createdAt),
    updatedAt: dateIso(row.updatedAt),
  };
}

function screenJsonAsGeneratedScreen(
  row: ScreenJsonRecord,
  session?: PromptSessionRecord
): GeneratedScreen {
  const screenJson = mapScreenJson(row, {}, session);
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

function mapActionLink(row: ScreenActionLinkRecord): ScreenActionLink {
  return {
    id: row.id,
    sourceSessionId: row.sourceSessionId,
    actionId: row.actionId,
    targetSessionId: row.targetSessionId ?? null,
    targetPath: row.targetPath ?? null,
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
  const screenJson = mapScreenJson(row.screenJson, {}, row.session);
  return {
    id: screenJson.id,
    sessionId: screenJson.sessionId,
    projectId: screenJson.projectId,
    pagePath: screenJson.pagePath,
    canonicalPath: screenJson.canonicalPath,
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
  const screen = mapLegacyScreen(row.screen, row.session);
  return {
    id: screen.id,
    sessionId: screen.sessionId,
    projectId: screen.projectId,
    pagePath: screen.pagePath,
    canonicalPath: screen.canonicalPath,
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
      const activeScreenJson = active ? mapScreenJson(active.screenJson, {}, active.session) : null;
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
        visibility: session.visibility ?? 'private',
        publishedAt: session.publishedAt ? dateIso(session.publishedAt) : null,
        projectId: session.projectId ?? null,
        pagePath: session.pagePath ?? null,
        canonicalPath: canonicalPathForSession(session),
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
  const found = collectRenderableActions(schema).find((action) => action.id === actionId);
  if (found) return found;
  throw new NotFoundError('Screen action not found');
}

function actionForGeneration(storedAction: AppAction, requestedAction?: AppAction) {
  if (requestedAction?.id === storedAction.id && requestedAction.target) {
    return { ...storedAction, target: requestedAction.target };
  }
  return storedAction;
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

function fallbackMessages(checkpoints: MessageCheckpoint[]): PromptSessionMessage[] {
  return checkpoints.flatMap((checkpoint) => {
    const createdAt = checkpoint.createdAt;
    return [
      {
        id: `00000000-0000-4000-8000-${checkpoint.version.toString().padStart(12, '0')}`,
        sessionId: checkpoint.sessionId,
        screenJsonId: checkpoint.id,
        role: 'user' as const,
        content: checkpoint.prompt,
        metadata: {},
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: `00000000-0000-4000-8001-${checkpoint.version.toString().padStart(12, '0')}`,
        sessionId: checkpoint.sessionId,
        screenJsonId: checkpoint.id,
        role: 'assistant' as const,
        content: `${checkpoint.page} を保存しました。`,
        metadata: {
          checkpointScreenJsonId: checkpoint.id,
          checkpointLabel,
          generatedPage: checkpoint.page,
          version: checkpoint.version,
          trigger: checkpoint.trigger,
        },
        createdAt,
        updatedAt: createdAt,
      },
    ];
  });
}

function messagesWithFallbacks(
  checkpoints: MessageCheckpoint[],
  storedMessages: PromptSessionMessage[]
): PromptSessionMessage[] {
  const messagesByScreenJsonId = new Map<string, PromptSessionMessage[]>();
  for (const message of storedMessages) {
    messagesByScreenJsonId.set(message.screenJsonId, [
      ...(messagesByScreenJsonId.get(message.screenJsonId) ?? []),
      message,
    ]);
  }

  return checkpoints.flatMap((checkpoint) => {
    const messages = messagesByScreenJsonId.get(checkpoint.id);
    return messages && messages.length > 0 ? messages : fallbackMessages([checkpoint]);
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
    const [session, activeRow, checkpointRows, storedMessageRows, actionLinkRows] =
      await Promise.all([
        repo.findSessionById(userId, sessionId),
        repo.findActiveSessionScreenJson(userId, sessionId),
        repo.listSessionScreenJsonCheckpoints(userId, sessionId),
        repo.listSessionMessages(userId, sessionId),
        repo.listSessionActionLinks(userId, sessionId),
      ]);
    if (!session) throw new NotFoundError('Prompt session not found');

    const checkpoints = checkpointRows.map(mapScreenCheckpoint);
    const active = activeRow
      ? mapScreenJson(activeRow.screenJson, { includeContextSnapshot: false }, activeRow.session)
      : null;
    const storedMessages = storedMessageRows.map(mapMessage);

    return {
      session: mapSession({ ...session, activeScreenJsonId: active?.id ?? null }),
      activeScreenJsonId: active?.id ?? null,
      activeVersion: active?.version ?? null,
      activeScreenJson: active,
      checkpoints,
      screenJsons: [],
      actionLinks: actionLinkRows.map(mapActionLink),
      messages: messagesWithFallbacks(checkpoints, storedMessages),
    };
  };

  const saveScreenJson = async ({
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
  }: {
    action?: AppAction | null;
    assistantContent: (screenJson: ScreenJsonRecord) => string;
    layoutPrompt: string;
    providerContext?: AiSourceContext;
    session?: PromptSessionRecord;
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
      screen: screenJsonAsGeneratedScreen(screenJson, session),
      activities: generated.activities,
    };
  };

  const saveSchemaScreenJson = async ({
    assistantContent,
    current,
    prompt,
    schema,
    session,
    sessionId,
    userContent,
    userId,
  }: {
    assistantContent: (screenJson: ScreenJsonRecord) => string;
    current: ScreenJson;
    prompt: string;
    schema: AppUiSchema;
    session?: PromptSessionRecord;
    sessionId: string;
    userContent: string;
    userId: string;
  }): Promise<ScreenResponse> => {
    const parsedSchema = appUiSchemaSchema.parse(schema);
    const version = await nextVersionAfter(userId, sessionId, current.version);
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
  };

  const activeScreenJsonForSession = async (userId: string, sessionId: string) => {
    const active = await repo.findActiveSessionScreenJson(userId, sessionId);
    if (!active) throw new NotFoundError('Active ScreenJSON not found');
    return mapScreenJson(active.screenJson, {}, active.session);
  };

  const ensureProjectForSession = async (
    userId: string,
    session: PromptSessionRecord,
    fallbackPagePath = 'index'
  ) => {
    if (session.projectId && session.pagePath) return session;
    const project = await repo.createProject({
      createdBy: userId,
      rootSessionId: session.id,
      title: session.title,
    });
    return repo.updateSessionProjectPage(
      session.id,
      project.id,
      session.pagePath ?? fallbackPagePath
    );
  };

  const assertSessionAction = async (userId: string, sessionId: string, actionId: string) => {
    const current = await activeScreenJsonForSession(userId, sessionId);
    return {
      action: findAction(current.schema, actionId),
      current,
    };
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

  const targetSessionForActionPage = async (
    userId: string,
    sourceSession: PromptSessionRecord,
    action: AppAction
  ) => {
    const projectSession = await ensureProjectForSession(userId, sourceSession);
    if (!projectSession.projectId) {
      throw new ValidationError('UIDesign project could not be resolved');
    }
    const pagePath = pagePathForAction(action);
    const targetSession =
      (await repo.findProjectPageSession(userId, projectSession.projectId, pagePath)) ??
      (await repo.createSession({
        activeScreenJsonId: null,
        createdBy: userId,
        pagePath,
        projectId: projectSession.projectId,
        title: titleFromPrompt(action.label),
      }));

    return {
      canonicalPath: projectRoutePath(projectSession.projectId, pagePath, targetSession.id),
      pagePath,
      projectId: projectSession.projectId,
      sourceSession: projectSession,
      targetSession,
      version: await nextVersionAfter(userId, targetSession.id),
    };
  };

  const getScreenJsonOrLegacy = async (userId: string, screenId: string) => {
    const screenJsonRow = await repo.findScreenJsonById(userId, screenId);
    if (screenJsonRow) {
      return {
        kind: 'screen-json' as const,
        row: screenJsonRow,
        screen: screenJsonAsGeneratedScreen(screenJsonRow.screenJson, screenJsonRow.session),
      };
    }

    const legacyRow = await repo.findLegacyScreenById(userId, screenId);
    if (!legacyRow) throw new NotFoundError('Generated screen not found');
    return {
      kind: 'legacy' as const,
      row: legacyRow,
      screen: mapLegacyScreen(legacyRow.screen, legacyRow.session),
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
    deleteSession: async (userId: string, sessionId: string) => {
      const session = await repo.findSessionById(userId, sessionId);
      if (!session) throw new NotFoundError('Prompt session not found');
      await repo.deleteSession(userId, sessionId);
      return { success: true };
    },
    edit: async (
      userId: string,
      sessionId: string,
      input: ScreenEditRequest
    ): Promise<ScreenResponse> => {
      const session = await repo.findSessionById(userId, sessionId);
      if (!session) throw new NotFoundError('Prompt session not found');
      const current = await activeScreenJsonForSession(userId, sessionId);
      const editPrompt = buildEditPrompt(current.schema, input.prompt);
      const version = await nextVersionAfter(userId, sessionId, current.version);
      return saveScreenJson({
        action: current.action ?? null,
        assistantContent: (screenJson) =>
          `${appUiSchemaSchema.parse(screenJson.schema).page} を更新しました。`,
        layoutPrompt: editPrompt,
        session,
        sessionId,
        snapshot: { previousScreen: current.schema },
        storedPrompt: input.prompt,
        trigger: 'chat-edit',
        userContent: input.prompt,
        version,
      });
    },
    saveSessionScreenJson: async (
      userId: string,
      sessionId: string,
      input: ScreenJsonSaveRequest
    ): Promise<ScreenResponse> => {
      const session = await repo.findSessionById(userId, sessionId);
      if (!session) throw new NotFoundError('Prompt session not found');
      const current = await activeScreenJsonForSession(userId, sessionId);
      return saveSchemaScreenJson({
        assistantContent: (screenJson) =>
          `${appUiSchemaSchema.parse(screenJson.schema).page} を保存しました。`,
        current,
        prompt: input.prompt ?? 'ScreenJSON manual save',
        schema: input.schema,
        session,
        sessionId,
        userContent: input.prompt ?? 'ScreenJSON を保存',
        userId,
      });
    },
    generate: async (userId: string, input: ScreenGenerateRequest): Promise<ScreenResponse> => {
      const session = await repo.createSession({
        activeScreenJsonId: null,
        createdBy: userId,
        title: input.title ?? titleFromPrompt(input.prompt),
      });
      const project = await repo.createProject({
        createdBy: userId,
        rootSessionId: session.id,
        title: session.title,
      });
      const projectSession = await repo.updateSessionProjectPage(session.id, project.id, 'index');
      const context = await contextSnapshot(contextReader);
      return saveScreenJson({
        assistantContent: (screenJson) =>
          `${appUiSchemaSchema.parse(screenJson.schema).page} を保存しました。${
            appUiSchemaSchema.parse(screenJson.schema).sections.length
          } sections`,
        layoutPrompt: input.prompt,
        providerContext: context.providerContext,
        session: projectSession,
        sessionId: projectSession.id,
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
      const action = actionForGeneration(findAction(current.screen.schema, actionId), input.action);
      if (action.kind === 'submit') {
        throw new ValidationError('Submit actions cannot generate a page');
      }

      const context = await contextSnapshot(contextReader, current.screen.schema);
      const target = await targetSessionForActionPage(userId, current.row.session, action);
      const result = await saveScreenJson({
        action,
        assistantContent: (screenJson) =>
          `${appUiSchemaSchema.parse(screenJson.schema).page} を生成しました。`,
        layoutPrompt: promptForAction(current.screen, action, input.prompt),
        providerContext: context.providerContext,
        session: target.targetSession,
        sessionId: target.targetSession.id,
        snapshot: context.snapshot,
        storedPrompt: input.prompt ?? action.label,
        trigger: 'action-click',
        userContent: action.label,
        version: target.version,
      });
      if (current.kind === 'screen-json') {
        const source = mapScreenJson(current.row.screenJson, {}, target.sourceSession);
        const targetPath = projectLocalPathForPage(target.pagePath);
        const linked = updateRenderableActionTarget(source.schema, actionId, targetPath);
        if (linked) {
          await saveSchemaScreenJson({
            assistantContent: (screenJson) =>
              `${appUiSchemaSchema.parse(screenJson.schema).page} の遷移先を更新しました。`,
            current: source,
            prompt: `${action.label} -> ${targetPath}`,
            schema: linked.schema,
            session: target.sourceSession,
            sessionId: source.sessionId,
            userContent: `${action.label} の遷移先を ${result.screen.schema.page} に設定`,
            userId,
          });
        }
      }
      return result;
    },
    generateFromSessionAction: async (
      userId: string,
      sessionId: string,
      actionId: string,
      input: ScreenActionGenerateRequest
    ): Promise<ScreenResponse> => {
      const sourceSession = await repo.findSessionById(userId, sessionId);
      if (!sourceSession) throw new NotFoundError('Prompt session not found');
      const current = await activeScreenJsonForSession(userId, sessionId);
      const action = actionForGeneration(findAction(current.schema, actionId), input.action);
      if (action.kind === 'submit') {
        throw new ValidationError('Submit actions cannot generate a page');
      }

      const context = await contextSnapshot(contextReader, current.schema);
      const target = await targetSessionForActionPage(userId, sourceSession, action);
      const result = await saveScreenJson({
        action,
        assistantContent: (screenJson) =>
          `${appUiSchemaSchema.parse(screenJson.schema).page} を生成しました。`,
        layoutPrompt: promptForAction(current, action, input.prompt),
        providerContext: context.providerContext,
        session: target.targetSession,
        sessionId: target.targetSession.id,
        snapshot: context.snapshot,
        storedPrompt: input.prompt ?? action.label,
        trigger: 'action-click',
        userContent: action.label,
        version: target.version,
      });
      const targetPath = projectLocalPathForPage(target.pagePath);
      const linked = updateRenderableActionTarget(current.schema, actionId, targetPath);
      if (linked) {
        await saveSchemaScreenJson({
          assistantContent: (screenJson) =>
            `${appUiSchemaSchema.parse(screenJson.schema).page} の遷移先を更新しました。`,
          current,
          prompt: `${action.label} -> ${targetPath}`,
          schema: linked.schema,
          session: target.sourceSession,
          sessionId,
          userContent: `${action.label} の遷移先を ${result.screen.schema.page} に設定`,
          userId,
        });
      }
      return result;
    },
    get: async (userId: string, screenId: string): Promise<ScreenResponse> => {
      const current = await getScreenJsonOrLegacy(userId, screenId);
      return { screen: current.screen, activities: [] as AiActivity[] };
    },
    projectPage: async (
      userId: string,
      projectId: string,
      pagePath: string
    ): Promise<ScreenProjectPageResponse> => {
      const normalizedPagePath = normalizeProjectPagePath(`/${pagePath}`);
      const project = await repo.findProjectById(userId, projectId);
      if (!project) throw new NotFoundError('UIDesign project not found');
      const session = await repo.findProjectPageSession(userId, projectId, normalizedPagePath);
      if (!session) throw new NotFoundError('UIDesign project page not found');
      return {
        canonicalPath: projectRoutePath(projectId, normalizedPagePath, session.id),
        pagePath: normalizedPagePath,
        projectId,
        session: mapSession(session),
        sessionId: session.id,
      };
    },
    list: async (userId: string, _query?: ScreenListQuery) => {
      const screenJsonRows = await repo.listScreenJsons(userId);
      const sessionIds = Array.from(new Set(screenJsonRows.map((row) => row.session.id)));
      const messageStats = new Map<string, { count: number; searchText: string | null }>(
        (await repo.listSessionMessageStats(userId, sessionIds)).map((row) => [
          row.sessionId,
          {
            count: row.count,
            searchText: row.searchText,
          },
        ])
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
    linkAction: async (
      userId: string,
      sessionId: string,
      actionId: string,
      input: ScreenActionLinkUpsertRequest
    ): Promise<ScreenActionLinkResponse> => {
      const { action } = await assertSessionAction(userId, sessionId, actionId);
      if (action.kind === 'submit') {
        throw new ValidationError('Submit actions cannot link to a page');
      }
      if (input.targetSessionId) {
        const target = await repo.findSessionById(userId, input.targetSessionId);
        if (!target) throw new NotFoundError('Target prompt session not found');
      }

      return {
        link: mapActionLink(
          await repo.upsertActionLink({
            actionId,
            sourceSessionId: sessionId,
            targetPath: input.targetPath ?? null,
            targetSessionId: input.targetSessionId ?? null,
          })
        ),
      };
    },
    unlinkAction: async (
      userId: string,
      sessionId: string,
      actionId: string
    ): Promise<ScreenActionLinkDeleteResponse> => {
      const session = await repo.findSessionById(userId, sessionId);
      if (!session) throw new NotFoundError('Prompt session not found');
      await repo.deleteActionLink(sessionId, actionId);
      return { success: true };
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
        session: current.row.session,
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
      const session = await repo.findSessionById(userId, sessionId);
      if (!session) throw new NotFoundError('Prompt session not found');
      const current = await activeScreenJsonForSession(userId, sessionId);
      const context = await contextSnapshot(contextReader, current.schema);
      const version = await nextVersionAfter(userId, sessionId, current.version);
      return saveScreenJson({
        action: current.action ?? null,
        assistantContent: (screenJson) =>
          `${appUiSchemaSchema.parse(screenJson.schema).page} を再生成しました。`,
        layoutPrompt: input.prompt ?? current.prompt,
        providerContext: context.providerContext,
        session,
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
        screen: screenJsonAsGeneratedScreen(found.screenJson, found.session),
        conversation: await sessionConversation(userId, sessionId),
      };
    },
    screenJson: async (userId: string, screenJsonId: string): Promise<ScreenJsonResponse> => {
      const found = await repo.findScreenJsonById(userId, screenJsonId);
      if (!found) throw new NotFoundError('ScreenJSON not found');
      const screenJson = mapScreenJson(found.screenJson, {}, found.session);
      return {
        screenJson,
        schemaJson: JSON.stringify(screenJson.schema),
      };
    },
    updateSessionVisibility: async (
      userId: string,
      sessionId: string,
      input: PromptSessionVisibilityUpdateRequest
    ): Promise<PromptSessionVisibilityResponse> => {
      if (input.visibility === 'private') {
        const session = await repo.updateSessionVisibility(userId, sessionId, 'private');
        return { session: mapSession(session) };
      }

      const active = await repo.findActiveSessionScreenJson(userId, sessionId);
      if (!active) throw new NotFoundError('Active ScreenJSON not found');
      const html = renderPublishedScreenHtml(appUiSchemaSchema.parse(active.screenJson.schema));
      const session = await repo.updateSessionVisibility(userId, sessionId, 'public', {
        html,
        screenJsonId: active.screenJson.id,
      });
      return { session: mapSession(session) };
    },
  };
}

export const screenHistoryService = createScreenHistoryService(
  screenHistoryRepository,
  aiService,
  createDefaultAiLayoutContextReader()
);
