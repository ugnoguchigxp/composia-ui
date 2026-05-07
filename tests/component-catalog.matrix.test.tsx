import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  componentDefinitions,
  validateAppUiSchemaCatalog,
} from '../shared/schemas/app-catalog.schema';
import { appUiSchemaSchema } from '../shared/schemas/ui-schema.schema';
import { JsonRenderRenderer } from '../src/modules/ui-schema/components/JsonRenderRenderer';
import { appUiSchemaToJsonRenderSpec } from '../src/modules/ui-schema/services/ui-schema-to-json-render.service';
import {
  createSchemaForPageShell,
  createSchemaForSection,
  type PageShellComponentName,
  pageShellLayoutByComponent,
  type SectionComponentName,
  sectionComponentFixtures,
} from './fixtures/app-ui-schema-fixtures';

describe('component catalog matrix', () => {
  it('keeps a fixture for every catalog component', () => {
    const covered = [
      ...Object.keys(pageShellLayoutByComponent),
      ...Object.keys(sectionComponentFixtures),
    ].sort();

    expect(componentDefinitions.map((definition) => definition.name).sort()).toEqual(covered);
  });

  it.each(
    Object.keys(pageShellLayoutByComponent) as PageShellComponentName[]
  )('maps %s to a renderable page shell', (component) => {
    const schema = appUiSchemaSchema.parse(createSchemaForPageShell(component));
    const spec = appUiSchemaToJsonRenderSpec(schema);
    const html = renderToStaticMarkup(<JsonRenderRenderer schema={schema} />);

    expect(spec.elements[spec.root].type).toBe(component);
    expect(validateAppUiSchemaCatalog(schema)).toEqual([]);
    expect(html).toContain(`${component} root fixture`);
    expect(html).not.toContain('<h1');
    expect(html).toContain(`${component} child content`);
  });

  it('keeps generated page shell metadata out of the visible H1 header slot', () => {
    const schema = appUiSchemaSchema.parse(createSchemaForPageShell('DashboardPage'));
    const html = renderToStaticMarkup(<JsonRenderRenderer schema={schema} />);

    expect(html).not.toContain('<h1');
    expect(html).toContain('aria-label="DashboardPage root fixture"');
  });

  it('renders NavigationPanel as tab-style navigation instead of a button-card menu', () => {
    const schema = appUiSchemaSchema.parse(createSchemaForSection('NavigationPanel'));
    const html = renderToStaticMarkup(<JsonRenderRenderer schema={schema} />);

    expect(html).toContain('sr-only');
    expect(html).toContain('flex-wrap');
    expect(html).toContain('border-b-2');
    expect(html).not.toContain('overflow-x-auto');
    expect(html).not.toContain('px-ui-button');
    expect(html).not.toContain('rounded-lg border p-');
  });

  it.each(
    Object.keys(sectionComponentFixtures) as SectionComponentName[]
  )('validates and renders %s', (component) => {
    const fixture = sectionComponentFixtures[component];
    const schema = appUiSchemaSchema.parse(createSchemaForSection(component));
    const spec = appUiSchemaToJsonRenderSpec(schema);
    const html = renderToStaticMarkup(<JsonRenderRenderer schema={schema} />);
    const sectionElement = Object.values(spec.elements).find(
      (element) => element.type === component
    );

    expect(sectionElement).toBeDefined();
    expect(validateAppUiSchemaCatalog(schema)).toEqual([]);
    expect(html).toContain(fixture.expectedText);
  });
});
