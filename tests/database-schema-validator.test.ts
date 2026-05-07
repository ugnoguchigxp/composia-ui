import { describe, expect, it } from 'vitest';
import {
  validateDataBindingsForDatabaseSchema,
  validateDatabaseSchemaJson,
} from '../api/modules/database-design/database-schema-validator.service';
import type { DataBindingDraft } from '../shared/schemas/data-binding.schema';
import type { DatabaseSchemaJson } from '../shared/schemas/database-design.schema';

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
});
