import { describe, expect, it } from 'vitest';
import { detectDatabaseDraftGap } from '../api/modules/database-design/database-draft-gap.service';
import type {
  DatabaseSchemaJson,
  SandboxStateResponse,
} from '../shared/schemas/database-design.schema';

function draftSchema(): DatabaseSchemaJson {
  return {
    name: 'inventory_schema',
    label: 'Inventory',
    purpose: 'Manage inventory',
    tables: [
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
            ui: {
              filterable: false,
              formVisible: false,
              listVisible: false,
              sortable: false,
            },
          },
          {
            name: 'name',
            label: 'Name',
            type: 'text',
            nullable: false,
            primaryKey: false,
            unique: false,
            validation: { required: true },
            ui: {
              filterable: true,
              formVisible: true,
              listVisible: true,
              sortable: true,
            },
          },
        ],
        indexes: [{ name: 'products_name_idx', columns: ['name'], unique: false }],
        ui: { defaultSortDirection: 'asc', displayField: 'name' },
      },
    ],
    relations: [],
    uiHints: {
      defaultNavigation: ['products'],
      primaryTables: ['products'],
      suggestedScreens: [{ name: 'Products', operation: 'list', table: 'products' }],
    },
  };
}

function matchingState(): SandboxStateResponse {
  return {
    appliedDatabaseSchemaJsonId: null,
    appliedVersion: null,
    tables: [
      {
        name: 'products',
        managed: true,
        rowCount: 2,
        columns: [
          {
            name: 'id',
            type: 'uuid',
            scalarType: 'uuid',
            nullable: false,
            primaryKey: true,
            defaultValue: 'gen_random_uuid()',
          },
          {
            name: 'name',
            type: 'text',
            scalarType: 'text',
            nullable: false,
            primaryKey: false,
            defaultValue: null,
          },
        ],
        indexes: [{ name: 'products_name_idx', columns: ['name'], unique: false }],
        foreignKeys: [],
      },
    ],
  };
}

describe('database draft gap detection', () => {
  it('keeps unmanaged tables informational instead of blocking current match', () => {
    const state = matchingState();
    state.tables.push({
      name: 'legacy_imports',
      managed: false,
      rowCount: 1,
      columns: [],
      indexes: [],
      foreignKeys: [],
    });

    const gap = detectDatabaseDraftGap(draftSchema(), state);

    expect(gap.currentMatch).toBe(true);
    expect(gap.blockingCount).toBe(0);
    expect(gap.items).toContainEqual(
      expect.objectContaining({
        kind: 'unmanaged_table_present',
        severity: 'info',
        table: 'legacy_imports',
      })
    );
  });

  it('marks managed structural differences as blocking gaps', () => {
    const state = matchingState();
    const productTable = state.tables[0];
    const nameColumn = productTable?.columns[1];
    expect(productTable).toBeDefined();
    expect(nameColumn).toBeDefined();
    if (!productTable || !nameColumn) return;
    productTable.columns[1] = {
      ...nameColumn,
      scalarType: 'varchar',
      type: 'character varying',
    };

    const gap = detectDatabaseDraftGap(draftSchema(), state);

    expect(gap.currentMatch).toBe(false);
    expect(gap.items).toContainEqual(
      expect.objectContaining({
        actual: 'varchar',
        column: 'name',
        expected: 'text',
        kind: 'column_type_mismatch',
        severity: 'blocking',
        table: 'products',
      })
    );
  });

  it('does not flag implicit unique column indexes as extra draft gaps', () => {
    const schema = draftSchema();
    const draftTable = schema.tables[0];
    const nameColumn = draftTable?.columns[1];
    const state = matchingState();
    const productTable = state.tables[0];
    expect(draftTable).toBeDefined();
    expect(nameColumn).toBeDefined();
    expect(productTable).toBeDefined();
    if (!draftTable || !nameColumn || !productTable) return;
    draftTable.columns[1] = { ...nameColumn, unique: true };
    productTable.indexes.push({ name: 'products_name_key', columns: ['name'], unique: true });

    const gap = detectDatabaseDraftGap(schema, state);

    expect(gap.currentMatch).toBe(true);
    expect(gap.blockingCount).toBe(0);
    expect(gap.items).not.toContainEqual(
      expect.objectContaining({
        kind: 'index_mismatch',
        table: 'products',
      })
    );
  });
});
