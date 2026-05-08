import { describe, expect, it } from 'vitest';
import {
  aiJsonMaxOutputTokens,
  appUiSchemaJsonSchema,
  layoutSystemContext,
  parseJsonText,
} from '../api/modules/ai/ai.provider';
import { componentDefinitions } from '../shared/schemas/app-catalog.schema';

describe('ai provider system context', () => {
  it('keeps generation mechanics out of visible UI labels', () => {
    expect(layoutSystemContext).toContain('strict JSON only');
    expect(layoutSystemContext).toContain('No Markdown or prose');
    expect(layoutSystemContext).toContain('Do not output null values');
    expect(layoutSystemContext).toContain('visible product copy');
    expect(layoutSystemContext).toContain('Never mention generate/create/infer/build');
    expect(layoutSystemContext).toContain(
      'Keep generation mechanics only in action.kind and intentHint'
    );
    expect(layoutSystemContext).toContain('Do not write labels like');
    expect(layoutSystemContext).toContain('Do not use layout:"sidebar"');
    expect(layoutSystemContext).toContain('top-level navigation.items');
    expect(layoutSystemContext).toContain('SidebarPage is a legacy renderer compatibility path');
    expect(layoutSystemContext).toContain('Keep page titles compact');
    expect(layoutSystemContext).toContain('The page and intent fields are internal metadata');
    expect(layoutSystemContext).toContain('Do not create sections that merely restate the request');
    expect(layoutSystemContext).toContain('Do not create generic overview');
    expect(layoutSystemContext).toContain('InsightPanel is not available');
    expect(layoutSystemContext).toContain('Use KpiSummarySection only when');
    expect(layoutSystemContext).toContain('Use ChartSection only for numeric');
    expect(layoutSystemContext).toContain('Use ProgressListSection for completion');
    expect(layoutSystemContext).toContain('Do not create page-level side menus');
    expect(layoutSystemContext).toContain('Use MainSearchNavigationSection for Amazon-style');
    expect(layoutSystemContext).toContain('NavigationPanel only as compact local tab navigation');
    expect(layoutSystemContext).toContain('hierarchy, tree, archive, or related-post list');
    expect(layoutSystemContext).toContain('Do not add newsletter');
    expect(layoutSystemContext).toContain('ニュースレター registration');
    expect(layoutSystemContext).toContain('main-search navigation');
    expect(layoutSystemContext).toContain('hero/carousel/card-grid');
    expect(layoutSystemContext).toContain('master-detail/inbox');
    expect(layoutSystemContext).toContain('options must always be objects');
    expect(layoutSystemContext).toContain('never return string arrays');
    expect(layoutSystemContext).toContain('DataTableSection rows');
    expect(layoutSystemContext).toContain('Never put nested objects or arrays inside row cells');
  });

  it('keeps legacy sidebar navigation out of new provider-generated screens', () => {
    expect(appUiSchemaJsonSchema.properties.layout.enum).not.toContain('sidebar');
    expect(appUiSchemaJsonSchema.properties).not.toHaveProperty('navigation');
    expect(layoutSystemContext).not.toContain('Use sidebar + navigation.items');
  });

  it('allows larger structured UI responses before provider truncation', () => {
    expect(aiJsonMaxOutputTokens).toBe(8000);
  });

  it('constrains FormSection select options in the provider JSON schema', () => {
    const sectionItem = appUiSchemaJsonSchema.properties.sections.items;
    const formSection = sectionItem.oneOf.find(
      (item) => (item.properties.component as { const?: string }).const === 'FormSection'
    );
    const formSectionDefinition = componentDefinitions.find(
      (definition) => definition.name === 'FormSection'
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
    expect((formSection?.properties.source as { enum?: string[] }).enum).toEqual(
      formSectionDefinition?.allowedSources
    );
  });

  it('does not require FormSection fields in the provider JSON schema', () => {
    const sectionItem = appUiSchemaJsonSchema.properties.sections.items;
    const formSection = sectionItem.oneOf.find(
      (item) => (item.properties.component as { const?: string }).const === 'FormSection'
    );

    expect(formSection?.properties.props.required).toEqual(['title']);
    expect(formSection?.properties.props.properties.fields.minItems).toBeUndefined();
  });

  it('offers only section components to the layout provider sections array', () => {
    const sectionItem = appUiSchemaJsonSchema.properties.sections.items;
    const nonFormSection = sectionItem.oneOf.find(
      (item) => (item.properties.component as { enum?: string[] }).enum
    );
    const providerSectionNames =
      (nonFormSection?.properties.component as { enum?: string[] }).enum ?? [];
    const catalogSectionNames = componentDefinitions
      .filter(
        (definition) =>
          definition.placement === 'section' &&
          definition.name !== 'FormSection' &&
          definition.name !== 'InsightPanel'
      )
      .map((definition) => definition.name)
      .sort();

    expect([...providerSectionNames].sort()).toEqual(catalogSectionNames);
    expect(providerSectionNames).not.toContain('InsightPanel');
    expect(providerSectionNames).not.toContain('DashboardPage');
    expect(layoutSystemContext).not.toContain('Allowed components:');
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
