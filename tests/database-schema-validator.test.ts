import { describe, expect, it } from 'vitest';
import {
  validateDataBindingsForDatabaseSchema,
  validateDatabaseSchemaJson,
  validateScreenDataBindingReferences,
} from '../api/modules/database-design/database-schema-validator.service';
import type { DataBindingDraft } from '../shared/schemas/data-binding.schema';
import type { DatabaseSchemaJson } from '../shared/schemas/database-design.schema';
import { databaseDesignDraftResponseSchema } from '../shared/schemas/database-design.schema';

function validSchema(): DatabaseSchemaJson {
  return {
    name: 'inventory_schema',
    label: 'Inventory',
    purpose: 'Manage products and categories',
    tables: [
      {
        name: 'categories',
        label: 'Categories',
        columns: [
          {
            name: 'id',
            label: 'ID',
            type: 'uuid',
            nullable: false,
            primaryKey: true,
            unique: true,
            default: { kind: 'uuid' },
            validation: { required: true },
            ui: { listVisible: false, formVisible: false, filterable: false, sortable: false },
          },
          {
            name: 'name',
            label: 'Name',
            type: 'text',
            nullable: false,
            primaryKey: false,
            unique: true,
            validation: { required: true },
            ui: { listVisible: true, formVisible: true, filterable: true, sortable: true },
          },
        ],
        indexes: [{ name: 'categories_name_uidx', columns: ['name'], unique: true }],
        ui: { displayField: 'name', defaultSortField: 'name', defaultSortDirection: 'asc' },
      },
      {
        name: 'products',
        label: 'Products',
        columns: [
          {
            name: 'id',
            label: 'ID',
            type: 'uuid',
            nullable: false,
            primaryKey: true,
            unique: true,
            default: { kind: 'uuid' },
            validation: { required: true },
            ui: { listVisible: false, formVisible: false, filterable: false, sortable: false },
          },
          {
            name: 'category_id',
            label: 'Category ID',
            type: 'uuid',
            nullable: false,
            primaryKey: false,
            unique: false,
            validation: { required: true },
            ui: { listVisible: false, formVisible: true, filterable: true, sortable: false },
          },
          {
            name: 'name',
            label: 'Name',
            type: 'text',
            nullable: false,
            primaryKey: false,
            unique: false,
            validation: { required: true },
            ui: { listVisible: true, formVisible: true, filterable: true, sortable: true },
          },
        ],
        indexes: [],
        ui: { displayField: 'name', defaultSortField: 'name', defaultSortDirection: 'asc' },
      },
    ],
    relations: [
      {
        kind: 'one-to-many',
        name: 'category_products',
        parentTable: 'categories',
        childTable: 'products',
        foreignKeyColumn: 'category_id',
        parentDisplayField: 'name',
        onDelete: 'restrict',
      },
    ],
    uiHints: {
      primaryTables: ['products'],
      defaultNavigation: ['products', 'categories'],
      suggestedScreens: [{ name: 'Products', table: 'products', operation: 'list' }],
    },
  };
}

describe('database schema validator', () => {
  it('accepts relational database schema JSON', () => {
    expect(validateDatabaseSchemaJson(validSchema()).relations[0].kind).toBe('one-to-many');
  });

  it('omits active flags from many-to-many join tables while keeping timestamps', () => {
    const draft = databaseDesignDraftResponseSchema.parse({
      databaseSchema: {
        name: 'forum_schema',
        purpose: 'Manage posts and tags',
        tables: [
          { name: 'posts', columns: [{ name: 'title', type: 'string', not_null: true }] },
          { name: 'tags', columns: [{ name: 'name', type: 'string', not_null: true }] },
          {
            name: 'post_tags',
            columns: [
              { name: 'post_id', type: 'foreign_key', not_null: true },
              { name: 'tag_id', type: 'foreign_key', not_null: true },
            ],
            indexes: [{ columns: ['post_id', 'tag_id'], unique: true }],
          },
        ],
        relations: [
          {
            kind: 'many-to-many',
            name: 'posts_tags',
            leftTable: 'posts',
            rightTable: 'tags',
            joinTable: 'post_tags',
            leftForeignKeyColumn: 'post_id',
            rightForeignKeyColumn: 'tag_id',
          },
        ],
      },
      dataBindings: [],
      rationale: 'forum tables are proposed',
    });

    expect(draft.databaseSchema.tables.find((table) => table.name === 'posts')?.columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'is_active' })])
    );
    expect(
      draft.databaseSchema.tables
        .find((table) => table.name === 'post_tags')
        ?.columns.map((column) => column.name)
    ).toEqual(['id', 'created_at', 'updated_at', 'post_id', 'tag_id']);
    expect(() => validateDatabaseSchemaJson(draft.databaseSchema)).not.toThrow();
  });

  it('rejects broken relation references', () => {
    const schema = validSchema();
    schema.relations = [
      {
        kind: 'one-to-many',
        name: 'broken',
        parentTable: 'categories',
        childTable: 'products',
        foreignKeyColumn: 'missing_id',
        onDelete: 'restrict',
      },
    ];

    expect(() => validateDatabaseSchemaJson(schema)).toThrow('Database schema proposal is invalid');
  });

  it('rejects data bindings that point outside the database schema', () => {
    const bindings: DataBindingDraft[] = [
      {
        id: 'products_list',
        table: 'products',
        operation: 'list',
        fields: ['missing_field'],
        relations: ['category_products'],
        filters: [],
        sort: [{ field: 'name', direction: 'asc' }],
        limit: 50,
      },
    ];

    expect(() => validateDataBindingsForDatabaseSchema(validSchema(), bindings)).toThrow(
      'Data binding proposal is invalid'
    );
  });

  it('rejects duplicate data binding ids', () => {
    const bindings: DataBindingDraft[] = [
      {
        id: 'products_list',
        table: 'products',
        operation: 'list',
        fields: ['name'],
        relations: [],
        filters: [],
        sort: [],
        limit: 50,
      },
      {
        id: 'products_list',
        table: 'products',
        operation: 'create',
        fields: ['name'],
        relations: [],
        filters: [],
        sort: [],
        limit: 50,
      },
    ];

    expect(() => validateDataBindingsForDatabaseSchema(validSchema(), bindings)).toThrow(
      'Data binding proposal is invalid'
    );
  });

  it('rejects screens that reference missing data binding ids', () => {
    expect(() =>
      validateScreenDataBindingReferences(
        {
          page: 'Products',
          intent: 'Manage products',
          layout: 'entity-list',
          sections: [
            {
              component: 'DataTableSection',
              dataBindingId: 'missing_list',
              source: 'postgres',
              props: {
                title: 'Products',
                columns: [{ key: 'name', label: 'Name' }],
              },
            },
          ],
        },
        [{ id: 'products_list' }]
      )
    ).toThrow('Screen data binding proposal is invalid');
  });

  it('normalizes string rationale from LLM draft output', () => {
    const draft = databaseDesignDraftResponseSchema.parse({
      databaseSchema: validSchema(),
      dataBindings: [],
      rationale: 'products and categories tables are proposed',
    });

    expect(draft.rationale).toEqual({
      databaseChanges: ['products and categories tables are proposed'],
      uiBindings: [],
    });
  });

  it('normalizes SQL-like LLM draft output before strict validation', () => {
    const draft = databaseDesignDraftResponseSchema.parse({
      databaseSchema: {
        name: 'commerce_schema',
        purpose: 'Manage commerce data',
        tables: [
          {
            name: 'products',
            columns: [
              {
                name: 'id',
                type: 'uuid',
                primary_key: true,
                not_null: true,
                default: 'gen_random_uuid()',
              },
              {
                name: 'name',
                type: 'string',
                not_null: true,
              },
              {
                name: 'price',
                type: 'decimal',
                not_null: true,
                default: 0,
              },
              {
                name: 'active',
                type: 'bool',
                default: true,
              },
            ],
          },
        ],
      },
      dataBindings: {
        products_list: {
          table: 'products',
          operation: 'select',
          fields: { name: true, price: true },
        },
      },
      rationale: {
        summary: 'products table is proposed',
        notes: ['data binding is attached'],
      },
    });

    const product = draft.databaseSchema.tables[0];
    expect(product.label).toBe('Products');
    expect(product.columns.slice(0, 4).map((column) => column.name)).toEqual([
      'id',
      'created_at',
      'updated_at',
      'is_active',
    ]);
    expect(product.columns.find((column) => column.name === 'created_at')?.ui).toMatchObject({
      formVisible: false,
      listVisible: false,
    });
    expect(product.columns.find((column) => column.name === 'updated_at')?.default).toEqual({
      kind: 'now',
    });
    expect(product.columns.find((column) => column.name === 'is_active')?.default).toEqual({
      kind: 'literal',
      value: true,
    });
    expect(product.columns.find((column) => column.name === 'name')?.label).toBe('Name');
    expect(product.columns.find((column) => column.name === 'name')?.type).toBe('text');
    expect(product.columns.find((column) => column.name === 'price')?.default).toEqual({
      kind: 'literal',
      value: 0,
    });
    expect(product.columns.find((column) => column.name === 'active')?.type).toBe('boolean');
    expect(draft.dataBindings).toEqual([
      {
        id: 'products_list',
        table: 'products',
        operation: 'list',
        fields: ['name', 'price'],
        relations: [],
        filters: [],
        sort: [],
        limit: 50,
      },
    ]);
    expect(draft.rationale.databaseChanges).toEqual([
      'products table is proposed',
      'data binding is attached',
    ]);
  });

  it('adds missing primary keys and rewrites reserved column identifiers', () => {
    const draft = databaseDesignDraftResponseSchema.parse({
      databaseSchema: {
        name: 'forum_schema',
        purpose: 'Manage forum data',
        tables: [
          {
            name: 'categories',
            columns: [
              { name: 'name', type: 'string', not_null: true },
              { name: 'order', type: 'integer', default: 0 },
            ],
            indexes: ['idx_categories_order'],
            ui: { displayField: 'name', defaultSortField: 'order' },
          },
          {
            name: 'post_tags',
            columns: [
              { name: 'post_id', type: 'foreign_key', not_null: true },
              { name: 'tag_id', type: 'foreign_key', not_null: true },
            ],
            indexes: [{ columns: ['post_id', 'tag_id'], unique: true }],
          },
        ],
      },
      dataBindings: [
        {
          id: 'categories_list',
          table: 'categories',
          operation: 'select',
          fields: ['name', 'order'],
          sort: { field: 'order' },
        },
      ],
      rationale: 'forum tables are proposed',
    });

    expect(validateDatabaseSchemaJson(draft.databaseSchema).tables).toHaveLength(2);
    expect(draft.databaseSchema.tables[0]?.columns.map((column) => column.name)).toEqual([
      'id',
      'created_at',
      'updated_at',
      'is_active',
      'name',
      'sort_order',
    ]);
    expect(draft.databaseSchema.tables[0]?.indexes).toEqual([
      { name: 'categories_sort_order_idx', columns: ['sort_order'], unique: false },
    ]);
    expect(draft.databaseSchema.tables[0]?.ui.defaultSortField).toBe('sort_order');
    expect(draft.databaseSchema.tables[1]?.columns[0]?.name).toBe('id');
    expect(draft.dataBindings[0]?.fields).toEqual(['name', 'sort_order']);
    expect(draft.dataBindings[0]?.sort).toEqual([{ field: 'sort_order', direction: 'asc' }]);
    expect(() =>
      validateDataBindingsForDatabaseSchema(draft.databaseSchema, draft.dataBindings)
    ).not.toThrow();
  });

  it('wraps table arrays returned as databaseSchema into a schema object', () => {
    const draft = databaseDesignDraftResponseSchema.parse({
      databaseSchema: [
        {
          name: 'users',
          columns: [
            { name: 'email', type: 'string', not_null: true, unique: true },
            { name: 'display_name', type: 'string' },
          ],
        },
        {
          name: 'posts',
          columns: [
            { name: 'user_id', type: 'foreign_key', not_null: true },
            { name: 'title', type: 'string', not_null: true },
          ],
        },
      ],
      dataBindings: [],
      rationale: 'forum tables are proposed',
    });

    expect(draft.databaseSchema.name).toBe('users_schema');
    expect(draft.databaseSchema.tables.map((table) => table.name)).toEqual(['users', 'posts']);
    expect(draft.databaseSchema.tables[0]?.columns[0]?.name).toBe('id');
    expect(draft.databaseSchema.tables[1]?.columns[0]?.name).toBe('id');
    expect(() => validateDatabaseSchemaJson(draft.databaseSchema)).not.toThrow();
  });

  it('normalizes DBDesign drafts that include binding summaries and string indexes', () => {
    const draft = databaseDesignDraftResponseSchema.parse({
      screen: {
        bindingsSummary: 'products and categories are bound to the current screen',
        componentsBound: ['DataTableSection'],
      },
      databaseSchema: {
        label: 'Commerce',
        purpose: 'Manage product merchandising',
        tables: [
          {
            name: 'products',
            columns: [
              { name: 'id', type: 'uuid', primary_key: true, not_null: true },
              { name: 'name', type: 'string', not_null: true },
              { name: 'category_id', type: 'foreign_key', not_null: true },
            ],
            indexes: ['products_name_idx', 'idx_products_category_id'],
          },
        ],
      },
      dataBindings: [
        {
          id: 'products_grid',
          targetTable: 'products',
          bindingType: 'read',
          fields: ['products.name', 'category-id', '利用不可'],
        },
        {
          id: 'products_form',
          tableName: 'products',
          type: 'form',
          fields: { name: true, category_id: true },
        },
        {
          id: 'component_binding',
          operation: 'read',
          fields: ['name'],
        },
      ],
      rationale: {
        summary: 'products table is proposed',
      },
    });

    expect(draft.screen).toBeUndefined();
    expect(draft.databaseSchema.name).toBe('commerce');
    expect(draft.databaseSchema.tables[0]?.indexes).toEqual([
      { name: 'products_name_idx', columns: ['name'], unique: false },
      { name: 'products_category_id_idx', columns: ['category_id'], unique: false },
    ]);
    expect(draft.dataBindings).toEqual([
      {
        id: 'products_grid',
        table: 'products',
        operation: 'list',
        fields: ['name', 'category_id'],
        relations: [],
        filters: [],
        sort: [],
        limit: 50,
      },
      {
        id: 'products_form',
        table: 'products',
        operation: 'create',
        fields: ['name', 'category_id'],
        relations: [],
        filters: [],
        sort: [],
        limit: 50,
      },
    ]);
  });
});
