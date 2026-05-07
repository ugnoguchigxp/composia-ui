import { z } from 'zod';
import { appUiComponentNameSchema } from './ui-schema.schema';

const zodSchemaLike = z.custom<z.ZodType>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'safeParse' in value &&
    typeof value.safeParse === 'function',
  'propsSchema must be a Zod schema'
);

export const componentDefinitionSchema = z
  .object({
    name: appUiComponentNameSchema,
    description: z.string().min(1),
    allowedSources: z.array(z.string().min(1)).default([]),
    propsSchema: zodSchemaLike,
    variants: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const componentCatalogDefinitionSchema = z.array(componentDefinitionSchema);

export type ComponentDefinition = z.infer<typeof componentDefinitionSchema>;
