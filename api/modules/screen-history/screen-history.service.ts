import type { AiActivity } from '../../../shared/schemas/ai.schema';
import type {
  PromptSessionVisibilityResponse,
  PromptSessionVisibilityUpdateRequest,
  ScreenActionGenerateRequest,
  ScreenActionLinkDeleteResponse,
  ScreenActionLinkResponse,
  ScreenActionLinkUpsertRequest,
  ScreenCheckpointRestoreResponse,
  ScreenConversationResponse,
  ScreenEditRequest,
  ScreenGenerateRequest,
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
import { type AppAction, appUiSchemaSchema } from '../../../shared/schemas/ui-schema.schema';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { aiService, createDefaultAiLayoutContextReader } from '../ai/ai.service';
import { messagesWithFallbacks } from './screen-history.conversation';
import {
  buildEditPrompt,
  contextSnapshot,
  nextVersionAfter,
  promptForAction,
  type ScreenHistoryAiService,
  type ScreenHistoryContextReader,
  saveSchemaScreenJson,
  saveScreenJson,
  titleFromPrompt,
} from './screen-history.generation';
import {
  mapActionLink,
  mapLegacyScreen,
  mapLegacySummary,
  mapMessage,
  mapScreenCheckpoint,
  mapScreenJson,
  mapScreenJsonSummary,
  mapSession,
  screenJsonAsGeneratedScreen,
} from './screen-history.mapper';
import {
  normalizeProjectPagePath,
  pagePathForAction,
  projectLocalPathForPage,
  projectRoutePath,
} from './screen-history.project';
import {
  type PromptSessionRecord,
  type ScreenHistoryRepository,
  screenHistoryRepository,
} from './screen-history.repository';
import { renderPublishedScreenHtml } from './screen-static-publisher';

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

  const findAction = (schema: any, actionId: string): AppAction => {
    const found = collectRenderableActions(schema).find((action) => action.id === actionId);
    if (found) return found;
    throw new NotFoundError('Screen action not found');
  };

  const actionForGeneration = (storedAction: AppAction, requestedAction?: AppAction) => {
    if (requestedAction?.id === storedAction.id && requestedAction.target) {
      return { ...storedAction, target: requestedAction.target };
    }
    return storedAction;
  };

  const assertSessionAction = async (userId: string, sessionId: string, actionId: string) => {
    const current = await activeScreenJsonForSession(userId, sessionId);
    return {
      action: findAction(current.schema, actionId),
      current,
    };
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
      version: await nextVersionAfter(repo, userId, targetSession.id),
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

  const summarizeSessions = (
    rows: any[],
    messageStats = new Map<string, { count: number; searchText: string | null }>()
  ) => {
    const grouped = new Map<string, any[]>();
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
        const activeScreenJson = active
          ? mapScreenJson(active.screenJson, {}, active.session)
          : null;
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
          publishedAt: session.publishedAt ? session.publishedAt.toISOString() : null,
          projectId: session.projectId ?? null,
          pagePath: session.pagePath ?? null,
          canonicalPath: projectRoutePath(
            session.projectId ?? '',
            session.pagePath ?? '',
            session.id
          ),
          page: activeScreenJson?.schema.page ?? null,
          prompt: activeScreenJson?.prompt ?? null,
          inferredIntent: activeScreenJson?.inferredIntent ?? null,
          screenCount: sorted.length,
          messageCount: sessionMessageStats?.count ?? 0,
          messageSearchText: sessionMessageStats?.searchText ?? null,
          createdAt: session.createdAt.toISOString(),
          updatedAt: latestUpdatedAt.toISOString(),
        };
      })
      .filter((summary) => Boolean(summary))
      .sort((a, b) => Date.parse(b?.updatedAt ?? '') - Date.parse(a?.updatedAt ?? ''));
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
      const version = await nextVersionAfter(repo, userId, sessionId, current.version);
      return saveScreenJson(repo, layoutService, {
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
      return saveSchemaScreenJson(repo, {
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
      return saveScreenJson(repo, layoutService, {
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
      const result = await saveScreenJson(repo, layoutService, {
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
          await saveSchemaScreenJson(repo, {
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
      const result = await saveScreenJson(repo, layoutService, {
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
        await saveSchemaScreenJson(repo, {
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

      const total = sessions.length > 0 ? sessions.length : screenSummaries.length;

      return {
        screens: screenSummaries,
        sessions: sessions as any,
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
          ? await nextVersionAfter(repo, userId, current.screen.sessionId, current.screen.version)
          : await nextVersionAfter(repo, userId, current.screen.sessionId);
      return saveScreenJson(repo, layoutService, {
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
      const version = await nextVersionAfter(repo, userId, sessionId, current.version);
      return saveScreenJson(repo, layoutService, {
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
