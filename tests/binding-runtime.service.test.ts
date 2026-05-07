import { describe, expect, it } from 'vitest';
import type { DataBinding } from '../shared/schemas/data-binding.schema';
import type { SandboxStateResponse } from '../shared/schemas/database-design.schema';
import {
  bindingRuntimeIsReady,
  bindingRuntimeIssue,
  resolveScreenRuntimeBindings,
  submitBindingRuntimeIssue,
} from '../src/modules/screen-history/services/binding-runtime.service';

const appliedDatabaseSchemaJsonId = '11111111-1111-4111-8111-111111111111';
const otherDatabaseSchemaJsonId = '22222222-2222-4222-8222-222222222222';

function binding(input: Partial<DataBinding> = {}): DataBinding {
  return {
    id: 'products_list',
    table: 'products',
    operation: 'list',
    fields: ['name'],
    relations: [],
    filters: [],
    sort: [],
    limit: 50,
    databaseSchemaJsonId: appliedDatabaseSchemaJsonId,
    databaseSchemaVersion: 1,
    ...input,
  };
}

function sandboxState(input: Partial<SandboxStateResponse> = {}): SandboxStateResponse {
  return {
    appliedDatabaseSchemaJsonId,
    appliedVersion: 1,
    tables: [
      {
        name: 'products',
        rowCount: 0,
        managed: true,
        columns: [],
        indexes: [],
        foreignKeys: [],
      },
    ],
    ...input,
  };
}

describe('binding runtime gate', () => {
  it('allows a binding when the applied schema and managed table match', () => {
    const issue = bindingRuntimeIssue(binding(), sandboxState());

    expect(issue).toBeNull();
    expect(bindingRuntimeIsReady(binding(), sandboxState())).toBe(true);
  });

  it('blocks row access when the binding schema is not applied', () => {
    const issue = bindingRuntimeIssue(
      binding({ databaseSchemaJsonId: otherDatabaseSchemaJsonId }),
      sandboxState()
    );

    expect(issue?.message).toContain(otherDatabaseSchemaJsonId);
    expect(
      bindingRuntimeIsReady(
        binding({ databaseSchemaJsonId: otherDatabaseSchemaJsonId }),
        sandboxState()
      )
    ).toBe(false);
  });

  it('blocks row access when the target table is missing or unmanaged', () => {
    expect(
      bindingRuntimeIssue(
        binding({ table: 'orders' }),
        sandboxState({ tables: [{ ...sandboxState().tables[0], name: 'products' }] })
      )?.message
    ).toContain('orders table');
    expect(
      bindingRuntimeIssue(
        binding(),
        sandboxState({ tables: [{ ...sandboxState().tables[0], managed: false }] })
      )?.message
    ).toContain('managed table');
  });

  it('blocks submit while SandboxDB state is not loaded', () => {
    const issue = submitBindingRuntimeIssue(binding({ operation: 'create' }), undefined);

    expect(issue?.message).toContain('読み込み中');
  });

  it('plans runtime queries only for bindings referenced by the screen', () => {
    const result = resolveScreenRuntimeBindings(
      {
        page: 'Products',
        intent: 'Manage products',
        layout: 'entity-list',
        sections: [
          {
            component: 'DataTableSection',
            dataBindingId: 'products_list',
            source: 'postgres',
            props: {
              title: 'Products',
              columns: [{ key: 'name', label: 'Name' }],
            },
          },
        ],
      },
      [
        binding({ id: 'products_list', operation: 'list' }),
        binding({ id: 'unused_list', operation: 'list' }),
      ]
    );

    expect(result.issues).toEqual([]);
    expect(result.runtimeBindings.map((item) => item.id)).toEqual(['products_list']);
  });

  it('reports screen references that cannot resolve to a binding', () => {
    const result = resolveScreenRuntimeBindings(
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
      [binding({ id: 'products_list', operation: 'list' })]
    );

    expect(result.runtimeBindings).toEqual([]);
    expect(result.issues[0]?.message).toContain('missing_list');
  });
});
