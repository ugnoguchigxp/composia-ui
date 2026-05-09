import type { AppUiSchema } from '../../shared/schemas/ui-schema.schema';

export type GoldenPromptFixture = {
  id: string;
  prompt: string;
  schema: AppUiSchema;
};

export const goldenPromptFixtures: GoldenPromptFixture[] = [
  {
    id: 'operations-dashboard',
    prompt: '運用チーム向けに KPI とアラートを確認できるダッシュボードを作成',
    schema: {
      page: 'Operations Dashboard',
      intent: 'Track daily operations',
      layout: 'dashboard',
      navigation: {
        items: [
          { label: 'History', href: '/history' },
          { label: 'Prompt', href: '/prompt' },
        ],
      },
      sections: [
        {
          component: 'KpiSummarySection',
          source: 'summary',
          props: {
            title: 'Daily KPIs',
            items: [
              { label: 'Incidents', value: 3, description: 'Today' },
              { label: 'Resolved', value: 11, description: 'This week' },
            ],
          },
        },
        {
          component: 'ChartSection',
          source: 'summary',
          props: {
            title: 'Incident trend',
            chartType: 'line',
            data: [
              { label: 'Mon', value: 4 },
              { label: 'Tue', value: 3 },
              { label: 'Wed', value: 5 },
            ],
          },
        },
      ],
    },
  },
  {
    id: 'ecommerce-catalog',
    prompt: 'EC サイトの商品一覧と検索導線を生成',
    schema: {
      page: 'Catalog',
      intent: 'Show product discovery flow',
      layout: 'screen',
      sections: [
        {
          component: 'MainSearchNavigationSection',
          source: 'navigation',
          props: {
            title: 'Store navigation',
            searchPlaceholder: 'Search products',
            searchButtonLabel: 'Search',
            categories: [
              { label: 'All', value: 'all' },
              { label: 'Audio', value: 'audio' },
            ],
            links: [
              { label: 'Home', href: '/' },
              { label: 'Deals', href: '/deals' },
              { label: 'Cart', href: '/cart' },
            ],
          },
        },
        {
          component: 'CardGridSection',
          source: 'app',
          props: {
            title: 'Featured products',
            items: [
              {
                title: 'Wireless earbuds',
                description: 'Noise cancelling',
                href: '/products/earbuds',
                image: {
                  src: 'https://picsum.photos/seed/golden-earbuds/1200/720',
                  alt: 'Wireless earbuds',
                },
              },
            ],
          },
        },
      ],
    },
  },
  {
    id: 'data-table-binding',
    prompt: '受注一覧をデータバインディング付きの表で表示',
    schema: {
      page: 'Orders',
      intent: 'Inspect bound order rows',
      layout: 'entity-list',
      sections: [
        {
          component: 'DataTableSection',
          source: 'api',
          dataBindingId: 'orders_list',
          props: {
            title: 'Order table',
            columns: [
              { key: 'order_id', label: 'Order ID' },
              { key: 'status', label: 'Status' },
            ],
            rows: [
              { order_id: 'ORD-001', status: 'Ready' },
              { order_id: 'ORD-002', status: 'Pending' },
            ],
          },
        },
      ],
    },
  },
  {
    id: 'form-submit-action',
    prompt: '問い合わせ登録フォームを submit action 付きで生成',
    schema: {
      page: 'Contact Intake',
      intent: 'Submit a new inquiry',
      layout: 'form',
      sections: [
        {
          component: 'FormSection',
          source: 'app',
          dataBindingId: 'inquiry_create',
          props: {
            title: 'Inquiry form',
            fields: [
              { name: 'title', label: 'Title', type: 'text', required: true },
              { name: 'email', label: 'Email', type: 'email', required: true },
            ],
            submitLabel: 'Submit inquiry',
          },
          actions: [{ id: 'submit-inquiry', label: 'Submit inquiry', kind: 'submit' }],
        },
      ],
    },
  },
  {
    id: 'dbdesign-bound-screen',
    prompt: 'DBDesign で定義したテーブルに紐づく在庫管理画面を生成',
    schema: {
      page: 'Inventory Workspace',
      intent: 'Manage DB-bound inventory',
      layout: 'entity-list',
      sections: [
        {
          component: 'DataTableSection',
          source: 'api',
          dataBindingId: 'inventory_list',
          props: {
            title: 'Inventory rows',
            columns: [
              { key: 'sku', label: 'SKU' },
              { key: 'stock', label: 'Stock' },
            ],
            rows: [{ sku: 'SKU-001', stock: 18 }],
          },
          actions: [{ id: 'open-item', label: 'Item details', kind: 'generate-screen' }],
        },
        {
          component: 'InsightPanel',
          source: 'summary',
          props: {
            title: 'Inventory insight',
            body: 'Stock thresholds are based on DBDesign draft bindings.',
          },
        },
      ],
    },
  },
];

export const unsafeImageGoldenPromptFixture: GoldenPromptFixture = {
  id: 'unsafe-image',
  prompt: 'unsafe image host should fail',
  schema: {
    page: 'Unsafe image',
    intent: 'Reject non-allowlisted image host',
    layout: 'screen',
    sections: [
      {
        component: 'ImageSection',
        source: 'app',
        props: {
          title: 'Unsafe image',
          image: {
            src: 'https://example.com/unsafe.png',
            alt: 'unsafe',
          },
        },
      },
    ],
  },
};
