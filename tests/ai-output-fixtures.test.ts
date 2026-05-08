import { describe, expect, it } from 'vitest';
import { createAiService } from '../api/modules/ai/ai.service';
import { aiProviderResponses } from './fixtures/ai-provider-responses';

function createFixtureService(response: unknown) {
  return createAiService({
    generateLayout: async () => response,
  });
}

describe('AI provider response fixtures', () => {
  it('normalizes string select options from observed provider output', async () => {
    const service = createFixtureService(aiProviderResponses.formSectionWithStringSelectOptions);

    await expect(service.generateLayout({ prompt: 'Make an incident form' })).resolves.toEqual(
      expect.objectContaining({
        schema: expect.objectContaining({
          sections: [
            expect.objectContaining({
              component: 'FormSection',
              props: expect.objectContaining({
                fields: [
                  { name: 'title', label: 'Title', type: 'text' },
                  {
                    name: 'priority',
                    label: 'Priority',
                    type: 'select',
                    options: [
                      { label: '高', value: '高' },
                      { label: '中', value: '中' },
                      { label: '低', value: '低' },
                    ],
                    value: '高',
                  },
                ],
              }),
            }),
          ],
        }),
      })
    );
  });

  it('omits optional null fields from provider output before schema validation', async () => {
    const service = createFixtureService(aiProviderResponses.schemaWithOptionalNullFields);

    const result = await service.generateLayout({ prompt: 'Make product recommendations' });

    expect(result.schema).toEqual(
      expect.objectContaining({
        layout: 'screen',
        sections: [
          expect.objectContaining({
            component: 'CardGridSection',
            actions: [
              {
                id: 'open-gift',
                label: 'Gift set',
                kind: 'generate-screen',
                carry: {
                  navigation: true,
                  sourceContext: true,
                  visualIntent: true,
                },
              },
            ],
            props: {
              title: 'Recommendations',
              items: [
                {
                  title: 'Gift set',
                  href: '/products/gift-set',
                },
              ],
            },
          }),
        ],
      })
    );
    expect(result.schema).not.toHaveProperty('density');
    expect(result.schema).not.toHaveProperty('navigation');
    expect(result.schema.sections[0]).not.toHaveProperty('visualIntent');
  });

  it('normalizes object-like data table cells from provider output', async () => {
    const service = createFixtureService(aiProviderResponses.dataTableWithObjectCells);

    await expect(service.generateLayout({ prompt: 'Make product rankings' })).resolves.toEqual(
      expect.objectContaining({
        schema: expect.objectContaining({
          sections: [
            expect.objectContaining({
              component: 'DataTableSection',
              props: expect.objectContaining({
                rows: [
                  {
                    rank: 1,
                    product: 'Wireless earbuds',
                    tags: 'Audio, Gift',
                  },
                  {
                    rank: 2,
                    product: 'Desk light',
                    tags: 'Lighting, Work',
                  },
                ],
              }),
            }),
          ],
        }),
      })
    );
  });

  it('rejects unsafe action links from provider output', async () => {
    const service = createFixtureService(aiProviderResponses.unsafeExternalActionHref);

    await expect(service.generateLayout({ prompt: 'Make unsafe UI' })).rejects.toThrow(
      'AI returned a schema outside the component catalog'
    );
  });

  it('rejects component source mismatches from provider output', async () => {
    const service = createFixtureService(aiProviderResponses.unsupportedSourceBinding);

    await expect(service.generateLayout({ prompt: 'Make source mismatch UI' })).rejects.toThrow(
      'AI returned a schema outside the component catalog'
    );
  });
});
