import type { EntityMetadata, FieldMetadata } from '../../../shared/schemas/entities.schema';

function field(
  input: Omit<FieldMetadata, 'required' | 'searchable' | 'sortable'> & Partial<FieldMetadata>
) {
  return {
    searchable: false,
    sortable: false,
    required: false,
    ...input,
  };
}

export const entityMetadataList: EntityMetadata[] = [
  {
    name: 'source-definitions',
    label: 'Sources',
    source: 'postgres',
    mode: 'readonly',
    fields: [
      field({ name: 'id', label: 'ID', type: 'uuid' }),
      field({ name: 'kind', label: 'Kind', type: 'text' }),
      field({ name: 'label', label: 'Label', type: 'text', searchable: true, sortable: true }),
      field({ name: 'url', label: 'URL', type: 'text' }),
      field({ name: 'entityType', label: 'Entity Type', type: 'text' }),
      field({ name: 'enabled', label: 'Enabled', type: 'boolean' }),
    ],
    views: {
      list: ['label', 'kind', 'entityType', 'enabled'],
      detail: ['id', 'label', 'kind', 'url', 'entityType', 'enabled', 'createdAt', 'updatedAt'],
    },
  },
  {
    name: 'normalized-entities',
    label: 'Normalized Entities',
    source: 'postgres',
    mode: 'readonly',
    fields: [
      field({ name: 'id', label: 'ID', type: 'uuid' }),
      field({ name: 'source', label: 'Source', type: 'text' }),
      field({ name: 'entityType', label: 'Entity Type', type: 'text', sortable: true }),
      field({ name: 'title', label: 'Title', type: 'text', searchable: true }),
      field({ name: 'url', label: 'URL', type: 'text' }),
      field({ name: 'publishedAt', label: 'Published', type: 'datetime', sortable: true }),
    ],
    views: {
      list: ['title', 'source', 'entityType', 'publishedAt'],
      detail: ['id', 'title', 'summary', 'url', 'author', 'publishedAt', 'updatedAt'],
    },
  },
  {
    name: 'cache-entries',
    label: 'Cache Entries',
    source: 'postgres',
    mode: 'readonly',
    fields: [
      field({ name: 'namespace', label: 'Namespace', type: 'text', sortable: true }),
      field({ name: 'key', label: 'Key', type: 'text', searchable: true }),
      field({ name: 'expiresAt', label: 'Expires', type: 'datetime' }),
      field({ name: 'updatedAt', label: 'Updated', type: 'datetime' }),
    ],
    views: {
      list: ['namespace', 'key', 'expiresAt', 'updatedAt'],
      detail: ['namespace', 'key', 'value', 'createdAt', 'updatedAt', 'expiresAt'],
    },
  },
];

export function findEntityMetadata(name: string) {
  return entityMetadataList.find((entity) => entity.name === name) ?? null;
}
