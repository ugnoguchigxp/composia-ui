import { describe, expect, it, vi } from 'vitest';
import type {
  GeneratedScreenRecord,
  GeneratedScreenWithSessionRecord,
  PromptSessionMessageRecord,
  PromptSessionRecord,
  ScreenActionLinkRecord,
  ScreenHistoryRepository,
  ScreenJsonCheckpointRecord,
  ScreenJsonRecord,
  ScreenJsonWithSessionRecord,
  UiProjectRecord,
} from '../api/modules/screen-history/screen-history.repository';
import { createScreenHistoryService } from '../api/modules/screen-history/screen-history.service';
import { screenResponseSchema } from '../shared/schemas/screen-history.schema';
import { collectRenderableActions } from '../shared/schemas/ui-action-collector';
import type { AppUiSchema } from '../shared/schemas/ui-schema.schema';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const screenId = '33333333-3333-4333-8333-333333333333';
const childScreenId = '44444444-4444-4444-8444-444444444444';
const childSessionId = '44444444-4444-4444-9444-444444444444';
const editScreenId = '55555555-5555-4555-8555-555555555555';
const projectId = '99999999-9999-4999-8999-999999999999';
const now = new Date('2026-05-07T00:00:00.000Z');

function schema(input: Partial<AppUiSchema> = {}): AppUiSchema {
  return {
    page: input.page ?? 'Flower Shop',
    intent: input.intent ?? 'Flower shop top page',
    layout: input.layout ?? 'screen',
    sections: input.sections ?? [
      {
        component: 'InsightPanel',
        source: 'summary',
        props: {
          title: 'Fresh flowers',
          body: 'Seasonal bouquets are ready.',
        },
        actions: [
          {
            id: 'flower-detail',
            label: 'Flower details',
            kind: 'generate-screen',
            intentHint: 'ECサイト 花の商品詳細画面',
          },
        ],
      },
    ],
  };
}

function sessionRecord(input: Partial<PromptSessionRecord> = {}): PromptSessionRecord {
  return {
    id: input.id ?? sessionId,
    title: input.title ?? 'ECサイトのトップ画面',
    createdBy: input.createdBy ?? userId,
    activeScreenJsonId: input.activeScreenJsonId ?? screenId,
    visibility: input.visibility ?? 'private',
    publishedAt: input.publishedAt ?? null,
    projectId: input.projectId ?? null,
    pagePath: input.pagePath ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function screenJsonRecord(input: Partial<ScreenJsonRecord> = {}): ScreenJsonRecord {
  return {
    id: input.id ?? screenId,
    sessionId: input.sessionId ?? sessionId,
    version: input.version ?? 1,
    trigger: input.trigger ?? 'initial-prompt',
    prompt: input.prompt ?? 'ECサイトのトップ画面',
    inferredIntent: input.inferredIntent ?? 'Flower shop top page',
    action: input.action ?? null,
    schema: input.schema ?? schema(),
    databaseSchemaJsonId: input.databaseSchemaJsonId ?? null,
    dataBindings: input.dataBindings ?? [],
    contextSnapshot: input.contextSnapshot ?? {},
    providerMeta: input.providerMeta ?? {
      provider: 'mock',
      componentRegistryVersion: 'component-registry-v1',
    },
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function legacyScreenRecord(input: Partial<GeneratedScreenRecord> = {}): GeneratedScreenRecord {
  return {
    id: input.id ?? screenId,
    sessionId: input.sessionId ?? sessionId,
    parentScreenId: input.parentScreenId ?? null,
    trigger: input.trigger ?? 'initial-prompt',
    prompt: input.prompt ?? 'ECサイトのトップ画面',
    inferredIntent: input.inferredIntent ?? 'Flower shop top page',
    action: input.action ?? null,
    schema: input.schema ?? schema(),
    contextSnapshot: input.contextSnapshot ?? {},
    providerMeta: input.providerMeta ?? {
      provider: 'mock',
      componentRegistryVersion: 'component-registry-v1',
    },
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function messageRecord(
  input: Partial<PromptSessionMessageRecord> = {}
): PromptSessionMessageRecord {
  return {
    id:
      input.id ??
      `66666666-6666-4666-8666-${Math.random().toString().slice(2, 14).padEnd(12, '0')}`,
    sessionId: input.sessionId ?? sessionId,
    screenJsonId: input.screenJsonId ?? screenId,
    role: input.role ?? 'user',
    content: input.content ?? 'message',
    metadata: input.metadata ?? {},
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function createFakeRepository({
  initialActionLinks = [],
  initialMessages = [],
  initialLegacyScreens = [],
  initialSessions = [],
  initialScreenJsons = [],
}: {
  initialActionLinks?: ScreenActionLinkRecord[];
  initialMessages?: PromptSessionMessageRecord[];
  initialLegacyScreens?: GeneratedScreenRecord[];
  initialSessions?: PromptSessionRecord[];
  initialScreenJsons?: ScreenJsonRecord[];
} = {}) {
  const defaultSessionActiveScreenId =
    initialScreenJsons.findLast((screenJson) => screenJson.sessionId === sessionId)?.id ?? screenId;
  let session = sessionRecord({
    activeScreenJsonId: defaultSessionActiveScreenId,
  });
  const sessions = new Map<string, PromptSessionRecord>([
    [session.id, session],
    ...initialSessions.map((item) => [item.id, item] as const),
  ]);
  const projects = new Map<string, UiProjectRecord>();
  let createSessionCount = 0;
  let createProjectCount = 0;
  const screenJsons = [...initialScreenJsons];
  const legacyScreens = [...initialLegacyScreens];
  const messages: PromptSessionMessageRecord[] = [...initialMessages];
  const actionLinks: ScreenActionLinkRecord[] = [...initialActionLinks];

  const withSession = (screenJson: ScreenJsonRecord): ScreenJsonWithSessionRecord => ({
    screenJson,
    session: sessions.get(screenJson.sessionId) ?? sessionRecord({ id: screenJson.sessionId }),
  });
  const checkpoint = (screenJson: ScreenJsonRecord): ScreenJsonCheckpointRecord => {
    const checkpointSession =
      sessions.get(screenJson.sessionId) ?? sessionRecord({ id: screenJson.sessionId });
    return {
      id: screenJson.id,
      sessionId: screenJson.sessionId,
      projectId: checkpointSession.projectId,
      pagePath: checkpointSession.pagePath,
      version: screenJson.version,
      trigger: screenJson.trigger,
      prompt: screenJson.prompt,
      inferredIntent: screenJson.inferredIntent,
      action: screenJson.action,
      page: screenJson.schema.page,
      databaseSchemaJsonId: screenJson.databaseSchemaJsonId,
      dataBindings: screenJson.dataBindings,
      createdAt: screenJson.createdAt,
      updatedAt: screenJson.updatedAt,
    };
  };
  const legacyWithSession = (screen: GeneratedScreenRecord): GeneratedScreenWithSessionRecord => ({
    screen,
    session: sessions.get(screen.sessionId) ?? sessionRecord({ id: screen.sessionId }),
  });

  const repo: ScreenHistoryRepository = {
    createProject: vi.fn(async (input) => {
      createProjectCount += 1;
      const project: UiProjectRecord = {
        id: input.id ?? (createProjectCount === 1 ? projectId : childSessionId),
        title: input.title,
        createdBy: input.createdBy,
        rootSessionId: input.rootSessionId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      projects.set(project.id, project);
      return project;
    }),
    createMessages: vi.fn(async (input) => {
      const created = input.map((message, index) =>
        messageRecord({
          ...message,
          id: `66666666-6666-4666-8666-${(messages.length + index + 1)
            .toString()
            .padStart(12, '0')}`,
        })
      );
      messages.push(...created);
      return created;
    }),
    createScreenJson: vi.fn(async (input) => {
      const created = screenJsonRecord({
        ...input,
        id:
          input.sessionId !== sessionId
            ? childScreenId
            : input.version === 1
              ? screenId
              : input.trigger === 'chat-edit'
                ? editScreenId
                : childScreenId,
      });
      screenJsons.push(created);
      return created;
    }),
    createSession: vi.fn(async (input) => {
      const generatedId =
        createSessionCount === 0 &&
        initialScreenJsons.length === 0 &&
        initialLegacyScreens.length === 0
          ? sessionId
          : childSessionId;
      createSessionCount += 1;
      session = sessionRecord({
        ...input,
        id: input.id ?? generatedId,
        activeScreenJsonId: input.activeScreenJsonId ?? null,
      });
      sessions.set(session.id, session);
      return session;
    }),
    deleteActionLink: vi.fn(async (sourceSessionId, actionId) => {
      const index = actionLinks.findIndex(
        (link) => link.sourceSessionId === sourceSessionId && link.actionId === actionId
      );
      if (index >= 0) actionLinks.splice(index, 1);
    }),
    deleteLegacyScreen: vi.fn(async (_userId, id) => {
      const index = legacyScreens.findIndex((screen) => screen.id === id);
      if (index >= 0) legacyScreens.splice(index, 1);
    }),
    deleteMessagesAfterVersion: vi.fn(async (_sessionId, version) => {
      const futureIds = screenJsons
        .filter((screenJson) => screenJson.version > version)
        .map((screenJson) => screenJson.id);
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (
          messages[index]?.screenJsonId &&
          futureIds.includes(messages[index].screenJsonId ?? '')
        ) {
          messages.splice(index, 1);
        }
      }
    }),
    deleteScreenJson: vi.fn(async (_userId, id) => {
      const index = screenJsons.findIndex((screenJson) => screenJson.id === id);
      if (index >= 0) screenJsons.splice(index, 1);
    }),
    deleteScreenJsonsAfterVersion: vi.fn(async (_sessionId, version) => {
      for (let index = screenJsons.length - 1; index >= 0; index -= 1) {
        if ((screenJsons[index]?.version ?? 0) > version) screenJsons.splice(index, 1);
      }
    }),
    deleteSession: vi.fn(async (_userId, id) => {
      sessions.delete(id);
      for (let index = screenJsons.length - 1; index >= 0; index -= 1) {
        if (screenJsons[index]?.sessionId === id) screenJsons.splice(index, 1);
      }
      for (let index = legacyScreens.length - 1; index >= 0; index -= 1) {
        if (legacyScreens[index]?.sessionId === id) legacyScreens.splice(index, 1);
      }
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index]?.sessionId === id) messages.splice(index, 1);
      }
      for (let index = actionLinks.length - 1; index >= 0; index -= 1) {
        if (actionLinks[index]?.sourceSessionId === id) {
          actionLinks.splice(index, 1);
        } else if (actionLinks[index]?.targetSessionId === id) {
          actionLinks[index].targetSessionId = null;
        }
      }
    }),
    findLegacyScreenById: vi.fn(async (_userId, id) => {
      const screen = legacyScreens.find((item) => item.id === id);
      return screen ? legacyWithSession(screen) : null;
    }),
    findScreenJsonById: vi.fn(async (_userId, id) => {
      const screenJson = screenJsons.find((item) => item.id === id);
      return screenJson ? withSession(screenJson) : null;
    }),
    findActiveSessionScreenJson: vi.fn(async (_userId, id) => {
      const current = sessions.get(id);
      if (!current) return null;
      const sessionScreenJsons = screenJsons.filter((item) => item.sessionId === id);
      const active =
        sessionScreenJsons.find((item) => item.id === current.activeScreenJsonId) ??
        sessionScreenJsons.sort((a, b) => b.version - a.version).at(0);
      return active ? withSession(active) : null;
    }),
    findSessionById: vi.fn(async (_userId, id) => sessions.get(id) ?? null),
    findProjectById: vi.fn(async (_userId, id) => projects.get(id) ?? null),
    findProjectPageSession: vi.fn(async (_userId, id, pagePath) => {
      return (
        Array.from(sessions.values()).find(
          (item) => item.projectId === id && item.pagePath === pagePath
        ) ?? null
      );
    }),
    listLegacyChildren: vi.fn(async (_userId, parentId) =>
      legacyScreens
        .filter((screen) => screen.parentScreenId === parentId)
        .map((screen) => legacyWithSession(screen))
    ),
    listLegacyScreens: vi.fn(async () => legacyScreens.map((screen) => legacyWithSession(screen))),
    listScreenJsons: vi.fn(async () => screenJsons.map((screenJson) => withSession(screenJson))),
    listSessionActionLinks: vi.fn(async (_userId, sourceSessionId) =>
      actionLinks.filter((link) => link.sourceSessionId === sourceSessionId)
    ),
    listSessionMessageStats: vi.fn(async (_userId, sessionIds) =>
      sessionIds.map((id) => {
        const sessionMessages = messages.filter((message) => message.sessionId === id);
        return {
          sessionId: id,
          count: sessionMessages.length,
          searchText:
            sessionMessages.length > 0
              ? sessionMessages.map((message) => message.content).join('\n')
              : null,
        };
      })
    ),
    listSessionMessages: vi.fn(async (_userId, id) =>
      messages.filter((message) => message.sessionId === id)
    ),
    listSessionScreenJsonCheckpoints: vi.fn(async (_userId, id) =>
      [...screenJsons]
        .filter((screenJson) => screenJson.sessionId === id)
        .sort((a, b) => a.version - b.version)
        .map(checkpoint)
    ),
    listSessionScreenJsons: vi.fn(async (_userId, id) =>
      [...screenJsons]
        .filter((screenJson) => screenJson.sessionId === id)
        .sort((a, b) => a.version - b.version)
        .map((screenJson) => withSession(screenJson))
    ),
    updateSessionActiveScreenJson: vi.fn(async (id, screenJsonId) => {
      const current = sessions.get(id) ?? sessionRecord({ id });
      session = sessionRecord({ ...current, activeScreenJsonId: screenJsonId });
      sessions.set(id, session);
      return session;
    }),
    updateSessionProjectPage: vi.fn(async (id, nextProjectId, pagePath) => {
      const current = sessions.get(id) ?? sessionRecord({ id });
      session = sessionRecord({ ...current, pagePath, projectId: nextProjectId });
      sessions.set(id, session);
      return session;
    }),
    updateSessionVisibility: vi.fn(async (_userId, id, visibility, _publishedPage) => {
      const current = sessions.get(id) ?? sessionRecord({ id });
      session = sessionRecord({
        ...current,
        publishedAt: visibility === 'public' ? now : null,
        visibility,
      });
      sessions.set(id, session);
      return session;
    }),
    upsertActionLink: vi.fn(async (input) => {
      const existing = actionLinks.find(
        (link) => link.sourceSessionId === input.sourceSessionId && link.actionId === input.actionId
      );
      if (existing) {
        existing.targetPath = input.targetPath ?? null;
        existing.targetSessionId = input.targetSessionId ?? null;
        existing.updatedAt = now;
        return existing;
      }

      const created: ScreenActionLinkRecord = {
        id: `77777777-7777-4777-8777-${(actionLinks.length + 1).toString().padStart(12, '0')}`,
        sourceSessionId: input.sourceSessionId,
        actionId: input.actionId,
        targetSessionId: input.targetSessionId ?? null,
        targetPath: input.targetPath ?? null,
        createdAt: now,
        updatedAt: now,
      };
      actionLinks.push(created);
      return created;
    }),
  };
  return { actionLinks, messages, repo, screenJsons };
}

describe('screen history service', () => {
  it('generates a prompt screen and persists version 1 ScreenJSON with checkpoint messages', async () => {
    const { repo } = createFakeRepository({ initialScreenJsons: [] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({
        schema: schema(),
        activities: [],
      })),
    };
    const service = createScreenHistoryService(repo, layoutService, {
      getLayoutContext: async () => ({ entities: [], sources: [] }),
    });

    const result = await service.generate(userId, { prompt: 'ECサイトのトップ画面' });

    expect(result.screen.schema.page).toBe('Flower Shop');
    expect(result.screen.version).toBe(1);
    expect(repo.createSession).toHaveBeenCalledWith({
      activeScreenJsonId: null,
      createdBy: userId,
      title: 'ECサイトのトップ画面',
    });
    expect(repo.createScreenJson).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'ECサイトのトップ画面',
        trigger: 'initial-prompt',
        version: 1,
      })
    );
    expect(repo.createMessages).toHaveBeenCalledWith([
      expect.objectContaining({ content: 'ECサイトのトップ画面', role: 'user' }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          checkpointLabel: 'このバージョンへ戻る',
          checkpointScreenJsonId: screenId,
          version: 1,
        }),
        role: 'assistant',
      }),
    ]);
  });

  it('generates a target page and persists the source link as a new ScreenJSON version', async () => {
    const parent = screenJsonRecord();
    const { repo, screenJsons } = createFakeRepository({ initialScreenJsons: [parent] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({
        schema: schema({
          page: 'Flower Details',
          intent: 'ECサイト 花の商品詳細画面',
          sections: [
            {
              component: 'InsightPanel',
              source: 'summary',
              props: {
                title: 'Flower details',
                body: 'A detailed product page for flowers.',
              },
            },
          ],
        }),
        activities: [],
      })),
    };
    const service = createScreenHistoryService(repo, layoutService, {
      getLayoutContext: async () => ({ entities: [], sources: [] }),
    });

    const result = await service.generateFromAction(userId, parent.id, 'flower-detail', {});

    expect(result.screen.parentScreenId).toBeNull();
    expect(result.screen.version).toBe(1);
    expect(result.screen.trigger).toBe('action-click');
    expect(result.screen.schema.page).toBe('Flower Details');
    expect(repo.upsertActionLink).not.toHaveBeenCalled();
    const linkedSource = screenJsons.find((item) => item.id === editScreenId);
    expect(linkedSource).toEqual(
      expect.objectContaining({
        sessionId: parent.sessionId,
        trigger: 'chat-edit',
        version: 2,
      })
    );
    expect(linkedSource?.schema.sections[0]?.actions?.[0]).toEqual(
      expect.objectContaining({
        id: 'flower-detail',
        target: '/flower-details',
      })
    );
    expect(layoutService.generateLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Clicked action label: Flower details'),
      })
    );
  });

  it('uses the stored screen action instead of trusting client action overrides', async () => {
    const parent = screenJsonRecord();
    const { repo } = createFakeRepository({ initialScreenJsons: [parent] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({
        schema: schema({
          page: 'Stored Action Result',
          intent: 'Result from stored action',
        }),
        activities: [],
      })),
    };
    const service = createScreenHistoryService(repo, layoutService, {
      getLayoutContext: async () => ({ entities: [], sources: [] }),
    });

    await service.generateFromAction(userId, parent.id, 'flower-detail', {
      action: {
        id: 'flower-detail',
        label: 'Client supplied label',
        kind: 'generate-screen',
        intentHint: 'Client supplied intent',
      },
    });

    expect(layoutService.generateLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Clicked action label: Flower details'),
      })
    );
    expect(layoutService.generateLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.not.stringContaining('Client supplied label'),
      })
    );
  });

  it('rejects action generation for unknown stored actions', async () => {
    const parent = screenJsonRecord();
    const { repo } = createFakeRepository({ initialScreenJsons: [parent] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    await expect(
      service.generateFromAction(userId, parent.id, 'client-only-action', {
        action: {
          id: 'client-only-action',
          label: 'Client only',
          kind: 'generate-screen',
        },
      })
    ).rejects.toThrow('Screen action not found');
    expect(layoutService.generateLayout).not.toHaveBeenCalled();
  });

  it('generates from a props href action and persists the updated href in ScreenJSON', async () => {
    const currentSchema = schema({
      intent: 'Shop top page',
      page: 'Shop Home',
      sections: [
        {
          component: 'NavigationPanel',
          source: 'navigation',
          props: {
            title: 'Navigation',
            links: [{ label: 'Cart', href: '/cart' }],
          },
        },
      ],
    });
    const cartAction = collectRenderableActions(currentSchema).find(
      (action) => action.target === '/cart'
    );
    const parent = screenJsonRecord({ schema: currentSchema });
    const { repo, screenJsons } = createFakeRepository({ initialScreenJsons: [parent] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({
        schema: schema({ intent: 'Cart page', page: 'Cart' }),
        activities: [],
      })),
    };
    const service = createScreenHistoryService(repo, layoutService, {
      getLayoutContext: async () => ({ entities: [], sources: [] }),
    });

    const result = await service.generateFromSessionAction(
      userId,
      sessionId,
      cartAction?.id ?? '',
      {}
    );

    expect(cartAction).toEqual(
      expect.objectContaining({ kind: 'generate-screen', label: 'Cart', target: '/cart' })
    );
    expect(result.screen.schema.page).toBe('Cart');
    expect(repo.upsertActionLink).not.toHaveBeenCalled();
    const linkedSource = screenJsons.find((item) => item.id === editScreenId);
    const firstLink = linkedSource?.schema.sections[0]?.props.links as
      | { href: string; label: string }[]
      | undefined;
    expect(firstLink?.[0]).toEqual(
      expect.objectContaining({
        href: '/cart',
        label: 'Cart',
      })
    );
    expect(layoutService.generateLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Action target: /cart'),
      })
    );
  });

  it('replays a saved ScreenJSON without calling the layout service', async () => {
    const { repo } = createFakeRepository({ initialScreenJsons: [screenJsonRecord()] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    const result = await service.get(userId, screenId);

    expect(result.screen.id).toBe(screenId);
    expect(result.activities).toEqual([]);
    expect(layoutService.generateLayout).not.toHaveBeenCalled();
  });

  it('restores a checkpoint by moving the active pointer without deleting future history or calling LLM', async () => {
    const first = screenJsonRecord({ id: screenId, version: 1 });
    const second = screenJsonRecord({
      id: childScreenId,
      version: 2,
      schema: schema({ page: 'V2' }),
    });
    const { repo, screenJsons } = createFakeRepository({ initialScreenJsons: [first, second] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    const result = await service.restoreCheckpoint(userId, sessionId, first.id);

    expect(result.screen.id).toBe(first.id);
    expect(result.conversation.activeScreenJsonId).toBe(first.id);
    expect(result.conversation.activeScreenJson?.id).toBe(first.id);
    expect(result.conversation.checkpoints.map((checkpoint) => checkpoint.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(result.conversation.screenJsons).toEqual([]);
    expect(screenJsons.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(repo.deleteScreenJsonsAfterVersion).not.toHaveBeenCalled();
    expect(layoutService.generateLayout).not.toHaveBeenCalled();
  });

  it('fills fallback conversation messages only for migrated ScreenJSON versions that lack stored messages', async () => {
    const first = screenJsonRecord({ id: screenId, version: 1 });
    const second = screenJsonRecord({
      id: childScreenId,
      version: 2,
      schema: schema({ page: 'Edited Flower Shop' }),
    });
    const storedSecondAssistant = messageRecord({
      id: '77777777-7777-4777-8777-777777777777',
      role: 'assistant',
      screenJsonId: second.id,
      content: 'Edited Flower Shop を更新しました。',
      metadata: {
        checkpointScreenJsonId: second.id,
        checkpointLabel: 'このバージョンへ戻る',
        generatedPage: 'Edited Flower Shop',
        version: 2,
        trigger: 'chat-edit',
      },
    });
    const { repo } = createFakeRepository({
      initialScreenJsons: [first, second],
      initialMessages: [storedSecondAssistant],
    });
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    const result = await service.conversation(userId, sessionId);

    expect(result.activeScreenJson?.id).toBe(second.id);
    expect(result.checkpoints.map((checkpoint) => checkpoint.id)).toEqual([first.id, second.id]);
    expect(result.screenJsons).toEqual([]);
    expect(result.messages.map((message) => message.content)).toEqual([
      'ECサイトのトップ画面',
      'Flower Shop を保存しました。',
      'Edited Flower Shop を更新しました。',
    ]);
    expect(result.messages.at(1)?.metadata).toEqual(
      expect.objectContaining({
        checkpointScreenJsonId: first.id,
        checkpointLabel: 'このバージョンへ戻る',
        version: 1,
      })
    );
  });

  it('includes persisted message content in session summaries for history search', async () => {
    const current = screenJsonRecord({ id: screenId, version: 1 });
    const { repo } = createFakeRepository({
      initialScreenJsons: [current],
      initialMessages: [
        messageRecord({
          role: 'user',
          screenJsonId: current.id,
          content: '予約導線をもっと目立たせる',
        }),
        messageRecord({
          role: 'assistant',
          screenJsonId: current.id,
          content: 'Flower Shop を更新しました。',
        }),
      ],
    });
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    const result = await service.list(userId);

    expect(result.sessions[0]?.messageCount).toBe(2);
    expect(result.sessions[0]?.messageSearchText).toContain('予約導線をもっと目立たせる');
    expect(result.sessions[0]?.messageSearchText).toContain('Flower Shop を更新しました。');
    expect(repo.listSessionMessageStats).toHaveBeenCalledWith(userId, [sessionId]);
    expect(repo.listSessionMessages).not.toHaveBeenCalled();
  });

  it('applies search, sort, and pagination to session summaries', async () => {
    const cartSessionId = childSessionId;
    const cartScreenId = childScreenId;
    const billingSessionId = '88888888-8888-4888-8888-888888888888';
    const billingScreenId = '99999999-9999-4999-8999-999999999998';
    const flowerScreen = screenJsonRecord({
      id: screenId,
      sessionId,
      schema: schema({ page: 'Flower Shop' }),
    });
    const cartScreen = screenJsonRecord({
      id: cartScreenId,
      sessionId: cartSessionId,
      schema: schema({ page: 'Cart Checkout' }),
    });
    const billingScreen = screenJsonRecord({
      id: billingScreenId,
      sessionId: billingSessionId,
      schema: schema({ page: 'Billing Checkout' }),
    });
    const { repo } = createFakeRepository({
      initialSessions: [
        sessionRecord({
          activeScreenJsonId: cartScreenId,
          id: cartSessionId,
          title: 'Cart flow',
          updatedAt: new Date('2026-05-08T00:00:00.000Z'),
        }),
        sessionRecord({
          activeScreenJsonId: billingScreenId,
          id: billingSessionId,
          title: 'Billing flow',
          updatedAt: new Date('2026-05-09T00:00:00.000Z'),
        }),
      ],
      initialScreenJsons: [flowerScreen, cartScreen, billingScreen],
      initialMessages: [
        messageRecord({
          content: 'checkout friction notes',
          screenJsonId: cartScreenId,
          sessionId: cartSessionId,
        }),
      ],
    });
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    const result = await service.list(userId, {
      limit: 1,
      page: 2,
      search: 'checkout',
      sortBy: 'title',
      sortOrder: 'asc',
    });

    expect(result.total).toBe(2);
    expect(result.sessions.map((session) => session.id)).toEqual([cartSessionId]);
    expect(result.screens.map((screen) => screen.id)).toEqual([cartScreenId]);
  });

  it('does not synthesize project canonical paths for non-project sessions', async () => {
    const current = screenJsonRecord({ id: screenId, version: 1 });
    const { repo } = createFakeRepository({ initialScreenJsons: [current] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    const result = await service.list(userId);

    expect(result.sessions[0]?.canonicalPath).toBeNull();
  });

  it('saves action links separately from ScreenJSON versions', async () => {
    const current = screenJsonRecord({ id: screenId, version: 1 });
    const { repo } = createFakeRepository({ initialScreenJsons: [current] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    const result = await service.linkAction(userId, sessionId, 'flower-detail', {
      targetPath: '/flower-details',
    });
    const conversation = await service.conversation(userId, sessionId);

    expect(result.link).toEqual(
      expect.objectContaining({
        actionId: 'flower-detail',
        sourceSessionId: sessionId,
        targetPath: '/flower-details',
        targetSessionId: null,
      })
    );
    expect(conversation.actionLinks).toHaveLength(1);
    expect(repo.createScreenJson).not.toHaveBeenCalled();

    await service.unlinkAction(userId, sessionId, 'flower-detail');
    expect(repo.deleteActionLink).toHaveBeenCalledWith(sessionId, 'flower-detail');
  });

  it('deletes a prompt session with all ScreenJSON versions and messages', async () => {
    const first = screenJsonRecord({ id: screenId, version: 1 });
    const second = screenJsonRecord({
      id: childScreenId,
      version: 2,
      schema: schema({ page: 'Edited Flower Shop' }),
    });
    const { actionLinks, messages, repo, screenJsons } = createFakeRepository({
      initialActionLinks: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          sourceSessionId: sessionId,
          actionId: 'flower-detail',
          targetSessionId: childSessionId,
          targetPath: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: '88888888-8888-4888-8888-888888888888',
          sourceSessionId: childSessionId,
          actionId: 'back',
          targetSessionId: sessionId,
          targetPath: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      initialMessages: [
        messageRecord({ id: '66666666-6666-4666-8666-000000000001', screenJsonId: first.id }),
        messageRecord({ id: '66666666-6666-4666-8666-000000000002', screenJsonId: second.id }),
      ],
      initialScreenJsons: [first, second],
    });
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    await expect(service.deleteSession(userId, sessionId)).resolves.toEqual({ success: true });

    expect(repo.deleteSession).toHaveBeenCalledWith(userId, sessionId);
    expect(screenJsons).toEqual([]);
    expect(messages).toEqual([]);
    expect(actionLinks).toEqual([
      expect.objectContaining({
        actionId: 'back',
        sourceSessionId: childSessionId,
        targetSessionId: null,
      }),
    ]);
  });

  it('updates prompt session visibility without generating a new ScreenJSON version', async () => {
    const current = screenJsonRecord({ id: screenId, version: 1 });
    const { repo, screenJsons } = createFakeRepository({ initialScreenJsons: [current] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    const result = await service.updateSessionVisibility(userId, sessionId, {
      visibility: 'public',
    });

    expect(result.session.visibility).toBe('public');
    expect(result.session.publishedAt).toBe(now.toISOString());
    expect(repo.updateSessionVisibility).toHaveBeenCalledWith(
      userId,
      sessionId,
      'public',
      expect.objectContaining({
        html: expect.stringContaining('data-composia-static-screen="true"'),
        screenJsonId: current.id,
      })
    );
    expect(screenJsons).toEqual([current]);
    expect(repo.createScreenJson).not.toHaveBeenCalled();
    expect(layoutService.generateLayout).not.toHaveBeenCalled();
  });

  it('saves a provided ScreenJSON schema as a new version without calling the layout service', async () => {
    const current = screenJsonRecord({ id: screenId, version: 1 });
    const nextSchema = schema({
      page: 'Linked Flower Shop',
      sections: [
        {
          component: 'InsightPanel',
          source: 'summary',
          props: {
            title: 'Fresh flowers',
            body: 'Seasonal bouquets are ready.',
          },
          actions: [
            {
              id: 'flower-detail',
              label: 'Flower details',
              kind: 'generate-screen',
              target: '/prompt/session/44444444-4444-4444-9444-444444444444',
            },
          ],
        },
      ],
    });
    const { repo } = createFakeRepository({ initialScreenJsons: [current] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    const result = await service.saveSessionScreenJson(userId, sessionId, {
      prompt: 'リンク設定を保存',
      schema: nextSchema,
    });

    expect(result.screen.id).toBe(editScreenId);
    expect(result.screen.version).toBe(2);
    expect(result.screen.schema.page).toBe('Linked Flower Shop');
    expect(repo.createScreenJson).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'リンク設定を保存',
        trigger: 'chat-edit',
        version: 2,
      })
    );
    expect(repo.createScreenJson).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: expect.objectContaining({
          page: 'Linked Flower Shop',
          sections: expect.arrayContaining([
            expect.objectContaining({
              actions: expect.arrayContaining([
                expect.objectContaining({
                  id: 'flower-detail',
                  target: '/prompt/session/44444444-4444-4444-9444-444444444444',
                }),
              ]),
            }),
          ]),
        }),
      })
    );
    expect(repo.updateSessionActiveScreenJson).toHaveBeenCalledWith(sessionId, editScreenId);
    expect(layoutService.generateLayout).not.toHaveBeenCalled();
  });

  it('edits from the active checkpoint using only compact current JSON and the latest instruction', async () => {
    const current = screenJsonRecord({ id: screenId, version: 1 });
    const future = screenJsonRecord({
      id: childScreenId,
      version: 2,
      schema: schema({ page: 'Future' }),
    });
    const { repo } = createFakeRepository({ initialScreenJsons: [future, current] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({
        schema: schema({ page: 'Edited Flower Shop', intent: 'Edited intent' }),
        activities: [],
      })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    const result = await service.edit(userId, sessionId, { prompt: 'タイトルを控えめにする' });

    expect(result.screen.id).toBe(editScreenId);
    expect(result.screen.version).toBe(2);
    expect(repo.deleteScreenJsonsAfterVersion).toHaveBeenCalledWith(sessionId, 1);
    expect(repo.createScreenJson).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'タイトルを控えめにする',
        trigger: 'chat-edit',
        version: 2,
      })
    );
    expect(layoutService.generateLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"page":"Flower Shop"'),
      })
    );
    expect(layoutService.generateLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.not.stringContaining('"page": "Flower Shop"'),
      })
    );
    expect(layoutService.generateLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Latest user instruction:\nタイトルを控えめにする'),
      })
    );
  });

  it('returns a parseable screen response when an edit removes page-level intent copy', async () => {
    const current = screenJsonRecord({ id: screenId, version: 1 });
    const { repo } = createFakeRepository({ initialScreenJsons: [current] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({
        schema: schema({ page: 'Home', intent: '' }),
        activities: [],
      })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    const result = await service.edit(userId, sessionId, {
      prompt: 'ページ上部の説明文を消す',
    });

    expect(result.screen.inferredIntent).toBe('');
    expect(screenResponseSchema.parse(result).screen.inferredIntent).toBe('');
  });

  it('rejects edit prompts that exceed the 24k token budget before calling the LLM', async () => {
    const current = screenJsonRecord({
      id: screenId,
      version: 1,
      schema: schema({
        sections: [
          {
            component: 'InsightPanel',
            source: 'summary',
            props: {
              title: 'Huge payload',
              body: 'x'.repeat(80_000),
            },
          },
        ],
      }),
    });
    const { repo } = createFakeRepository({ initialScreenJsons: [current] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    await expect(service.edit(userId, sessionId, { prompt: '少しだけ直す' })).rejects.toThrow(
      'Edit prompt exceeds the 24k token budget'
    );
    expect(layoutService.generateLayout).not.toHaveBeenCalled();
    expect(repo.createScreenJson).not.toHaveBeenCalled();
  });

  it('keeps legacy generated_screens replayable during migration', async () => {
    const legacy = legacyScreenRecord();
    const { repo } = createFakeRepository({ initialLegacyScreens: [legacy] });
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    const result = await service.get(userId, legacy.id);

    expect(result.screen.id).toBe(legacy.id);
    expect(result.screen.version).toBe(1);
    expect(layoutService.generateLayout).not.toHaveBeenCalled();
  });
});
