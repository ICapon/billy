import { z } from 'zod';
import { businessFileSchema } from './files';

export const transactionKinds = ['expense', 'income'] as const;
export const transactionKindSchema = z.enum(transactionKinds);
export type TransactionKind = z.infer<typeof transactionKindSchema>;

/** Canonical categories shared by the LLM prompt, validation and the editor dropdown. */
export const transactionCategories = [
  'supplies',
  'inventory',
  'rent',
  'utilities',
  'staff',
  'transport',
  'marketing',
  'taxes',
  'equipment',
  'sales',
  'services',
  'other',
] as const;
export const transactionCategorySchema = z.enum(transactionCategories);
export type TransactionCategory = z.infer<typeof transactionCategorySchema>;

export const lineDirections = ['purchase', 'sale'] as const;
export const lineDirectionSchema = z.enum(lineDirections);
export type LineDirection = z.infer<typeof lineDirectionSchema>;

/** ISO 4217 code in upper case (normalize before validating). */
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const minorUnitsSchema = z.number().int().nonnegative();
const confidenceSchema = z.number().min(0).max(1);

export const lineItemSchema = z.object({
  id: z.uuid(),
  productName: z.string().trim().min(1).max(200),
  quantity: z.number().positive(),
  unitPriceMinor: minorUnitsSchema.nullable(),
  totalMinor: minorUnitsSchema,
  direction: lineDirectionSchema,
});
export type LineItem = z.infer<typeof lineItemSchema>;

export const lineItemInputSchema = lineItemSchema.omit({ id: true });
export type LineItemInput = z.infer<typeof lineItemInputSchema>;

export const transactionSchema = z.object({
  id: z.uuid(),
  fileId: z.uuid(),
  occurredOn: z.iso.date(),
  amountMinor: minorUnitsSchema,
  currency: currencySchema,
  kind: transactionKindSchema,
  category: transactionCategorySchema,
  isStaff: z.boolean(),
  counterparty: z.string().max(200).nullable(),
  confidence: confidenceSchema,
  confirmed: z.boolean(),
  excludedReason: z.enum(['merged_duplicate']).nullable(),
  lineItems: z.array(lineItemSchema),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const transactionUpdateSchema = z
  .object({
    occurredOn: z.iso.date(),
    amountMinor: minorUnitsSchema,
    currency: currencySchema,
    kind: transactionKindSchema,
    category: transactionCategorySchema,
    counterparty: z.string().trim().max(200).nullable(),
    lineItems: z.array(lineItemInputSchema),
  })
  .partial();
export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;

export const businessFileDetailSchema = businessFileSchema.extend({
  records: z.array(transactionSchema),
});
export type BusinessFileDetail = z.infer<typeof businessFileDetailSchema>;

/**
 * Output contract of the LLM extraction. Amounts are decimal numbers in major units
 * (e.g. 12.5); conversion to minor units happens in code.
 */
export const extractedLineItemSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative().nullable(),
  total: z.number().nonnegative(),
  direction: lineDirectionSchema,
});
export type ExtractedLineItem = z.infer<typeof extractedLineItemSchema>;

export const extractedTransactionSchema = z.object({
  date: z.iso.date(),
  amount: z.number().nonnegative(),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .nullable(),
  kind: transactionKindSchema,
  category: transactionCategorySchema,
  counterparty: z.string().max(200).nullable(),
  lineItems: z.array(extractedLineItemSchema),
  confidence: z.object({
    date: confidenceSchema,
    amount: confidenceSchema,
    kind: confidenceSchema,
  }),
});
export type ExtractedTransaction = z.infer<typeof extractedTransactionSchema>;

export const extractedDocumentSchema = z.object({
  transactions: z.array(extractedTransactionSchema),
});
export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>;

export const groupByValues = ['week', 'month'] as const;
export const groupBySchema = z.enum(groupByValues);

export const recordsQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  kind: transactionKindSchema.optional(),
  category: transactionCategorySchema.optional(),
  product: z.string().trim().min(1).max(200).optional(),
  fileId: z.uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type RecordsQuery = z.infer<typeof recordsQuerySchema>;

export const recordsPageSchema = z.object({
  items: z.array(transactionSchema),
  nextCursor: z.string().nullable(),
});
export type RecordsPage = z.infer<typeof recordsPageSchema>;

export const totalsQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  groupBy: groupBySchema,
  kind: transactionKindSchema.optional(),
  category: transactionCategorySchema.optional(),
});
export type TotalsQuery = z.infer<typeof totalsQuerySchema>;

export const totalsRowSchema = z.object({
  bucketStart: z.iso.date(),
  kind: transactionKindSchema,
  category: transactionCategorySchema,
  totalMinor: z.number().int(),
  confirmedMinor: z.number().int(),
  unconfirmedMinor: z.number().int(),
  currency: z.string().length(3),
});
export type TotalsRow = z.infer<typeof totalsRowSchema>;

export const productsQuerySchema = z.object({
  direction: lineDirectionSchema,
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Keep only the products with the largest totals. */
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ProductsQuery = z.infer<typeof productsQuerySchema>;

export const productRowSchema = z.object({
  productName: z.string(),
  quantity: z.number(),
  totalMinor: z.number().int(),
  currency: z.string().length(3),
});
export type ProductRow = z.infer<typeof productRowSchema>;

export const duplicateStatuses = ['pending', 'kept_both', 'merged'] as const;
export const duplicateCandidateSchema = z.object({
  id: z.uuid(),
  status: z.enum(duplicateStatuses),
  a: transactionSchema,
  b: transactionSchema,
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;

export const resolveDuplicateSchema = z
  .object({
    action: z.enum(['keep_both', 'merge']),
    keepTransactionId: z.uuid().optional(),
  })
  .refine((value) => value.action !== 'merge' || !!value.keepTransactionId, {
    message: 'keepTransactionId is required to merge',
    path: ['keepTransactionId'],
  });
export type ResolveDuplicate = z.infer<typeof resolveDuplicateSchema>;
