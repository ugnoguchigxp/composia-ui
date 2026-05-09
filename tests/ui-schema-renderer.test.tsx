import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { collectRenderableActions } from '../shared/schemas/ui-action-collector';
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

    expect(html).not.toContain('<h1');
    expect(html).toContain('aria-label="Generated Screen Sample"');
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

  it('keeps page-level intent out of visible page shell copy', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'Home',
      intent:
        'AmazonライクなECサイトのトップページ。プロモーション、検索・絞り込み、注目カテゴリと売れ筋商品を提示し、商品詳細・カート・タイムセールへの導線を提供する',
      layout: 'screen',
      sections: [
        {
          component: 'NavigationPanel',
          source: 'navigation',
          props: {
            title: 'Tabs',
            links: [
              { label: 'Home', href: '/' },
              { label: 'Deals', href: '/deals' },
            ],
          },
        },
      ],
    });

    const spec = appUiSchemaToJsonRenderSpec(schema);

    expect(spec.elements[spec.root].props).not.toHaveProperty('description');
  });

  it('does not render page title or inferred intent as sidebar intro copy', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'ホーム',
      intent:
        'AmazonライクなECサイトのトップページ。プロモーション、検索・絞り込み、注目カテゴリと売れ筋商品を提示し、商品詳細・カート・タイムセールへの導線を提供する',
      layout: 'sidebar',
      navigation: {
        items: [
          { label: 'タイムセール', href: '/deals' },
          { label: 'カート', href: '/cart' },
        ],
      },
      sections: [
        {
          component: 'CardGridSection',
          source: 'app',
          props: {
            title: '売れ筋商品',
            items: [{ title: 'ワイヤレスイヤホン', href: '/products/earbuds' }],
          },
        },
      ],
    });
    const html = renderToStaticMarkup(<JsonRenderRenderer schema={schema} />);

    expect(html).not.toContain('>ホーム<');
    expect(html).not.toContain('AmazonライクなECサイトのトップページ');
    expect(html).toContain('タイムセール');
    expect(html).toContain('売れ筋商品');
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

  it('injects binding rows into DataTableSection ahead of static rows', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'Bound rows',
      intent: 'Render sandbox rows through a binding',
      layout: 'dashboard',
      sections: [
        {
          component: 'DataTableSection',
          dataBindingId: 'products_list',
          source: 'postgres',
          props: {
            title: 'Products',
            columns: [{ key: 'name', label: 'Name' }],
            rows: [{ name: 'Static product' }],
          },
        },
      ],
    });
    const spec = appUiSchemaToJsonRenderSpec(schema, {
      bindingRows: { products_list: [{ id: '1', name: 'Sandbox product' }] },
    });
    const html = renderToStaticMarkup(
      <JsonRenderRenderer
        bindingRows={{ products_list: [{ id: '1', name: 'Sandbox product' }] }}
        schema={schema}
      />
    );

    expect(spec.elements['section-datatablesection-0']?.props.rows).toEqual([
      { id: '1', name: 'Sandbox product' },
    ]);
    expect(html).toContain('Sandbox product');
    expect(html).not.toContain('Static product');
  });

  it('hides bound sections when the applied table has no rows', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'Empty bound rows',
      intent: 'Hide empty bound data instead of showing static fallback',
      layout: 'dashboard',
      sections: [
        {
          component: 'DataTableSection',
          dataBindingId: 'products_list',
          source: 'postgres',
          props: {
            title: 'Products',
            columns: [{ key: 'name', label: 'Name' }],
            rows: [{ name: 'Static product' }],
          },
        },
      ],
    });
    const spec = appUiSchemaToJsonRenderSpec(schema, { bindingRows: { products_list: [] } });
    const html = renderToStaticMarkup(
      <JsonRenderRenderer bindingRows={{ products_list: [] }} schema={schema} />
    );

    expect(spec.elements[spec.root].children).toEqual([]);
    expect(html).not.toContain('Products');
    expect(html).not.toContain('Name');
    expect(html).not.toContain('Static product');
  });

  it('maps bound table rows into card grid items', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'Bound cards',
      intent: 'Render sandbox rows through bound cards',
      layout: 'dashboard',
      sections: [
        {
          component: 'CardGridSection',
          dataBindingId: 'products_list',
          source: 'postgres',
          props: {
            title: 'Products',
            items: [{ title: 'Static product' }],
          },
        },
      ],
    });
    const bindingRows = {
      products_list: [
        {
          id: '1',
          name: 'Sandbox product',
          description: 'Loaded from SandboxDB',
          price: 1200,
        },
      ],
    };
    const spec = appUiSchemaToJsonRenderSpec(schema, { bindingRows });
    const html = renderToStaticMarkup(
      <JsonRenderRenderer bindingRows={bindingRows} schema={schema} />
    );

    expect(spec.elements['section-cardgridsection-0']?.props.items).toEqual([
      expect.objectContaining({
        title: 'Sandbox product',
        description: 'Loaded from SandboxDB',
        meta: { label: 'price', value: '1200' },
      }),
    ]);
    expect(html).toContain('Sandbox product');
    expect(html).toContain('Loaded from SandboxDB');
    expect(html).not.toContain('Static product');
  });

  it('suppresses database system columns in rendered data tables', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'System columns',
      intent: 'Hide database bookkeeping fields from table UI',
      layout: 'dashboard',
      sections: [
        {
          component: 'DataTableSection',
          source: 'postgres',
          props: {
            title: 'Products',
            columns: [
              { key: 'id', label: 'ID' },
              { key: 'name', label: 'Name' },
              { key: 'created_at', label: 'Created at' },
              { key: 'updated_at', label: 'Updated at' },
              { key: 'is_active', label: 'Active' },
            ],
            rows: [
              {
                id: 'system-row-id',
                name: 'Visible product',
                created_at: 'SYSTEM_CREATED_VALUE',
                updated_at: 'SYSTEM_UPDATED_VALUE',
                is_active: 'SYSTEM_ACTIVE_VALUE',
              },
            ],
          },
        },
      ],
    });
    const html = renderToStaticMarkup(<JsonRenderRenderer schema={schema} />);

    expect(html).toContain('Name');
    expect(html).toContain('Visible product');
    expect(html).not.toContain('Created at');
    expect(html).not.toContain('Updated at');
    expect(html).not.toContain('Active');
    expect(html).not.toContain('SYSTEM_CREATED_VALUE');
    expect(html).not.toContain('SYSTEM_UPDATED_VALUE');
    expect(html).not.toContain('SYSTEM_ACTIVE_VALUE');
    expect(html).not.toContain('system-row-id');
  });

  it('hides bound static rows while binding rows are unavailable', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'Static fallback',
      intent: 'Avoid rendering static rows for bound sections before rows are loaded',
      layout: 'dashboard',
      sections: [
        {
          component: 'DataTableSection',
          dataBindingId: 'products_list',
          source: 'postgres',
          props: {
            title: 'Products',
            columns: [{ key: 'name', label: 'Name' }],
            rows: [{ name: 'Static product' }],
          },
        },
      ],
    });
    const spec = appUiSchemaToJsonRenderSpec(schema, { bindingRows: {} });
    const html = renderToStaticMarkup(<JsonRenderRenderer bindingRows={{}} schema={schema} />);

    expect(spec.elements[spec.root].children).toEqual([]);
    expect(html).not.toContain('Static product');
  });

  it('does not inject binding rows into unsupported components', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'Create product',
      intent: 'Render a bound create form',
      layout: 'form',
      sections: [
        {
          component: 'FormSection',
          dataBindingId: 'products_create',
          source: 'postgres',
          props: {
            title: 'Product',
            fields: [{ name: 'name', label: 'Name', type: 'text' }],
            submitLabel: 'Save',
          },
        },
      ],
    });
    const spec = appUiSchemaToJsonRenderSpec(schema, {
      bindingRows: { products_create: [{ id: '1', name: 'Sandbox product' }] },
    });

    expect(spec.elements['section-formsection-0']?.props.dataBindingId).toBe('products_create');
    expect(spec.elements['section-formsection-0']?.props.rows).toBeUndefined();
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
    const schema = appUiSchemaSchema.parse({
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
    });
    const html = renderToStaticMarkup(
      <JsonRenderRenderer onAction={() => undefined} schema={schema} />
    );
    const actions = collectRenderableActions(schema);
    const settingsAction = actions.find((action) => action.target === '/settings');

    expect(html).toContain('Settings');
    expect(settingsAction).toEqual(
      expect.objectContaining({ kind: 'generate-screen', label: 'Settings', target: '/settings' })
    );
    expect(html).toContain(`data-action-id="${settingsAction?.id}"`);
    expect(html).not.toContain('href="/settings"');
    expect(html).toContain('Order management');
  });

  it('marks the selected canvas action while intercepting href links', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'Shop',
      intent: 'Show shop navigation',
      layout: 'screen',
      sections: [
        {
          component: 'NavigationPanel',
          source: 'navigation',
          props: {
            title: 'Navigation',
            links: [{ label: 'Cart', href: '/cart' }],
          },
        },
      ],
    });
    const cartAction = collectRenderableActions(schema).find((action) => action.target === '/cart');
    const html = renderToStaticMarkup(
      <JsonRenderRenderer
        onAction={() => undefined}
        schema={schema}
        selectedActionId={cartAction?.id}
      />
    );

    expect(cartAction?.label).toBe('Cart');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-selected="true"');
    expect(html).not.toContain('href="/cart"');
  });

  it('renders marketplace search navigation with tabs under the search bar', () => {
    const html = renderToStaticMarkup(
      <JsonRenderRenderer
        schema={{
          page: 'Marketplace',
          intent: 'Amazon-style searchable catalog header',
          layout: 'screen',
          sections: [
            {
              component: 'MainSearchNavigationSection',
              source: 'navigation',
              props: {
                title: 'Shop',
                searchPlaceholder: '商品を検索',
                searchButtonLabel: '検索',
                categories: [
                  { label: 'すべて', value: 'all' },
                  { label: '家電', value: 'electronics' },
                ],
                links: [
                  { label: 'タイムセール', href: '/deals' },
                  { label: 'ランキング', href: '/ranking' },
                  { label: 'カート', href: '/cart' },
                  { label: '新着', href: '/new' },
                  { label: 'ブランド', href: '/brands' },
                  { label: 'ギフト', href: '/gifts' },
                  { label: 'アウトレット', href: '/outlet' },
                ],
              },
            },
          ],
        }}
      />
    );

    expect(html).toContain('商品を検索');
    expect(html).toContain('タイムセール');
    expect(html).toContain('ランキング');
    expect(html).toContain('カート');
    expect(html).toContain('アウトレット');
    expect(html.indexOf('商品を検索')).toBeLessThan(html.indexOf('タイムセール'));
    expect(html.indexOf('タイムセール')).toBeLessThan(html.indexOf('アウトレット'));
    expect(html).toContain('flex-wrap');
    expect(html).toContain('border-b-2');
  });

  it('does not synthesize a fixed tab menu or result cards when AI omits tab props', () => {
    const html = renderToStaticMarkup(
      <JsonRenderRenderer
        schema={{
          page: 'Marketplace',
          intent: 'Render default search navigation',
          layout: 'screen',
          sections: [
            {
              component: 'MainSearchNavigationSection',
              source: 'app',
              props: {},
            },
          ],
        }}
      />
    );

    expect(html).toContain('Search...');
    expect(html).toContain('Search');
    expect(html).not.toContain('おすすめ');
    expect(html).not.toContain('href="/deals"');
    expect(html).not.toContain('aria-label="Main navigation"');
    expect(html).not.toContain('aria-label="Results"');
  });

  it('renders card grid metadata objects from AI output', () => {
    const html = renderToStaticMarkup(
      <JsonRenderRenderer
        schema={{
          page: 'Product catalog',
          intent: 'Browse products with structured metadata',
          layout: 'screen',
          sections: [
            {
              component: 'CardGridSection',
              source: 'app',
              props: {
                title: 'Featured products',
                items: [
                  {
                    title: 'Seasonal bouquet',
                    meta: { label: 'Price', value: '¥4,800' },
                  },
                  {
                    title: 'Gift set',
                    meta: { stock: 'In stock', delivery: 'Tomorrow' },
                  },
                ],
              },
            },
          ],
        }}
      />
    );

    expect(html).toContain('Price: ¥4,800');
    expect(html).toContain('stock: In stock / delivery: Tomorrow');
  });

  it('renders card grid item hrefs as whole-card links', () => {
    const html = renderToStaticMarkup(
      <JsonRenderRenderer
        schema={{
          page: 'Product catalog',
          intent: 'Browse products with linked cards',
          layout: 'screen',
          sections: [
            {
              component: 'CardGridSection',
              source: 'app',
              props: {
                title: 'Featured products',
                items: [
                  {
                    title: 'Seasonal bouquet',
                    description: 'Fresh flowers for the week',
                    href: '/products/seasonal-bouquet',
                  },
                ],
              },
            },
          ],
        }}
      />
    );

    expect(html).toContain('href="/products/seasonal-bouquet"');
    expect(html).toContain('group block h-full w-full overflow-hidden rounded-md border');
    expect(html).toContain('Seasonal bouquet</span>');
    expect(html).not.toContain('inline-flex h-8 items-center rounded-md border');
  });

  it('renders card grid item actions as whole-card compose targets', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'Product catalog',
      intent: 'Browse products with linked cards',
      layout: 'screen',
      sections: [
        {
          component: 'CardGridSection',
          source: 'app',
          props: {
            title: 'Featured products',
            items: [{ title: 'Seasonal bouquet', href: '/products/seasonal-bouquet' }],
          },
        },
      ],
    });
    const cardAction = collectRenderableActions(schema).find(
      (action) => action.target === '/products/seasonal-bouquet'
    );
    const html = renderToStaticMarkup(
      <JsonRenderRenderer
        onAction={() => undefined}
        schema={schema}
        selectedActionId={cardAction?.id}
      />
    );

    expect(cardAction?.label).toBe('Seasonal bouquet');
    expect(html).toContain('<button');
    expect(html).toContain(`data-action-id="${cardAction?.id}"`);
    expect(html).toContain('data-selected="true"');
    expect(html).not.toContain('href="/products/seasonal-bouquet"');
  });

  it('does not render orphan card grid section actions as bottom CTA buttons', () => {
    const html = renderToStaticMarkup(
      <JsonRenderRenderer
        onAction={() => undefined}
        schema={{
          page: 'Recommended',
          intent: 'Show featured product cards',
          layout: 'screen',
          sections: [
            {
              component: 'CardGridSection',
              source: 'app',
              props: {
                title: '本日のおすすめ',
                items: [
                  {
                    title: '人気モデル特集',
                    href: '/features/popular-models',
                  },
                ],
              },
              actions: [
                {
                  id: 'popular-models',
                  label: '人気モデル特集',
                  kind: 'generate-screen',
                  target: '/features/popular-models',
                },
                {
                  id: 'view-features',
                  label: '特集を見る',
                  kind: 'generate-screen',
                  target: '/features',
                },
              ],
            },
          ],
        }}
      />
    );

    expect(html).toContain('人気モデル特集');
    expect(html).not.toContain('特集を見る');
    expect(html).not.toContain('data-action-id="view-features"');
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
              component: 'StepperSection',
              source: 'app',
              props: {
                title: 'Ticket response workflow',
                steps: [
                  {
                    id: 'collect',
                    title: 'Collect signals',
                    description: 'Review payment provider and gateway logs',
                    status: 'completed',
                  },
                  {
                    id: 'triage',
                    title: 'Triage issue',
                    description: 'Identify failing checkout segment and assign owner',
                    status: 'current',
                  },
                ],
                activeStepId: 'triage',
                orientation: 'vertical',
                variant: 'split',
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
          ],
        }}
      />
    );

    expect(html).toContain('Ticket response workflow');
    expect(html).toContain('Incident board');
    expect(html).toContain('Support conversation');
    expect(html).toContain('Reply draft');
    expect(html).toContain('Response options');
    expect(html).toContain('Escalation form');
  });

  it('renders error message for invalid schema', () => {
    // Missing required 'page' and 'sections'
    const invalidSchema = {
      layout: 'dashboard',
    } as any;

    const html = renderToStaticMarkup(<JsonRenderRenderer schema={invalidSchema} />);
    expect(html).toContain('UI schema validation failed');
  });
});
