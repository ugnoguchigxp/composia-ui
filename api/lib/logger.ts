import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
  redact: {
    paths: [
      '*.authorization',
      '*.Authorization',
      '*.apiKey',
      '*.api-key',
      '*.OPENAI_API_KEY',
      '*.AZURE_OPENAI_API_KEY',
      '*.ANTHROPIC_API_KEY',
      '*.GOOGLE_AI_API_KEY',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
});
