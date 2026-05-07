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
    expect(html).toContain(`${component} child content`);
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
