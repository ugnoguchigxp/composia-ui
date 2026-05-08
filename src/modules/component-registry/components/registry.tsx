import { defineRegistry } from '@json-render/react';
import type { ComponentType } from 'react';
import type { AppComponentName } from '../../../../shared/schemas/app-catalog.schema';
import { appJsonRenderCatalog } from '../services/catalog.service';
import { PageShell } from './pages/PageShell';
import { SidebarPage } from './pages/SidebarPage';
import { EmptyState } from './primitives/EmptyState';
import { ErrorState } from './primitives/ErrorState';
import { AccordionSection } from './sections/AccordionSection';
import { ActivityFeedSection } from './sections/ActivityFeedSection';
import { CalendarSection } from './sections/CalendarSection';
import { CardGridSection } from './sections/CardGridSection';
import { CarouselSection } from './sections/CarouselSection';
import { ChartInsightSection } from './sections/ChartInsightSection';
import { ChartSection } from './sections/ChartSection';
import { ChatPanelSection } from './sections/ChatPanelSection';
import { CheckoutSummarySection } from './sections/CheckoutSummarySection';
import { ComparisonSection } from './sections/ComparisonSection';
import { ControlPanelSection } from './sections/ControlPanelSection';
import { DataTableSection } from './sections/DataTableSection';
import { EditorPreviewSection } from './sections/EditorPreviewSection';
import { FormSection } from './sections/FormSection';
import { HoldingsListSection } from './sections/HoldingsListSection';
import { ImageSection } from './sections/ImageSection';
import { InsightPanel } from './sections/InsightPanel';
import { KanbanSection } from './sections/KanbanSection';
import { KpiSummarySection } from './sections/KpiSummarySection';
import { MainSearchNavigationSection } from './sections/MainSearchNavigationSection';
import { NavigationPanel } from './sections/NavigationPanel';
import { NotificationCenterSection } from './sections/NotificationCenterSection';
import { ProgressListSection } from './sections/ProgressListSection';
import { QuickActionsSection } from './sections/QuickActionsSection';
import { ScheduleSection } from './sections/ScheduleSection';
import { SplitHeroSection } from './sections/SplitHeroSection';
import { StatsTrendCardsSection } from './sections/StatsTrendCardsSection';
import { StepperSection } from './sections/StepperSection';
import { TimelineSection } from './sections/TimelineSection';

export const appJsonRenderComponentMap = {
  DashboardPage: PageShell,
  EntityListPage: PageShell,
  EntityDetailPage: PageShell,
  EditableFormPage: PageShell,
  ArticleFeedPage: PageShell,
  SidebarPage,
  KpiSummarySection,
  ChartSection,
  ChartInsightSection,
  StatsTrendCardsSection,
  ProgressListSection,
  TimelineSection,
  ActivityFeedSection,
  NotificationCenterSection,
  InsightPanel,
  ImageSection,
  SplitHeroSection,
  CarouselSection,
  StepperSection,
  CardGridSection,
  FormSection,
  KanbanSection,
  CalendarSection,
  ScheduleSection,
  HoldingsListSection,
  ControlPanelSection,
  QuickActionsSection,
  CheckoutSummarySection,
  ChatPanelSection,
  EditorPreviewSection,
  ComparisonSection,
  DataTableSection,
  NavigationPanel,
  MainSearchNavigationSection,
  AccordionSection,
  EmptyState,
  ErrorState,
  // biome-ignore lint/suspicious/noExplicitAny: json-render registry components each own distinct prop schemas.
} satisfies Record<AppComponentName, ComponentType<any>>;

export const { registry: appJsonRenderRegistry } = defineRegistry(appJsonRenderCatalog, {
  components: appJsonRenderComponentMap,
});
