import { z } from 'zod';

export const dataBindingIdentifierSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]*$/, 'Use snake_case identifiers starting with a letter');

export const dataBindingOperationSchema = z.enum([
  'list',
  'get',
  'create',
  'update',
  'delete',
  'attach',
  'detach',
]);

export const dataBindingFilterSchema = z
  .object({
    field: dataBindingIdentifierSchema,
    operator: z.enum(['eq', 'contains', 'gte', 'lte']),
    valueFrom: z.enum(['static', 'route', 'form', 'session']).default('static'),
    value: z.unknown().optional(),
  })
  .strict();

export const dataBindingSortSchema = z
  .object({
    field: dataBindingIdentifierSchema,
    direction: z.enum(['asc', 'desc']),
  })
  .strict();

export const dataBindingDraftSchema = z
  .object({
    id: dataBindingIdentifierSchema,
    table: dataBindingIdentifierSchema,
    operation: dataBindingOperationSchema,
    fields: z.array(dataBindingIdentifierSchema).default([]),
    relations: z.array(dataBindingIdentifierSchema).default([]),
    filters: z.array(dataBindingFilterSchema).default([]),
    sort: z.array(dataBindingSortSchema).default([]),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .strict();

export const dataBindingSchema = dataBindingDraftSchema
  .extend({
    databaseSchemaJsonId: z.string().uuid(),
    databaseSchemaVersion: z.number().int().min(1),
  })
  .strict();

export type DataBindingOperation = z.infer<typeof dataBindingOperationSchema>;
export type DataBindingDraft = z.infer<typeof dataBindingDraftSchema>;
export type DataBinding = z.infer<typeof dataBindingSchema>;
