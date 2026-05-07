import type { AppComponentName } from '../../shared/schemas/app-catalog.schema';
import type { AppUiLayout, AppUiSchema } from '../../shared/schemas/ui-schema.schema';

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
    expectedText: 'Fixture KPIs',
    source: 'summary',
    props: {
      title: 'Fixture KPIs',
      items: [{ label: 'Open tickets', value: 12, description: 'Today' }],
    },
  },
  TimelineSection: {
    expectedText: 'Fixture timeline',
    source: 'api',
    props: {
      title: 'Fixture timeline',
      items: [{ title: 'Order received', timestamp: '10:00', description: 'Queued' }],
    },
  },
  InsightPanel: {
    expectedText: 'Fixture insight',
    source: 'summary',
    props: {
      title: 'Fixture insight',
      body: 'A short operational insight.',
    },
  },
  ImageSection: {
    expectedText: 'Fixture image',
    source: 'app',
    props: {
      title: 'Fixture image',
      image: {
        src: 'https://picsum.photos/seed/fixture-image/1200/720',
        alt: 'Fixture image',
      },
    },
  },
  SplitHeroSection: {
    expectedText: 'Fixture hero',
    source: 'app',
    props: {
      eyebrow: 'Fixture',
      title: 'Fixture hero',
      description: 'A hero section fixture.',
      primaryAction: { label: 'Open workspace', href: '/workspace' },
    },
  },
  CarouselSection: {
    expectedText: 'Fixture carousel',
    source: 'app',
    props: {
      title: 'Fixture carousel',
      items: [
        { title: 'First card', description: 'Primary card', href: '/cards/first' },
        { title: 'Second card', description: 'Secondary card', href: '/cards/second' },
      ],
    },
  },
  ProcessStepperSection: {
    expectedText: 'Fixture steps',
    source: 'summary',
    props: {
      title: 'Fixture steps',
      steps: [
        { title: 'Received', status: 'completed' },
        { title: 'Review', status: 'current' },
      ],
    },
  },
  CardGridSection: {
    expectedText: 'Fixture cards',
    source: 'app',
    props: {
      title: 'Fixture cards',
      items: [{ title: 'Ops template', meta: { label: 'Owner', value: 'Ops' } }],
    },
  },
  FilterBarSection: {
    expectedText: 'Fixture filters',
    source: 'app',
    props: {
      title: 'Fixture filters',
      searchPlaceholder: 'Search fixtures',
      filters: [{ label: 'Open', value: 'open' }],
    },
  },
  FormSection: {
    expectedText: 'Fixture form',
    source: 'app',
    props: {
      title: 'Fixture form',
      fields: [
        { name: 'title', label: 'Title', type: 'text', value: 'Incident' },
        {
          name: 'priority',
          label: 'Priority',
          type: 'select',
          value: 'high',
          options: [{ label: 'High', value: 'high' }],
        },
      ],
      submitLabel: 'Save fixture',
    },
  },
  MasterDetailSection: {
    expectedText: 'Fixture master detail',
    source: 'app',
    props: {
      title: 'Fixture master detail',
      items: [{ id: 'ticket-1', title: 'Checkout issue', status: 'Open' }],
      detail: {
        title: 'Checkout issue',
        fields: [{ label: 'Owner', value: 'Support' }],
      },
    },
  },
  KanbanSection: {
    expectedText: 'Fixture board',
    source: 'app',
    props: {
      title: 'Fixture board',
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
    expectedText: 'Fixture calendar',
    source: 'app',
    props: {
      title: 'Fixture calendar',
      events: [{ title: 'Release review', date: '2026-05-07', time: '10:00' }],
    },
  },
  ChatPanelSection: {
    expectedText: 'Fixture chat',
    source: 'app',
    props: {
      title: 'Fixture chat',
      messages: [{ author: 'Agent', role: 'assistant', content: 'Checking the ticket.' }],
    },
  },
  EditorPreviewSection: {
    expectedText: 'Fixture editor',
    source: 'app',
    props: {
      title: 'Fixture editor',
      editorContent: 'Draft response',
      previewContent: 'Draft response',
    },
  },
  ComparisonSection: {
    expectedText: 'Fixture comparison',
    source: 'app',
    props: {
      title: 'Fixture comparison',
      columns: [
        { title: 'Standard', items: [{ label: 'ETA', value: '2 days' }] },
        { title: 'Expedite', items: [{ label: 'ETA', value: 'Today' }] },
      ],
    },
  },
  ActionFooterSection: {
    expectedText: 'Fixture decision',
    source: 'app',
    props: {
      title: 'Fixture decision',
      primaryAction: { label: 'Continue', href: '/continue' },
      secondaryAction: { label: 'Cancel', href: '/history' },
    },
  },
  DataTableSection: {
    expectedText: 'Fixture table',
    source: 'api',
    props: {
      title: 'Fixture table',
      columns: [{ key: 'name', label: 'Name' }],
      rows: [{ name: 'Fixture row' }],
    },
  },
  NavigationPanel: {
    expectedText: 'Fixture navigation',
    source: 'navigation',
    props: {
      title: 'Fixture navigation',
      links: [{ label: 'History', href: '/history' }],
    },
  },
  EmptyState: {
    expectedText: 'Fixture empty',
    source: 'app',
    props: {
      title: 'Fixture empty',
      description: 'Nothing is available.',
      action: { label: 'Open prompt', href: '/prompt' },
    },
  },
  ErrorState: {
    expectedText: 'Fixture error',
    source: 'app',
    props: {
      title: 'Fixture error',
      description: 'Something failed.',
    },
  },
} satisfies Record<SectionComponentName, SectionFixture>;

export function createSchemaForSection(component: SectionComponentName): AppUiSchema {
  const fixture = sectionComponentFixtures[component];
  return {
    page: `${component} fixture`,
    intent: `Render ${component} through the catalog matrix`,
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
