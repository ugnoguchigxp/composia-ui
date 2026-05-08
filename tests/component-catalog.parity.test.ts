import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  componentDefinitions,
  componentPropsSchemas,
  normalizeAppUiSchemaCatalog,
} from '../shared/schemas/app-catalog.schema';
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

  it('documents every catalog component in the parts list', () => {
    const docs = readFileSync(new URL('../docs/component-catalog.md', import.meta.url), 'utf8');

    for (const definition of componentDefinitions) {
      expect(docs).toContain(`\`${definition.name}\``);
    }
    expect(docs).not.toContain('Filter' + 'BarSection');
    expect(docs).not.toContain('Action' + 'FooterSection');
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

  it('exposes marketplace search tabs as a catalog variant', () => {
    expect(
      componentDefinitions.find((definition) => definition.name === 'MainSearchNavigationSection')
    ).toEqual(expect.objectContaining({ variants: ['marketplace-search-tabs'] }));
  });

  it('materializes default props for default-safe generated sections', () => {
    const schema = normalizeAppUiSchemaCatalog({
      sections: [
        {
          component: 'MainSearchNavigationSection',
          source: 'app',
          props: {},
        },
        {
          component: 'ChartSection',
          source: 'summary',
          props: { title: 'Chart' },
        },
        {
          component: 'ProgressListSection',
          source: 'summary',
          props: { title: 'Progress' },
        },
      ],
    });

    expect(
      schema.sections.find((section) => section.component === 'MainSearchNavigationSection')?.props
    ).toEqual(
      expect.objectContaining({
        searchPlaceholder: '商品を検索',
        searchButtonLabel: '検索',
        categories: [],
        links: [
          { label: 'おすすめ', href: '/' },
          { label: 'セール', href: '/deals' },
          { label: 'ランキング', href: '/ranking' },
          { label: 'カート', href: '/cart' },
        ],
      })
    );
    expect(schema.sections.find((section) => section.component === 'ChartSection')?.props).toEqual(
      expect.objectContaining({
        chartType: 'bar',
        data: [],
        height: 'md',
        showLegend: true,
        valueLabel: 'Value',
      })
    );
    expect(
      schema.sections.find((section) => section.component === 'ProgressListSection')?.props
    ).toEqual(expect.objectContaining({ items: [] }));
  });

  it('does not require generated collection props when the section itself is selected', () => {
    const schema = normalizeAppUiSchemaCatalog({
      sections: [
        { component: 'KpiSummarySection', source: 'summary', props: {} },
        { component: 'ChartSection', source: 'summary', props: { title: 'Chart' } },
        { component: 'ProgressListSection', source: 'summary', props: { title: 'Progress' } },
        { component: 'TimelineSection', source: 'api', props: { title: 'Timeline' } },
        { component: 'CarouselSection', source: 'app', props: { title: 'Carousel' } },
        { component: 'ProcessStepperSection', source: 'api', props: { title: 'Steps' } },
        { component: 'CardGridSection', source: 'app', props: { title: 'Cards' } },
        { component: 'FormSection', source: 'app', props: { title: 'Form' } },
        { component: 'MasterDetailSection', source: 'app', props: { title: 'Master detail' } },
        { component: 'KanbanSection', source: 'app', props: { title: 'Board' } },
        { component: 'CalendarSection', source: 'app', props: { title: 'Calendar' } },
        { component: 'ChatPanelSection', source: 'app', props: { title: 'Chat' } },
        { component: 'ComparisonSection', source: 'app', props: { title: 'Compare' } },
        { component: 'DataTableSection', source: 'api', props: { title: 'Table' } },
        { component: 'NavigationPanel', source: 'navigation', props: { title: 'Navigation' } },
      ],
    });
    const propsFor = (component: string) =>
      schema.sections.find((section) => section.component === component)?.props;

    expect(propsFor('KpiSummarySection')).toMatchObject({ items: [] });
    expect(propsFor('ChartSection')).toMatchObject({ data: [] });
    expect(propsFor('ProgressListSection')).toMatchObject({ items: [] });
    expect(propsFor('TimelineSection')).toMatchObject({ items: [] });
    expect(propsFor('CarouselSection')).toMatchObject({ items: [] });
    expect(propsFor('ProcessStepperSection')).toMatchObject({ steps: [] });
    expect(propsFor('CardGridSection')).toMatchObject({ items: [] });
    expect(propsFor('FormSection')).toMatchObject({ fields: [] });
    expect(propsFor('MasterDetailSection')).toMatchObject({
      detail: { title: '詳細', fields: [] },
      items: [],
    });
    expect(propsFor('KanbanSection')).toMatchObject({ columns: [] });
    expect(propsFor('CalendarSection')).toMatchObject({ events: [] });
    expect(propsFor('ChatPanelSection')).toMatchObject({ messages: [] });
    expect(propsFor('ComparisonSection')).toMatchObject({ columns: [] });
    expect(propsFor('DataTableSection')).toMatchObject({ columns: [], rows: [] });
    expect(propsFor('NavigationPanel')).toMatchObject({ links: [] });
  });

  it('does not require nested comparison column items', () => {
    const schema = normalizeAppUiSchemaCatalog({
      sections: [
        {
          component: 'ComparisonSection',
          source: 'app',
          props: {
            title: 'Compare',
            columns: [{ title: 'Option A' }],
          },
        },
      ],
    });

    expect(schema.sections[0]?.props).toMatchObject({
      columns: [{ title: 'Option A', items: [] }],
    });
  });
});
