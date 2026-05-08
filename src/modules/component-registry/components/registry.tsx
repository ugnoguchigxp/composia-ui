import { defineRegistry } from '@json-render/react';
import type { ComponentType } from 'react';
import type { AppComponentName } from '../../../../shared/schemas/app-catalog.schema';
import { appJsonRenderCatalog } from '../services/catalog.service';
import { PageShell } from './pages/PageShell';
import { SidebarPage } from './pages/SidebarPage';
import { EmptyState } from './primitives/EmptyState';
import { ErrorState } from './primitives/ErrorState';
import { CalendarSection } from './sections/CalendarSection';
import { CardGridSection } from './sections/CardGridSection';
import { CarouselSection } from './sections/CarouselSection';
import { ChartSection } from './sections/ChartSection';
import { ChatPanelSection } from './sections/ChatPanelSection';
import { ComparisonSection } from './sections/ComparisonSection';
import { DataTableSection } from './sections/DataTableSection';
import { EditorPreviewSection } from './sections/EditorPreviewSection';
import { FormSection } from './sections/FormSection';
import { ImageSection } from './sections/ImageSection';
import { InsightPanel } from './sections/InsightPanel';
import { KanbanSection } from './sections/KanbanSection';
import { KpiSummarySection } from './sections/KpiSummarySection';
import { MainSearchNavigationSection } from './sections/MainSearchNavigationSection';
import { MasterDetailSection } from './sections/MasterDetailSection';
import { NavigationPanel } from './sections/NavigationPanel';
import { ProcessStepperSection } from './sections/ProcessStepperSection';
import { ProgressListSection } from './sections/ProgressListSection';
import { SplitHeroSection } from './sections/SplitHeroSection';
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
  ProgressListSection,
  TimelineSection,
  InsightPanel,
  ImageSection,
  SplitHeroSection,
  CarouselSection,
  ProcessStepperSection,
  CardGridSection,
  FormSection,
  MasterDetailSection,
  KanbanSection,
  CalendarSection,
  ChatPanelSection,
  EditorPreviewSection,
  ComparisonSection,
  DataTableSection,
  NavigationPanel,
  MainSearchNavigationSection,
  EmptyState,
  ErrorState,
  // biome-ignore lint/suspicious/noExplicitAny: json-render registry components each own distinct prop schemas.
} satisfies Record<AppComponentName, ComponentType<any>>;

export const { registry: appJsonRenderRegistry } = defineRegistry(appJsonRenderCatalog, {
  components: appJsonRenderComponentMap,
});
