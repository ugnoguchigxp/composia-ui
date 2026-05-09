import { describe, expect, it } from 'vitest';
import { createAiService } from '../api/modules/ai/ai.service';
import { validateAppUiSchemaCatalog } from '../shared/schemas/app-catalog.schema';
import { appUiSchemaSchema } from '../shared/schemas/ui-schema.schema';
import { goldenPromptFixtures, unsafeImageGoldenPromptFixture } from './fixtures/golden-prompts';

function collectValuesByKey(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectValuesByKey(item, key));
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([entryKey, entryValue]) => [
    ...(entryKey === key ? [entryValue] : []),
    ...collectValuesByKey(entryValue, key),
  ]);
}

describe('golden prompt fixtures', () => {
  it.each(
    goldenPromptFixtures
  )('accepts %s fixture through schema and catalog validation', async (fixture) => {
    const service = createAiService({
      generateLayout: async () => fixture.schema,
    });

    const result = await service.generateLayout({ prompt: fixture.prompt });
    const parsed = appUiSchemaSchema.parse(result.schema);
    const issues = validateAppUiSchemaCatalog(parsed);

    expect(issues, fixture.id).toEqual([]);
  });

  it('keeps fixture links app-relative and visible labels free of generation mechanics', async () => {
    const forbidden = /(generate|create|infer|build|生成|作成).*(screen|page|ui|画面|ページ)/i;
    let hrefCount = 0;

    for (const fixture of goldenPromptFixtures) {
      const hrefs = collectValuesByKey(fixture.schema, 'href');
      hrefCount += hrefs.length;
      for (const href of hrefs) {
        expect(typeof href, fixture.id).toBe('string');
        expect(href, fixture.id).toMatch(/^\/(?!\/)/);
        expect(href, fixture.id).not.toContain('\\');
      }

      const visibleLabels = [
        ...collectValuesByKey(fixture.schema, 'title'),
        ...collectValuesByKey(fixture.schema, 'label'),
      ].filter((value): value is string => typeof value === 'string');
      expect(
        visibleLabels.some((value) => forbidden.test(value)),
        fixture.id
      ).toBe(false);
    }

    expect(hrefCount).toBeGreaterThan(0);
  });

  it('rejects unsafe image URLs in golden fixtures', async () => {
    const service = createAiService({
      generateLayout: async () => unsafeImageGoldenPromptFixture.schema,
    });

    await expect(
      service.generateLayout({ prompt: unsafeImageGoldenPromptFixture.prompt })
    ).rejects.toThrow('AI returned a schema outside the component catalog');
  });
});
