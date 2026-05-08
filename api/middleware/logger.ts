import { createMiddleware } from 'hono/factory';
import { logger as globalLogger } from '../lib/logger';
import type { AppEnv } from '../lib/types';

export const loggerMiddleware = () => {
  return createMiddleware<AppEnv>(async (c, next) => {
    const requestId = c.req.header('X-Request-Id') || crypto.randomUUID();
    const logger = globalLogger.child({
      requestId,
      method: c.req.method,
      path: c.req.path,
    });

    c.set('logger', logger);
    c.header('X-Request-Id', requestId);

    const start = performance.now();

    logger.info(
      {
        type: 'request_started',
        userAgent: c.req.header('User-Agent'),
        ip: c.req.header('X-Forwarded-For') || c.req.header('Remote-Addr'),
      },
      'Request started'
    );

    await next();

    const durationMs = Math.round(performance.now() - start);

    logger.info(
      {
        type: 'request_completed',
        status: c.res.status,
        durationMs,
      },
      'Request completed'
    );
  });
};
