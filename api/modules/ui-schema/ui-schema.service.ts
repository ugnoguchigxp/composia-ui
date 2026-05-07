import { validateAppUiSchemaCatalog } from '../../../shared/schemas/app-catalog.schema';
import type {
  AppUiSchema,
  UiSchemaRequest,
  UiSchemaValidationResponse,
} from '../../../shared/schemas/ui-schema.schema';
import { NotFoundError, ValidationError } from '../../lib/errors';

const pageSchemas: Record<string, AppUiSchema> = {
  sample: {
    page: 'Generated Screen Sample',
    intent: 'Show the registered App UI Schema renderer components.',
    layout: 'screen',
    sections: [
      {
        component: 'InsightPanel',
        source: 'summary',
        props: {
          title: 'Renderer ready',
          body: 'This fixed schema is validated by the backend UI Schema service.',
          action: { label: 'Open history', href: '/history' },
        },
      },
    ],
  },
};

function validateCatalog(schema: AppUiSchema): UiSchemaValidationResponse {
  const issues = validateAppUiSchemaCatalog(schema);
  return { valid: issues.length === 0, issues };
}

export const uiSchemaService = {
  getPage: async (pageId: string) => {
    const schema = pageSchemas[pageId];
    if (!schema) throw new NotFoundError('UI schema page not found');
    return { schema };
  },
  preview: async (input: UiSchemaRequest) => {
    const validation = validateCatalog(input.schema);
    if (!validation.valid) {
      throw new ValidationError('UI schema is outside the component catalog', {
        issues: validation.issues,
      });
    }
    return { schema: input.schema };
  },
  validate: async (input: UiSchemaRequest): Promise<UiSchemaValidationResponse> =>
    validateCatalog(input.schema),
};
