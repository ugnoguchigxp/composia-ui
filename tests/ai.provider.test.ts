import { describe, expect, it } from 'vitest';
import {
  aiJsonMaxOutputTokens,
  appUiSchemaJsonSchema,
  layoutSystemContext,
  parseJsonText,
} from '../api/modules/ai/ai.provider';

describe('ai provider system context', () => {
  it('keeps generation mechanics out of visible UI labels', () => {
    expect(layoutSystemContext).toContain('strict JSON only');
    expect(layoutSystemContext).toContain('No Markdown or prose');
    expect(layoutSystemContext).toContain('visible product copy');
    expect(layoutSystemContext).toContain('Never mention generate/create/infer/build');
    expect(layoutSystemContext).toContain(
      'Keep generation mechanics only in action.kind and intentHint'
    );
    expect(layoutSystemContext).toContain('Do not write labels like');
    expect(layoutSystemContext).toContain('Use sidebar + navigation.items');
    expect(layoutSystemContext).toContain('hero/carousel/card-grid');
    expect(layoutSystemContext).toContain('master-detail/inbox');
    expect(layoutSystemContext).toContain('options must always be objects');
    expect(layoutSystemContext).toContain('never return string arrays');
  });

  it('allows larger structured UI responses before provider truncation', () => {
    expect(aiJsonMaxOutputTokens).toBe(8000);
  });

  it('constrains FormSection select options in the provider JSON schema', () => {
    const sectionItem = appUiSchemaJsonSchema.properties.sections.items;
    const formSection = sectionItem.oneOf.find(
      (item) => (item.properties.component as { const?: string }).const === 'FormSection'
    );

    expect(formSection?.properties.props.properties.fields.items.properties.options.items).toEqual(
      expect.objectContaining({
        additionalProperties: false,
        required: ['label', 'value'],
        properties: expect.objectContaining({
          label: expect.objectContaining({ type: 'string' }),
          value: expect.objectContaining({ type: 'string' }),
        }),
      })
    );
  });

  it('repairs minor provider JSON syntax errors before schema validation', () => {
    expect(parseJsonText("{ page: 'Operations', sections: [1, 2,], }")).toEqual({
      page: 'Operations',
      sections: [1, 2],
    });
  });

  it('repairs fenced provider JSON through the repair library', () => {
    expect(parseJsonText('```json\n{"page":"Operations"}\n```')).toEqual({
      page: 'Operations',
    });
  });
});
