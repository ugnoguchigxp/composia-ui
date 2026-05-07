import { z } from 'zod';

export const visualDensitySchema = z.enum(['compact', 'normal', 'spacious']);
export const visualToneSchema = z.enum(['neutral', 'primary', 'success', 'warning', 'danger']);
export const visualEmphasisSchema = z.enum(['low', 'medium', 'high']);

export const visualIntentSchema = z
  .object({
    density: visualDensitySchema.optional(),
    tone: visualToneSchema.optional(),
    emphasis: visualEmphasisSchema.optional(),
  })
  .strict();

export type VisualDensity = z.infer<typeof visualDensitySchema>;
export type VisualTone = z.infer<typeof visualToneSchema>;
export type VisualEmphasis = z.infer<typeof visualEmphasisSchema>;
export type VisualIntent = z.infer<typeof visualIntentSchema>;
