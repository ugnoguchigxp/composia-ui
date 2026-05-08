import { z } from 'zod';
import { dataBindingIdentifierSchema } from './data-binding.schema';
import { visualIntentSchema } from './visual-intent.schema';

export const appRelativePathSchema = z
  .string()
  .trim()
  .max(500)
  .refine((href) => href.startsWith('/') && !href.startsWith('//') && !href.includes('\\'), {
    message: 'href must be an app-relative path',
  });

export const appUiLayoutSchema = z.enum([
  'dashboard',
  'entity-list',
  'entity-detail',
  'form',
  'article-feed',
  'admin',
  'screen',
  'sidebar',
]);

export const appUiComponentNameSchema = z
  .string()
  .min(1)
  .regex(/^[A-Z][A-Za-z0-9]*$/, 'component must be a catalog component name');

export const appUiNavigationSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            label: z.string().min(1),
            href: appRelativePathSchema,
            description: z.string().min(1).optional(),
          })
          .strict()
      )
      .default([]),
  })
  .strict();

export const appActionSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(120),
    kind: z.enum(['generate-screen', 'navigate', 'submit']).default('generate-screen'),
    intentHint: z.string().trim().min(1).max(500).optional(),
    target: appRelativePathSchema.optional(),
    carry: z
      .object({
        navigation: z.boolean().default(true),
        visualIntent: z.boolean().default(true),
        sourceContext: z.boolean().default(true),
      })
      .strict()
      .default({ navigation: true, visualIntent: true, sourceContext: true }),
  })
  .strict();

export const appUiSchemaSectionSchema = z
  .object({
    component: appUiComponentNameSchema,
    source: z.string().min(1),
    variant: z.string().min(1).optional(),
    props: z.record(z.string(), z.unknown()).default({}),
    dataBindingId: dataBindingIdentifierSchema.optional(),
    actions: z.array(appActionSchema).optional(),
    visualIntent: visualIntentSchema.optional(),
  })
  .strict();

export const appUiSchemaSchema = z
  .object({
    page: z.string().min(1),
    intent: z.string().min(1),
    layout: appUiLayoutSchema,
    density: visualIntentSchema.shape.density.optional(),
    tone: visualIntentSchema.shape.tone.optional(),
    sections: z.array(appUiSchemaSectionSchema).min(1),
    navigation: appUiNavigationSchema.optional(),
  })
  .strict();

export const uiSchemaRequestSchema = z
  .object({
    schema: appUiSchemaSchema,
  })
  .strict();

export const uiSchemaResponseSchema = z
  .object({
    schema: appUiSchemaSchema,
  })
  .strict();

export const uiSchemaValidationResponseSchema = z
  .object({
    valid: z.boolean(),
    issues: z.array(
      z
        .object({
          path: z.string().min(1),
          message: z.string().min(1),
        })
        .strict()
    ),
  })
  .strict();

export type AppUiLayout = z.infer<typeof appUiLayoutSchema>;
export type AppAction = z.infer<typeof appActionSchema>;
export type AppUiNavigation = z.infer<typeof appUiNavigationSchema>;
export type AppUiSchemaSection = z.infer<typeof appUiSchemaSectionSchema>;
export type AppUiSchema = z.infer<typeof appUiSchemaSchema>;
export type UiSchemaRequest = z.infer<typeof uiSchemaRequestSchema>;
export type UiSchemaResponse = z.infer<typeof uiSchemaResponseSchema>;
export type UiSchemaValidationResponse = z.infer<typeof uiSchemaValidationResponseSchema>;
