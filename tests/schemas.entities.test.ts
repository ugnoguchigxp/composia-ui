import { describe, expect, it } from 'vitest';
import { entityMetadataSchema, normalizedEntitySchema } from '../shared/schemas/entities.schema';

describe('entity schemas', () => {
  it('validates normalized entities', () => {
    const parsed = normalizedEntitySchema.parse({
      id: 'entity-1',
      source: 'rss',
      entityType: 'article',
      title: 'Release notes',
      url: 'https://example.com/release-notes',
      raw: { original: true },
    });

    expect(parsed.source).toBe('rss');
    expect(parsed.raw).toEqual({ original: true });
  });

  it('validates entity metadata', () => {
    const metadata = entityMetadataSchema.parse({
      name: 'users',
      label: 'Users',
      source: 'postgres',
      mode: 'readwrite',
      fields: [
        {
          name: 'email',
          label: 'Email',
          type: 'text',
          searchable: true,
          sortable: true,
        },
      ],
      views: {
        list: ['email'],
        detail: ['email'],
        form: ['email'],
      },
    });

    expect(metadata.fields[0].searchable).toBe(true);
  });

  it('rejects invalid entity URLs', () => {
    expect(() =>
      normalizedEntitySchema.parse({
        id: 'entity-1',
        source: 'rss',
        entityType: 'article',
        url: 'not-a-url',
        raw: {},
      })
    ).toThrow();
  });
});
