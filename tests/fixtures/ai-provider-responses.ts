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
  filterBarWithStringFilters: {
    page: 'Ticket search',
    intent: 'Filter operational tickets',
    layout: 'screen',
    sections: [
      {
        component: 'FilterBarSection',
        source: 'app',
        props: {
          title: 'Ticket filters',
          searchPlaceholder: 'Search tickets',
          filters: ['Open', 'High priority'],
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
