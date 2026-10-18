import { z } from 'zod';
import { readingMethodSchema } from './files';

export const costKinds = [
  'parse',
  'ocr',
  'llm_text',
  'llm_vision',
  'embedding',
] as const;
export const costKindSchema = z.enum(costKinds);
export type CostKind = z.infer<typeof costKindSchema>;

export const costsQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export type CostsQuery = z.infer<typeof costsQuerySchema>;

export const costSummarySchema = z.object({
  month: z.string(),
  totalMicroUsd: z.number().int().nonnegative(),
  limitMicroUsd: z.number().int().nonnegative().nullable(),
  limitReached: z.boolean(),
  avgPerFileMicroUsd: z.number().int().nonnegative(),
  byKind: z.record(z.string(), z.number().int().nonnegative()),
  byTier: z.record(readingMethodSchema, z.number().int().nonnegative()),
});
export type CostSummary = z.infer<typeof costSummarySchema>;
