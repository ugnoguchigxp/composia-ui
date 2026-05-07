import { z } from 'zod';
import { componentDefinitionSchema } from './component-registry.schema';
import { appActionSchema } from './ui-schema.schema';
import { visualIntentSchema } from './visual-intent.schema';

const tableCellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const allowedImageHostnames = new Set(['picsum.photos']);
const renderActionsSchema = z.array(appActionSchema).default([]).optional();

export const appRelativeHrefSchema = z
  .string()
  .trim()
  .refine((href) => href.startsWith('/') && !href.startsWith('//') && !href.includes('\\'), {
    message: 'href must be an app-relative path',
  });

export const imageUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (src) => {
      const url = new URL(src);
      return url.protocol === 'https:' && allowedImageHostnames.has(url.hostname);
    },
    {
      message: 'image src must be an allowed HTTPS image URL',
    }
  );

const actionLinkSchema = z
  .object({
    label: z.string().min(1),
    href: appRelativeHrefSchema,
  })
  .strict();

const imageAssetSchema = z
  .object({
    src: imageUrlSchema,
    alt: z.string().min(1),
    caption: z.string().optional(),
    credit: z.string().optional(),
  })
  .strict();

const metricSchema = z
  .object({
    label: z.string().min(1),
    value: z.union([z.string(), z.number()]),
    description: z.string().optional(),
    tone: visualIntentSchema.shape.tone.optional(),
  })
  .strict();

const metadataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const metadataEntrySchema = z
  .object({
    label: z.string().min(1),
    value: metadataValueSchema,
  })
  .strict();
const displayMetadataSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  metadataEntrySchema,
  z.array(metadataEntrySchema).min(1).max(6),
  z.record(z.string(), metadataValueSchema),
]);

const tableColumnSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

const carouselItemSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    badge: z.string().optional(),
    href: appRelativeHrefSchema.optional(),
    image: imageAssetSchema.optional(),
  })
  .strict();

const cardGridItemSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    badge: z.string().optional(),
    href: appRelativeHrefSchema.optional(),
    image: imageAssetSchema.optional(),
    meta: displayMetadataSchema.optional(),
  })
  .strict();

const processStepSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    status: z.enum(['completed', 'current', 'upcoming']).optional(),
  })
  .strict();

const optionSchema = z
  .object({
    label: z.string().min(1),
    value: z.string().min(1),
  })
  .strict();

const formFieldSchema = z
  .object({
    name: z.string().min(1),
    label: z.string().min(1),
    type: z
      .enum(['text', 'email', 'number', 'date', 'textarea', 'select', 'checkbox'])
      .default('text'),
    placeholder: z.string().optional(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    required: z.boolean().optional(),
    options: z.array(optionSchema).optional(),
  })
  .strict();

const keyValueSchema = z
  .object({
    label: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean()]),
    tone: visualIntentSchema.shape.tone.optional(),
  })
  .strict();

const masterDetailItemSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    meta: displayMetadataSchema.optional(),
    status: z.string().optional(),
  })
  .strict();

const kanbanCardSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    assignee: z.string().optional(),
    meta: displayMetadataSchema.optional(),
    tone: visualIntentSchema.shape.tone.optional(),
  })
  .strict();

const kanbanColumnSchema = z
  .object({
    title: z.string().min(1),
    cards: z.array(kanbanCardSchema).default([]),
  })
  .strict();

const calendarEventSchema = z
  .object({
    title: z.string().min(1),
    date: z.string().min(1),
    time: z.string().optional(),
    description: z.string().optional(),
    tone: visualIntentSchema.shape.tone.optional(),
  })
  .strict();

const chatMessageSchema = z
  .object({
    author: z.string().min(1),
    role: z.enum(['user', 'assistant', 'system']).default('user'),
    content: z.string().min(1),
    timestamp: z.string().optional(),
  })
  .strict();

const comparisonColumnSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    items: z.array(keyValueSchema).min(1),
  })
  .strict();

export const componentPropsSchemas = {
  DashboardPage: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  EntityListPage: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  EntityDetailPage: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  EditableFormPage: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ArticleFeedPage: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  SidebarPage: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      navigation: z
        .array(
          z
            .object({
              label: z.string().min(1),
              href: appRelativeHrefSchema,
              description: z.string().optional(),
            })
            .strict()
        )
        .default([]),
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  KpiSummarySection: z
    .object({
      title: z.string().min(1).optional(),
      items: z.array(metricSchema).min(1),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  TimelineSection: z
    .object({
      title: z.string().min(1),
      items: z
        .array(
          z
            .object({
              title: z.string().min(1),
              timestamp: z.string().optional(),
              description: z.string().optional(),
            })
            .strict()
        )
        .min(1),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  InsightPanel: z
    .object({
      title: z.string().min(1),
      body: z.string().min(1),
      action: actionLinkSchema.optional(),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ImageSection: z
    .object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      image: imageAssetSchema,
      aspectRatio: z.enum(['wide', 'square', 'portrait']).default('wide'),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  SplitHeroSection: z
    .object({
      eyebrow: z.string().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      image: imageAssetSchema.optional(),
      primaryAction: actionLinkSchema.optional(),
      secondaryAction: actionLinkSchema.optional(),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  CarouselSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      items: z.array(carouselItemSchema).min(2).max(12),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ProcessStepperSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      steps: z.array(processStepSchema).min(2).max(8),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  CardGridSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      items: z.array(cardGridItemSchema).min(1).max(16),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  FilterBarSection: z
    .object({
      title: z.string().optional(),
      searchPlaceholder: z.string().optional(),
      filters: z.array(optionSchema).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  FormSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      fields: z.array(formFieldSchema).min(1).max(16),
      submitLabel: z.string().optional(),
      secondaryAction: actionLinkSchema.optional(),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  MasterDetailSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      items: z.array(masterDetailItemSchema).min(1).max(20),
      detail: z
        .object({
          title: z.string().min(1),
          description: z.string().optional(),
          fields: z.array(keyValueSchema).default([]),
        })
        .strict(),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  KanbanSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      columns: z.array(kanbanColumnSchema).min(2).max(6),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  CalendarSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      events: z.array(calendarEventSchema).min(1).max(20),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ChatPanelSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      messages: z.array(chatMessageSchema).min(1).max(12),
      composerPlaceholder: z.string().optional(),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  EditorPreviewSection: z
    .object({
      title: z.string().min(1),
      editorTitle: z.string().optional(),
      editorContent: z.string().min(1),
      previewTitle: z.string().optional(),
      previewContent: z.string().min(1),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ComparisonSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      columns: z.array(comparisonColumnSchema).min(2).max(4),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ActionFooterSection: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      primaryAction: actionLinkSchema.optional(),
      secondaryAction: actionLinkSchema.optional(),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  DataTableSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      columns: z.array(tableColumnSchema).min(1),
      rows: z.array(z.record(z.string(), tableCellValueSchema)).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  NavigationPanel: z
    .object({
      title: z.string().min(1),
      links: z.array(actionLinkSchema).min(1),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  EmptyState: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      action: actionLinkSchema.optional(),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ErrorState: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
} as const;

export type AppComponentName = keyof typeof componentPropsSchemas;

export const appCatalogVersion = 'app-catalog-v4';

export const componentDefinitions = componentDefinitionSchema.array().parse([
  {
    name: 'DashboardPage',
    description: 'Dashboard page shell.',
    allowedSources: ['app'],
    placement: 'page',
    propsSchema: componentPropsSchemas.DashboardPage,
    promptProps: 'visualIntent?',
  },
  {
    name: 'EntityListPage',
    description: 'Entity list page shell.',
    allowedSources: ['app'],
    placement: 'page',
    propsSchema: componentPropsSchemas.EntityListPage,
    promptProps: 'visualIntent?',
  },
  {
    name: 'EntityDetailPage',
    description: 'Entity detail page shell.',
    allowedSources: ['app'],
    placement: 'page',
    propsSchema: componentPropsSchemas.EntityDetailPage,
    promptProps: 'visualIntent?',
  },
  {
    name: 'EditableFormPage',
    description: 'Editable form page shell.',
    allowedSources: ['app'],
    placement: 'page',
    propsSchema: componentPropsSchemas.EditableFormPage,
    promptProps: 'visualIntent?',
  },
  {
    name: 'ArticleFeedPage',
    description: 'Article feed page shell.',
    allowedSources: ['app'],
    placement: 'page',
    propsSchema: componentPropsSchemas.ArticleFeedPage,
    promptProps: 'visualIntent?',
  },
  {
    name: 'SidebarPage',
    description: 'Page shell with a persistent side navigation and main content area.',
    allowedSources: ['app'],
    placement: 'page',
    propsSchema: componentPropsSchemas.SidebarPage,
    promptProps: 'navigation[label,href], visualIntent?',
  },
  {
    name: 'KpiSummarySection',
    description: 'Metric summary section.',
    allowedSources: ['summary', 'postgres', 'api'],
    placement: 'section',
    propsSchema: componentPropsSchemas.KpiSummarySection,
    promptProps: 'title?, items[label,value,description?]',
  },
  {
    name: 'TimelineSection',
    description: 'Timeline section.',
    allowedSources: ['rss', 'api', 'markdown'],
    placement: 'section',
    propsSchema: componentPropsSchemas.TimelineSection,
    promptProps: 'title, items[title,timestamp?,description?]',
  },
  {
    name: 'InsightPanel',
    description: 'Insight panel section.',
    allowedSources: ['summary', 'rss', 'postgres', 'api', 'markdown'],
    placement: 'section',
    propsSchema: componentPropsSchemas.InsightPanel,
    promptProps: 'title, body, action?[label,href]',
  },
  {
    name: 'ImageSection',
    description: 'Image section backed by an allowlisted external image URL.',
    allowedSources: ['app', 'api', 'markdown'],
    placement: 'section',
    propsSchema: componentPropsSchemas.ImageSection,
    promptProps: 'title?, description?, image[src,alt,caption?,credit?], aspectRatio?',
  },
  {
    name: 'SplitHeroSection',
    description: 'A strong two-column hero or feature intro with optional image and actions.',
    allowedSources: ['app', 'api', 'markdown'],
    placement: 'section',
    propsSchema: componentPropsSchemas.SplitHeroSection,
    promptProps: 'eyebrow?, title, description?, image?, primaryAction?, secondaryAction?',
  },
  {
    name: 'CarouselSection',
    description: 'A horizontal carousel for products, articles, gallery items, or recommendations.',
    allowedSources: ['app', 'api', 'markdown', 'rss'],
    placement: 'section',
    propsSchema: componentPropsSchemas.CarouselSection,
    promptProps: 'title, description?, items[title,description?,badge?,href?,image?]',
  },
  {
    name: 'ProcessStepperSection',
    description:
      'A stepper for workflows, onboarding, setup, ordering, or incident response flows.',
    allowedSources: ['summary', 'api', 'markdown'],
    placement: 'section',
    propsSchema: componentPropsSchemas.ProcessStepperSection,
    promptProps: 'title, description?, steps[title,description?,status?]',
  },
  {
    name: 'CardGridSection',
    description: 'A grid for products, projects, templates, files, or selectable cards.',
    allowedSources: ['app', 'api', 'markdown', 'rss', 'postgres'],
    placement: 'section',
    propsSchema: componentPropsSchemas.CardGridSection,
    promptProps: 'title, description?, items[title,description?,badge?,href?,meta?,image?]',
  },
  {
    name: 'FilterBarSection',
    description: 'A compact search and filter bar for list, catalog, table, or board screens.',
    allowedSources: ['app', 'api', 'postgres'],
    placement: 'section',
    propsSchema: componentPropsSchemas.FilterBarSection,
    promptProps: 'title?, searchPlaceholder?, filters[label,value]',
  },
  {
    name: 'FormSection',
    description: 'A structured create, edit, settings, checkout, or application form.',
    allowedSources: ['app', 'api', 'postgres'],
    placement: 'section',
    propsSchema: componentPropsSchemas.FormSection,
    promptProps:
      'title, description?, fields[name,label,type?,placeholder?,value?,required?,options?], submitLabel?, secondaryAction?',
  },
  {
    name: 'MasterDetailSection',
    description: 'A master-detail split for tickets, customers, messages, records, or documents.',
    allowedSources: ['app', 'api', 'postgres', 'markdown'],
    placement: 'section',
    propsSchema: componentPropsSchemas.MasterDetailSection,
    promptProps:
      'title, description?, items[id,title,description?,meta?,status?], detail[title,description?,fields?]',
  },
  {
    name: 'KanbanSection',
    description: 'A kanban board for work items, tickets, leads, tasks, or workflows.',
    allowedSources: ['app', 'api', 'postgres'],
    placement: 'section',
    propsSchema: componentPropsSchemas.KanbanSection,
    promptProps:
      'title, description?, columns[title,cards[title,description?,assignee?,meta?,tone?]]',
  },
  {
    name: 'CalendarSection',
    description: 'A calendar or schedule agenda for events, bookings, deadlines, or plans.',
    allowedSources: ['app', 'api', 'postgres'],
    placement: 'section',
    propsSchema: componentPropsSchemas.CalendarSection,
    promptProps: 'title, description?, events[title,date,time?,description?,tone?]',
  },
  {
    name: 'ChatPanelSection',
    description: 'A chat or conversation surface for support, AI assistants, and messages.',
    allowedSources: ['app', 'api', 'markdown'],
    placement: 'section',
    propsSchema: componentPropsSchemas.ChatPanelSection,
    promptProps:
      'title, description?, messages[author,role?,content,timestamp?], composerPlaceholder?',
  },
  {
    name: 'EditorPreviewSection',
    description: 'An editor and preview split for documents, markdown, code, prompts, or content.',
    allowedSources: ['app', 'api', 'markdown'],
    placement: 'section',
    propsSchema: componentPropsSchemas.EditorPreviewSection,
    promptProps: 'title, editorTitle?, editorContent, previewTitle?, previewContent',
  },
  {
    name: 'ComparisonSection',
    description: 'A comparison view for plans, diffs, options, candidates, or versions.',
    allowedSources: ['app', 'api', 'postgres', 'markdown'],
    placement: 'section',
    propsSchema: componentPropsSchemas.ComparisonSection,
    promptProps: 'title, description?, columns[title,description?,items[label,value,tone?]]',
  },
  {
    name: 'ActionFooterSection',
    description: 'A bottom decision or action area for confirmation, submit, and next steps.',
    allowedSources: ['app', 'summary', 'api'],
    placement: 'section',
    propsSchema: componentPropsSchemas.ActionFooterSection,
    promptProps: 'title?, description?, primaryAction?, secondaryAction?',
  },
  {
    name: 'DataTableSection',
    description: 'Data table section.',
    allowedSources: ['postgres', 'api'],
    placement: 'section',
    propsSchema: componentPropsSchemas.DataTableSection,
    promptProps: 'title, description?, columns[key,label], rows?',
  },
  {
    name: 'NavigationPanel',
    description: 'Compact tab-style local navigation section.',
    allowedSources: ['navigation'],
    placement: 'section',
    propsSchema: componentPropsSchemas.NavigationPanel,
    promptProps: 'title, links[label,href]',
    promptGuidance: 'for compact local tab navigation only',
  },
  {
    name: 'EmptyState',
    description: 'Empty state fallback.',
    allowedSources: ['app', 'summary', 'rss', 'postgres', 'api', 'markdown', 'navigation'],
    placement: 'section',
    propsSchema: componentPropsSchemas.EmptyState,
    promptProps: 'title, description?, action?',
  },
  {
    name: 'ErrorState',
    description: 'Error state fallback.',
    allowedSources: ['app', 'summary', 'rss', 'postgres', 'api', 'markdown', 'navigation'],
    placement: 'section',
    propsSchema: componentPropsSchemas.ErrorState,
    promptProps: 'title, description?',
  },
]);

export type CatalogValidationIssue = {
  path: string;
  message: string;
};

const componentDefinitionMap = new Map(
  componentDefinitions.map((definition) => [definition.name, definition])
);

export function listComponentDefinitions() {
  return componentDefinitions;
}

export function getComponentDefinition(name: string) {
  return componentDefinitionMap.get(name);
}

export function isAppComponentName(name: string): name is AppComponentName {
  return componentDefinitionMap.has(name);
}

export function validateComponentProps(
  componentName: string,
  props: Record<string, unknown>,
  path = componentName
): CatalogValidationIssue[] {
  const definition = getComponentDefinition(componentName);
  if (!definition) {
    return [{ path, message: `Unknown component: ${componentName}` }];
  }

  const result = definition.propsSchema.safeParse(props);
  if (result.success) return [];

  return result.error.issues.map((issue) => ({
    path: `${path}.${issue.path.join('.')}`,
    message: issue.message,
  }));
}

export function validateAppUiSchemaCatalog(schema: {
  sections: Array<{ component: string; source: string; props?: Record<string, unknown> }>;
}): CatalogValidationIssue[] {
  return schema.sections.flatMap((section, index) => {
    const path = `sections.${index}`;
    const definition = getComponentDefinition(section.component);
    if (!definition) {
      return [{ path: `${path}.component`, message: `Unknown component: ${section.component}` }];
    }

    const sourceAllowed =
      definition.allowedSources.length === 0 ||
      definition.allowedSources.includes('*') ||
      definition.allowedSources.includes(section.source);

    const sourceIssues = sourceAllowed
      ? []
      : [
          {
            path: `${path}.source`,
            message: `${section.component} cannot read from source ${section.source}`,
          },
        ];

    return [
      ...sourceIssues,
      ...validateComponentProps(section.component, section.props ?? {}, `${path}.props`),
    ];
  });
}

export function assertAppUiSchemaCatalog(schema: {
  sections: Array<{ component: string; source: string; props?: Record<string, unknown> }>;
}) {
  const issues = validateAppUiSchemaCatalog(schema);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  }
}
