import { componentDefinitions } from '../../../shared/schemas/app-catalog.schema';
import { config } from '../../config';
import { AppError } from '../../lib/errors';
import { aiJsonMaxOutputTokens, createJsonProvider } from './ai.provider-base';

export { aiJsonMaxOutputTokens };

const excludedLayoutProviderSectionComponents = new Set(['InsightPanel']);
const sectionComponentDefinitions = componentDefinitions.filter(
  (definition) =>
    definition.placement === 'section' &&
    !excludedLayoutProviderSectionComponents.has(definition.name)
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
  required: ['title'],
  properties: {
    title: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    fields: {
      type: 'array',
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
    intent: { type: 'string' },
    layout: {
      type: 'string',
      enum: ['dashboard', 'entity-list', 'entity-detail', 'form', 'article-feed', 'screen'],
    },
    density: { type: 'string', enum: ['compact', 'normal', 'spacious'] },
    tone: { type: 'string', enum: ['neutral', 'primary', 'success', 'warning', 'danger'] },
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
    const variants = definition.variants?.length
      ? `; variants=${definition.variants.join('|')}`
      : '';
    return `- ${definition.name}: sources=${definition.allowedSources.join('|')}; props=${definition.promptProps}${variants}${guidance}`;
  })
  .join('\n');

export const layoutSystemContextVersion = 'layout-system-context-v10';

export const layoutSystemContext = `
Return App UI Schema as strict JSON only. No Markdown or prose.
Do not output null values. Omit optional fields instead of setting them to null.
All labels are visible product copy. Never mention generate/create/infer/build screen/page/UI in visible labels.
Do not write labels like "画面を生成", "ページを生成", "注文管理画面を生成", "Generate screen", or "Create page".
Action/navigation labels must name the destination or intent, e.g. "注文管理", "障害対応", "花の商品を見る", "詳細を見る".
Keep generation mechanics only in action.kind and intentHint, never in label fields.
For FormSection select fields, options must always be objects like {"label":"高","value":"high"}; never return string arrays like ["高","中","低"].
For DataTableSection rows, each cell value must be a string, number, boolean, or null. Never put nested objects or arrays inside row cells.
Keep page titles compact and workmanlike. Do not use oversized landing-page H1 or billboard headline patterns.
The page and intent fields are internal metadata. Do not turn the user's prompt or inferred intent into visible title, description, intro, summary, or sidebar copy.
Do not create sections that merely restate the request, such as "ホーム" plus a sentence describing the requested EC site. Put only real product content, navigation, search, listings, forms, or workflow UI in sections.
Do not create generic overview, summary, introduction, current state, or insight panels. Start with the actual primary content or control surface the user asked for.
InsightPanel is not available for new generated screens. Use concrete components such as MainSearchNavigationSection, CardGridSection, DataTableSection, StepperSection, ChatPanelSection, FormSection, KanbanSection, CalendarSection, or SplitHeroSection.
Use KpiSummarySection only when the prompt clearly needs concrete metrics with meaningful labels and values; never use it as an overview substitute.
Use ChartSection only for numeric trends, comparisons, shares, or radar scores. Do not add charts as decorative filler.
Use ProgressListSection for completion, quota, score, setup, or health progress lists. Do not use it for plain navigation.
Do not create page-level side menus, persistent sidebar navigation, or standalone menu sections made of button lists, such as "ショップメニュー" or "Shop menu".
Do not use layout:"sidebar" or top-level navigation.items for new generated screens. SidebarPage is a legacy renderer compatibility path, not a default generation pattern.
Use MainSearchNavigationSection for Amazon-style marketplace pages that need a prominent main search bar with category tabs directly underneath.
When MainSearchNavigationSection is present, do not add NavigationPanel or an additional search/filter form section that duplicates the same purpose.
Use NavigationPanel only as compact local tab navigation when the user explicitly asks for tabs or local category switching without a main search bar.
Section selection priority must follow: request-fit first, then no-duplication, then source compatibility, then visual balance.
If a prompt needs a hierarchy, tree, archive, or related-post list, render it as real content inside an appropriate section instead of adding a generic side menu.
Do not add newsletter, email signup, メルマガ, or ニュースレター registration as a default landing-page filler pattern.
Choose varied layouts. Use dashboards only for analytics-heavy prompts.
Use screen for ordinary generated pages. Use main-search navigation, hero/carousel/card-grid for product or browsing flows. Use stepper, kanban, calendar, chat, editor-preview, comparison, form, or article-feed when they fit the user request.
`.trim();

const layoutInstructions = `
${layoutSystemContext}

Use catalog components only. Allowed components:
${componentInstructions}
Links are project-local app paths like "/", "/cart", "/basket", "/products". Use "/" for home/index links. Do not output "/prompt/project/..." routes; the backend canonicalizes generated page links. Images use https://picsum.photos/seed/<topic>/1200/720 only.
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

const instructions = {
  classification: classificationInstructions,
  layout: layoutInstructions,
  navigation: navigationInstructions,
  summary: summaryInstructions,
};

const schemas = {
  classification: classificationJsonSchema,
  layout: appUiSchemaJsonSchema,
  navigation: navigationJsonSchema,
  summary: summaryJsonSchema,
};

export type AiLayoutProvider = {
  classify?: (input: { labels?: string[]; prompt?: string; text: string }) => Promise<unknown>;
  generateLayout: (prompt: string) => Promise<unknown>;
  generateNavigation?: (input: string) => Promise<unknown>;
  summarize?: (input: { prompt?: string; text: string }) => Promise<unknown>;
};

function providerError(message: string, details?: Record<string, unknown>) {
  return new AppError(502, 'AI_PROVIDER_ERROR', message, details);
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

function extractAnthropicMessageText(payload: Record<string, unknown>) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const firstContent = content[0];
  if (
    typeof firstContent === 'object' &&
    firstContent !== null &&
    typeof (firstContent as { text?: unknown }).text === 'string'
  ) {
    return (firstContent as { text: string }).text;
  }
  throw providerError('Anthropic response did not include text content');
}

function extractGoogleAiMessageText(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const firstCandidate = candidates[0];
  if (typeof firstCandidate !== 'object' || firstCandidate === null) {
    throw providerError('Google AI response did not include candidates');
  }

  const content = (firstCandidate as { content?: unknown }).content;
  const parts =
    typeof content === 'object' &&
    content !== null &&
    Array.isArray((content as { parts?: unknown }).parts)
      ? (content as { parts: unknown[] }).parts
      : [];
  const firstPart = parts[0];
  if (
    typeof firstPart === 'object' &&
    firstPart !== null &&
    typeof (firstPart as { text?: unknown }).text === 'string'
  ) {
    return (firstPart as { text: string }).text;
  }

  throw providerError('Google AI response did not include text content');
}

function createOpenAiResponsesLayoutProvider(): AiLayoutProvider {
  return createJsonProvider(
    {
      name: 'OpenAI',
      buildRequest: ({ input, instructions, name, schema }) => ({
        url: 'https://api.openai.com/v1/responses',
        init: {
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
        },
      }),
      extractText: extractOpenAiResponseText,
    },
    instructions,
    schemas
  );
}

function createAzureOpenAiLayoutProvider(): AiLayoutProvider {
  return createJsonProvider(
    {
      name: 'Azure OpenAI',
      buildRequest: ({ input, instructions, name, schema }) => {
        const rawEndpoint = config.AZURE_OPENAI_ENDPOINT;
        const endpoint = rawEndpoint?.endsWith('/') ? rawEndpoint.slice(0, -1) : rawEndpoint;
        const deployment = encodeURIComponent(config.AZURE_OPENAI_DEPLOYMENT_NAME ?? '');
        const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${encodeURIComponent(
          config.AZURE_OPENAI_API_VERSION
        )}`;

        return {
          url,
          init: {
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
          },
        };
      },
      extractText: extractAzureMessageText,
    },
    instructions,
    schemas
  );
}

function createAnthropicLayoutProvider(): AiLayoutProvider {
  return createJsonProvider(
    {
      name: 'Anthropic',
      buildRequest: ({ input, instructions }) => ({
        url: 'https://api.anthropic.com/v1/messages',
        init: {
          method: 'POST',
          headers: {
            'x-api-key': config.ANTHROPIC_API_KEY ?? '',
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.ANTHROPIC_MODEL,
            max_tokens: aiJsonMaxOutputTokens,
            system: instructions,
            messages: [{ role: 'user', content: input }],
          }),
        },
      }),
      extractText: extractAnthropicMessageText,
    },
    instructions,
    schemas
  );
}

function createGoogleAiLayoutProvider(): AiLayoutProvider {
  return createJsonProvider(
    {
      name: 'Google AI',
      buildRequest: ({ input, instructions, schema }) => ({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${config.GOOGLE_AI_MODEL}:generateContent?key=${config.GOOGLE_AI_API_KEY}`,
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: input }] }],
            systemInstruction: { parts: [{ text: instructions }] },
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: schema,
            },
          }),
        },
      }),
      extractText: extractGoogleAiMessageText,
    },
    instructions,
    schemas
  );
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

  if (config.ANTHROPIC_API_KEY) {
    return createAnthropicLayoutProvider();
  }

  if (config.GOOGLE_AI_API_KEY) {
    return createGoogleAiLayoutProvider();
  }

  return {
    generateLayout: async () => {
      throw new AppError(503, 'AI_PROVIDER_NOT_CONFIGURED', 'OpenAI API is not configured');
    },
  };
}
