import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AppUiSchema } from '../../../../shared/schemas/ui-schema.schema';
import { JsonRenderRenderer } from '../../ui-schema/components/JsonRenderRenderer';
import {
  createSchemaForSection,
  type SectionComponentName,
  sectionComponentFixtures,
} from './catalog-story-fixtures';

function CatalogScreenStory({ schema }: { schema: AppUiSchema }) {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-5xl">
        <JsonRenderRenderer schema={schema} />
      </div>
    </main>
  );
}

const meta = {
  title: 'Root App Catalog/Sections',
  component: CatalogScreenStory,
  parameters: {
    docs: {
      description: {
        component:
          'Root app catalog stories render App UI Schema through the same json-render registry used by generated screens.',
      },
    },
  },
} satisfies Meta<typeof CatalogScreenStory>;

export default meta;

type Story = StoryObj<typeof meta>;

function sectionStory(component: SectionComponentName): Story {
  return {
    name: component,
    args: {
      schema: createSchemaForSection(component),
    },
    parameters: {
      docs: {
        description: {
          story: `Catalog section fixture for ${component}. Expected text: ${sectionComponentFixtures[component].expectedText}.`,
        },
      },
    },
  };
}

export const KpiSummarySection = sectionStory('KpiSummarySection');
export const ChartSection = sectionStory('ChartSection');
export const ProgressListSection = sectionStory('ProgressListSection');
export const TimelineSection = sectionStory('TimelineSection');
export const InsightPanel = sectionStory('InsightPanel');
export const ImageSection = sectionStory('ImageSection');
export const SplitHeroSection = sectionStory('SplitHeroSection');
export const CarouselSection = sectionStory('CarouselSection');
export const ProcessStepperSection = sectionStory('ProcessStepperSection');
export const CardGridSection = sectionStory('CardGridSection');
export const FormSection = sectionStory('FormSection');
export const MasterDetailSection = sectionStory('MasterDetailSection');
export const KanbanSection = sectionStory('KanbanSection');
export const CalendarSection = sectionStory('CalendarSection');
export const ChatPanelSection = sectionStory('ChatPanelSection');
export const EditorPreviewSection = sectionStory('EditorPreviewSection');
export const ComparisonSection = sectionStory('ComparisonSection');
export const DataTableSection = sectionStory('DataTableSection');
export const NavigationPanel = sectionStory('NavigationPanel');
export const MainSearchNavigationSection = sectionStory('MainSearchNavigationSection');
export const EmptyState = sectionStory('EmptyState');
export const ErrorState = sectionStory('ErrorState');

export const CommerceComposition: Story = {
  args: {
    schema: {
      page: 'Commerce catalog story',
      intent: 'Show marketplace search and product cards',
      layout: 'screen',
      sections: [
        {
          component: 'MainSearchNavigationSection',
          source: 'app',
          props: {
            title: 'Shop search',
            searchPlaceholder: 'Search products, brands, or keywords',
            searchButtonLabel: 'Search',
            categories: [
              { label: 'All', value: 'all' },
              { label: 'Electronics', value: 'electronics' },
              { label: 'Outdoor', value: 'outdoor' },
            ],
            links: [
              { label: 'Home', href: '/' },
              { label: 'Deals', href: '/deals' },
              { label: 'Ranking', href: '/ranking' },
              { label: 'Cart', href: '/cart' },
            ],
          },
        },
        {
          component: 'CardGridSection',
          source: 'app',
          props: {
            title: 'Featured products',
            description:
              'Catalog cards use low-level buttons, badges, and image treatments internally.',
            items: [
              {
                title: 'Noise cancelling headphones',
                description: 'Long battery life with a compact travel case.',
                badge: 'Popular',
                href: '/products/headphones',
                meta: { price: '¥18,900', rating: 4.6 },
                image: {
                  src: 'https://picsum.photos/seed/story-headphones/1200/720',
                  alt: 'Headphones on a desk',
                },
              },
              {
                title: 'Trail backpack',
                description: 'Lightweight outdoor pack with weather-resistant pockets.',
                badge: 'Outdoor',
                href: '/products/backpack',
                meta: { price: '¥9,800', stock: 'In stock' },
                image: {
                  src: 'https://picsum.photos/seed/story-backpack/1200/720',
                  alt: 'Backpack near a trail',
                },
              },
            ],
          },
        },
      ],
    },
  },
};

export const AnalyticsComposition: Story = {
  args: {
    schema: {
      page: 'Analytics catalog story',
      intent: 'Show generated chart and progress sections',
      layout: 'screen',
      sections: [
        {
          component: 'ChartSection',
          source: 'summary',
          props: {
            title: 'Weekly order trend',
            description:
              'Recharts powers chart sections while the catalog controls the schema shape.',
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
        {
          component: 'ProgressListSection',
          source: 'summary',
          props: {
            title: 'Operational readiness',
            description:
              'Progress rows adapt the old design-system progress pattern into a generated section.',
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
      ],
    },
  },
};
