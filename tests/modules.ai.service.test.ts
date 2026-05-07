import { describe, expect, it, vi } from 'vitest';
import { createAiService } from '../api/modules/ai/ai.service';

describe('ai service', () => {
  it('validates provider output as App UI Schema', async () => {
    const service = createAiService({
      generateLayout: async () => ({
        page: 'Operations',
        intent: 'Show operations at a glance',
        layout: 'dashboard',
        sections: [
          {
            component: 'InsightPanel',
            source: 'summary',
            props: {
              title: 'Current state',
              body: 'Everything is stable.',
              action: {
                label: 'Open history',
                href: '/history',
              },
            },
          },
        ],
      }),
    });

    await expect(
      service.generateLayout({ prompt: 'Make an operations dashboard' })
    ).resolves.toEqual({
      schema: {
        page: 'Operations',
        intent: 'Show operations at a glance',
        layout: 'dashboard',
        sections: [
          {
            component: 'InsightPanel',
            source: 'summary',
            props: {
              title: 'Current state',
              body: 'Everything is stable.',
              action: {
                label: 'Open history',
                href: '/history',
              },
            },
          },
        ],
      },
      activities: expect.arrayContaining([
        expect.objectContaining({
          id: 'provider-response',
          label: 'AI provider response',
          status: 'completed',
        }),
        expect.objectContaining({
          id: 'schema-validation',
          label: 'App UI Schema validation',
          status: 'completed',
          detail: '1 sections',
        }),
        expect.objectContaining({
          id: 'catalog-validation',
          label: 'Component catalog validation',
          status: 'completed',
        }),
      ]),
    });
  });

  it('returns a validated cached layout without calling the provider', async () => {
    const cachedSchema = {
      page: 'Cached operations',
      intent: 'Show a cached layout',
      layout: 'dashboard',
      sections: [
        {
          component: 'InsightPanel',
          source: 'summary',
          props: {
            title: 'Cached state',
            body: 'This layout came from cache.',
            action: {
              label: 'Open history',
              href: '/history',
            },
          },
        },
      ],
    };
    const provider = {
      generateLayout: vi.fn(async () => {
        throw new Error('Provider should not be called on cache hit');
      }),
    };
    const cache = {
      get: vi.fn(async () => ({ entry: { value: cachedSchema } })),
      set: vi.fn(),
    };
    const service = createAiService(provider, cache);

    await expect(service.generateLayout({ prompt: 'Make a cached dashboard' })).resolves.toEqual({
      schema: cachedSchema,
      activities: expect.arrayContaining([
        expect.objectContaining({
          id: 'layout-cache',
          label: 'Layout decision cache',
          status: 'completed',
          detail: 'hit',
        }),
        expect.objectContaining({
          id: 'catalog-validation',
          label: 'Component catalog validation',
          status: 'completed',
        }),
      ]),
    });
    expect(provider.generateLayout).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('rejects provider output outside the component catalog', async () => {
    const service = createAiService({
      generateLayout: async () => ({
        page: 'Unsafe',
        intent: 'Render an unsafe link',
        layout: 'dashboard',
        sections: [
          {
            component: 'InsightPanel',
            source: 'summary',
            props: {
              title: 'Unsafe',
              body: 'Bad link',
              action: {
                label: 'Run',
                href: 'javascript:alert(1)',
              },
            },
          },
        ],
      }),
    });

    await expect(service.generateLayout({ prompt: 'Make unsafe UI' })).rejects.toThrow(
      'AI returned a schema outside the component catalog'
    );
  });

  it('adds source context to layout provider input when a context reader is configured', async () => {
    const provider = {
      generateLayout: vi.fn(async () => ({
        page: 'Contextual',
        intent: 'Use source data',
        layout: 'dashboard',
        sections: [
          {
            component: 'InsightPanel',
            source: 'summary',
            props: {
              title: 'Context',
              body: 'Context was included.',
            },
          },
        ],
      })),
    };
    const service = createAiService(provider, undefined, {
      getLayoutContext: async () => ({
        sources: [
          {
            source: {
              id: 'source-1',
              kind: 'rss',
              label: 'Release feed',
              entityType: 'article',
              enabled: true,
            },
            items: [
              {
                id: 'item-1',
                source: 'rss',
                entityType: 'article',
                title: 'Release shipped',
                raw: {},
              },
            ],
          },
        ],
        entities: [],
      }),
    });

    await service.generateLayout({ prompt: 'Make a release dashboard' });

    expect(provider.generateLayout).toHaveBeenCalledWith(
      expect.stringContaining('Available app data context JSON')
    );
    expect(provider.generateLayout).toHaveBeenCalledWith(expect.stringContaining('Release feed'));
  });

  it('validates summarize, classify, and navigation provider output', async () => {
    const service = createAiService({
      classify: async () => ({ label: 'incident', confidence: 0.82 }),
      generateLayout: async () => ({}),
      generateNavigation: async () => ({
        links: [{ label: 'History', href: '/history', description: 'Replay generated screens' }],
      }),
      summarize: async () => ({ summary: 'A concise summary.' }),
    });

    await expect(service.summarize({ text: 'Long text' })).resolves.toMatchObject({
      summary: 'A concise summary.',
    });
    await expect(service.classify({ text: 'Outage', labels: ['incident'] })).resolves.toMatchObject(
      {
        label: 'incident',
        confidence: 0.82,
      }
    );
    await expect(service.generateNavigation({ prompt: 'History links' })).resolves.toMatchObject({
      links: [{ label: 'History', href: '/history', description: 'Replay generated screens' }],
    });
  });
});
