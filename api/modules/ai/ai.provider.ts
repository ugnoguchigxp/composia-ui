import { jsonrepair } from 'jsonrepair';
import { componentDefinitions } from '../../../shared/schemas/app-catalog.schema';
import { config } from '../../config';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';

export const aiJsonMaxOutputTokens = 8000;

const sectionComponentDefinitions = componentDefinitions.filter(
  (definition) => definition.placement === 'section'
);
const formSectionDefinition = sectionComponentDefinitions.find(
  (definition) => definition.name === 'FormSection'
);
const sectionComponentNames = sectionComponentDefinitions.map((definition) => definition.name);
const formSectionSources = formSectionDefinition?.allowedSources ?? [];
const sectionSources = Array.from(
  new Set(sectionComponentDefinitions.flatMap((definition) => definition.allowedSources))
);
const nonFormSectionComponentNames = sectionComponentNames.filter(
  (component) => component !== 'FormSection'
);

const visualIntentJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    density: { type: 'string', enum: ['compact', 'normal', 'spacious'] },
    tone: {
      type: 'string',
      enum: ['neutral', 'primary', 'success', 'warning', 'danger'],
    },
    emphasis: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
};

const appRelativeHrefJsonSchema = { type: 'string', pattern: '^/(?!/)' };

const actionLinkJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'href'],
  properties: {
    label: { type: 'string', minLength: 1 },
    href: appRelativeHrefJsonSchema,
  },
};

const sectionActionsJsonSchema = {
  type: 'array',
  maxItems: 6,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'label', 'kind'],
    properties: {
      id: { type: 'string', minLength: 1 },
      label: { type: 'string', minLength: 1 },
      kind: {
        type: 'string',
        enum: ['generate-screen', 'navigate', 'submit'],
      },
      intentHint: { type: 'string' },
      target: appRelativeHrefJsonSchema,
      carry: {
        type: 'object',
        additionalProperties: false,
        properties: {
          navigation: { type: 'boolean' },
          visualIntent: { type: 'boolean' },
          sourceContext: { type: 'boolean' },
        },
      },
    },
  },
};

const optionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'value'],
  properties: {
    label: { type: 'string', minLength: 1 },
    value: { type: 'string', minLength: 1 },
  },
};

const formFieldJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'label'],
  properties: {
    name: { type: 'string', minLength: 1 },
    label: { type: 'string', minLength: 1 },
    type: {
      type: 'string',
      enum: ['text', 'email', 'number', 'date', 'textarea', 'select', 'checkbox'],
    },
    placeholder: { type: 'string' },
    value: {
      oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
    },
    required: { type: 'boolean' },
    options: {
      type: 'array',
      items: optionJsonSchema,
    },
  },
};

const formSectionPropsJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'fields'],
  properties: {
    title: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    fields: {
      type: 'array',
      minItems: 1,
      maxItems: 16,
      items: formFieldJsonSchema,
    },
    submitLabel: { type: 'string' },
    secondaryAction: actionLinkJsonSchema,
  },
};

const commonSectionProperties = {
  variant: { type: 'string' },
  dataBindingId: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
  visualIntent: visualIntentJsonSchema,
  actions: sectionActionsJsonSchema,
};

export const appUiSchemaJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['page', 'intent', 'layout', 'sections'],
  properties: {
    page: { type: 'string', minLength: 1 },
    intent: { type: 'string', minLength: 1 },
    layout: {
      type: 'string',
      enum: [
        'dashboard',
        'entity-list',
        'entity-detail',
        'form',
        'article-feed',
        'screen',
        'sidebar',
      ],
    },
    density: { type: 'string', enum: ['compact', 'normal', 'spacious'] },
    tone: { type: 'string', enum: ['neutral', 'primary', 'success', 'warning', 'danger'] },
    navigation: {
      type: 'object',
      additionalProperties: false,
      properties: {
        items: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'href'],
            properties: {
              label: { type: 'string', minLength: 1 },
              href: appRelativeHrefJsonSchema,
              description: { type: 'string' },
            },
          },
        },
      },
    },
    sections: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['component', 'source', 'props'],
            properties: {
              component: { type: 'string', const: 'FormSection' },
              source: { type: 'string', enum: formSectionSources },
              ...commonSectionProperties,
              props: formSectionPropsJsonSchema,
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['component', 'source', 'props'],
            properties: {
              component: { type: 'string', enum: nonFormSectionComponentNames },
              source: { type: 'string', enum: sectionSources },
              ...commonSectionProperties,
              props: {
                type: 'object',
                additionalProperties: true,
              },
            },
          },
        ],
      },
    },
  },
};

const componentInstructions = sectionComponentDefinitions
  .map((definition) => {
    const guidance = definition.promptGuidance ? `; guidance=${definition.promptGuidance}` : '';
    return `- ${definition.name}: sources=${definition.allowedSources.join('|')}; props=${definition.promptProps}${guidance}`;
  })
  .join('\n');

export const layoutSystemContextVersion = 'layout-system-context-v8';

export const layoutSystemContext = `
Return App UI Schema as strict JSON only. No Markdown or prose.
All labels are visible product copy. Never mention generate/create/infer/build screen/page/UI in visible labels.
Do not write labels like "画面を生成", "ページを生成", "注文管理画面を生成", "Generate screen", or "Create page".
Action/navigation labels must name the destination or intent, e.g. "注文管理", "障害対応", "花の商品を見る", "詳細を見る".
Keep generation mechanics only in action.kind and intentHint, never in label fields.
For FormSection select fields, options must always be objects like {"label":"高","value":"high"}; never return string arrays like ["高","中","低"].
Keep page titles compact and workmanlike. Do not use oversized landing-page H1 or billboard headline patterns.
Do not rely on the page-level title or intent as visible hero copy. Put user-facing content in sections only when it is needed.
Do not create standalone menu sections made of button lists, such as "ショップメニュー" or "Shop menu". Put primary navigation in layout:"sidebar" with navigation.items, or use NavigationPanel only as compact local tab navigation.
Do not add newsletter, email signup, メルマガ, or ニュースレター registration as a default landing-page filler pattern.
Choose varied layouts. Use dashboards only for analytics-heavy prompts.
Use sidebar + navigation.items for multi-area apps. Use hero/carousel/card-grid for product or browsing flows. Use master-detail/inbox, kanban, calendar, chat, editor-preview, comparison, form, stepper, or action footer when they fit the user request.
`.trim();

const layoutInstructions = `
${layoutSystemContext}

Use catalog components only. Allowed components:
${componentInstructions}
Links are app-relative paths like "/history". Images use https://picsum.photos/seed/<topic>/1200/720 only.
For inferred next screens, add actions[{ kind:"generate-screen", id, label, target, intentHint }].
Prefer 2-5 well-chosen sections with concise static sample data.
`.trim();

const summaryJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary'],
  properties: {
    summary: { type: 'string', minLength: 1 },
  },
};

const classificationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'confidence'],
  properties: {
    label: { type: 'string', minLength: 1 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasoning: { type: 'string' },
  },
};

const navigationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['links'],
  properties: {
    links: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'href'],
        properties: {
          label: { type: 'string', minLength: 1 },
          href: { type: 'string', pattern: '^/(?!/)' },
          description: { type: 'string' },
        },
      },
    },
  },
};

const summaryInstructions =
  'Summarize the provided text for an application UI. Return strict JSON text only, without Markdown fences, with a concise "summary" string.';

const classificationInstructions =
  'Classify the provided text. If labels are provided, choose the best label from that list. Return strict JSON text only, without Markdown fences, with "label", "confidence" from 0 to 1, and optional "reasoning".';

const navigationInstructions =
  'Generate concise app navigation links for the provided request and context. Return strict JSON text only, without Markdown fences. Every href must be an app-relative path beginning with a single slash.';

export type AiLayoutProvider = {
  classify?: (input: { labels?: string[]; prompt?: string; text: string }) => Promise<unknown>;
  generateLayout: (prompt: string) => Promise<unknown>;
  generateNavigation?: (input: string) => Promise<unknown>;
  summarize?: (input: { prompt?: string; text: string }) => Promise<unknown>;
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

function extractOpenAiResponseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === 'string') return payload.output_text;

  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (typeof item !== 'object' || item === null) continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const contentItem of content) {
      if (
        typeof contentItem === 'object' &&
        contentItem !== null &&
        typeof (contentItem as { text?: unknown }).text === 'string'
      ) {
        return (contentItem as { text: string }).text;
      }
    }
  }

  throw providerError('OpenAI response did not include text output');
}

function extractAzureMessageText(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0];
  if (typeof firstChoice !== 'object' || firstChoice === null) {
    throw providerError('Azure OpenAI response did not include choices');
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) {
    throw providerError('Azure OpenAI response did not include a message');
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string' && content.trim().length > 0) return content;

  throw providerError('Azure OpenAI response message did not include text content', {
    finishReason: (firstChoice as { finish_reason?: unknown }).finish_reason,
  });
}

async function parseProviderResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw providerError('AI provider request failed', {
      status: response.status,
      providerError: payload.error,
    });
  }
  return payload;
}

export function createDefaultAiLayoutProvider(): AiLayoutProvider {
  if (
    config.AZURE_OPENAI_API_KEY &&
    config.AZURE_OPENAI_ENDPOINT &&
    config.AZURE_OPENAI_DEPLOYMENT_NAME
  ) {
    return createAzureOpenAiLayoutProvider();
  }

  if (config.OPENAI_API_KEY) {
    return createOpenAiResponsesLayoutProvider();
  }

  return {
    generateLayout: async () => {
      throw new AppError(503, 'AI_PROVIDER_NOT_CONFIGURED', 'OpenAI API is not configured');
    },
  };
}

function createOpenAiResponsesLayoutProvider(): AiLayoutProvider {
  const generateJson = async ({
    input,
    instructions,
    name,
    schema,
  }: {
    input: string;
    instructions: string;
    name: string;
    schema: object;
  }) => {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.OPENAI_MODEL,
        instructions,
        input,
        max_output_tokens: aiJsonMaxOutputTokens,
        text: {
          format: {
            type: 'json_schema',
            name,
            strict: false,
            schema,
          },
        },
      }),
    });

    logger.info(
      {
        name,
        model: config.OPENAI_MODEL,
        inputLength: input.length,
        instructionsLength: instructions.length,
        maxOutputTokens: aiJsonMaxOutputTokens,
      },
      'OpenAI request sent'
    );

    const payload = await parseProviderResponse(response);
    logger.info({ name, payload }, 'OpenAI response received');
    return parseJsonText(extractOpenAiResponseText(payload));
  };

  return {
    classify: async (input) =>
      generateJson({
        instructions: classificationInstructions,
        input: JSON.stringify(input),
        name: 'ai_classification',
        schema: classificationJsonSchema,
      }),
    generateLayout: async (prompt) =>
      generateJson({
        instructions: layoutInstructions,
        input: prompt,
        name: 'app_ui_schema',
        schema: appUiSchemaJsonSchema,
      }),
    generateNavigation: async (input) =>
      generateJson({
        instructions: navigationInstructions,
        input,
        name: 'ai_navigation',
        schema: navigationJsonSchema,
      }),
    summarize: async (input) =>
      generateJson({
        instructions: summaryInstructions,
        input: JSON.stringify(input),
        name: 'ai_summary',
        schema: summaryJsonSchema,
      }),
  };
}

function createAzureOpenAiLayoutProvider(): AiLayoutProvider {
  const generateJson = async ({
    input,
    instructions,
    name,
    schema,
  }: {
    input: string;
    instructions: string;
    name: string;
    schema: object;
  }) => {
    const rawEndpoint = config.AZURE_OPENAI_ENDPOINT;
    const endpoint = rawEndpoint?.endsWith('/') ? rawEndpoint.slice(0, -1) : rawEndpoint;
    const deployment = encodeURIComponent(config.AZURE_OPENAI_DEPLOYMENT_NAME ?? '');
    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${encodeURIComponent(
      config.AZURE_OPENAI_API_VERSION
    )}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': config.AZURE_OPENAI_API_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: input },
        ],
        max_completion_tokens: aiJsonMaxOutputTokens,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name,
            strict: false,
            schema,
          },
        },
      }),
    });

    logger.info(
      {
        name,
        url,
        inputLength: input.length,
        instructionsLength: instructions.length,
        maxCompletionTokens: aiJsonMaxOutputTokens,
      },
      'Azure OpenAI request sent'
    );

    const payload = await parseProviderResponse(response);
    logger.info({ name, payload }, 'Azure OpenAI response received');
    return parseJsonText(extractAzureMessageText(payload));
  };

  return {
    classify: async (input) =>
      generateJson({
        instructions: classificationInstructions,
        input: JSON.stringify(input),
        name: 'ai_classification',
        schema: classificationJsonSchema,
      }),
    generateLayout: async (prompt) =>
      generateJson({
        instructions: layoutInstructions,
        input: prompt,
        name: 'app_ui_schema',
        schema: appUiSchemaJsonSchema,
      }),
    generateNavigation: async (input) =>
      generateJson({
        instructions: navigationInstructions,
        input,
        name: 'ai_navigation',
        schema: navigationJsonSchema,
      }),
    summarize: async (input) =>
      generateJson({
        instructions: summaryInstructions,
        input: JSON.stringify(input),
        name: 'ai_summary',
        schema: summaryJsonSchema,
      }),
  };
}
