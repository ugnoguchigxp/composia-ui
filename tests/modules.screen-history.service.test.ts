import { describe, expect, it, vi } from 'vitest';
import type {
  GeneratedScreenRecord,
  PromptSessionRecord,
  ScreenHistoryRepository,
} from '../api/modules/screen-history/screen-history.repository';
import { createScreenHistoryService } from '../api/modules/screen-history/screen-history.service';
import type { AppUiSchema } from '../shared/schemas/ui-schema.schema';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const screenId = '33333333-3333-4333-8333-333333333333';
const childScreenId = '44444444-4444-4444-8444-444444444444';
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
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function screenRecord(input: Partial<GeneratedScreenRecord> = {}): GeneratedScreenRecord {
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

function createFakeRepository(initialScreens: GeneratedScreenRecord[] = []) {
  const screens = [...initialScreens];
  const repo: ScreenHistoryRepository = {
    createScreen: vi.fn(async (input) => {
      const created = screenRecord({
        ...input,
        id: input.parentScreenId ? childScreenId : screenId,
      });
      screens.push(created);
      return created;
    }),
    createSession: vi.fn(async (input) => sessionRecord(input)),
    deleteScreen: vi.fn(async (_userId, id) => {
      const index = screens.findIndex((screen) => screen.id === id);
      if (index >= 0) screens.splice(index, 1);
    }),
    findScreenById: vi.fn(async (_userId, id) => {
      const screen = screens.find((item) => item.id === id);
      return screen ? { screen, session: sessionRecord() } : null;
    }),
    listChildren: vi.fn(async (_userId, parentId) =>
      screens
        .filter((screen) => screen.parentScreenId === parentId)
        .map((screen) => ({ screen, session: sessionRecord() }))
    ),
    listScreens: vi.fn(async () => screens.map((screen) => ({ screen, session: sessionRecord() }))),
  };
  return repo;
}

describe('screen history service', () => {
  it('generates a prompt screen and persists the validated schema', async () => {
    const repo = createFakeRepository();
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
    expect(repo.createSession).toHaveBeenCalledWith({
      createdBy: userId,
      title: 'ECサイトのトップ画面',
    });
    expect(repo.createScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'ECサイトのトップ画面',
        trigger: 'initial-prompt',
      })
    );
  });

  it('generates a child screen from a clicked action', async () => {
    const parent = screenRecord();
    const repo = createFakeRepository([parent]);
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

    expect(result.screen.parentScreenId).toBe(parent.id);
    expect(result.screen.trigger).toBe('action-click');
    expect(result.screen.schema.page).toBe('Flower Details');
    expect(layoutService.generateLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Clicked action label: Flower details'),
      })
    );
  });

  it('uses the stored screen action instead of trusting client action overrides', async () => {
    const parent = screenRecord();
    const repo = createFakeRepository([parent]);
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
    const parent = screenRecord();
    const repo = createFakeRepository([parent]);
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

  it('replays a saved screen without calling the layout service', async () => {
    const repo = createFakeRepository([screenRecord()]);
    const layoutService = {
      generateLayout: vi.fn(async () => ({ schema: schema(), activities: [] })),
    };
    const service = createScreenHistoryService(repo, layoutService);

    const result = await service.get(userId, screenId);

    expect(result.screen.id).toBe(screenId);
    expect(result.activities).toEqual([]);
    expect(layoutService.generateLayout).not.toHaveBeenCalled();
  });
});
