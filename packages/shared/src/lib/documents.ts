import { z } from 'zod';
import type { DocumentType } from './document-types';
import { extractedTransactionSchema } from './records';

/** Types whose figures are read from the document and checked against each other. */
export const typedDocumentTypes = [
  'bank_statement',
  'payroll',
  'invoice',
  'receipt',
  'sales_report',
] as const;

export const paymentStatuses = ['paid', 'pending', 'unknown'] as const;
export const paymentStatusSchema = z.enum(paymentStatuses);

const minor = z.number().int().nonnegative();
/** Balances can be negative (overdraft). */
const signedMinor = z.number().int();

// ------------------------------------------------- stored details (minor units)

export const bankStatementDetailsSchema = z.object({
  accountIdentifier: z.string().max(100).nullable(),
  openingBalanceMinor: signedMinor,
  closingBalanceMinor: signedMinor,
  totalDepositsMinor: minor,
  totalWithdrawalsMinor: minor,
  totalFeesMinor: minor.default(0),
});
export type BankStatementDetails = z.infer<typeof bankStatementDetailsSchema>;

export const payrollDetailsSchema = z.object({
  grossTotalMinor: minor,
  deductionsTotalMinor: minor,
  netTotalMinor: minor,
  employerTotalCostMinor: minor.nullable(),
  employeeCount: z.number().int().nonnegative(),
});
export type PayrollDetails = z.infer<typeof payrollDetailsSchema>;

export const commercialDetailsSchema = z.object({
  counterparty: z.string().max(200).nullable(),
  subtotalMinor: minor.nullable(),
  taxMinor: minor.nullable(),
  totalMinor: minor,
  paymentStatus: paymentStatusSchema,
});
export type CommercialDetails = z.infer<typeof commercialDetailsSchema>;

export const salesReportDetailsSchema = z.object({
  totalSalesMinor: minor,
  unitsSold: z.number().nonnegative().nullable(),
  transactionCount: z.number().int().nonnegative().nullable(),
});
export type SalesReportDetails = z.infer<typeof salesReportDetailsSchema>;

/** Validates the stored `details` JSON of a document of the given type. */
export function parseDetails(type: DocumentType, details: unknown) {
  switch (type) {
    case 'bank_statement':
      return bankStatementDetailsSchema.safeParse(details);
    case 'payroll':
      return payrollDetailsSchema.safeParse(details);
    case 'invoice':
    case 'receipt':
      return commercialDetailsSchema.safeParse(details);
    case 'sales_report':
      return salesReportDetailsSchema.safeParse(details);
    default:
      return z.object({}).safeParse(details);
  }
}

// ------------------------------------------------ LLM extraction output (decimals)

const money = z.number().nonnegative();
const confidence = z.number().min(0).max(1);
const isoDateOrNull = z.iso.date().nullable();
const currencyOrNull = z
  .string()
  .regex(/^[A-Za-z]{3}$/)
  .nullable();

export const extractedBankStatementSchema = z.object({
  accountIdentifier: z.string().max(100).nullable(),
  openingBalance: z.number(),
  closingBalance: z.number(),
  totalDeposits: money,
  totalWithdrawals: money,
  totalFees: money,
});

export const extractedPayrollSchema = z.object({
  grossTotal: money,
  deductionsTotal: money,
  netTotal: money,
  employerTotalCost: money.nullable(),
  employees: z.array(
    z.object({
      name: z.string().trim().min(1).max(200),
      gross: money,
      deductions: money,
      net: money,
    }),
  ),
});

export const extractedCommercialSchema = z.object({
  counterparty: z.string().max(200).nullable(),
  subtotal: money.nullable(),
  tax: money.nullable(),
  total: money,
  paymentStatus: paymentStatusSchema,
});

export const extractedSalesReportSchema = z.object({
  totalSales: money,
  unitsSold: z.number().nonnegative().nullable(),
  transactionCount: z.number().int().nonnegative().nullable(),
});

const base = {
  typeConfidence: confidence,
  periodStart: isoDateOrNull,
  periodEnd: isoDateOrNull,
  issueDate: isoDateOrNull,
  currency: currencyOrNull,
  transactions: z.array(extractedTransactionSchema),
};

/** One logical document found in a file. The detail block must match `type`. */
export const extractedLogicalDocumentSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('bank_statement'),
    bankStatement: extractedBankStatementSchema,
  }),
  z.object({
    ...base,
    type: z.literal('payroll'),
    payroll: extractedPayrollSchema,
  }),
  z.object({
    ...base,
    type: z.literal('invoice'),
    commercial: extractedCommercialSchema,
  }),
  z.object({
    ...base,
    type: z.literal('receipt'),
    commercial: extractedCommercialSchema,
  }),
  z.object({
    ...base,
    type: z.literal('sales_report'),
    salesReport: extractedSalesReportSchema,
  }),
  z.object({ ...base, type: z.literal('other') }),
]);
export type ExtractedLogicalDocument = z.infer<
  typeof extractedLogicalDocumentSchema
>;

/** Output contract of the extraction call: a file can hold several documents. */
export const extractionOutputSchema = z.object({
  documents: z.array(extractedLogicalDocumentSchema),
});
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

// -------------------------------------------------------------- employees

/** Lower case, no accents or punctuation, collapsed spaces: "José  Pérez." -> "jose perez". */
export function employeeKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
