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

  it('normalizes string filter options from provider output', async () => {
    const service = createFixtureService(aiProviderResponses.filterBarWithStringFilters);

    await expect(service.generateLayout({ prompt: 'Make ticket filters' })).resolves.toEqual(
      expect.objectContaining({
        schema: expect.objectContaining({
          sections: [
            expect.objectContaining({
              component: 'FilterBarSection',
              props: expect.objectContaining({
                filters: [
                  { label: 'Open', value: 'Open' },
                  { label: 'High priority', value: 'High priority' },
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
