import type {
  GeneratedScreen,
  GeneratedScreenSummary,
  PromptSession,
  PromptSessionMessage,
  ScreenActionLink,
  ScreenCheckpoint,
  ScreenJson,
} from '../../../shared/schemas/screen-history.schema';
import { appUiSchemaSchema } from '../../../shared/schemas/ui-schema.schema';
import { projectRoutePath } from './screen-history.project';
import type {
  GeneratedScreenRecord,
  GeneratedScreenWithSessionRecord,
  PromptSessionMessageRecord,
  PromptSessionRecord,
  ScreenActionLinkRecord,
  ScreenJsonCheckpointRecord,
  ScreenJsonRecord,
  ScreenJsonWithSessionRecord,
} from './screen-history.repository';

export const componentRegistryVersion = 'component-registry-v2:layout-system-context-v10';
export const checkpointLabel = 'このバージョンへ戻る';

export function dateIso(value: Date) {
  return value.toISOString();
}

export function canonicalPathForSession(
  row: Pick<PromptSessionRecord, 'id' | 'pagePath' | 'projectId'>
) {
  if (!row.projectId || !row.pagePath) return null;
  return projectRoutePath(row.projectId, row.pagePath, row.id);
}

export function mapSession(row: PromptSessionRecord): PromptSession {
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

export function mapLegacyScreen(
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

export function mapScreenJson(
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

export function mapScreenCheckpoint(row: ScreenJsonCheckpointRecord): ScreenCheckpoint {
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

export function screenJsonAsGeneratedScreen(
  row: ScreenJsonRecord,
  session?: PromptSessionRecord
): GeneratedScreen {
  const screenJson = mapScreenJson(row, {}, session);
  return {
    ...screenJson,
    parentScreenId: null,
  };
}

export function mapMessage(row: PromptSessionMessageRecord): PromptSessionMessage {
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

export function mapActionLink(row: ScreenActionLinkRecord): ScreenActionLink {
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

export function mapScreenJsonSummary(row: ScreenJsonWithSessionRecord): GeneratedScreenSummary {
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

export function mapLegacySummary(row: GeneratedScreenWithSessionRecord): GeneratedScreenSummary {
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
