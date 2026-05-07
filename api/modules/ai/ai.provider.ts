import { jsonrepair } from 'jsonrepair';
import { config } from '../../config';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';

const sectionCatalogRules = [
  {
    component: 'KpiSummarySection',
    sources: ['summary', 'postgres', 'api'],
    props:
      'props { title?: string, items: [{ label: string, value: string | number, description?: string }] }',
  },
  {
    component: 'TimelineSection',
    sources: ['rss', 'api', 'markdown'],
    props:
      'props { title: string, items: [{ title: string, timestamp?: string, description?: string }] }',
  },
  {
    component: 'InsightPanel',
    sources: ['summary', 'rss', 'postgres', 'api', 'markdown'],
    props: 'props { title: string, body: string, action?: { label: string, href: string } }',
  },
  {
    component: 'ImageSection',
    sources: ['app', 'api', 'markdown'],
    props:
      'props { title?: string, description?: string, image: { src: string, alt: string, caption?: string, credit?: string }, aspectRatio?: "wide" | "square" | "portrait" }. image.src must be a direct https://picsum.photos/seed/<short-kebab-topic>/1200/720 URL',
  },
  {
    component: 'SplitHeroSection',
    sources: ['app', 'api', 'markdown'],
    props:
      'props { eyebrow?: string, title: string, description?: string, image?: { src: string, alt: string, caption?: string, credit?: string }, primaryAction?: { label: string, href: string }, secondaryAction?: { label: string, href: string } }',
  },
  {
    component: 'CarouselSection',
    sources: ['app', 'api', 'markdown', 'rss'],
    props:
      'props { title: string, description?: string, items: [{ title: string, description?: string, badge?: string, href?: string, image?: { src: string, alt: string, caption?: string, credit?: string } }] }. Use for products, articles, gallery items, recommendations, or browsing choices.',
  },
  {
    component: 'ProcessStepperSection',
    sources: ['summary', 'api', 'markdown'],
    props:
      'props { title: string, description?: string, steps: [{ title: string, description?: string, status?: "completed" | "current" | "upcoming" }] }. Use for workflows, onboarding, setup, ordering, support, or incident response flows.',
  },
  {
    component: 'CardGridSection',
    sources: ['app', 'api', 'markdown', 'rss', 'postgres'],
    props:
      'props { title: string, description?: string, items: [{ title: string, description?: string, badge?: string, href?: string, meta?: string, image?: { src: string, alt: string, caption?: string, credit?: string } }] }. Use for products, projects, templates, files, or selectable cards.',
  },
  {
    component: 'FilterBarSection',
    sources: ['app', 'api', 'postgres'],
    props:
      'props { title?: string, searchPlaceholder?: string, filters: [{ label: string, value: string }] }. Use before lists, grids, tables, kanban boards, or search result screens.',
  },
  {
    component: 'FormSection',
    sources: ['app', 'api', 'postgres'],
    props:
      'props { title: string, description?: string, fields: [{ name: string, label: string, type?: "text" | "email" | "number" | "date" | "textarea" | "select" | "checkbox", placeholder?: string, value?: string | number | boolean, required?: boolean, options?: [{ label: string, value: string }] }], submitLabel?: string, secondaryAction?: { label: string, href: string } }. Use for create, edit, settings, checkout, signup, or application screens.',
  },
  {
    component: 'MasterDetailSection',
    sources: ['app', 'api', 'postgres', 'markdown'],
    props:
      'props { title: string, description?: string, items: [{ id: string, title: string, description?: string, meta?: string, status?: string }], detail: { title: string, description?: string, fields?: [{ label: string, value: string | number | boolean }] } }. Use for mail, tickets, CRM, customer records, files, and medical-like record browsers.',
  },
  {
    component: 'KanbanSection',
    sources: ['app', 'api', 'postgres'],
    props:
      'props { title: string, description?: string, columns: [{ title: string, cards: [{ title: string, description?: string, assignee?: string, meta?: string, tone?: "neutral" | "primary" | "success" | "warning" | "danger" }] }] }. Use for tasks, tickets, leads, hiring, project workflow, or operations boards.',
  },
  {
    component: 'CalendarSection',
    sources: ['app', 'api', 'postgres'],
    props:
      'props { title: string, description?: string, events: [{ title: string, date: string, time?: string, description?: string, tone?: "neutral" | "primary" | "success" | "warning" | "danger" }] }. Use for schedules, bookings, plans, deadlines, and event management.',
  },
  {
    component: 'ChatPanelSection',
    sources: ['app', 'api', 'markdown'],
    props:
      'props { title: string, description?: string, messages: [{ author: string, role?: "user" | "assistant" | "system", content: string, timestamp?: string }], composerPlaceholder?: string }. Use for support chat, AI chat, customer conversations, and messaging.',
  },
  {
    component: 'EditorPreviewSection',
    sources: ['app', 'api', 'markdown'],
    props:
      'props { title: string, editorTitle?: string, editorContent: string, previewTitle?: string, previewContent: string }. Use for markdown editors, prompt editors, document drafting, code preview, and CMS authoring.',
  },
  {
    component: 'ComparisonSection',
    sources: ['app', 'api', 'postgres', 'markdown'],
    props:
      'props { title: string, description?: string, columns: [{ title: string, description?: string, items: [{ label: string, value: string | number | boolean, tone?: "neutral" | "primary" | "success" | "warning" | "danger" }] }] }. Use for pricing, plan comparison, candidate comparison, version diff, or option selection.',
  },
  {
    component: 'ActionFooterSection',
    sources: ['app', 'summary', 'api'],
    props:
      'props { title?: string, description?: string, primaryAction?: { label: string, href: string }, secondaryAction?: { label: string, href: string } }. Use as a decision footer for wizard, form, checkout, import, or confirmation screens.',
  },
  {
    component: 'DataTableSection',
    sources: ['postgres', 'api'],
    props:
      'props { title: string, description?: string, columns: [{ key: string, label: string }], rows: object[] }',
  },
  {
    component: 'NavigationPanel',
    sources: ['navigation'],
    props: 'props { title: string, links: [{ label: string, href: string }] }',
  },
  {
    component: 'EmptyState',
    sources: ['app', 'summary', 'rss', 'postgres', 'api', 'markdown', 'navigation'],
    props:
      'props { title: string, description?: string, action?: { label: string, href: string } }',
  },
] as const;

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

const appUiSchemaJsonSchema = {
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
              href: { type: 'string', pattern: '^/(?!/)' },
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
        oneOf: sectionCatalogRules.map((rule) => ({
          type: 'object',
          additionalProperties: false,
          required: ['component', 'source', 'props'],
          properties: {
            component: { type: 'string', const: rule.component },
            source: { type: 'string', enum: [...rule.sources] },
            variant: { type: 'string' },
            visualIntent: visualIntentJsonSchema,
            actions: {
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
                  target: { type: 'string', pattern: '^/(?!/)' },
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
            },
            props: {
              type: 'object',
              additionalProperties: true,
            },
          },
        })),
      },
    },
  },
};

const componentInstructions = sectionCatalogRules
  .map(
    (rule) =>
      `- ${rule.component}: source must be one of ${rule.sources.map((source) => `"${source}"`).join(', ')}; ${rule.props}`
  )
  .join('\n');

export const layoutSystemContextVersion = 'layout-system-context-v5';

export const layoutSystemContext = `
You generate only an App UI Schema JSON object for a React app.
Return strict JSON text only. Do not wrap the JSON in Markdown fences or explanatory text.
The UI schema is rendered directly. Treat every title, link label, action label, button label, table column label, and empty-state action label as user-visible product copy.
Do not expose implementation mechanics in visible labels. In particular, never mention that the app will generate, create, infer, or build a screen/page/UI in visible copy.
For action labels and navigation labels, write the user's destination or intent. Use labels like "注文管理", "障害対応", "花の商品を見る", "詳細を見る", or "カートに進む".
Do not write labels like "画面を生成", "ページを生成", "注文管理画面を生成", "障害対応画面を生成", "Generate screen", "Create page", or similar wording.
Keep generation mechanics only in action.kind and intentHint, never in label fields.
Choose a composition that fits the requested product, site, workflow, or tool. Do not default to dashboards with KPI cards and tables unless the prompt is clearly analytics-heavy.
Use "sidebar" layout with navigation.items for apps with multiple work areas, settings, catalogs, admin-like flows, or tools that need persistent navigation.
Use SplitHeroSection for product, venue, landing, EC, portfolio, or first-impression screens.
Use CarouselSection for product browsing, article browsing, galleries, recommendations, courses, media, or selectable collections.
Use ProcessStepperSection for onboarding, checkout, incident response, support, setup, or any sequential workflow.
Use MasterDetailSection for mail, ticket, CRM, record, file, or inbox-like screens.
Use FilterBarSection with CardGridSection, DataTableSection, KanbanSection, or MasterDetailSection when users need search, filtering, or browsing controls.
Use CardGridSection for product lists, project lists, template galleries, files, or selectable tiles.
Use FormSection for create/edit/settings/signup/checkout/application screens.
Use KanbanSection for workflow boards, task boards, lead pipelines, and issue tracking.
Use CalendarSection for schedules, bookings, deadlines, and event planning.
Use ChatPanelSection for support, AI chat, messaging, or conversation review screens.
Use EditorPreviewSection for markdown, CMS, document, prompt, code, or editor-preview workflows.
Use ComparisonSection for plans, options, candidates, versions, or before/after comparisons.
Use ActionFooterSection when a page needs a persistent confirmation or next-step decision area.
`.trim();

const layoutInstructions = `
${layoutSystemContext}

Use high-level catalog components, not low-level Button/Card/Input/Grid components.
Allowed components and required props:
${componentInstructions}
Links must be app-relative paths beginning with a single slash, for example "/history".
For "sidebar" layout, include navigation.items with useful destinations and use page sections for the main content.
Vary the screen structure. Prefer a small number of well-chosen sections over repeating tables, KPI blocks, or generic card grids.
When a button or link should lead to a newly inferred screen, also add a section actions item with kind "generate-screen", a stable kebab-case id, a destination-specific visible label, and a short intentHint for the expected next screen.
Use ImageSection when imagery would make the requested UI easier to scan. Generate image.src with picsum.photos seed URLs only, for example "https://picsum.photos/seed/operations-dashboard/1200/720".
Keep sections concise and use plausible static sample data when the prompt implies data that is not available.
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
        max_output_tokens: 4000,
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

    logger.info({ name, model: config.OPENAI_MODEL, instructions, input }, 'OpenAI request sent');

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
        max_completion_tokens: 4000,
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

    logger.info({ name, url, instructions, input }, 'Azure OpenAI request sent');

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
