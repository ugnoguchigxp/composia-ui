import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMocks = vi.hoisted(() => {
  const childLogger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };

  return {
    childLogger,
    logger: {
      child: vi.fn(() => childLogger),
    },
  };
});

vi.mock('../api/lib/logger', () => ({
  logger: loggerMocks.logger,
}));

import { loggerMiddleware } from '../api/middleware/logger';

describe('loggerMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('request-id-1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs method and path without query parameters', async () => {
    const middleware = loggerMiddleware();
    const c = {
      req: {
        method: 'GET',
        url: 'http://localhost/api/auth/oauth/google/callback?code=secret-code&state=secret-state',
        path: '/api/auth/oauth/google/callback',
        header: vi.fn((name) => {
          if (name === 'X-Request-Id') return undefined;
          if (name === 'User-Agent') return 'vitest';
          return undefined;
        }),
      },
      get: vi.fn(() => undefined),
      res: {
        status: 200,
      },
      set: vi.fn(),
      header: vi.fn(),
    };

    await middleware(c as never, async () => {});

    expect(loggerMocks.logger.child).toHaveBeenCalledWith({
      requestId: 'request-id-1',
      method: 'GET',
      path: '/api/auth/oauth/google/callback',
      userId: 'anonymous',
    });

    const startCall = loggerMocks.childLogger.info.mock.calls[0];
    expect(startCall?.[0]).toEqual({
      type: 'request_started',
      userAgent: 'vitest',
      ip: undefined,
    });
    expect(JSON.stringify(startCall?.[0])).not.toContain('secret-code');
    expect(JSON.stringify(startCall?.[0])).not.toContain('secret-state');
  });

  it('uses warn level for 4xx responses', async () => {
    const middleware = loggerMiddleware();
    const c = {
      req: {
        method: 'POST',
        path: '/api/auth/login',
        header: vi.fn((name) => {
          if (name === 'X-Request-Id') return undefined;
          return undefined;
        }),
      },
      get: vi.fn(() => undefined),
      res: {
        status: 401,
      },
      set: vi.fn(),
      header: vi.fn(),
    };

    await middleware(c as never, async () => {});

    expect(loggerMocks.childLogger.warn).toHaveBeenCalledTimes(1);
    expect(loggerMocks.childLogger.error).not.toHaveBeenCalled();
  });
});
