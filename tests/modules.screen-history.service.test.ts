import { describe, expect, it, vi } from 'vitest';
import type {
  GeneratedScreenRecord,
  GeneratedScreenWithSessionRecord,
  PromptSessionMessageRecord,
  PromptSessionRecord,
  ScreenHistoryRepository,
  ScreenJsonRecord,
  ScreenJsonWithSessionRecord,
} from '../api/modules/screen-history/screen-history.repository';
import { createScreenHistoryService } from '../api/modules/screen-history/screen-history.service';
import type { AppUiSchema } from '../shared/schemas/ui-schema.schema';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const screenId = '33333333-3333-4333-8333-333333333333';
const childScreenId = '44444444-4444-4444-8444-444444444444';
const editScreenId = '55555555-5555-4555-8555-555555555555';
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
  initialMessages = [],
  initialLegacyScreens = [],
  initialScreenJsons = [],
}: {
  initialMessages?: PromptSessionMessageRecord[];
  initialLegacyScreens?: GeneratedScreenRecord[];
  initialScreenJsons?: ScreenJsonRecord[];
} = {}) {
  let session = sessionRecord({
    activeScreenJsonId: initialScreenJsons.at(-1)?.id ?? screenId,
  });
  const screenJsons = [...initialScreenJsons];
  const legacyScreens = [...initialLegacyScreens];
  const messages: PromptSessionMessageRecord[] = [...initialMessages];

  const withSession = (screenJson: ScreenJsonRecord): ScreenJsonWithSessionRecord => ({
    screenJson,
    session,
  });
  const legacyWithSession = (screen: GeneratedScreenRecord): GeneratedScreenWithSessionRecord => ({
    screen,
    session,
  });

  const repo: ScreenHistoryRepository = {
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
          input.version === 1
            ? screenId
            : input.trigger === 'chat-edit'
              ? editScreenId
              : childScreenId,
      });
      screenJsons.push(created);
      return created;
    }),
    createSession: vi.fn(async (input) => {
      session = sessionRecord({ ...input, activeScreenJsonId: input.activeScreenJsonId ?? null });
      return session;
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
    findLegacyScreenById: vi.fn(async (_userId, id) => {
      const screen = legacyScreens.find((item) => item.id === id);
      return screen ? legacyWithSession(screen) : null;
    }),
    findScreenJsonById: vi.fn(async (_userId, id) => {
      const screenJson = screenJsons.find((item) => item.id === id);
      return screenJson ? withSession(screenJson) : null;
    }),
    findSessionById: vi.fn(async (_userId, id) => (id === session.id ? session : null)),
    listLegacyChildren: vi.fn(async (_userId, parentId) =>
      legacyScreens
        .filter((screen) => screen.parentScreenId === parentId)
        .map((screen) => legacyWithSession(screen))
    ),
    listLegacyScreens: vi.fn(async () => legacyScreens.map((screen) => legacyWithSession(screen))),
    listScreenJsons: vi.fn(async () => screenJsons.map((screenJson) => withSession(screenJson))),
    listSessionMessages: vi.fn(async () => messages),
    listSessionScreenJsons: vi.fn(async () =>
      [...screenJsons]
        .sort((a, b) => a.version - b.version)
        .map((screenJson) => withSession(screenJson))
    ),
    updateSessionActiveScreenJson: vi.fn(async (_sessionId, screenJsonId) => {
      session = sessionRecord({ ...session, activeScreenJsonId: screenJsonId });
      return session;
    }),
  };
  return { messages, repo, screenJsons };
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

  it('generates the next ScreenJSON from a clicked action', async () => {
    const parent = screenJsonRecord();
    const { repo } = createFakeRepository({ initialScreenJsons: [parent] });
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
    expect(result.screen.version).toBe(2);
    expect(result.screen.trigger).toBe('action-click');
    expect(result.screen.schema.page).toBe('Flower Details');
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
