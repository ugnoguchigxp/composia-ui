import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { componentDefinitionSchema } from '../shared/schemas/component-registry.schema';

describe('component registry schema', () => {
  it('accepts component definitions with zod props schemas', () => {
    const definition = componentDefinitionSchema.parse({
      name: 'InsightPanel',
      description: 'Insight panel',
      allowedSources: ['summary'],
      propsSchema: z.object({
        title: z.string(),
      }),
    });

    expect(definition.name).toBe('InsightPanel');
    expect(definition.propsSchema.safeParse({ title: 'A' }).success).toBe(true);
  });

  it('rejects component definitions without zod props schemas', () => {
    expect(() =>
      componentDefinitionSchema.parse({
        name: 'InsightPanel',
        description: 'Insight panel',
        allowedSources: ['summary'],
        propsSchema: { title: 'string' },
      })
    ).toThrow();
  });
});
