import { createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  databaseCheckpointRestoreRequestSchema,
  databaseDesignConversationResponseSchema,
  databaseDesignEditRequestSchema,
  databaseDesignProposeRequestSchema,
  databaseDesignReproposalRequestSchema,
  databaseDesignResponseSchema,
  databaseDraftGapResponseSchema,
  databaseDraftsResponseSchema,
  databaseSchemaJsonResponseSchema,
  sandboxDeleteResponseSchema,
  sandboxMigrationApplyRequestSchema,
  sandboxMigrationPreviewSchema,
  sandboxMigrationRunSchema,
  sandboxRelationAttachRequestSchema,
  sandboxResetRequestSchema,
  sandboxResetResponseSchema,
  sandboxRowResponseSchema,
  sandboxRowsResponseSchema,
  sandboxStateResponseSchema,
} from '../../../shared/schemas/database-design.schema';
import { createOpenApiRouter } from '../../lib/openapi';
import type { AppEnv } from '../../lib/types';
import { authMiddleware } from '../../middleware/auth';
import { databaseDesignRepository } from './database-design.repository';
import { databaseDesignService } from './database-design.service';
import { createSandboxQueryService } from './sandbox-query.service';

const designSessionParamSchema = z.object({ designSessionId: z.string().uuid() }).strict();
const databaseSchemaJsonParamSchema = z
  .object({ databaseSchemaJsonId: z.string().uuid() })
  .strict();
const tableParamSchema = z.object({ table: z.string().regex(/^[a-z][a-z0-9_]*$/) }).strict();
const relationParamSchema = z.object({ relation: z.string().regex(/^[a-z][a-z0-9_]*$/) }).strict();
const rowParamSchema = tableParamSchema.extend({ id: z.string().uuid() }).strict();
const rowsQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(200).optional() })
  .strict();
const rowBodySchema = z.record(z.string(), z.unknown());
const mcpGetDatabaseSchemaJsonRequestSchema = z
  .object({ databaseSchemaJsonId: z.string().uuid() })
  .strict();

const proposeRoute = createRoute({
  method: 'post',
  path: '/propose',
  request: {
    body: { content: { 'application/json': { schema: databaseDesignProposeRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: databaseDesignResponseSchema } },
      description: 'Propose a DatabaseSchemaJSON draft from prompt or ScreenJSON',
    },
  },
});

const draftsRoute = createRoute({
  method: 'get',
  path: '/drafts',
  responses: {
    200: {
      content: { 'application/json': { schema: databaseDraftsResponseSchema } },
      description: 'List DBDesign drafts for the current user',
    },
  },
});

const conversationRoute = createRoute({
  method: 'get',
  path: '/:designSessionId/conversation',
  request: { params: designSessionParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: databaseDesignConversationResponseSchema } },
      description: 'Get DBDesign conversation and schema checkpoints',
    },
  },
});

const editRoute = createRoute({
  method: 'post',
  path: '/:designSessionId/edit',
  request: {
    params: designSessionParamSchema,
    body: { content: { 'application/json': { schema: databaseDesignEditRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: databaseDesignResponseSchema } },
      description: 'Edit active DatabaseSchemaJSON through DBDesign',
    },
  },
});

const restoreRoute = createRoute({
  method: 'post',
  path: '/:designSessionId/checkpoints/restore',
  request: {
    params: designSessionParamSchema,
    body: {
      content: { 'application/json': { schema: databaseCheckpointRestoreRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: databaseDesignConversationResponseSchema } },
      description: 'Restore a DBDesign checkpoint without calling the LLM provider',
    },
  },
});

const schemaJsonRoute = createRoute({
  method: 'get',
  path: '/schema-jsons/:databaseSchemaJsonId',
  request: { params: databaseSchemaJsonParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: databaseSchemaJsonResponseSchema } },
      description: 'Get DatabaseSchemaJSON as minified JSON',
    },
  },
});

const schemaJsonGapRoute = createRoute({
  method: 'get',
  path: '/schema-jsons/:databaseSchemaJsonId/gap',
  request: { params: databaseSchemaJsonParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: databaseDraftGapResponseSchema } },
      description: 'Compare a DatabaseSchemaJSON draft with current SandboxDB state',
    },
  },
});

const schemaJsonReproposalRoute = createRoute({
  method: 'post',
  path: '/schema-jsons/:databaseSchemaJsonId/reproposal',
  request: {
    params: databaseSchemaJsonParamSchema,
    body: {
      content: { 'application/json': { schema: databaseDesignReproposalRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: databaseDesignResponseSchema } },
      description: 'Create a new DatabaseSchemaJSON draft from current SandboxDB state',
    },
  },
});

const schemaJsonAliasRoute = createRoute({
  method: 'get',
  path: '/schemas/:databaseSchemaJsonId',
  request: { params: databaseSchemaJsonParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: databaseSchemaJsonResponseSchema } },
      description: 'Get DatabaseSchemaJSON as minified JSON',
    },
  },
});

const migrationPreviewRoute = createRoute({
  method: 'post',
  path: '/schema-jsons/:databaseSchemaJsonId/migration/preview',
  request: { params: databaseSchemaJsonParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxMigrationPreviewSchema } },
      description: 'Preview SQL for applying a DatabaseSchemaJSON to the sandbox DB',
    },
  },
});

const migrationPreviewAliasRoute = createRoute({
  method: 'post',
  path: '/schemas/:databaseSchemaJsonId/migration-preview',
  request: { params: databaseSchemaJsonParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxMigrationPreviewSchema } },
      description: 'Preview SQL for applying a DatabaseSchemaJSON to the sandbox DB',
    },
  },
});

const migrationApplyRoute = createRoute({
  method: 'post',
  path: '/schema-jsons/:databaseSchemaJsonId/migration/apply',
  request: {
    params: databaseSchemaJsonParamSchema,
    body: { content: { 'application/json': { schema: sandboxMigrationApplyRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxMigrationRunSchema } },
      description: 'Apply a DatabaseSchemaJSON to the sandbox DB after user approval',
    },
  },
});

const migrationApplyAliasRoute = createRoute({
  method: 'post',
  path: '/schemas/:databaseSchemaJsonId/apply',
  request: {
    params: databaseSchemaJsonParamSchema,
    body: { content: { 'application/json': { schema: sandboxMigrationApplyRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxMigrationRunSchema } },
      description: 'Apply a DatabaseSchemaJSON to the sandbox DB after user approval',
    },
  },
});

const resetRoute = createRoute({
  method: 'post',
  path: '/reset',
  request: {
    body: { content: { 'application/json': { schema: sandboxResetRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxResetResponseSchema } },
      description: 'Reset managed objects in the sandbox DB',
    },
  },
});

const sandboxStateRoute = createRoute({
  method: 'get',
  path: '/state',
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxStateResponseSchema } },
      description: 'List managed sandbox tables and row counts',
    },
  },
});

const sandboxTablesRoute = createRoute({
  method: 'get',
  path: '/tables',
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxStateResponseSchema } },
      description: 'List managed sandbox tables and row counts',
    },
  },
});

const sandboxRowsRoute = createRoute({
  method: 'get',
  path: '/tables/:table/rows',
  request: { params: tableParamSchema, query: rowsQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxRowsResponseSchema } },
      description: 'List rows from a managed sandbox table',
    },
  },
});

const sandboxRowRoute = createRoute({
  method: 'get',
  path: '/tables/:table/rows/:id',
  request: { params: rowParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxRowResponseSchema } },
      description: 'Get a row from a managed sandbox table',
    },
  },
});

const sandboxInsertRoute = createRoute({
  method: 'post',
  path: '/tables/:table/rows',
  request: {
    params: tableParamSchema,
    body: { content: { 'application/json': { schema: rowBodySchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxRowResponseSchema } },
      description: 'Insert a row into a managed sandbox table',
    },
  },
});

const sandboxUpdateRoute = createRoute({
  method: 'patch',
  path: '/tables/:table/rows/:id',
  request: {
    params: rowParamSchema,
    body: { content: { 'application/json': { schema: rowBodySchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxRowResponseSchema } },
      description: 'Update a row in a managed sandbox table',
    },
  },
});

const sandboxDeleteRoute = createRoute({
  method: 'delete',
  path: '/tables/:table/rows/:id',
  request: { params: rowParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxDeleteResponseSchema } },
      description: 'Delete a row from a managed sandbox table',
    },
  },
});

const sandboxRelationAttachRoute = createRoute({
  method: 'post',
  path: '/relations/:relation/attach',
  request: {
    params: relationParamSchema,
    body: { content: { 'application/json': { schema: sandboxRelationAttachRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxRowResponseSchema } },
      description: 'Attach two rows through a managed many-to-many relation',
    },
  },
});

const sandboxRelationDetachRoute = createRoute({
  method: 'post',
  path: '/relations/:relation/detach',
  request: {
    params: relationParamSchema,
    body: { content: { 'application/json': { schema: sandboxRelationAttachRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: sandboxDeleteResponseSchema } },
      description: 'Detach two rows through a managed many-to-many relation',
    },
  },
});

const mcpGetDatabaseSchemaJsonRoute = createRoute({
  method: 'post',
  path: '/tools/get_database_schema_json',
  request: {
    body: {
      content: {
        'application/json': { schema: mcpGetDatabaseSchemaJsonRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: databaseSchemaJsonResponseSchema } },
      description: 'MCP-compatible tool endpoint for reading DatabaseSchemaJSON',
    },
  },
});

function userId(c: Context<AppEnv>) {
  const user = c.get('user');
  if (!user) throw new Error('Authenticated user is missing from route context');
  return user.userId;
}

const protectedDatabaseDesignRouter = createOpenApiRouter();
const protectedSandboxRouter = createOpenApiRouter();
const protectedMcpRouter = createOpenApiRouter();
const sandboxQueryService = createSandboxQueryService(databaseDesignRepository);

protectedDatabaseDesignRouter.use('*', authMiddleware());
protectedSandboxRouter.use('*', authMiddleware());
protectedMcpRouter.use('*', authMiddleware());

export const databaseDesignRouter = protectedDatabaseDesignRouter
  .openapi(proposeRoute, async (c) =>
    c.json(await databaseDesignService.propose(userId(c), c.req.valid('json')), 200)
  )
  .openapi(draftsRoute, async (c) => c.json(await databaseDesignService.listDrafts(userId(c)), 200))
  .openapi(conversationRoute, async (c) =>
    c.json(
      await databaseDesignService.conversation(userId(c), c.req.valid('param').designSessionId),
      200
    )
  )
  .openapi(editRoute, async (c) =>
    c.json(
      await databaseDesignService.edit(
        userId(c),
        c.req.valid('param').designSessionId,
        c.req.valid('json')
      ),
      200
    )
  )
  .openapi(restoreRoute, async (c) => {
    const body = c.req.valid('json');
    return c.json(
      await databaseDesignService.restoreCheckpoint(
        userId(c),
        c.req.valid('param').designSessionId,
        body.databaseSchemaJsonId,
        body.screenJsonId
      ),
      200
    );
  })
  .openapi(schemaJsonGapRoute, async (c) =>
    c.json(
      await databaseDesignService.draftGap(userId(c), c.req.valid('param').databaseSchemaJsonId),
      200
    )
  )
  .openapi(schemaJsonReproposalRoute, async (c) =>
    c.json(
      await databaseDesignService.reproposal(
        userId(c),
        c.req.valid('param').databaseSchemaJsonId,
        c.req.valid('json')
      ),
      200
    )
  )
  .openapi(schemaJsonRoute, async (c) =>
    c.json(
      await databaseDesignService.schemaJson(userId(c), c.req.valid('param').databaseSchemaJsonId),
      200
    )
  )
  .openapi(schemaJsonAliasRoute, async (c) =>
    c.json(
      await databaseDesignService.schemaJson(userId(c), c.req.valid('param').databaseSchemaJsonId),
      200
    )
  )
  .openapi(migrationPreviewRoute, async (c) =>
    c.json(
      await databaseDesignService.migrationPreview(
        userId(c),
        c.req.valid('param').databaseSchemaJsonId
      ),
      200
    )
  )
  .openapi(migrationPreviewAliasRoute, async (c) =>
    c.json(
      await databaseDesignService.migrationPreview(
        userId(c),
        c.req.valid('param').databaseSchemaJsonId
      ),
      200
    )
  )
  .openapi(migrationApplyRoute, async (c) =>
    c.json(
      await databaseDesignService.applyMigration(
        userId(c),
        c.req.valid('param').databaseSchemaJsonId
      ),
      200
    )
  )
  .openapi(migrationApplyAliasRoute, async (c) =>
    c.json(
      await databaseDesignService.applyMigration(
        userId(c),
        c.req.valid('param').databaseSchemaJsonId
      ),
      200
    )
  )
  .openapi(resetRoute, async (c) =>
    c.json(await databaseDesignService.resetSandbox(c.req.valid('json')), 200)
  );

export const sandboxDatabaseRouter = protectedSandboxRouter
  .openapi(sandboxStateRoute, async (c) => c.json(await sandboxQueryService.state(), 200))
  .openapi(sandboxTablesRoute, async (c) => c.json(await sandboxQueryService.state(), 200))
  .openapi(sandboxRowsRoute, async (c) => {
    const params = c.req.valid('param');
    return c.json(
      await sandboxQueryService.listRows(params.table, c.req.valid('query').limit),
      200
    );
  })
  .openapi(sandboxRowRoute, async (c) => {
    const params = c.req.valid('param');
    return c.json(await sandboxQueryService.getRow(params.table, params.id), 200);
  })
  .openapi(sandboxInsertRoute, async (c) =>
    c.json(
      await sandboxQueryService.insertRow(c.req.valid('param').table, c.req.valid('json')),
      200
    )
  )
  .openapi(sandboxUpdateRoute, async (c) => {
    const params = c.req.valid('param');
    return c.json(
      await sandboxQueryService.updateRow(params.table, params.id, c.req.valid('json')),
      200
    );
  })
  .openapi(sandboxDeleteRoute, async (c) => {
    const params = c.req.valid('param');
    return c.json(await sandboxQueryService.deleteRow(params.table, params.id), 200);
  })
  .openapi(sandboxRelationAttachRoute, async (c) =>
    c.json(
      await sandboxQueryService.attachRelation(c.req.valid('param').relation, c.req.valid('json')),
      200
    )
  )
  .openapi(sandboxRelationDetachRoute, async (c) =>
    c.json(
      await sandboxQueryService.detachRelation(c.req.valid('param').relation, c.req.valid('json')),
      200
    )
  );

export const databaseDesignMcpRouter = protectedMcpRouter.openapi(
  mcpGetDatabaseSchemaJsonRoute,
  async (c) =>
    c.json(
      await databaseDesignService.schemaJson(userId(c), c.req.valid('json').databaseSchemaJsonId),
      200
    )
);
