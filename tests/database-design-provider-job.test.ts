import { describe, expect, it } from 'vitest';
import {
  type DatabaseDesignProviderInput,
  draftFromDatabaseDesignJob,
} from '../api/modules/database-design/database-design.provider';
import {
  validateDataBindingsForDatabaseSchema,
  validateDatabaseSchemaJson,
} from '../api/modules/database-design/database-schema-validator.service';

const providerInput: DatabaseDesignProviderInput = {
  prompt: 'Forum data model with users, posts, tags, and post publishing status',
  source: 'dbdesign',
};

describe('database design provider job conversion', () => {
  it('converts a compact DBDesignJob into a valid relational schema draft', () => {
    const draft = draftFromDatabaseDesignJob(
      {
        name: 'forum_schema',
        label: 'Forum',
        purpose: 'Manage forum users, posts, and tags',
        tables: [
          {
            name: 'users',
            label: 'Users',
            fields: [
              { name: 'email', label: 'Email', type: 'text', unique: true, sortable: true },
              { name: 'display_name', label: 'Display name', type: 'text' },
            ],
          },
          {
            name: 'posts',
            label: 'Posts',
            fields: [
              { name: 'title', label: 'Title', type: 'text', sortable: true },
              { name: 'body', label: 'Body', type: 'text', listVisible: false },
              {
                name: 'status',
                label: 'Status',
                type: 'enum',
                enumName: 'post_status',
                enumValues: ['draft', 'published', 'archived'],
                filterable: true,
              },
            ],
          },
          {
            name: 'tags',
            label: 'Tags',
            fields: [{ name: 'name', label: 'Name', type: 'text', unique: true }],
          },
        ],
        relationships: [
          {
            kind: 'one_to_many',
            parentTable: 'users',
            childTable: 'posts',
            foreignKeyColumn: 'author_id',
          },
          {
            kind: 'many_to_many',
            leftTable: 'posts',
            rightTable: 'tags',
            joinTable: 'post_tags',
          },
        ],
        primaryTables: ['posts'],
        notes: ['Forum tables are proposed'],
      },
      providerInput
    );

    expect(draft.databaseSchema.tables.map((table) => table.name)).toEqual([
      'users',
      'posts',
      'tags',
      'post_tags',
    ]);
    expect(draft.databaseSchema.tables.find((table) => table.name === 'posts')?.columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'author_id', type: 'uuid' })])
    );
    expect(
      draft.databaseSchema.tables.find((table) => table.name === 'post_tags')?.indexes
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ columns: ['post_id', 'tag_id'], unique: true }),
      ])
    );
    expect(
      draft.databaseSchema.tables
        .find((table) => table.name === 'posts')
        ?.columns.map((column) => column.name)
    ).toEqual(expect.arrayContaining(['created_at', 'updated_at', 'is_active']));
    expect(
      draft.databaseSchema.tables
        .find((table) => table.name === 'post_tags')
        ?.columns.map((column) => column.name)
    ).toEqual(['id', 'created_at', 'updated_at', 'post_id', 'tag_id']);
    expect(
      draft.databaseSchema.tables
        .find((table) => table.name === 'post_tags')
        ?.columns.some((column) => column.name === 'is_active')
    ).toBe(false);
    expect(draft.databaseSchema.relations.map((relation) => relation.kind)).toEqual([
      'one-to-many',
      'many-to-many',
    ]);
    expect(() => validateDatabaseSchemaJson(draft.databaseSchema)).not.toThrow();
    expect(() =>
      validateDataBindingsForDatabaseSchema(draft.databaseSchema, draft.dataBindings)
    ).not.toThrow();
  });

  it('binds the active screen without asking the LLM to return screen JSON', () => {
    const draft = draftFromDatabaseDesignJob(
      {
        name: 'inventory_schema',
        label: 'Inventory',
        purpose: 'Manage inventory items',
        tables: [
          {
            name: 'items',
            label: 'Items',
            fields: [{ name: 'name', label: 'Name', type: 'text' }],
          },
        ],
        relationships: [],
        primaryTables: ['items'],
        notes: [],
      },
      {
        ...providerInput,
        currentScreen: {
          page: 'Inventory',
          intent: 'List inventory items',
          layout: 'entity-list',
          sections: [
            {
              component: 'DataTableSection',
              source: 'static',
              props: {
                title: 'Items',
                columns: [{ key: 'name', label: 'Name' }],
                rows: [],
              },
            },
          ],
        },
      }
    );

    expect(draft.screen?.sections[0]).toMatchObject({
      dataBindingId: 'items_list',
      source: 'postgres',
    });
    expect(draft.dataBindings.map((binding) => binding.id)).toEqual(['items_list', 'items_create']);
  });

  it('makes set-null one-to-many foreign keys nullable', () => {
    const draft = draftFromDatabaseDesignJob(
      {
        name: 'catalog_schema',
        label: 'Catalog',
        purpose: 'Manage brands and products',
        tables: [
          {
            name: 'brands',
            label: 'Brands',
            fields: [{ name: 'name', label: 'Name', type: 'text' }],
          },
          {
            name: 'products',
            label: 'Products',
            fields: [{ name: 'name', label: 'Name', type: 'text' }],
          },
        ],
        relationships: [
          {
            kind: 'one_to_many',
            parentTable: 'brands',
            childTable: 'products',
            foreignKeyColumn: 'brand_id',
            onDelete: 'set-null',
          },
        ],
        primaryTables: ['products'],
        notes: [],
      },
      providerInput
    );

    const brandId = draft.databaseSchema.tables
      .find((table) => table.name === 'products')
      ?.columns.find((column) => column.name === 'brand_id');

    expect(brandId).toMatchObject({ nullable: true, validation: { required: false } });
    expect(() => validateDatabaseSchemaJson(draft.databaseSchema)).not.toThrow();
  });
});
