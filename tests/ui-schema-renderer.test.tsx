import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { appUiSchemaSchema } from '../shared/schemas/ui-schema.schema';
import { JsonRenderRenderer } from '../src/modules/ui-schema/components/JsonRenderRenderer';
import { uiSchemaPreviewRepository } from '../src/modules/ui-schema/repositories/ui-schema-preview.repository';
import { appUiSchemaToJsonRenderSpec } from '../src/modules/ui-schema/services/ui-schema-to-json-render.service';

describe('ui schema renderer', () => {
  it('converts App UI Schema into a json-render flat spec', async () => {
    const schema = await uiSchemaPreviewRepository.getPreview('sample');
    const spec = appUiSchemaToJsonRenderSpec(schema);

    expect(spec.root).toBe('page-generated-screen-sample');
    expect(spec.elements[spec.root].type).toBe('DashboardPage');
    expect(Object.values(spec.elements).map((element) => element.type)).toContain('InsightPanel');
  });

  it('rejects unknown catalog components before rendering', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'Invalid',
      intent: 'Use an unknown component',
      layout: 'dashboard',
      sections: [
        {
          component: 'UnknownPanel',
          source: 'summary',
          props: {},
        },
      ],
    });

    expect(() => appUiSchemaToJsonRenderSpec(schema)).toThrow('Unknown component');
  });

  it('renders fixed schema through the json-render React renderer', async () => {
    const schema = await uiSchemaPreviewRepository.getPreview('sample');
    const html = renderToStaticMarkup(<JsonRenderRenderer schema={schema} />);

    expect(html).toContain('Generated Screen Sample');
    expect(html).toContain('Registry coverage');
    expect(html).toContain('https://picsum.photos/seed/composia-ai-sample/1200/720');
    expect(html).toContain('Entity preview');
  });

  it('renders sidebar layouts and carousel sections', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'Flower Shop',
      intent: 'Browse seasonal bouquets',
      layout: 'sidebar',
      navigation: {
        items: [
          { label: 'Bouquets', href: '/bouquets', description: 'Seasonal picks' },
          { label: 'Orders', href: '/orders' },
        ],
      },
      sections: [
        {
          component: 'SplitHeroSection',
          source: 'app',
          props: {
            eyebrow: 'Spring collection',
            title: 'Fresh flowers for every room',
            description: 'Choose a bouquet and continue to details.',
            image: {
              src: 'https://picsum.photos/seed/flower-shop-hero/1200/720',
              alt: 'Fresh flowers',
            },
            primaryAction: { label: 'Bouquets', href: '/bouquets' },
          },
        },
        {
          component: 'CarouselSection',
          source: 'app',
          props: {
            title: 'Popular bouquets',
            items: [
              {
                title: 'Tulip set',
                href: '/bouquets/tulip',
                image: {
                  src: 'https://picsum.photos/seed/tulip-set/1200/720',
                  alt: 'Tulip set',
                },
              },
              {
                title: 'Rose set',
                href: '/bouquets/rose',
                image: {
                  src: 'https://picsum.photos/seed/rose-set/1200/720',
                  alt: 'Rose set',
                },
              },
            ],
          },
        },
      ],
    });
    const spec = appUiSchemaToJsonRenderSpec(schema);
    const html = renderToStaticMarkup(<JsonRenderRenderer schema={schema} />);

    expect(spec.elements[spec.root].type).toBe('SidebarPage');
    expect(html).toContain('Seasonal picks');
    expect(html).toContain('Fresh flowers for every room');
    expect(html).toContain('Popular bouquets');
    expect(html).toContain('Tulip set');
  });

  it('renders a data table when AI omits optional rows', () => {
    const html = renderToStaticMarkup(
      <JsonRenderRenderer
        schema={{
          page: 'Rows omitted',
          intent: 'Render a data table without explicit rows',
          layout: 'dashboard',
          sections: [
            {
              component: 'DataTableSection',
              source: 'api',
              props: {
                title: 'Rows omitted',
                columns: [{ key: 'name', label: 'Name' }],
              },
            },
          ],
        }}
      />
    );

    expect(html).toContain('Rows omitted');
    expect(html).toContain('Name');
  });

  it('renders action labels as provided by the schema', () => {
    const html = renderToStaticMarkup(
      <JsonRenderRenderer
        onAction={() => undefined}
        schema={{
          page: 'Operations',
          intent: 'Show navigation actions',
          layout: 'screen',
          sections: [
            {
              component: 'NavigationPanel',
              source: 'navigation',
              props: {
                title: 'Navigation',
                links: [
                  { label: 'Incident response', href: '/incident' },
                  { label: 'Order management', href: '/orders' },
                ],
              },
              actions: [
                {
                  id: 'incident',
                  label: 'Incident response',
                  kind: 'generate-screen',
                  target: '/incident',
                },
                {
                  id: 'orders',
                  label: 'Order management',
                  kind: 'generate-screen',
                  target: '/orders',
                },
              ],
            },
          ],
        }}
      />
    );

    expect(html).toContain('Incident response');
    expect(html).toContain('Order management');
  });

  it('renders section-level generate and submit actions', () => {
    const html = renderToStaticMarkup(
      <JsonRenderRenderer
        onAction={() => undefined}
        schema={{
          page: 'Action coverage',
          intent: 'Show actions on generated sections',
          layout: 'screen',
          sections: [
            {
              component: 'TimelineSection',
              source: 'api',
              props: {
                title: 'Recent activity',
                items: [{ title: 'Order received', timestamp: '10:00' }],
              },
              actions: [
                {
                  id: 'open-detail',
                  label: 'Open detail',
                  kind: 'generate-screen',
                  target: '/orders/1',
                },
              ],
            },
            {
              component: 'ActionFooterSection',
              source: 'app',
              props: {
                title: 'Apply changes',
              },
              actions: [
                {
                  id: 'apply',
                  label: 'Apply filters',
                  kind: 'submit',
                },
              ],
            },
          ],
        }}
      />
    );

    expect(html).toContain('Open detail');
    expect(html).toContain('Apply filters');
  });

  it('does not attach the first generated action to unrelated links', () => {
    const html = renderToStaticMarkup(
      <JsonRenderRenderer
        onAction={() => undefined}
        schema={{
          page: 'Operations',
          intent: 'Show mixed navigation',
          layout: 'screen',
          sections: [
            {
              component: 'NavigationPanel',
              source: 'navigation',
              props: {
                title: 'Navigation',
                links: [
                  { label: 'Settings', href: '/settings' },
                  { label: 'Order management', href: '/orders' },
                ],
              },
              actions: [
                {
                  id: 'orders',
                  label: 'Order management',
                  kind: 'generate-screen',
                  target: '/orders',
                },
              ],
            },
          ],
        }}
      />
    );

    expect(html).toContain('Settings');
    expect(html).toContain('href="/settings"');
    expect(html).toContain('Order management');
  });

  it('renders broad work app sections from the catalog', () => {
    const html = renderToStaticMarkup(
      <JsonRenderRenderer
        schema={{
          page: 'Operations Workspace',
          intent: 'Show a broad operational workspace',
          layout: 'screen',
          sections: [
            {
              component: 'FilterBarSection',
              source: 'app',
              props: {
                title: 'Find work',
                searchPlaceholder: 'Search tickets',
                filters: [
                  { label: 'Open', value: 'open' },
                  { label: 'High priority', value: 'high' },
                ],
              },
            },
            {
              component: 'MasterDetailSection',
              source: 'app',
              props: {
                title: 'Ticket queue',
                items: [
                  {
                    id: 'ticket-1',
                    title: 'Checkout failure',
                    description: 'Payment provider timeout',
                    status: 'High',
                  },
                ],
                detail: {
                  title: 'Checkout failure',
                  description: 'Investigate recent payment errors.',
                  fields: [{ label: 'Owner', value: 'Support' }],
                },
              },
            },
            {
              component: 'KanbanSection',
              source: 'app',
              props: {
                title: 'Incident board',
                columns: [
                  { title: 'Open', cards: [{ title: 'API timeout', assignee: 'Sato' }] },
                  { title: 'Resolved', cards: [{ title: 'Email delay', meta: 'Yesterday' }] },
                ],
              },
            },
            {
              component: 'ChatPanelSection',
              source: 'app',
              props: {
                title: 'Support conversation',
                messages: [
                  { author: 'Customer', role: 'user', content: 'My order is delayed.' },
                  { author: 'Agent', role: 'assistant', content: 'I will check the shipment.' },
                ],
              },
            },
            {
              component: 'EditorPreviewSection',
              source: 'app',
              props: {
                title: 'Reply draft',
                editorContent: 'Hello, we are checking your order.',
                previewContent: 'Hello, we are checking your order.',
              },
            },
            {
              component: 'ComparisonSection',
              source: 'app',
              props: {
                title: 'Response options',
                columns: [
                  { title: 'Standard', items: [{ label: 'ETA', value: '2 days' }] },
                  { title: 'Expedite', items: [{ label: 'ETA', value: 'Today' }] },
                ],
              },
            },
            {
              component: 'FormSection',
              source: 'app',
              props: {
                title: 'Escalation form',
                fields: [
                  { name: 'owner', label: 'Owner', type: 'text', value: 'Support' },
                  {
                    name: 'priority',
                    label: 'Priority',
                    type: 'select',
                    value: 'high',
                    options: [{ label: 'High', value: 'high' }],
                  },
                ],
                submitLabel: 'Escalate',
              },
            },
            {
              component: 'ActionFooterSection',
              source: 'app',
              props: {
                title: 'Ready to continue',
                primaryAction: { label: 'Save changes', href: '/save' },
                secondaryAction: { label: 'Cancel', href: '/history' },
              },
            },
          ],
        }}
      />
    );

    expect(html).toContain('Ticket queue');
    expect(html).toContain('Incident board');
    expect(html).toContain('Support conversation');
    expect(html).toContain('Reply draft');
    expect(html).toContain('Response options');
    expect(html).toContain('Escalation form');
    expect(html).toContain('Ready to continue');
  });
});
