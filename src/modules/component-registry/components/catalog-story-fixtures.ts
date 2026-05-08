import type { AppComponentName } from '../../../../shared/schemas/app-catalog.schema';
import type { AppUiLayout, AppUiSchema } from '../../../../shared/schemas/ui-schema.schema';

export const pageShellLayoutByComponent = {
  DashboardPage: 'dashboard',
  EntityListPage: 'entity-list',
  EntityDetailPage: 'entity-detail',
  EditableFormPage: 'form',
  ArticleFeedPage: 'article-feed',
  SidebarPage: 'sidebar',
} satisfies Record<PageShellComponentName, AppUiLayout>;

export type PageShellComponentName =
  | 'DashboardPage'
  | 'EntityListPage'
  | 'EntityDetailPage'
  | 'EditableFormPage'
  | 'ArticleFeedPage'
  | 'SidebarPage';

export type SectionComponentName = Exclude<AppComponentName, PageShellComponentName>;

export type SectionFixture = {
  expectedText: string;
  props: Record<string, unknown>;
  source: string;
};

export const sectionComponentFixtures = {
  KpiSummarySection: {
    expectedText: 'Catalog KPIs',
    source: 'summary',
    props: {
      title: 'Catalog KPIs',
      items: [
        { label: 'Open tickets', value: 12, description: 'Today' },
        { label: 'Conversion', value: '8.4%', description: 'Weekly average' },
        { label: 'Revenue', value: '1.2M', description: 'Month to date' },
      ],
    },
  },
  ChartSection: {
    expectedText: 'Order trend',
    source: 'summary',
    props: {
      title: 'Order trend',
      chartType: 'area',
      valueLabel: 'Orders',
      secondaryValueLabel: 'Returns',
      data: [
        { label: 'Mon', value: 128, secondaryValue: 14 },
        { label: 'Tue', value: 164, secondaryValue: 18 },
        { label: 'Wed', value: 142, secondaryValue: 12 },
        { label: 'Thu', value: 186, secondaryValue: 16 },
        { label: 'Fri', value: 212, secondaryValue: 19 },
      ],
    },
  },
  ProgressListSection: {
    expectedText: 'Operational readiness',
    source: 'summary',
    props: {
      title: 'Operational readiness',
      items: [
        {
          label: 'Catalog coverage',
          value: 82,
          max: 100,
          description: 'Documented and covered by parity tests',
          tone: 'primary',
        },
        {
          label: 'Validation health',
          value: 96,
          max: 100,
          description: 'Generated schema passes catalog checks',
          tone: 'success',
        },
      ],
    },
  },
  TimelineSection: {
    expectedText: 'Activity timeline',
    source: 'api',
    props: {
      title: 'Activity timeline',
      items: [
        { title: 'Order received', timestamp: '10:00', description: 'Queued for review' },
        { title: 'Payment captured', timestamp: '10:05', description: 'Card authorization passed' },
      ],
    },
  },
  InsightPanel: {
    expectedText: 'Operational insight',
    source: 'summary',
    props: {
      title: 'Operational insight',
      body: 'A short renderer-compatible insight block for saved screens.',
    },
  },
  ImageSection: {
    expectedText: 'Campaign image',
    source: 'app',
    props: {
      title: 'Campaign image',
      image: {
        src: 'https://picsum.photos/seed/catalog-image/1200/720',
        alt: 'Campaign visual',
      },
    },
  },
  SplitHeroSection: {
    expectedText: 'Featured launch',
    source: 'app',
    props: {
      eyebrow: 'Featured',
      title: 'Featured launch',
      description: 'A product or campaign intro with primary and secondary actions.',
      primaryAction: { label: 'Open workspace', href: '/workspace' },
      secondaryAction: { label: 'View details', href: '/details' },
      image: {
        src: 'https://picsum.photos/seed/catalog-hero/1200/720',
        alt: 'Featured product',
      },
    },
  },
  CarouselSection: {
    expectedText: 'Recommended collection',
    source: 'app',
    props: {
      title: 'Recommended collection',
      items: [
        { title: 'First card', description: 'Primary card', href: '/cards/first' },
        { title: 'Second card', description: 'Secondary card', href: '/cards/second' },
        { title: 'Third card', description: 'Tertiary card', href: '/cards/third' },
      ],
    },
  },
  ProcessStepperSection: {
    expectedText: 'Order process',
    source: 'summary',
    props: {
      title: 'Order process',
      steps: [
        { title: 'Received', status: 'completed' },
        { title: 'Review', status: 'current' },
        { title: 'Ship', status: 'upcoming' },
      ],
    },
  },
  CardGridSection: {
    expectedText: 'Product cards',
    source: 'app',
    props: {
      title: 'Product cards',
      items: [
        {
          title: 'Noise cancelling headphones',
          description: 'Long battery life with a compact travel case.',
          badge: 'Popular',
          href: '/products/headphones',
          meta: { price: '18900', rating: 4.6 },
          image: {
            src: 'https://picsum.photos/seed/catalog-headphones/1200/720',
            alt: 'Headphones on a desk',
          },
        },
        {
          title: 'Trail backpack',
          description: 'Lightweight outdoor pack with weather-resistant pockets.',
          badge: 'Outdoor',
          href: '/products/backpack',
          meta: { price: '9800', stock: 'In stock' },
          image: {
            src: 'https://picsum.photos/seed/catalog-backpack/1200/720',
            alt: 'Backpack near a trail',
          },
        },
      ],
    },
  },
  FormSection: {
    expectedText: 'Incident form',
    source: 'app',
    props: {
      title: 'Incident form',
      fields: [
        { name: 'title', label: 'Title', type: 'text', value: 'Incident' },
        {
          name: 'priority',
          label: 'Priority',
          type: 'select',
          value: 'high',
          options: [{ label: 'High', value: 'high' }],
        },
        { name: 'notify', label: 'Notify team', type: 'checkbox', value: true },
      ],
      submitLabel: 'Save incident',
    },
  },
  MasterDetailSection: {
    expectedText: 'Ticket queue',
    source: 'app',
    props: {
      title: 'Ticket queue',
      items: [
        { id: 'ticket-1', title: 'Checkout issue', status: 'Open' },
        { id: 'ticket-2', title: 'Delivery delay', status: 'Pending' },
      ],
      detail: {
        title: 'Checkout issue',
        fields: [
          { label: 'Owner', value: 'Support' },
          { label: 'Priority', value: 'High' },
        ],
      },
    },
  },
  KanbanSection: {
    expectedText: 'Workflow board',
    source: 'app',
    props: {
      title: 'Workflow board',
      columns: [
        { title: 'Open', cards: [{ title: 'API timeout', meta: 'Today' }] },
        {
          title: 'Done',
          cards: [{ title: 'Cache rebuild', meta: { label: 'Owner', value: 'SRE' } }],
        },
      ],
    },
  },
  CalendarSection: {
    expectedText: 'Release calendar',
    source: 'app',
    props: {
      title: 'Release calendar',
      events: [
        { title: 'Release review', date: '2026-05-07', time: '10:00' },
        { title: 'Customer rollout', date: '2026-05-08', time: '14:00' },
      ],
    },
  },
  ChatPanelSection: {
    expectedText: 'Support chat',
    source: 'app',
    props: {
      title: 'Support chat',
      messages: [
        { author: 'Customer', role: 'user', content: 'Can you check my order?' },
        { author: 'Agent', role: 'assistant', content: 'Checking the ticket.' },
      ],
    },
  },
  EditorPreviewSection: {
    expectedText: 'Response editor',
    source: 'app',
    props: {
      title: 'Response editor',
      editorContent: 'Draft response',
      previewContent: 'Draft response',
    },
  },
  ComparisonSection: {
    expectedText: 'Plan comparison',
    source: 'app',
    props: {
      title: 'Plan comparison',
      columns: [
        { title: 'Standard', items: [{ label: 'ETA', value: '2 days' }] },
        { title: 'Expedite', items: [{ label: 'ETA', value: 'Today' }] },
      ],
    },
  },
  DataTableSection: {
    expectedText: 'Order table',
    source: 'api',
    props: {
      title: 'Order table',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'status', label: 'Status' },
      ],
      rows: [
        { name: 'Order A', status: 'Ready' },
        { name: 'Order B', status: 'Pending' },
      ],
    },
  },
  NavigationPanel: {
    expectedText: 'Local navigation',
    source: 'navigation',
    props: {
      title: 'Local navigation',
      links: [
        { label: 'History', href: '/history' },
        { label: 'Prompt', href: '/prompt' },
      ],
    },
  },
  MainSearchNavigationSection: {
    expectedText: 'Shop search',
    source: 'navigation',
    props: {
      title: 'Shop search',
      searchPlaceholder: 'Search products, brands, or keywords',
      searchButtonLabel: 'Search',
      categories: [
        { label: 'All', value: 'all' },
        { label: 'Books', value: 'books' },
        { label: 'Outdoor', value: 'outdoor' },
      ],
      links: [
        { label: 'Deals', href: '/deals' },
        { label: 'Ranking', href: '/ranking' },
        { label: 'Cart', href: '/cart' },
      ],
    },
  },
  EmptyState: {
    expectedText: 'Empty result',
    source: 'app',
    props: {
      title: 'Empty result',
      description: 'Nothing is available.',
      action: { label: 'Open prompt', href: '/prompt' },
    },
  },
  ErrorState: {
    expectedText: 'Loading error',
    source: 'app',
    props: {
      title: 'Loading error',
      description: 'Something failed.',
    },
  },
} satisfies Record<SectionComponentName, SectionFixture>;

export function createSchemaForSection(component: SectionComponentName): AppUiSchema {
  const fixture = sectionComponentFixtures[component];
  return {
    page: `${component} story`,
    intent: `Render ${component} through the root app catalog`,
    layout: 'screen',
    sections: [
      {
        component,
        source: fixture.source,
        props: fixture.props,
      },
    ],
  };
}

export function createSchemaForPageShell(component: PageShellComponentName): AppUiSchema {
  return {
    page: `${component} root fixture`,
    intent: `Render ${component} as a page shell`,
    layout: pageShellLayoutByComponent[component],
    navigation:
      component === 'SidebarPage'
        ? { items: [{ label: 'History', href: '/history', description: 'Replay screens' }] }
        : undefined,
    sections: [
      {
        component: 'InsightPanel',
        source: 'summary',
        props: {
          title: `${component} child content`,
          body: 'Root layout fixture content.',
        },
      },
    ],
  };
}
