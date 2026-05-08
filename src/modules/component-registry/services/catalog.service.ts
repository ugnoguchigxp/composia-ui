import { defineCatalog } from '@json-render/core';
import { schema as reactSchema } from '@json-render/react/schema';
import { componentPropsSchemas } from '../../../../shared/schemas/app-catalog.schema';

export {
  type AppComponentName,
  appRelativeHrefSchema,
  componentDefinitions,
  componentPropsSchemas,
} from '../../../../shared/schemas/app-catalog.schema';

export const appJsonRenderCatalog = defineCatalog(reactSchema, {
  components: {
    DashboardPage: {
      props: componentPropsSchemas.DashboardPage,
      slots: ['default'],
      description: 'A high-level dashboard page shell with a title and summary sections.',
    },
    EntityListPage: {
      props: componentPropsSchemas.EntityListPage,
      slots: ['default'],
      description: 'A high-level entity list page shell for generated data browsing surfaces.',
    },
    EntityDetailPage: {
      props: componentPropsSchemas.EntityDetailPage,
      slots: ['default'],
      description: 'A high-level entity detail page shell.',
    },
    EditableFormPage: {
      props: componentPropsSchemas.EditableFormPage,
      slots: ['default'],
      description: 'A high-level editable form page shell.',
    },
    ArticleFeedPage: {
      props: componentPropsSchemas.ArticleFeedPage,
      slots: ['default'],
      description: 'A high-level article feed page shell.',
    },
    SidebarPage: {
      props: componentPropsSchemas.SidebarPage,
      slots: ['default'],
      description: 'A high-level page shell with side navigation.',
    },
    KpiSummarySection: {
      props: componentPropsSchemas.KpiSummarySection,
      description: 'A section that summarizes key metrics.',
    },
    ChartSection: {
      props: componentPropsSchemas.ChartSection,
      description: 'A Recharts-backed section for numeric charts and score comparisons.',
    },
    ProgressListSection: {
      props: componentPropsSchemas.ProgressListSection,
      description: 'A section that renders progress, quota, completion, or health rows.',
    },
    TimelineSection: {
      props: componentPropsSchemas.TimelineSection,
      description: 'A section that renders chronological events.',
    },
    InsightPanel: {
      props: componentPropsSchemas.InsightPanel,
      description: 'A section for a concise insight, recommendation, or explanation.',
    },
    ImageSection: {
      props: componentPropsSchemas.ImageSection,
      description: 'A section that renders an allowlisted image URL with optional caption text.',
    },
    SplitHeroSection: {
      props: componentPropsSchemas.SplitHeroSection,
      description: 'A two-column hero or featured intro section.',
    },
    CarouselSection: {
      props: componentPropsSchemas.CarouselSection,
      description: 'A horizontal carousel for products, content, or recommendations.',
    },
    ProcessStepperSection: {
      props: componentPropsSchemas.ProcessStepperSection,
      description: 'A stepper for workflows, setup, ordering, or incident processes.',
    },
    CardGridSection: {
      props: componentPropsSchemas.CardGridSection,
      description: 'A grid of products, projects, templates, files, or selectable cards.',
    },
    FormSection: {
      props: componentPropsSchemas.FormSection,
      description: 'A structured form for create, edit, settings, checkout, or applications.',
    },
    MasterDetailSection: {
      props: componentPropsSchemas.MasterDetailSection,
      description: 'A master-detail split for records, tickets, messages, or documents.',
    },
    KanbanSection: {
      props: componentPropsSchemas.KanbanSection,
      description: 'A kanban board for tasks, tickets, leads, or workflow states.',
    },
    CalendarSection: {
      props: componentPropsSchemas.CalendarSection,
      description: 'A schedule or calendar agenda for events, deadlines, and bookings.',
    },
    ChatPanelSection: {
      props: componentPropsSchemas.ChatPanelSection,
      description: 'A conversation panel for support, AI chat, or messaging.',
    },
    EditorPreviewSection: {
      props: componentPropsSchemas.EditorPreviewSection,
      description: 'An editor and preview split for documents, code, prompts, or content.',
    },
    ComparisonSection: {
      props: componentPropsSchemas.ComparisonSection,
      description: 'A comparison view for plans, options, candidates, versions, or diffs.',
    },
    DataTableSection: {
      props: componentPropsSchemas.DataTableSection,
      description: 'A section for a bounded tabular data preview.',
    },
    NavigationPanel: {
      props: componentPropsSchemas.NavigationPanel,
      description: 'A compact tab-style section for local internal navigation links.',
    },
    MainSearchNavigationSection: {
      props: componentPropsSchemas.MainSearchNavigationSection,
      description: 'A marketplace-style main search bar with tab navigation underneath.',
    },
    EmptyState: {
      props: componentPropsSchemas.EmptyState,
      description: 'A fallback for empty data.',
    },
    ErrorState: {
      props: componentPropsSchemas.ErrorState,
      description: 'A fallback for validation or loading errors.',
    },
  },
  actions: {},
});
