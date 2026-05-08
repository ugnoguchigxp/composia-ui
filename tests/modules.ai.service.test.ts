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

  it('normalizes string select options before catalog validation', async () => {
    const service = createAiService({
      generateLayout: async () => ({
        page: 'Incident workflow',
        intent: 'Create an incident response form',
        layout: 'form',
        sections: [
          {
            component: 'FormSection',
            source: 'app',
            props: {
              title: 'Incident triage',
              fields: [
                { name: 'title', label: 'Title', type: 'text' },
                {
                  name: 'priority',
                  label: 'Priority',
                  type: 'select',
                  options: ['高', '中', '低'],
                  value: '高',
                },
              ],
              submitLabel: 'Save',
            },
          },
        ],
      }),
    });

    await expect(service.generateLayout({ prompt: 'Make an incident form' })).resolves.toEqual(
      expect.objectContaining({
        schema: expect.objectContaining({
          sections: [
            expect.objectContaining({
              component: 'FormSection',
              props: expect.objectContaining({
                fields: [
                  { name: 'title', label: 'Title', type: 'text' },
                  {
                    name: 'priority',
                    label: 'Priority',
                    type: 'select',
                    options: [
                      { label: '高', value: '高' },
                      { label: '中', value: '中' },
                      { label: '低', value: '低' },
                    ],
                    value: '高',
                  },
                ],
              }),
            }),
          ],
        }),
      })
    );
  });

  it('fills default-safe catalog props before returning generated layouts', async () => {
    const service = createAiService({
      generateLayout: async () => ({
        page: 'Marketplace',
        intent: 'Build a marketplace screen',
        layout: 'screen',
        sections: [
          {
            component: 'MainSearchNavigationSection',
            source: 'app',
            props: {
              title: 'Composia Market',
            },
          },
        ],
      }),
    });

    await expect(
      service.generateLayout({ prompt: 'Amazon like search navigation' })
    ).resolves.toEqual(
      expect.objectContaining({
        schema: expect.objectContaining({
          sections: [
            expect.objectContaining({
              component: 'MainSearchNavigationSection',
              props: expect.objectContaining({
                searchPlaceholder: '商品を検索',
                searchButtonLabel: '検索',
                links: [
                  { label: 'おすすめ', href: '/' },
                  { label: 'セール', href: '/deals' },
                  { label: 'ランキング', href: '/ranking' },
                  { label: 'カート', href: '/cart' },
                ],
              }),
            }),
          ],
        }),
      })
    );
  });

  it('accepts empty page intent from edit requests that remove page-level copy', async () => {
    const service = createAiService({
      generateLayout: async () => ({
        page: 'Home',
        intent: '',
        layout: 'screen',
        sections: [
          {
            component: 'NavigationPanel',
            source: 'navigation',
            props: {
              title: 'Menu',
              links: [
                { label: 'Home', href: '/' },
                { label: 'Deals', href: '/deals' },
              ],
            },
          },
        ],
      }),
    });

    await expect(
      service.generateLayout({ prompt: 'Remove the page-level Home description copy' })
    ).resolves.toMatchObject({
      schema: {
        page: 'Home',
        intent: '',
      },
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
