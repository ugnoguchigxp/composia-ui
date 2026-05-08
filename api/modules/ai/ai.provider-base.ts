import { jsonrepair } from 'jsonrepair';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { AiLayoutProvider } from './ai.provider';

export const aiJsonMaxOutputTokens = 8000;

export type GenerateJsonParams = {
  input: string;
  instructions: string;
  name: string;
  schema: object;
};

export type ProviderConfig = {
  buildRequest: (params: GenerateJsonParams) => { url: string; init: RequestInit };
  extractText: (payload: Record<string, unknown>) => string;
  name: string;
};

function providerError(message: string, details?: Record<string, unknown>) {
  return new AppError(502, 'AI_PROVIDER_ERROR', message, details);
}

export function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw providerError('AI provider returned empty text output');
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    try {
      const repaired = jsonrepair(trimmed);
      const parsed = JSON.parse(repaired);
      logger.warn(
        {
          reason: error instanceof Error ? error.message : 'Unknown JSON parse error',
          outputPreview: trimmed.slice(0, 240),
        },
        'AI provider returned repairable JSON'
      );
      return parsed;
    } catch (repairError) {
      logger.error({ text: trimmed, error, repairError }, 'AI provider returned invalid JSON');
      throw providerError('AI provider returned invalid JSON', {
        reason: error instanceof Error ? error.message : 'Unknown JSON parse error',
        repairReason:
          repairError instanceof Error ? repairError.message : 'Unknown JSON repair error',
        outputPreview: trimmed.slice(0, 240),
      });
    }
  }
}

export async function parseProviderResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw providerError('AI provider request failed', {
      status: response.status,
      providerError: payload.error,
    });
  }
  return payload;
}

export function createJsonProvider(
  config: ProviderConfig,
  instructions: {
    classification: string;
    layout: string;
    navigation: string;
    summary: string;
  },
  schemas: {
    classification: object;
    layout: object;
    navigation: object;
    summary: object;
  }
): AiLayoutProvider {
  const generateJson = async (params: GenerateJsonParams) => {
    const { url, init } = config.buildRequest(params);
    const response = await fetch(url, init);
    const payload = await parseProviderResponse(response);
    logger.info(
      {
        name: params.name,
        provider: config.name,
        usage: payload.usage,
      },
      `${config.name} response received`
    );
    return parseJsonText(config.extractText(payload));
  };

  return {
    classify: async (input) =>
      generateJson({
        instructions: instructions.classification,
        input: JSON.stringify(input),
        name: 'ai_classification',
        schema: schemas.classification,
      }),
    generateLayout: async (prompt) =>
      generateJson({
        instructions: instructions.layout,
        input: prompt,
        name: 'app_ui_schema',
        schema: schemas.layout,
      }),
    generateNavigation: async (input) =>
      generateJson({
        instructions: instructions.navigation,
        input,
        name: 'ai_navigation',
        schema: schemas.navigation,
      }),
    summarize: async (input) =>
      generateJson({
        instructions: instructions.summary,
        input: JSON.stringify(input),
        name: 'ai_summary',
        schema: schemas.summary,
      }),
  };
}
