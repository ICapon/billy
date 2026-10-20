import type {
  ExtractedLogicalDocument,
  ExtractedTransaction,
  ExtractionOutput,
} from '@org/shared';

/** Builders of valid model answers, shared by the extraction tests. */
export const sampleTransaction = (
  overrides: Partial<ExtractedTransaction> = {},
): ExtractedTransaction => ({
  date: '2026-10-12',
  amount: 42.5,
  currency: null,
  kind: 'expense',
  category: 'supplies',
  counterparty: 'Mayorista',
  lineItems: [
    {
      productName: 'Harina',
      quantity: 5,
      unitPrice: 8.5,
      total: 42.5,
      direction: 'purchase',
    },
  ],
  confidence: { date: 0.95, amount: 0.96, kind: 0.99 },
  ...overrides,
});

const common = {
  typeConfidence: 0.95,
  periodStart: null,
  periodEnd: null,
  issueDate: '2026-10-12',
  currency: null,
};

export const receiptDoc = (
  transactions: ExtractedTransaction[] = [sampleTransaction()],
  overrides: Record<string, unknown> = {},
): ExtractedLogicalDocument =>
  ({
    ...common,
    type: 'receipt',
    transactions,
    commercial: {
      counterparty: 'Mayorista',
      subtotal: null,
      tax: null,
      total: transactions.reduce((acc, t) => acc + t.amount, 0),
      paymentStatus: 'paid',
    },
    ...overrides,
  }) as ExtractedLogicalDocument;

export const bankStatementDoc = (
  overrides: Record<string, unknown> = {},
  statement: Record<string, unknown> = {},
): ExtractedLogicalDocument =>
  ({
    ...common,
    type: 'bank_statement',
    issueDate: null,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    transactions: [],
    bankStatement: {
      accountIdentifier: '****1234',
      openingBalance: 1000,
      closingBalance: 1450,
      totalDeposits: 800,
      totalWithdrawals: 345,
      totalFees: 5,
      ...statement,
    },
    ...overrides,
  }) as ExtractedLogicalDocument;

export const payrollDoc = (
  overrides: Record<string, unknown> = {},
  payroll: Record<string, unknown> = {},
): ExtractedLogicalDocument =>
  ({
    ...common,
    type: 'payroll',
    issueDate: null,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    transactions: [],
    payroll: {
      grossTotal: 3000,
      deductionsTotal: 600,
      netTotal: 2400,
      employerTotalCost: null,
      employees: [
        { name: 'Ana López', gross: 2000, deductions: 400, net: 1600 },
        { name: 'Beto Ruiz', gross: 1000, deductions: 200, net: 800 },
      ],
      ...payroll,
    },
    ...overrides,
  }) as ExtractedLogicalDocument;

export const salesReportDoc = (
  transactions: ExtractedTransaction[] = [
    sampleTransaction({
      kind: 'income',
      category: 'sales',
      amount: 100,
      lineItems: [],
    }),
  ],
  overrides: Record<string, unknown> = {},
): ExtractedLogicalDocument =>
  ({
    ...common,
    type: 'sales_report',
    issueDate: null,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-12',
    transactions,
    salesReport: {
      totalSales: transactions.reduce((acc, t) => acc + t.amount, 0),
      unitsSold: 20,
      transactionCount: 8,
    },
    ...overrides,
  }) as ExtractedLogicalDocument;

export const otherDoc = (
  transactions: ExtractedTransaction[] = [sampleTransaction({ lineItems: [] })],
  overrides: Record<string, unknown> = {},
): ExtractedLogicalDocument =>
  ({
    ...common,
    type: 'other',
    transactions,
    ...overrides,
  }) as ExtractedLogicalDocument;

export const extraction = (
  ...documents: ExtractedLogicalDocument[]
): ExtractionOutput => ({
  documents,
});
