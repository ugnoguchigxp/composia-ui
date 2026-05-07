import { describe, expect, it } from 'vitest';
import { componentDefinitions, componentPropsSchemas } from '../shared/schemas/app-catalog.schema';
import { appJsonRenderComponentMap } from '../src/modules/component-registry/components/registry';

describe('Component Catalog Parity', () => {
  const definitionNames = componentDefinitions.map((d) => d.name).sort();
  const schemaNames = Object.keys(componentPropsSchemas).sort();
  const registryNames = Object.keys(appJsonRenderComponentMap).sort();

  it('definitions and props schemas should have the same set of components', () => {
    expect(definitionNames).toEqual(schemaNames);
  });

  it('definitions and registry components should have the same set of components', () => {
    expect(definitionNames).toEqual(registryNames);
  });

  it('every component should have a valid promptProps definition', () => {
    for (const definition of componentDefinitions) {
      expect(
        definition.promptProps,
        `Component ${definition.name} should have promptProps`
      ).toBeDefined();
      expect(definition.promptProps.length).toBeGreaterThan(0);
    }
  });

  it('classifies page shells and renderable sections explicitly', () => {
    const pageShellNames = componentDefinitions
      .filter((definition) => definition.placement === 'page')
      .map((definition) => definition.name)
      .sort();
    const sectionNames = componentDefinitions
      .filter((definition) => definition.placement === 'section')
      .map((definition) => definition.name)
      .sort();

    expect(pageShellNames).toEqual([
      'ArticleFeedPage',
      'DashboardPage',
      'EditableFormPage',
      'EntityDetailPage',
      'EntityListPage',
      'SidebarPage',
    ]);
    expect(sectionNames).not.toContain('DashboardPage');
    expect(sectionNames).toContain('InsightPanel');
  });
});
