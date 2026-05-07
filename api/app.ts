import { serveStatic } from '@hono/node-server/serve-static';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';
import { config } from './config';
import { createOpenApiRouter } from './lib/openapi';
import { errorHandler } from './middleware/error-handler';
import { loggerMiddleware } from './middleware/logger';
import { rateLimiter } from './middleware/rate-limiter';
import { aiRouter } from './modules/ai/ai.routes';
import { cacheRouter } from './modules/cache/cache.routes';
import {
  databaseDesignMcpRouter,
  databaseDesignRouter,
  sandboxDatabaseRouter,
} from './modules/database-design/database-design.routes';
import { entitiesRouter, metadataRouter } from './modules/entities/entities.routes';
import {
  mcpToolsRouter,
  screenHistoryRouter,
  screenJsonRouter,
  screenSessionRouter,
} from './modules/screen-history/screen-history.routes';
import { sourcesRouter } from './modules/sources/sources.routes';
import { uiSchemaRouter } from './modules/ui-schema/ui-schema.routes';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { oauthRouter } from './routes/oauth';

const apiRoutes = createOpenApiRouter()
  .route('/health', healthRouter)
  .route('/ai', aiRouter)
  .route('/cache', cacheRouter)
  .route('/database-design', databaseDesignRouter)
  .route('/entities', entitiesRouter)
  .route('/metadata', metadataRouter)
  .route('/mcp', mcpToolsRouter)
  .route('/mcp', databaseDesignMcpRouter)
  .route('/sandbox-db', sandboxDatabaseRouter)
  .route('/screens', screenHistoryRouter)
  .route('/screen-jsons', screenJsonRouter)
  .route('/sessions', screenSessionRouter)
  .route('/sources', sourcesRouter)
  .route('/ui-schema', uiSchemaRouter)
  .route('/auth/oauth', oauthRouter)
  .route('/auth', authRouter);

const app = createOpenApiRouter();
const isProduction = config.NODE_ENV === 'production';
const authMutationRateLimit = isProduction ? 5 : 50;

// Middleware
app.use('*', timing());
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (origin && config.CORS_ORIGINS.includes(origin)) return origin;
      return null;
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", ...config.CORS_ORIGINS, ...(isProduction ? [] : ['ws:', 'wss:'])],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  })
);

app.use('*', loggerMiddleware());
app.onError(errorHandler);

app.use('/api/*', rateLimiter({ windowMs: 60 * 1000, limit: 100, trustProxy: config.TRUST_PROXY }));
app.use(
  '/api/auth/login',
  rateLimiter({ windowMs: 60 * 1000, limit: authMutationRateLimit, trustProxy: config.TRUST_PROXY })
);
app.use(
  '/api/auth/register',
  rateLimiter({ windowMs: 60 * 1000, limit: authMutationRateLimit, trustProxy: config.TRUST_PROXY })
);

app.use('/api/*', csrf());

// Documentation
app.doc('/api/doc', {
  openapi: '3.0.0',
  info: {
    title: 'composia-ai API',
    version: '1.0.0',
  },
});

app.get(
  '/api/ui',
  async (c, next) => {
    c.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'",
        "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );
    await next();
  },
  swaggerUI({ url: '/api/doc' })
);

// Routes
app.route('/api', apiRoutes);

if (config.NODE_ENV === 'production') {
  const serveIndex = serveStatic({ path: './dist/index.html' });
  app.use('/assets/*', serveStatic({ root: './dist' }));
  app.use('/favicon.ico', serveStatic({ root: './dist' }));
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api')) return next();
    return serveIndex(c, next);
  });
}

export type AppType = typeof apiRoutes;
export default app;
