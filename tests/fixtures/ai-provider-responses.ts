export const aiProviderResponses = {
  formSectionWithStringSelectOptions: {
    page: 'Incident workflow',
    intent: 'Create an incident response form',
    layout: 'form',
    sections: [
      {
        component: 'FormSection',
        source: 'app',
        props: {
          title: 'Incident triage',
          fields: [
            { name: 'title', label: 'Title', type: 'text' },
            {
              name: 'priority',
              label: 'Priority',
              type: 'select',
              options: ['高', '中', '低'],
              value: '高',
            },
          ],
          submitLabel: 'Save',
        },
      },
    ],
  },
  schemaWithOptionalNullFields: {
    page: 'Product catalog',
    intent: 'Browse product recommendations',
    layout: 'screen',
    density: null,
    navigation: null,
    sections: [
      {
        component: 'CardGridSection',
        source: 'app',
        visualIntent: null,
        actions: [
          {
            id: 'open-gift',
            label: 'Gift set',
            kind: 'generate-screen',
            target: null,
            intentHint: null,
          },
        ],
        props: {
          title: 'Recommendations',
          description: null,
          items: [
            {
              title: 'Gift set',
              description: null,
              badge: null,
              href: '/products/gift-set',
              image: null,
            },
          ],
        },
      },
    ],
  },
  dataTableWithObjectCells: {
    page: 'Product ranking',
    intent: 'Show product ranking rows',
    layout: 'screen',
    sections: [
      {
        component: 'DataTableSection',
        source: 'api',
        props: {
          title: 'Ranking',
          columns: [
            { key: 'rank', label: 'Rank' },
            { key: 'product', label: 'Product' },
            { key: 'tags', label: 'Tags' },
          ],
          rows: [
            {
              rank: 1,
              product: { id: 'p-1', name: 'Wireless earbuds', price: '¥12,800' },
              tags: [{ label: 'Audio' }, { label: 'Gift' }],
            },
            {
              rank: 2,
              product: { title: 'Desk light', category: 'Home office' },
              tags: ['Lighting', { label: 'Work' }],
            },
          ],
        },
      },
    ],
  },
  unsafeExternalActionHref: {
    page: 'Unsafe action',
    intent: 'Reject external action URLs',
    layout: 'screen',
    sections: [
      {
        component: 'InsightPanel',
        source: 'summary',
        props: {
          title: 'Unsafe',
          body: 'Provider attempted to return an unsafe action link.',
          action: {
            label: 'Run',
            href: 'javascript:alert(1)',
          },
        },
      },
    ],
  },
  unsupportedSourceBinding: {
    page: 'Source mismatch',
    intent: 'Reject component source mismatches',
    layout: 'screen',
    sections: [
      {
        component: 'DataTableSection',
        source: 'rss',
        props: {
          title: 'RSS table',
          columns: [{ key: 'title', label: 'Title' }],
          rows: [],
        },
      },
    ],
  },
} as const;
