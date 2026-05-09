import { z } from 'zod';
import { componentDefinitionSchema } from './component-registry.schema';
import { appActionSchema } from './ui-schema.schema';
import { visualIntentSchema } from './visual-intent.schema';

const tableCellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const allowedImageHostnames = new Set(['picsum.photos']);
const allowedLocalImageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const renderActionsSchema = z.array(appActionSchema).optional();

function isLocalImageAssetPath(src: string) {
  if (!src.startsWith('/images/')) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(src);
  } catch {
    return false;
  }
  if (
    decoded.includes('//') ||
    decoded.includes('\\') ||
    decoded.includes('..') ||
    decoded.includes('?') ||
    decoded.includes('#')
  ) {
    return false;
  }
  const filename = decoded.slice('/images/'.length);
  if (filename.length === 0 || filename.includes('/')) return false;
  const extension = filename.split('.').at(-1)?.toLowerCase();
  return extension ? allowedLocalImageExtensions.has(extension) : false;
}

export const appRelativeHrefSchema = z
  .string()
  .trim()
  .refine((href) => href.startsWith('/') && !href.startsWith('//') && !href.includes('\\'), {
    message: 'href must be an app-relative path',
  });

export const imageUrlSchema = z
  .string()
  .trim()
  .refine(
    (src) => {
      if (isLocalImageAssetPath(src)) return true;

      try {
        const url = new URL(src);
        return url.protocol === 'https:' && allowedImageHostnames.has(url.hostname);
      } catch {
        return false;
      }
    },
    {
      message: 'image src must be an allowed HTTPS image URL or /images asset path',
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

const defaultMarketplaceSearchResults = [
  {
    title: 'ワイヤレスイヤホン',
    description: 'ノイズキャンセルと長時間バッテリーに対応した定番モデル。',
    badge: '人気',
    href: '/products/wireless-earbuds',
    image: {
      src: 'https://picsum.photos/seed/marketplace-earbuds/1200/720',
      alt: 'ワイヤレスイヤホン',
    },
    meta: { label: '価格', value: '¥12,800' },
  },
  {
    title: 'ステンレスボトル',
    description: '通勤やアウトドアで使いやすい軽量ボトル。',
    badge: '本日のお得',
    href: '/products/stainless-bottle',
    image: {
      src: 'https://picsum.photos/seed/marketplace-bottle/1200/720',
      alt: 'ステンレスボトル',
    },
    meta: { label: '評価', value: 4.7 },
  },
  {
    title: 'デスクライト',
    description: '明るさと色温度を調整できる省スペースライト。',
    badge: '新着',
    href: '/products/desk-light',
    image: {
      src: 'https://picsum.photos/seed/marketplace-desk-light/1200/720',
      alt: 'デスクライト',
    },
    meta: { label: '在庫', value: 'あり' },
  },
  {
    title: 'キャンバストート',
    description: '毎日の買い物や通学に使える丈夫なトートバッグ。',
    href: '/products/canvas-tote',
    image: {
      src: 'https://picsum.photos/seed/marketplace-canvas-tote/1200/720',
      alt: 'キャンバストート',
    },
    meta: { label: '配送', value: '明日到着' },
  },
];

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

const stepperStepSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    status: z.enum(['completed', 'current', 'upcoming']).optional(),
    disabled: z.boolean().optional(),
    meta: displayMetadataSchema.optional(),
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

const scheduleEntrySchema = z
  .object({
    date: z.string().min(1),
    title: z.string().min(1),
    amount: z.union([z.string(), z.number()]),
    status: z.enum(['scheduled', 'processing', 'paid', 'overdue']).default('scheduled'),
  })
  .strict();

const holdingRecordSchema = z
  .object({
    ticker: z.string().min(1),
    name: z.string().min(1),
    quantityLabel: z.string().min(1),
    acquiredLabel: z.string().min(1),
    category: z.string().min(1).default('Stock'),
    value: z.union([z.string(), z.number()]),
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
    items: z.array(keyValueSchema).default([]),
  })
  .strict();

const chartDatumSchema = z
  .object({
    label: z.string().min(1),
    value: z.number(),
    secondaryValue: z.number().optional(),
  })
  .strict();

const progressItemSchema = z
  .object({
    label: z.string().min(1),
    value: z.number(),
    max: z.number().positive().default(100),
    description: z.string().optional(),
    tone: visualIntentSchema.shape.tone.optional(),
  })
  .strict();

const accordionItemSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    content: z.string().min(1),
    meta: z.string().optional(),
  })
  .strict();

const controlPanelModeSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

const controlPanelControlSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    icon: z.enum(['sun', 'thermometer', 'volume', 'timer']).default('sun'),
    value: z.number().min(0).max(100),
    min: z.number().default(0),
    max: z.number().default(100),
    step: z.number().positive().default(1),
  })
  .strict();

const chartInsightItemSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
  })
  .strict();

const statsTrendCardSchema = z
  .object({
    label: z.string().min(1),
    value: z.union([z.string(), z.number()]),
    delta: z.string().min(1),
    deltaTone: z.enum(['neutral', 'primary', 'success', 'warning', 'danger']).default('neutral'),
    period: z.string().min(1).default('vs prev'),
  })
  .strict();

const activityFeedItemSchema = z
  .object({
    actor: z.string().min(1),
    action: z.string().min(1),
    target: z.string().min(1),
    status: z.enum(['success', 'warning', 'danger', 'neutral']).default('neutral'),
    timestamp: z.string().min(1),
  })
  .strict();

const notificationItemSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    body: z.string().optional(),
    level: z.enum(['info', 'success', 'warning', 'danger']).default('info'),
    read: z.boolean().default(false),
    timestamp: z.string().optional(),
  })
  .strict();

const quickActionIconSchema = z.enum([
  'play',
  'download',
  'refresh-cw',
  'settings',
  'shield',
  'users',
  'database',
  'file-text',
  'bar-chart',
  'package',
  'dollar-sign',
]);

const quickActionItemSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    icon: quickActionIconSchema.default('play'),
  })
  .strict();

const checkoutLineItemSchema = z
  .object({
    label: z.string().min(1),
    value: z.union([z.string(), z.number()]),
    emphasize: z.boolean().default(false),
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
      items: z.array(metricSchema).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ChartSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      chartType: z.enum(['bar', 'line', 'area', 'pie', 'radar']).default('bar'),
      valueLabel: z.string().min(1).default('Value'),
      secondaryValueLabel: z.string().min(1).optional(),
      data: z.array(chartDatumSchema).max(16).default([]),
      showLegend: z.boolean().default(true),
      height: z.enum(['sm', 'md', 'lg']).default('md'),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ChartInsightSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      chartType: z.enum(['bar', 'pie']).default('bar'),
      valueLabel: z.string().min(1).default('Value'),
      data: z.array(chartDatumSchema).max(12).default([]),
      insights: z.array(chartInsightItemSchema).max(6).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ProgressListSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      items: z.array(progressItemSchema).max(12).default([]),
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
        .default([]),
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
      items: z.array(carouselItemSchema).max(12).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  StepperSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      steps: z.array(stepperStepSchema).max(12).default([]),
      orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
      variant: z.enum(['split', 'accordion']).default('split'),
      activeStepId: z.string().min(1).optional(),
      compactOnMobile: z.boolean().default(true),
      inlineContentOnVerticalMobile: z.boolean().default(true),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  CardGridSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      items: z.array(cardGridItemSchema).max(16).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  FormSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      fields: z.array(formFieldSchema).max(16).default([]),
      submitLabel: z.string().optional(),
      secondaryAction: actionLinkSchema.optional(),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  KanbanSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      columns: z.array(kanbanColumnSchema).max(6).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  CalendarSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      events: z.array(calendarEventSchema).max(20).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ScheduleSection: z
    .object({
      title: z.string().min(1).default('Upcoming Schedule'),
      description: z.string().default('Select a date to view scheduled items.'),
      monthLabel: z.string().min(1).default('May 2026'),
      weekDays: z
        .array(z.string().min(1))
        .length(7)
        .default(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']),
      days: z
        .array(z.number().int())
        .length(42)
        .default([
          26, 27, 28, 29, 30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
          21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 1, 2, 3, 4, 5, 6,
        ]),
      selectedDay: z.number().int().default(8),
      entries: z.array(scheduleEntrySchema).max(20).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  HoldingsListSection: z
    .object({
      searchPlaceholder: z.string().min(1).default('Search holdings or tickers...'),
      tabs: z.array(z.string().min(1)).default([]),
      activeTab: z.string().min(1).optional(),
      holdings: z.array(holdingRecordSchema).max(40).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  AccordionSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      type: z.enum(['single', 'multiple']).default('single'),
      defaultExpandedIds: z.array(z.string().min(1)).default([]),
      items: z.array(accordionItemSchema).max(20).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ControlPanelSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      enabled: z.boolean().default(true),
      modes: z.array(controlPanelModeSchema).max(8).default([]),
      activeModeId: z.string().min(1).optional(),
      controls: z.array(controlPanelControlSchema).max(12).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  StatsTrendCardsSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      cards: z.array(statsTrendCardSchema).max(8).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ActivityFeedSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      items: z.array(activityFeedItemSchema).max(30).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  NotificationCenterSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      items: z.array(notificationItemSchema).max(30).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  QuickActionsSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      items: z.array(quickActionItemSchema).max(16).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  CheckoutSummarySection: z
    .object({
      title: z.string().min(1).default('Order Summary'),
      description: z.string().optional(),
      lines: z.array(checkoutLineItemSchema).max(20).default([]),
      primaryActionLabel: z.string().min(1).default('Proceed to Payment'),
      secondaryActionLabel: z.string().min(1).default('Edit Cart'),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  ChatPanelSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      messages: z.array(chatMessageSchema).max(12).default([]),
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
      columns: z.array(comparisonColumnSchema).max(4).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  DataTableSection: z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      columns: z.array(tableColumnSchema).default([]),
      rows: z.array(z.record(z.string(), tableCellValueSchema)).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  NavigationPanel: z
    .object({
      title: z.string().min(1),
      links: z.array(actionLinkSchema).default([]),
      actions: renderActionsSchema,
      visualIntent: visualIntentSchema.optional(),
    })
    .strict(),
  MainSearchNavigationSection: z
    .object({
      title: z.string().min(1).optional(),
      searchPlaceholder: z.string().min(1).default('商品を検索'),
      searchButtonLabel: z.string().min(1).default('検索'),
      categories: z.array(optionSchema).default([]),
      links: z.array(actionLinkSchema).default([]),
      resultsTitle: z.string().min(1).default('検索結果'),
      results: z.array(cardGridItemSchema).max(24).default(defaultMarketplaceSearchResults),
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

export const appCatalogVersion = 'app-catalog-v11';

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
    promptProps: 'navigation[label,href]?, visualIntent?',
  },
  {
    name: 'KpiSummarySection',
    description: 'Metric summary section.',
    allowedSources: ['summary', 'postgres', 'api'],
    placement: 'section',
    propsSchema: componentPropsSchemas.KpiSummarySection,
    promptProps: 'title?, items[label,value,description?]?',
  },
  {
    name: 'ChartSection',
    description: 'A Recharts-backed quantitative chart section for trends or distributions.',
    allowedSources: ['summary', 'postgres', 'api', 'app'],
    placement: 'section',
    propsSchema: componentPropsSchemas.ChartSection,
    promptProps:
      'title, description?, chartType?, valueLabel?, secondaryValueLabel?, data[label,value,secondaryValue?]?, showLegend?, height?',
    promptGuidance:
      'use only for numeric comparisons, trends, shares, or radar scores; do not use as decorative filler',
    variants: ['bar', 'line', 'area', 'pie', 'radar'],
  },
  {
    name: 'ChartInsightSection',
    description: 'Bar or pie chart with companion insight text blocks.',
    allowedSources: ['summary', 'postgres', 'api', 'app'],
    placement: 'section',
    propsSchema: componentPropsSchemas.ChartInsightSection,
    promptProps:
      'title, description?, chartType?, valueLabel?, data[label,value]?, insights[title,body]?',
    variants: ['bar-with-insights', 'pie-with-insights'],
  },
  {
    name: 'ProgressListSection',
    description: 'A progress and completion list for goals, setup status, quotas, or score bands.',
    allowedSources: ['summary', 'postgres', 'api', 'app'],
    placement: 'section',
    propsSchema: componentPropsSchemas.ProgressListSection,
    promptProps: 'title, description?, items[label,value,max?,description?,tone?]?',
    promptGuidance:
      'use for progress, completion, quota, health, or score lists; avoid for plain navigation',
  },
  {
    name: 'TimelineSection',
    description: 'Timeline section.',
    allowedSources: ['rss', 'api', 'markdown'],
    placement: 'section',
    propsSchema: componentPropsSchemas.TimelineSection,
    promptProps: 'title, items[title,timestamp?,description?]?',
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
    promptProps: 'title, description?, items[title,description?,badge?,href?,image?]?',
  },
  {
    name: 'StepperSection',
    description:
      'A design-system migrated stepper for workflows, onboarding, setup, ordering, or incident response.',
    allowedSources: ['summary', 'api', 'markdown', 'app'],
    placement: 'section',
    propsSchema: componentPropsSchemas.StepperSection,
    promptProps:
      'title, description?, steps[id,title,description?,status?,disabled?,meta?]?, orientation?, variant?, activeStepId?, compactOnMobile?, inlineContentOnVerticalMobile?',
    variants: ['vertical-split', 'vertical-accordion', 'horizontal'],
  },
  {
    name: 'CardGridSection',
    description: 'A grid for products, projects, templates, files, or selectable cards.',
    allowedSources: ['app', 'api', 'markdown', 'rss', 'postgres'],
    placement: 'section',
    propsSchema: componentPropsSchemas.CardGridSection,
    promptProps: 'title, description?, items[title,description?,badge?,href?,meta?,image?]?',
  },
  {
    name: 'FormSection',
    description: 'A structured create, edit, settings, checkout, or application form.',
    allowedSources: ['app', 'api', 'postgres'],
    placement: 'section',
    propsSchema: componentPropsSchemas.FormSection,
    promptProps:
      'title, description?, fields[name,label,type?,placeholder?,value?,required?,options?]?, submitLabel?, secondaryAction?',
  },
  {
    name: 'KanbanSection',
    description: 'A kanban board for work items, tickets, leads, tasks, or workflows.',
    allowedSources: ['app', 'api', 'postgres'],
    placement: 'section',
    propsSchema: componentPropsSchemas.KanbanSection,
    promptProps:
      'title, description?, columns[title,cards[title,description?,assignee?,meta?,tone?]]?',
  },
  {
    name: 'CalendarSection',
    description: 'A calendar or schedule agenda for events, bookings, deadlines, or plans.',
    allowedSources: ['app', 'api', 'postgres'],
    placement: 'section',
    propsSchema: componentPropsSchemas.CalendarSection,
    promptProps: 'title, description?, events[title,date,time?,description?,tone?]?',
  },
  {
    name: 'ScheduleSection',
    description: 'A month calendar card for upcoming scheduled items.',
    allowedSources: ['app', 'api', 'postgres'],
    placement: 'section',
    propsSchema: componentPropsSchemas.ScheduleSection,
    promptProps:
      'title?, description?, monthLabel?, weekDays?, days?, selectedDay?, entries[date,title,amount,status?]?',
    variants: ['upcoming-schedule-monthly'],
  },
  {
    name: 'HoldingsListSection',
    description: 'A searchable holdings list with category tabs and value columns.',
    allowedSources: ['app', 'api', 'postgres', 'summary'],
    placement: 'section',
    propsSchema: componentPropsSchemas.HoldingsListSection,
    promptProps:
      'searchPlaceholder?, tabs?, activeTab?, holdings[ticker,name,quantityLabel,acquiredLabel,category?,value]?',
    promptGuidance:
      'tabs are arbitrary labels and may be empty, short, or long based on the requested categories',
    variants: ['portfolio-holdings-list'],
  },
  {
    name: 'AccordionSection',
    description: 'Accordion section for FAQs, policy notes, and collapsible detail groups.',
    allowedSources: ['app', 'api', 'markdown', 'summary'],
    placement: 'section',
    propsSchema: componentPropsSchemas.AccordionSection,
    promptProps: 'title, description?, type?, defaultExpandedIds?, items[id,title,content,meta?]?',
    variants: ['faq-accordion', 'details-accordion'],
  },
  {
    name: 'ControlPanelSection',
    description: 'A settings control panel with switch, mode tabs, and range controls.',
    allowedSources: ['app', 'api', 'summary'],
    placement: 'section',
    propsSchema: componentPropsSchemas.ControlPanelSection,
    promptProps:
      'title, description?, enabled?, modes[id,label]?, activeModeId?, controls[id,label,icon?,value,min?,max?,step?]?',
    variants: ['ambient-control-panel', 'settings-sliders'],
  },
  {
    name: 'StatsTrendCardsSection',
    description: 'Metric cards with comparison deltas and period labels.',
    allowedSources: ['summary', 'api', 'postgres', 'app'],
    placement: 'section',
    propsSchema: componentPropsSchemas.StatsTrendCardsSection,
    promptProps: 'title, description?, cards[label,value,delta,deltaTone?,period?]?',
    variants: ['kpi-trends'],
  },
  {
    name: 'ActivityFeedSection',
    description: 'Operational activity feed with actor/action/target/status.',
    allowedSources: ['summary', 'api', 'postgres', 'app'],
    placement: 'section',
    propsSchema: componentPropsSchemas.ActivityFeedSection,
    promptProps: 'title, description?, items[actor,action,target,status?,timestamp]?',
    variants: ['audit-activity-feed'],
  },
  {
    name: 'NotificationCenterSection',
    description: 'Notification list with read-state and severity levels.',
    allowedSources: ['summary', 'api', 'app'],
    placement: 'section',
    propsSchema: componentPropsSchemas.NotificationCenterSection,
    promptProps: 'title, description?, items[id,title,body?,level?,read?,timestamp?]?',
    variants: ['notification-center'],
  },
  {
    name: 'QuickActionsSection',
    description: 'Grid of icon-based immediate actions.',
    allowedSources: ['app', 'api', 'summary'],
    placement: 'section',
    propsSchema: componentPropsSchemas.QuickActionsSection,
    promptProps:
      'title, description?, items[id,label,description?,icon? one of play|download|refresh-cw|settings|shield|users|database|file-text|bar-chart|package|dollar-sign]?',
    variants: ['quick-actions-grid'],
  },
  {
    name: 'CheckoutSummarySection',
    description: 'Checkout amount summary with total emphasis and action row.',
    allowedSources: ['app', 'api', 'postgres'],
    placement: 'section',
    propsSchema: componentPropsSchemas.CheckoutSummarySection,
    promptProps:
      'title?, description?, lines[label,value,emphasize?]?, primaryActionLabel?, secondaryActionLabel?',
    variants: ['checkout-summary'],
  },
  {
    name: 'ChatPanelSection',
    description: 'A chat or conversation surface for support, AI assistants, and messages.',
    allowedSources: ['app', 'api', 'markdown'],
    placement: 'section',
    propsSchema: componentPropsSchemas.ChatPanelSection,
    promptProps:
      'title, description?, messages[author,role?,content,timestamp?]?, composerPlaceholder?',
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
    promptProps: 'title, description?, columns[title,description?,items[label,value,tone?]?]?',
  },
  {
    name: 'DataTableSection',
    description: 'Data table section.',
    allowedSources: ['postgres', 'api'],
    placement: 'section',
    propsSchema: componentPropsSchemas.DataTableSection,
    promptProps: 'title, description?, columns[key,label]?, rows? with scalar cell values only',
  },
  {
    name: 'NavigationPanel',
    description: 'Compact tab-style local navigation section.',
    allowedSources: ['navigation'],
    placement: 'section',
    propsSchema: componentPropsSchemas.NavigationPanel,
    promptProps: 'title, links[label,href]?',
    promptGuidance: 'for compact local tab navigation only',
  },
  {
    name: 'MainSearchNavigationSection',
    description:
      'A marketplace-style main search bar with category controls and tab navigation directly below it.',
    allowedSources: ['navigation', 'app'],
    placement: 'section',
    propsSchema: componentPropsSchemas.MainSearchNavigationSection,
    promptProps:
      'title?, searchPlaceholder?, searchButtonLabel?, categories[label,value]?, links[label,href]?, resultsTitle?, results[title,description?,badge?,href?,meta?,image]?',
    promptGuidance:
      'use for Amazon-style catalog pages with a prominent search bar, flexible wrapped tabs from props.links, and visible result cards; do not add a search-results action button',
    variants: ['marketplace-search-tabs'],
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

function catalogIssuePath(basePath: string, issuePath: PropertyKey[]) {
  return issuePath.length > 0 ? `${basePath}.${issuePath.map(String).join('.')}` : basePath;
}

type CatalogSectionInput = {
  component: string;
  source: string;
  props?: Record<string, unknown>;
};

type CatalogSchemaInput = {
  sections: CatalogSectionInput[];
};

export function listComponentDefinitions() {
  return componentDefinitions;
}

export function getComponentDefinition(name: string) {
  return componentDefinitionMap.get(name);
}

export function isAppComponentName(name: string): name is AppComponentName {
  return componentDefinitionMap.has(name);
}

function collectCatalogSectionValidation(schema: CatalogSchemaInput) {
  const issues: CatalogValidationIssue[] = [];
  const sections = schema.sections.map((section, index) => {
    const path = `sections.${index}`;
    const definition = getComponentDefinition(section.component);
    if (!definition) {
      issues.push({
        path: `${path}.component`,
        message: `Unknown component: ${section.component}`,
      });
      return section;
    }

    const sourceAllowed =
      definition.allowedSources.length === 0 ||
      definition.allowedSources.includes('*') ||
      definition.allowedSources.includes(section.source);

    if (!sourceAllowed) {
      issues.push({
        path: `${path}.source`,
        message: `${section.component} cannot read from source ${section.source}`,
      });
    }

    const parsedProps = definition.propsSchema.safeParse(section.props ?? {});
    if (!parsedProps.success) {
      issues.push(
        ...parsedProps.error.issues.map((issue) => ({
          path: catalogIssuePath(`${path}.props`, issue.path),
          message: issue.message,
        }))
      );
      return section;
    }

    return {
      ...section,
      props: parsedProps.data as Record<string, unknown>,
    };
  });

  return { issues, sections };
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
    path: catalogIssuePath(path, issue.path),
    message: issue.message,
  }));
}

export function validateAppUiSchemaCatalog(schema: {
  sections: Array<{ component: string; source: string; props?: Record<string, unknown> }>;
}): CatalogValidationIssue[] {
  return collectCatalogSectionValidation(schema).issues;
}

export function assertAppUiSchemaCatalog(schema: {
  sections: Array<{ component: string; source: string; props?: Record<string, unknown> }>;
}) {
  const issues = validateAppUiSchemaCatalog(schema);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  }
}

export function normalizeAppUiSchemaCatalog<T extends CatalogSchemaInput>(schema: T): T {
  const { issues, sections } = collectCatalogSectionValidation(schema);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  }

  return {
    ...schema,
    sections,
  } as T;
}
