import { describe, expect, it } from 'vitest';
import {
  getComponentDefinition,
  listComponentDefinitions,
  validateComponentProps,
} from '../src/modules/component-registry/services/registry.service';

describe('registry service', () => {
  it('lists component definitions from the catalog', () => {
    const definitions = listComponentDefinitions();
    expect(definitions.length).toBeGreaterThan(0);
    expect(definitions.some((d) => d.name === 'InsightPanel')).toBe(true);
  });

  it('retrieves a specific component definition', () => {
    const definition = getComponentDefinition('InsightPanel');
    expect(definition).toBeDefined();
    expect(definition?.name).toBe('InsightPanel');
  });

  it('validates component props', () => {
    const result = validateComponentProps('InsightPanel', {
      title: 'Test',
      body: 'Body',
    });
    expect(result).toHaveLength(0);

    const invalidResult = validateComponentProps('InsightPanel', {
      title: 123, // Should be string
    });
    expect(invalidResult.length).toBeGreaterThan(0);
  });
});
