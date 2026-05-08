import { createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  screenActionGenerateRequestSchema,
  screenActionLinkDeleteResponseSchema,
  screenActionLinkResponseSchema,
  screenActionLinkUpsertRequestSchema,
  screenCheckpointRestoreResponseSchema,
  screenChildrenResponseSchema,
  screenConversationResponseSchema,
  screenDeleteResponseSchema,
  screenEditRequestSchema,
  screenGenerateRequestSchema,
  screenJsonResponseSchema,
  screenJsonSaveRequestSchema,
  screenListQuerySchema,
  screenListResponseSchema,
  screenRegenerateRequestSchema,
  screenResponseSchema,
} from '../../../shared/schemas/screen-history.schema';
import { createOpenApiRouter } from '../../lib/openapi';
import type { AppEnv } from '../../lib/types';
import { authMiddleware } from '../../middleware/auth';
import { screenHistoryService } from './screen-history.service';

const screenParamSchema = z.object({ screenId: z.string().uuid() }).strict();
const sessionParamSchema = z.object({ sessionId: z.string().uuid() }).strict();
const screenJsonParamSchema = z.object({ screenJsonId: z.string().uuid() }).strict();
const actionParamSchema = z
  .object({ screenId: z.string().uuid(), actionId: z.string().min(1) })
  .strict();
const sessionActionParamSchema = z
  .object({ sessionId: z.string().uuid(), actionId: z.string().min(1) })
  .strict();
const checkpointParamSchema = z
  .object({ sessionId: z.string().uuid(), screenJsonId: z.string().uuid() })
  .strict();
const mcpGetScreenJsonRequestSchema = z.object({ screenJsonId: z.string().uuid() }).strict();

const listRoute = createRoute({
  method: 'get',
  path: '/',
  request: {
    query: screenListQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: screenListResponseSchema } },
      description: 'List prompt sessions and generated screens',
    },
  },
});

const detailRoute = createRoute({
  method: 'get',
  path: '/:screenId',
  request: { params: screenParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: screenResponseSchema } },
      description: 'Get generated screen or ScreenJSON',
    },
  },
});

const childrenRoute = createRoute({
  method: 'get',
  path: '/:screenId/children',
  request: { params: screenParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: screenChildrenResponseSchema } },
      description: 'List legacy child screens',
    },
  },
});

const generateRoute = createRoute({
  method: 'post',
  path: '/generate',
  request: {
    body: {
      content: {
        'application/json': {
          schema: screenGenerateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: screenResponseSchema } },
      description: 'Generate and save the first ScreenJSON for a session',
    },
  },
});

const actionGenerateRoute = createRoute({
  method: 'post',
  path: '/:screenId/actions/:actionId/generate',
  request: {
    params: actionParamSchema,
    body: {
      content: {
        'application/json': {
          schema: screenActionGenerateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: screenResponseSchema } },
      description: 'Generate and save the next ScreenJSON from a screen action',
    },
  },
});

const regenerateRoute = createRoute({
  method: 'post',
  path: '/:screenId/regenerate',
  request: {
    params: screenParamSchema,
    body: {
      content: {
        'application/json': {
          schema: screenRegenerateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: screenResponseSchema } },
      description: 'Regenerate a ScreenJSON from a screen id',
    },
  },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/:screenId',
  request: { params: screenParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: screenDeleteResponseSchema } },
      description: 'Delete generated screen or ScreenJSON',
    },
  },
});

const conversationRoute = createRoute({
  method: 'get',
  path: '/:sessionId/conversation',
  request: { params: sessionParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: screenConversationResponseSchema } },
      description: 'Get persisted ChatDock conversation and checkpoints for a session',
    },
  },
});

const sessionDeleteRoute = createRoute({
  method: 'delete',
  path: '/:sessionId',
  request: { params: sessionParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: screenDeleteResponseSchema } },
      description: 'Delete prompt session and all ScreenJSON versions',
    },
  },
});

const editRoute = createRoute({
  method: 'post',
  path: '/:sessionId/edit',
  request: {
    params: sessionParamSchema,
    body: {
      content: {
        'application/json': {
          schema: screenEditRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: screenResponseSchema } },
      description: 'Edit the active ScreenJSON in a session',
    },
  },
});

const sessionScreenJsonSaveRoute = createRoute({
  method: 'post',
  path: '/:sessionId/screen-json',
  request: {
    params: sessionParamSchema,
    body: {
      content: {
        'application/json': {
          schema: screenJsonSaveRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: screenResponseSchema } },
      description:
        'Save the active session ScreenJSON as a new version without calling the AI provider',
    },
  },
});

const sessionActionGenerateRoute = createRoute({
  method: 'post',
  path: '/:sessionId/actions/:actionId/generate',
  request: {
    params: sessionActionParamSchema,
    body: {
      content: {
        'application/json': {
          schema: screenActionGenerateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: screenResponseSchema } },
      description: 'Generate and save the next ScreenJSON from the active session screen',
    },
  },
});

const sessionActionLinkRoute = createRoute({
  method: 'put',
  path: '/:sessionId/actions/:actionId/link',
  request: {
    params: sessionActionParamSchema,
    body: {
      content: {
        'application/json': {
          schema: screenActionLinkUpsertRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: screenActionLinkResponseSchema } },
      description: 'Link a screen action to a target prompt session or app path',
    },
  },
});

const sessionActionUnlinkRoute = createRoute({
  method: 'delete',
  path: '/:sessionId/actions/:actionId/link',
  request: { params: sessionActionParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: screenActionLinkDeleteResponseSchema } },
      description: 'Remove a screen action link',
    },
  },
});

const sessionRegenerateRoute = createRoute({
  method: 'post',
  path: '/:sessionId/regenerate',
  request: {
    params: sessionParamSchema,
    body: {
      content: {
        'application/json': {
          schema: screenRegenerateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: screenResponseSchema } },
      description: 'Regenerate the active ScreenJSON in a session',
    },
  },
});

const restoreCheckpointRoute = createRoute({
  method: 'post',
  path: '/:sessionId/checkpoints/:screenJsonId/restore',
  request: { params: checkpointParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: screenCheckpointRestoreResponseSchema } },
      description: 'Restore a ScreenJSON checkpoint without calling the AI provider',
    },
  },
});

const screenJsonRoute = createRoute({
  method: 'get',
  path: '/:screenJsonId',
  request: { params: screenJsonParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: screenJsonResponseSchema } },
      description: 'Get ScreenJSON as minified JSON',
    },
  },
});

const mcpGetScreenJsonRoute = createRoute({
  method: 'post',
  path: '/tools/get_screen_json',
  request: {
    body: {
      content: {
        'application/json': {
          schema: mcpGetScreenJsonRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: screenJsonResponseSchema } },
      description: 'MCP-compatible tool endpoint for reading a ScreenJSON',
    },
  },
});

const protectedScreensRouter = createOpenApiRouter();
const protectedSessionsRouter = createOpenApiRouter();
const protectedScreenJsonsRouter = createOpenApiRouter();
const protectedMcpRouter = createOpenApiRouter();

protectedScreensRouter.use('*', authMiddleware());
protectedSessionsRouter.use('*', authMiddleware());
protectedScreenJsonsRouter.use('*', authMiddleware());
protectedMcpRouter.use('*', authMiddleware());

function userId(c: Context<AppEnv>) {
  const user = c.get('user');
  if (!user) throw new Error('Authenticated user is missing from route context');
  return user.userId;
}

export const screenHistoryRouter = protectedScreensRouter
  .openapi(listRoute, async (c) =>
    c.json(await screenHistoryService.list(userId(c), c.req.valid('query')), 200)
  )
  .openapi(generateRoute, async (c) =>
    c.json(await screenHistoryService.generate(userId(c), c.req.valid('json')), 200)
  )
  .openapi(childrenRoute, async (c) =>
    c.json(await screenHistoryService.children(userId(c), c.req.valid('param').screenId), 200)
  )
  .openapi(actionGenerateRoute, async (c) => {
    const { actionId, screenId } = c.req.valid('param');
    return c.json(
      await screenHistoryService.generateFromAction(
        userId(c),
        screenId,
        actionId,
        c.req.valid('json')
      ),
      200
    );
  })
  .openapi(regenerateRoute, async (c) =>
    c.json(
      await screenHistoryService.regenerate(
        userId(c),
        c.req.valid('param').screenId,
        c.req.valid('json')
      ),
      200
    )
  )
  .openapi(detailRoute, async (c) =>
    c.json(await screenHistoryService.get(userId(c), c.req.valid('param').screenId), 200)
  )
  .openapi(deleteRoute, async (c) =>
    c.json(await screenHistoryService.delete(userId(c), c.req.valid('param').screenId), 200)
  );

export const screenSessionRouter = protectedSessionsRouter
  .openapi(conversationRoute, async (c) =>
    c.json(await screenHistoryService.conversation(userId(c), c.req.valid('param').sessionId), 200)
  )
  .openapi(sessionDeleteRoute, async (c) =>
    c.json(await screenHistoryService.deleteSession(userId(c), c.req.valid('param').sessionId), 200)
  )
  .openapi(editRoute, async (c) =>
    c.json(
      await screenHistoryService.edit(
        userId(c),
        c.req.valid('param').sessionId,
        c.req.valid('json')
      ),
      200
    )
  )
  .openapi(sessionScreenJsonSaveRoute, async (c) =>
    c.json(
      await screenHistoryService.saveSessionScreenJson(
        userId(c),
        c.req.valid('param').sessionId,
        c.req.valid('json')
      ),
      200
    )
  )
  .openapi(sessionActionGenerateRoute, async (c) => {
    const { actionId, sessionId } = c.req.valid('param');
    return c.json(
      await screenHistoryService.generateFromSessionAction(
        userId(c),
        sessionId,
        actionId,
        c.req.valid('json')
      ),
      200
    );
  })
  .openapi(sessionActionLinkRoute, async (c) => {
    const { actionId, sessionId } = c.req.valid('param');
    return c.json(
      await screenHistoryService.linkAction(userId(c), sessionId, actionId, c.req.valid('json')),
      200
    );
  })
  .openapi(sessionActionUnlinkRoute, async (c) => {
    const { actionId, sessionId } = c.req.valid('param');
    return c.json(await screenHistoryService.unlinkAction(userId(c), sessionId, actionId), 200);
  })
  .openapi(sessionRegenerateRoute, async (c) =>
    c.json(
      await screenHistoryService.regenerateSession(
        userId(c),
        c.req.valid('param').sessionId,
        c.req.valid('json')
      ),
      200
    )
  )
  .openapi(restoreCheckpointRoute, async (c) => {
    const { screenJsonId, sessionId } = c.req.valid('param');
    return c.json(
      await screenHistoryService.restoreCheckpoint(userId(c), sessionId, screenJsonId),
      200
    );
  });

export const screenJsonRouter = protectedScreenJsonsRouter.openapi(screenJsonRoute, async (c) =>
  c.json(await screenHistoryService.screenJson(userId(c), c.req.valid('param').screenJsonId), 200)
);

export const mcpToolsRouter = protectedMcpRouter.openapi(mcpGetScreenJsonRoute, async (c) =>
  c.json(await screenHistoryService.screenJson(userId(c), c.req.valid('json').screenJsonId), 200)
);
