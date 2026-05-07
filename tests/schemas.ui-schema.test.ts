import { describe, expect, it } from 'vitest';
import { appUiSchemaSchema } from '../shared/schemas/ui-schema.schema';

describe('ui schema', () => {
  it('validates a high-level app UI schema', () => {
    const parsed = appUiSchemaSchema.parse({
      page: 'Operations',
      intent: 'Show the current operations dashboard',
      layout: 'dashboard',
      density: 'compact',
      tone: 'neutral',
      sections: [
        {
          component: 'InsightPanel',
          source: 'summary',
          props: {
            title: 'Current state',
            body: 'All systems are nominal.',
          },
        },
      ],
    });

    expect(parsed.layout).toBe('dashboard');
    expect(parsed.sections[0].component).toBe('InsightPanel');
  });

  it('validates generated screen actions on sections', () => {
    const parsed = appUiSchemaSchema.parse({
      page: 'Flower Shop',
      intent: 'EC top page',
      layout: 'screen',
      sections: [
        {
          component: 'InsightPanel',
          source: 'summary',
          props: {
            title: 'Flowers',
            body: 'Seasonal bouquets.',
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
    });

    expect(parsed.sections[0].actions[0]).toMatchObject({
      id: 'flower-detail',
      kind: 'generate-screen',
    });
  });

  it('rejects unsafe action targets', () => {
    expect(() =>
      appUiSchemaSchema.parse({
        page: 'Unsafe',
        intent: 'Reject unsafe action target',
        layout: 'screen',
        sections: [
          {
            component: 'NavigationPanel',
            source: 'navigation',
            props: {
              title: 'Navigation',
              links: [{ label: 'Home', href: '/' }],
            },
            actions: [
              {
                id: 'unsafe',
                label: 'Unsafe',
                kind: 'navigate',
                target: 'javascript:alert(1)',
              },
            ],
          },
        ],
      })
    ).toThrow('href must be an app-relative path');
  });

  it('rejects unknown layouts', () => {
    expect(() =>
      appUiSchemaSchema.parse({
        page: 'Operations',
        intent: 'Show the current operations dashboard',
        layout: 'freehand',
        sections: [],
      })
    ).toThrow();
  });

  it('rejects low-level or invalid component names', () => {
    expect(() =>
      appUiSchemaSchema.parse({
        page: 'Operations',
        intent: 'Show the current operations dashboard',
        layout: 'dashboard',
        sections: [
          {
            component: 'button',
            source: 'summary',
            props: {},
          },
        ],
      })
    ).toThrow();
  });
});
