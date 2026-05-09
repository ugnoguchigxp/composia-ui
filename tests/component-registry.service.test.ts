import { describe, expect, it } from 'vitest';
import { appUiSchemaSchema } from '../shared/schemas/ui-schema.schema';
import {
  isAppComponentName,
  validateAppUiSchemaCatalog,
  validateComponentProps,
} from '../src/modules/component-registry/services/registry.service';

describe('component registry service', () => {
  it('recognizes allowlisted high-level components', () => {
    expect(isAppComponentName('InsightPanel')).toBe(true);
    expect(isAppComponentName('ChartSection')).toBe(true);
    expect(isAppComponentName('ProgressListSection')).toBe(true);
    expect(isAppComponentName('CarouselSection')).toBe(true);
    expect(isAppComponentName('StepperSection')).toBe(true);
    expect(isAppComponentName('EditorPreviewSection')).toBe(true);
    expect(isAppComponentName('Button')).toBe(false);
  });

  it('validates props before rendering', () => {
    const issues = validateComponentProps('KpiSummarySection', {
      title: 'Metrics',
      items: 'not an array',
    });

    expect(issues.some((issue) => issue.message.includes('expected array'))).toBe(true);
  });

  it('rejects AI-controlled non-relative action hrefs', () => {
    const issues = validateComponentProps('InsightPanel', {
      title: 'Unsafe link',
      body: 'This link should not be renderable.',
      action: {
        label: 'Run',
        href: 'javascript:alert(1)',
      },
    });

    expect(issues).toEqual([
      {
        path: 'InsightPanel.action.href',
        message: 'href must be an app-relative path',
      },
    ]);
  });

  it('accepts app-relative action hrefs', () => {
    expect(
      validateComponentProps('InsightPanel', {
        title: 'Safe link',
        body: 'This link stays inside the app.',
        action: {
          label: 'Open',
          href: '/history',
        },
      })
    ).toEqual([]);
  });

  it('rejects AI-controlled image URLs outside the allowlist', () => {
    const issues = validateComponentProps('ImageSection', {
      title: 'Unsafe image',
      image: {
        src: 'http://picsum.photos/seed/unsafe-image/1200/720',
        alt: 'Unsafe image',
      },
    });

    expect(issues).toEqual([
      {
        path: 'ImageSection.image.src',
        message: 'image src must be an allowed HTTPS image URL or /images asset path',
      },
    ]);
  });

  it('accepts allowlisted picsum image URLs', () => {
    expect(
      validateComponentProps('ImageSection', {
        title: 'Safe image',
        image: {
          src: 'https://picsum.photos/seed/safe-image/1200/720',
          alt: 'Safe image',
        },
      })
    ).toEqual([]);
  });

  it('accepts local public image asset paths', () => {
    expect(
      validateComponentProps('ImageSection', {
        title: 'Uploaded image',
        image: {
          src: '/images/screenshot1.png',
          alt: 'Uploaded image',
        },
      })
    ).toEqual([]);
  });

  it('rejects unsafe carousel item hrefs', () => {
    const issues = validateComponentProps('CarouselSection', {
      title: 'Products',
      items: [
        {
          title: 'Unsafe product',
          href: 'javascript:alert(1)',
        },
        {
          title: 'Safe product',
          href: '/products/safe',
        },
      ],
    });

    expect(issues).toEqual([
      {
        path: 'CarouselSection.items.0.href',
        message: 'href must be an app-relative path',
      },
    ]);
  });

  it('accepts structured card metadata from AI output', () => {
    expect(
      validateComponentProps('CardGridSection', {
        title: 'Products',
        items: [
          {
            title: 'Seasonal bouquet',
            meta: { label: 'Price', value: '¥4,800' },
          },
          {
            title: 'Gift set',
            meta: { stock: 'In stock', delivery: 'Tomorrow' },
          },
        ],
      })
    ).toEqual([]);
  });

  it('rejects source bindings outside the component definition', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'Operations',
      intent: 'Show table',
      layout: 'dashboard',
      sections: [
        {
          component: 'DataTableSection',
          source: 'rss',
          props: {
            title: 'Articles',
            columns: [{ key: 'title', label: 'Title' }],
            rows: [],
          },
        },
      ],
    });

    expect(validateAppUiSchemaCatalog(schema)).toEqual([
      {
        path: 'sections.0.source',
        message: 'DataTableSection cannot read from source rss',
      },
    ]);
  });
});
