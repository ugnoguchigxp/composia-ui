import { describe, expect, it } from 'vitest';
import {
  validateAppUiSchemaCatalog,
  validateComponentProps,
} from '../shared/schemas/app-catalog.schema';
import { appUiSchemaSchema } from '../shared/schemas/ui-schema.schema';
import {
  createSchemaForSection,
  type SectionComponentName,
  sectionComponentFixtures,
} from './fixtures/app-ui-schema-fixtures';

function collectValuesByKey(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectValuesByKey(item, key));
  }

  if (typeof value !== 'object' || value === null) return [];

  return Object.entries(value).flatMap(([entryKey, entryValue]) => [
    ...(entryKey === key ? [entryValue] : []),
    ...collectValuesByKey(entryValue, key),
  ]);
}

function collectStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }

  if (typeof value === 'string') return [value];
  if (typeof value !== 'object' || value === null) return [];

  return Object.values(value).flatMap(collectStrings);
}

describe('UI schema invariants', () => {
  it('keeps fixture hrefs app-relative', () => {
    let hrefCount = 0;
    for (const component of Object.keys(sectionComponentFixtures) as SectionComponentName[]) {
      const schema = createSchemaForSection(component);
      const hrefs = collectValuesByKey(schema, 'href');

      hrefCount += hrefs.length;
      for (const href of hrefs) {
        expect(typeof href, component).toBe('string');
        expect(href, component).toMatch(/^\/(?!\/)/);
        expect(href, component).not.toContain('\\');
      }
    }
    expect(hrefCount).toBeGreaterThan(0);
  });

  it('rejects source mismatches for every section component fixture', () => {
    for (const component of Object.keys(sectionComponentFixtures) as SectionComponentName[]) {
      const fixture = sectionComponentFixtures[component];
      const schema = appUiSchemaSchema.parse({
        page: `${component} source mismatch`,
        intent: 'Reject source mismatch',
        layout: 'screen',
        sections: [
          {
            component,
            source: '__invalid_source__',
            props: fixture.props,
          },
        ],
      });

      expect(validateAppUiSchemaCatalog(schema), component).toEqual([
        expect.objectContaining({
          path: 'sections.0.source',
          message: expect.stringContaining('cannot read from source'),
        }),
      ]);
    }
  });

  it('rejects string arrays for structured option props at the catalog boundary', () => {
    expect(
      validateComponentProps('FormSection', {
        title: 'Invalid form',
        fields: [
          {
            name: 'priority',
            label: 'Priority',
            type: 'select',
            options: ['High', 'Low'],
          },
        ],
      })
    ).toEqual([
      {
        path: 'FormSection.fields.0.options.0',
        message: 'Invalid input: expected object, received string',
      },
      {
        path: 'FormSection.fields.0.options.1',
        message: 'Invalid input: expected object, received string',
      },
    ]);

    expect(
      validateComponentProps('FilterBarSection', {
        title: 'Invalid filters',
        filters: ['Open', 'Closed'],
      })
    ).toEqual([
      {
        path: 'FilterBarSection.filters.0',
        message: 'Invalid input: expected object, received string',
      },
      {
        path: 'FilterBarSection.filters.1',
        message: 'Invalid input: expected object, received string',
      },
    ]);
  });

  it('keeps visible fixture labels free of generation mechanics', () => {
    const forbidden = /(generate|create|infer|build|生成|作成).*(screen|page|ui|画面|ページ)/i;

    for (const component of Object.keys(sectionComponentFixtures) as SectionComponentName[]) {
      const schema = createSchemaForSection(component);
      const visibleStrings = [
        ...collectValuesByKey(schema, 'label'),
        ...collectValuesByKey(schema, 'title'),
      ].filter((value): value is string => typeof value === 'string');

      expect(
        visibleStrings.some((value) => forbidden.test(value)),
        component
      ).toBe(false);
    }
  });

  it('keeps fixtures free of deprecated landing-page filler patterns', () => {
    const deprecatedFiller =
      /(newsletter|email signup|subscribe|ニュースレター|メルマガ|メールマガジン|購読)/i;

    for (const component of Object.keys(sectionComponentFixtures) as SectionComponentName[]) {
      const schema = createSchemaForSection(component);

      expect(
        collectStrings(schema).some((value) => deprecatedFiller.test(value)),
        component
      ).toBe(false);
    }
  });
});
