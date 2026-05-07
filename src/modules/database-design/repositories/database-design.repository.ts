import type {
  DatabaseDesignConversationResponse,
  DatabaseDesignEditRequest,
  DatabaseDesignProposeRequest,
  DatabaseDesignResponse,
  DatabaseSchemaJsonResponse,
  SandboxDeleteResponse,
  SandboxMigrationPreview,
  SandboxMigrationRun,
  SandboxRelationAttachRequest,
  SandboxResetResponse,
  SandboxRowResponse,
  SandboxRowsResponse,
  SandboxStateResponse,
} from '../../../../shared/schemas/database-design.schema';
import {
  databaseDesignConversationResponseSchema,
  databaseDesignResponseSchema,
  databaseSchemaJsonResponseSchema,
  sandboxDeleteResponseSchema,
  sandboxMigrationPreviewSchema,
  sandboxMigrationRunSchema,
  sandboxResetResponseSchema,
  sandboxRowResponseSchema,
  sandboxRowsResponseSchema,
  sandboxStateResponseSchema,
} from '../../../../shared/schemas/database-design.schema';
import { client } from '../../../lib/api';

async function readErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    message?: string;
  } | null;
  return payload?.error?.message ?? payload?.message ?? 'Database design request failed';
}

export const databaseDesignRepository = {
  applyMigration: async (databaseSchemaJsonId: string): Promise<SandboxMigrationRun> => {
    const response = await client['database-design']['schema-jsons'][
      ':databaseSchemaJsonId'
    ].migration.apply.$post({
      json: {},
      param: { databaseSchemaJsonId },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sandboxMigrationRunSchema.parse(await response.json());
  },
  conversation: async (designSessionId: string): Promise<DatabaseDesignConversationResponse> => {
    const response = await client['database-design'][':designSessionId'].conversation.$get({
      param: { designSessionId },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return databaseDesignConversationResponseSchema.parse(await response.json());
  },
  edit: async (
    designSessionId: string,
    input: DatabaseDesignEditRequest
  ): Promise<DatabaseDesignResponse> => {
    const response = await client['database-design'][':designSessionId'].edit.$post({
      json: input,
      param: { designSessionId },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return databaseDesignResponseSchema.parse(await response.json());
  },
  migrationPreview: async (databaseSchemaJsonId: string): Promise<SandboxMigrationPreview> => {
    const response = await client['database-design']['schema-jsons'][
      ':databaseSchemaJsonId'
    ].migration.preview.$post({
      param: { databaseSchemaJsonId },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sandboxMigrationPreviewSchema.parse(await response.json());
  },
  propose: async (input: DatabaseDesignProposeRequest): Promise<DatabaseDesignResponse> => {
    const response = await client['database-design'].propose.$post({ json: input });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return databaseDesignResponseSchema.parse(await response.json());
  },
  restoreCheckpoint: async (
    designSessionId: string,
    input: { databaseSchemaJsonId?: string; screenJsonId?: string }
  ): Promise<DatabaseDesignConversationResponse> => {
    const response = await client['database-design'][':designSessionId'].checkpoints.restore.$post({
      json: input,
      param: { designSessionId },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return databaseDesignConversationResponseSchema.parse(await response.json());
  },
  resetSandbox: async (input: { confirmation: string }): Promise<SandboxResetResponse> => {
    const response = await client['database-design'].reset.$post({ json: input });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sandboxResetResponseSchema.parse(await response.json());
  },
  attachSandboxRelation: async (
    relation: string,
    input: SandboxRelationAttachRequest
  ): Promise<SandboxRowResponse> => {
    const response = await client['sandbox-db'].relations[':relation'].attach.$post({
      json: input,
      param: { relation },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sandboxRowResponseSchema.parse(await response.json());
  },
  detachSandboxRelation: async (
    relation: string,
    input: SandboxRelationAttachRequest
  ): Promise<SandboxDeleteResponse> => {
    const response = await client['sandbox-db'].relations[':relation'].detach.$post({
      json: input,
      param: { relation },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sandboxDeleteResponseSchema.parse(await response.json());
  },
  sandboxRows: async (table: string, limit = 50): Promise<SandboxRowsResponse> => {
    const response = await client['sandbox-db'].tables[':table'].rows.$get({
      param: { table },
      query: { limit: String(limit) },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sandboxRowsResponseSchema.parse(await response.json());
  },
  insertSandboxRow: async (
    table: string,
    input: Record<string, unknown>
  ): Promise<SandboxRowResponse> => {
    const response = await client['sandbox-db'].tables[':table'].rows.$post({
      json: input,
      param: { table },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sandboxRowResponseSchema.parse(await response.json());
  },
  updateSandboxRow: async (
    table: string,
    id: string,
    input: Record<string, unknown>
  ): Promise<SandboxRowResponse> => {
    const response = await client['sandbox-db'].tables[':table'].rows[':id'].$patch({
      json: input,
      param: { id, table },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sandboxRowResponseSchema.parse(await response.json());
  },
  sandboxRow: async (table: string, id: string): Promise<SandboxRowResponse> => {
    const response = await client['sandbox-db'].tables[':table'].rows[':id'].$get({
      param: { id, table },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sandboxRowResponseSchema.parse(await response.json());
  },
  sandboxState: async (): Promise<SandboxStateResponse> => {
    const response = await client['sandbox-db'].state.$get({});
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sandboxStateResponseSchema.parse(await response.json());
  },
  schemaJson: async (databaseSchemaJsonId: string): Promise<DatabaseSchemaJsonResponse> => {
    const response = await client['database-design']['schema-jsons'][':databaseSchemaJsonId'].$get({
      param: { databaseSchemaJsonId },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return databaseSchemaJsonResponseSchema.parse(await response.json());
  },
  deleteSandboxRow: async (table: string, id: string): Promise<SandboxDeleteResponse> => {
    const response = await client['sandbox-db'].tables[':table'].rows[':id'].$delete({
      param: { id, table },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sandboxDeleteResponseSchema.parse(await response.json());
  },
};
