import { z } from 'zod';
import { toleranceMinor } from './consistency';
import type { TotalsRow, TransactionCategory } from './records';
import {
  addDays,
  bucketStartOf,
  type Bucket,
  type WeekStart,
} from './dashboard';
import { consistencySchema, type Consistency } from './document-types';
import {
  employeeKey as normalizeName,
  type BankStatementDetails,
  type CommercialDetails,
  type PayrollDetails,
  type SalesReportDetails,
} from './documents';

const currencySchema = z.string().length(3);
const minor = z.number().int().nonnegative();

// ----------------------------------------------------------- bank statements

export const bankStatementRowSchema = z.object({
  documentId: z.uuid(),
  fileId: z.uuid(),
  accountIdentifier: z.string().nullable(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  openingBalanceMinor: z.number().int(),
  closingBalanceMinor: z.number().int(),
  totalDepositsMinor: minor,
  totalWithdrawalsMinor: minor,
  totalFeesMinor: minor,
  netChangeMinor: z.number().int(),
  consistency: consistencySchema,
  notes: z.string().nullable(),
});

export const bankGapSchema = z.object({
  kind: z.enum(['balance', 'missing_period']),
  accountIdentifier: z.string().nullable(),
  afterDocumentId: z.uuid(),
  beforeDocumentId: z.uuid(),
  closingBalanceMinor: z.number().int().nullable(),
  openingBalanceMinor: z.number().int().nullable(),
  missingFrom: z.iso.date().nullable(),
  missingTo: z.iso.date().nullable(),
});

export const bankStatementsViewSchema = z.object({
  currency: currencySchema,
  statements: z.array(bankStatementRowSchema),
  balanceSeries: z.array(
    z.object({
      date: z.iso.date(),
      balanceMinor: z.number().int(),
      accountIdentifier: z.string().nullable(),
    }),
  ),
  flows: z.array(
    z.object({
      periodStart: z.iso.date(),
      depositsMinor: minor,
      withdrawalsMinor: minor,
    }),
  ),
  gaps: z.array(bankGapSchema),
});
export type BankStatementsView = z.infer<typeof bankStatementsViewSchema>;
export type BankGap = z.infer<typeof bankGapSchema>;

/** A bank statement document as stored (figures already validated). */
export interface BankStatementDocument {
  documentId: string;
  fileId: string;
  currency: string;
  periodStart: string | null;
  periodEnd: string;
  details: BankStatementDetails;
  consistency: Consistency;
  notes: string | null;
}

const accountKey = (identifier: string | null) =>
  (identifier ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Builds the bank statements view, one entry per currency: rows ordered by period, the balance
 * over time, deposits and withdrawals per month, and the continuity gaps between consecutive
 * statements of the same account (an opening balance that differs from the previous closing
 * balance, or days with no statement in between).
 */
export function buildBankStatementsView(
  documents: BankStatementDocument[],
): BankStatementsView[] {
  const currencies = [...new Set(documents.map((d) => d.currency))].sort();

  return currencies.map((currency) => {
    const own = documents
      .filter((d) => d.currency === currency)
      .sort(
        (a, b) =>
          a.periodEnd.localeCompare(b.periodEnd) ||
          (a.periodStart ?? '').localeCompare(b.periodStart ?? ''),
      );

    const statements = own.map((d) => ({
      documentId: d.documentId,
      fileId: d.fileId,
      accountIdentifier: d.details.accountIdentifier,
      periodStart: d.periodStart ?? d.periodEnd,
      periodEnd: d.periodEnd,
      openingBalanceMinor: d.details.openingBalanceMinor,
      closingBalanceMinor: d.details.closingBalanceMinor,
      totalDepositsMinor: d.details.totalDepositsMinor,
      totalWithdrawalsMinor: d.details.totalWithdrawalsMinor,
      totalFeesMinor: d.details.totalFeesMinor,
      netChangeMinor:
        d.details.closingBalanceMinor - d.details.openingBalanceMinor,
      consistency: d.consistency,
      notes: d.notes,
    }));

    const balanceSeries = own.map((d) => ({
      date: d.periodEnd,
      balanceMinor: d.details.closingBalanceMinor,
      accountIdentifier: d.details.accountIdentifier,
    }));

    const months = new Map<
      string,
      { depositsMinor: number; withdrawalsMinor: number }
    >();
    for (const d of own) {
      const month = `${d.periodEnd.slice(0, 7)}-01`;
      const current = months.get(month) ?? {
        depositsMinor: 0,
        withdrawalsMinor: 0,
      };
      current.depositsMinor += d.details.totalDepositsMinor;
      current.withdrawalsMinor += d.details.totalWithdrawalsMinor;
      months.set(month, current);
    }
    const flows = [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodStart, flow]) => ({ periodStart, ...flow }));

    const gaps: BankGap[] = [];
    const byAccount = new Map<string, BankStatementDocument[]>();
    for (const d of own) {
      const key = accountKey(d.details.accountIdentifier);
      byAccount.set(key, [...(byAccount.get(key) ?? []), d]);
    }
    for (const list of byAccount.values()) {
      for (let i = 1; i < list.length; i++) {
        const before = list[i - 1];
        const after = list[i];
        const closing = before.details.closingBalanceMinor;
        const opening = after.details.openingBalanceMinor;
        if (
          Math.abs(opening - closing) >
          toleranceMinor(Math.max(Math.abs(opening), Math.abs(closing)))
        ) {
          gaps.push({
            kind: 'balance',
            accountIdentifier: after.details.accountIdentifier,
            afterDocumentId: before.documentId,
            beforeDocumentId: after.documentId,
            closingBalanceMinor: closing,
            openingBalanceMinor: opening,
            missingFrom: null,
            missingTo: null,
          });
        }
        const expectedStart = addDays(before.periodEnd, 1);
        if (after.periodStart && after.periodStart > expectedStart) {
          gaps.push({
            kind: 'missing_period',
            accountIdentifier: after.details.accountIdentifier,
            afterDocumentId: before.documentId,
            beforeDocumentId: after.documentId,
            closingBalanceMinor: null,
            openingBalanceMinor: null,
            missingFrom: expectedStart,
            missingTo: addDays(after.periodStart, -1),
          });
        }
      }
    }

    return { currency, statements, balanceSeries, flows, gaps };
  });
}

// ------------------------------------------------------------------ payroll

export const payrollPeriodSchema = z.object({
  documentId: z.uuid(),
  fileId: z.uuid(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  employees: z.number().int().nonnegative(),
  grossMinor: minor,
  netMinor: minor,
  deductionsMinor: minor,
  /** Employer total cost when the document states it, otherwise the gross total. */
  totalCostMinor: minor,
  consistency: consistencySchema,
});

export const payrollViewSchema = z.object({
  currency: currencySchema,
  periods: z.array(payrollPeriodSchema),
});
export type PayrollView = z.infer<typeof payrollViewSchema>;

export const payrollLineViewSchema = z.object({
  employeeKey: z.string(),
  employeeName: z.string(),
  grossMinor: minor,
  deductionsMinor: minor,
  netMinor: minor,
});
export type PayrollLineView = z.infer<typeof payrollLineViewSchema>;

export const employeeHistorySchema = z.object({
  employeeKey: z.string(),
  employeeName: z.string(),
  history: z.array(
    z.object({
      documentId: z.uuid(),
      periodStart: z.iso.date(),
      periodEnd: z.iso.date(),
      currency: currencySchema,
      grossMinor: minor,
      deductionsMinor: minor,
      netMinor: minor,
    }),
  ),
});
export type EmployeeHistory = z.infer<typeof employeeHistorySchema>;

/** A payroll document as stored (figures already validated). */
export interface PayrollDocument {
  documentId: string;
  fileId: string;
  currency: string;
  periodStart: string | null;
  periodEnd: string;
  details: PayrollDetails;
  consistency: Consistency;
}

/** The total cost of a payroll: the employer cost when stated, otherwise the gross total. */
export const payrollTotalCost = (d: PayrollDetails): number =>
  d.employerTotalCostMinor ?? d.grossTotalMinor;

/** Pay periods per currency, oldest first. */
export function buildPayrollView(documents: PayrollDocument[]): PayrollView[] {
  const currencies = [...new Set(documents.map((d) => d.currency))].sort();
  return currencies.map((currency) => ({
    currency,
    periods: documents
      .filter((d) => d.currency === currency)
      .sort(
        (a, b) =>
          a.periodEnd.localeCompare(b.periodEnd) ||
          (a.periodStart ?? '').localeCompare(b.periodStart ?? ''),
      )
      .map((d) => ({
        documentId: d.documentId,
        fileId: d.fileId,
        periodStart: d.periodStart ?? d.periodEnd,
        periodEnd: d.periodEnd,
        employees: d.details.employeeCount,
        grossMinor: d.details.grossTotalMinor,
        netMinor: d.details.netTotalMinor,
        deductionsMinor: d.details.deductionsTotalMinor,
        totalCostMinor: payrollTotalCost(d.details),
        consistency: d.consistency,
      })),
  }));
}

export interface EmployeePayEntry {
  employeeKey: string;
  employeeName: string;
  documentId: string;
  currency: string;
  periodStart: string | null;
  periodEnd: string;
  grossMinor: number;
  deductionsMinor: number;
  netMinor: number;
}

/**
 * The pay history of one employee, oldest first. People are matched only by `employeeKey`
 * (case, accents and punctuation ignored); the name shown is the one of the latest period.
 */
export function buildEmployeeHistory(
  entries: EmployeePayEntry[],
): EmployeeHistory | null {
  if (entries.length === 0) return null;
  const ordered = [...entries].sort((a, b) =>
    a.periodEnd.localeCompare(b.periodEnd),
  );
  const latest = ordered[ordered.length - 1];
  return {
    employeeKey: latest.employeeKey,
    employeeName: latest.employeeName,
    history: ordered.map((e) => ({
      documentId: e.documentId,
      periodStart: e.periodStart ?? e.periodEnd,
      periodEnd: e.periodEnd,
      currency: e.currency,
      grossMinor: e.grossMinor,
      deductionsMinor: e.deductionsMinor,
      netMinor: e.netMinor,
    })),
  };
}

// -------------------------------------------------------------------- losses

export interface ResultPeriod {
  bucketStart: string;
  incomeMinor: number;
  expensesMinor: number;
  /** income - expenses; negative in a loss */
  netMinor: number;
  /** expenses greater than income */
  isLoss: boolean;
  /** The three biggest expense categories of the period, largest first. */
  topExpenseCategories: { category: TransactionCategory; totalMinor: number }[];
  /** Running total of `netMinor` from the first period of the range. */
  cumulativeNetMinor: number;
  unconfirmedMinor: number;
}

export interface ResultsAnalysis {
  currency: string;
  periods: ResultPeriod[];
  totalIncomeMinor: number;
  totalExpensesMinor: number;
  totalNetMinor: number;
  losingPeriods: number;
  /** The biggest shortfall of a single period (expenses - income), 0 without losses. */
  largestLossMinor: number;
}

const TOP_CATEGORIES = 3;

/**
 * Finds the periods where expenses exceeded income. It works on the rows of
 * `/records/totals` (week or month buckets), so the inclusion rules are exactly those of the
 * rest of the analysis, and currencies are never mixed.
 */
export function analyzeResults(rows: TotalsRow[]): ResultsAnalysis[] {
  const currencies = [...new Set(rows.map((r) => r.currency))].sort();

  return currencies.map((currency) => {
    const own = rows.filter((r) => r.currency === currency);
    const buckets = [...new Set(own.map((r) => r.bucketStart))].sort();

    let cumulative = 0;
    const periods = buckets.map((bucketStart): ResultPeriod => {
      const inBucket = own.filter((r) => r.bucketStart === bucketStart);
      const sum = (list: TotalsRow[]) =>
        list.reduce((acc, r) => acc + r.totalMinor, 0);
      const expenseRows = inBucket.filter((r) => r.kind === 'expense');
      const incomeMinor = sum(inBucket.filter((r) => r.kind === 'income'));
      const expensesMinor = sum(expenseRows);
      const netMinor = incomeMinor - expensesMinor;
      cumulative += netMinor;

      const byCategory = new Map<TransactionCategory, number>();
      for (const row of expenseRows) {
        byCategory.set(
          row.category,
          (byCategory.get(row.category) ?? 0) + row.totalMinor,
        );
      }
      return {
        bucketStart,
        incomeMinor,
        expensesMinor,
        netMinor,
        isLoss: expensesMinor > incomeMinor,
        topExpenseCategories: [...byCategory.entries()]
          .map(([category, totalMinor]) => ({ category, totalMinor }))
          .sort((a, b) => b.totalMinor - a.totalMinor)
          .slice(0, TOP_CATEGORIES),
        cumulativeNetMinor: cumulative,
        unconfirmedMinor: inBucket.reduce(
          (acc, r) => acc + r.unconfirmedMinor,
          0,
        ),
      };
    });

    const losses = periods.filter((p) => p.isLoss);
    return {
      currency,
      periods,
      totalIncomeMinor: periods.reduce((acc, p) => acc + p.incomeMinor, 0),
      totalExpensesMinor: periods.reduce((acc, p) => acc + p.expensesMinor, 0),
      totalNetMinor: cumulative,
      losingPeriods: losses.length,
      largestLossMinor: losses.reduce(
        (max, p) => Math.max(max, -p.netMinor),
        0,
      ),
    };
  });
}

// ------------------------------------------------- invoices and receipts

export const commercialViewSchema = z.object({
  currency: currencySchema,
  kind: z.enum(['invoice', 'receipt']),
  documents: z.number().int().nonnegative(),
  totalMinor: minor,
  taxMinor: minor,
  paidMinor: minor,
  pendingMinor: minor,
  topCounterparties: z.array(
    z.object({
      counterparty: z.string(),
      totalMinor: minor,
      documents: z.number().int().positive(),
    }),
  ),
});
export type CommercialView = z.infer<typeof commercialViewSchema>;

export interface CommercialDocument {
  type: 'invoice' | 'receipt';
  currency: string;
  details: CommercialDetails;
}

const TOP_COUNTERPARTIES = 5;

/** Letters and digits only, no accents or case: "Súper Mercado, S.A." -> "supermercadosa". */
const partyKey = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/**
 * Totals of invoices and receipts, one entry per currency and kind. Taxes count as 0 when a
 * document does not state them; "paid" and "pending" only add documents that say so.
 * Counterparties are grouped ignoring case, accents and punctuation.
 */
export function buildCommercialView(
  documents: CommercialDocument[],
): CommercialView[] {
  const groups = new Map<string, CommercialDocument[]>();
  for (const doc of documents) {
    const key = `${doc.currency}|${doc.type}`;
    groups.set(key, [...(groups.get(key) ?? []), doc]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => {
      const [currency, kind] = key.split('|') as [
        string,
        'invoice' | 'receipt',
      ];
      const sum = (pick: (d: CommercialDocument) => number) =>
        list.reduce((acc, d) => acc + pick(d), 0);

      const byCounterparty = new Map<
        string,
        { name: string; totalMinor: number; documents: number }
      >();
      for (const d of list) {
        const name = d.details.counterparty?.trim();
        if (!name) continue;
        const id = partyKey(name);
        const current = byCounterparty.get(id) ?? {
          name,
          totalMinor: 0,
          documents: 0,
        };
        current.totalMinor += d.details.totalMinor;
        current.documents += 1;
        byCounterparty.set(id, current);
      }

      return {
        currency,
        kind,
        documents: list.length,
        totalMinor: sum((d) => d.details.totalMinor),
        taxMinor: sum((d) => d.details.taxMinor ?? 0),
        paidMinor: sum((d) =>
          d.details.paymentStatus === 'paid' ? d.details.totalMinor : 0,
        ),
        pendingMinor: sum((d) =>
          d.details.paymentStatus === 'pending' ? d.details.totalMinor : 0,
        ),
        topCounterparties: [...byCounterparty.values()]
          .map((c) => ({
            counterparty: c.name,
            totalMinor: c.totalMinor,
            documents: c.documents,
          }))
          .sort((a, b) => b.totalMinor - a.totalMinor)
          .slice(0, TOP_COUNTERPARTIES),
      };
    });
}

// ------------------------------------------------------------- sales reports

export const salesViewSchema = z.object({
  currency: currencySchema,
  totalSalesMinor: minor,
  unitsSold: z.number().nonnegative(),
  /** total sales / transactions, only over reports that state their transaction count */
  averageTicketMinor: z.number().int().nonnegative().nullable(),
  bestProducts: z.array(
    z.object({
      productName: z.string(),
      quantity: z.number(),
      totalMinor: z.number().int(),
    }),
  ),
  series: z.array(z.object({ bucketStart: z.iso.date(), totalMinor: minor })),
});
export type SalesView = z.infer<typeof salesViewSchema>;

export interface SalesInput {
  documents: { currency: string; details: SalesReportDetails }[];
  products: {
    currency: string;
    productName: string;
    quantity: number;
    totalMinor: number;
  }[];
  /** Sales per day (or per period) of the reports, as recorded. */
  daily: { currency: string; date: string; totalMinor: number }[];
  bucket: Bucket;
  weekStart: WeekStart;
}

const BEST_PRODUCTS = 5;

/** Sales report metrics per currency. */
export function buildSalesView(input: SalesInput): SalesView[] {
  const currencies = [
    ...new Set(input.documents.map((d) => d.currency)),
  ].sort();
  return currencies.map((currency) => {
    const docs = input.documents.filter((d) => d.currency === currency);
    const totalSalesMinor = docs.reduce(
      (acc, d) => acc + d.details.totalSalesMinor,
      0,
    );
    const withCount = docs.filter((d) => (d.details.transactionCount ?? 0) > 0);
    const tickets = withCount.reduce(
      (acc, d) => acc + (d.details.transactionCount ?? 0),
      0,
    );

    const byProduct = new Map<
      string,
      { productName: string; quantity: number; totalMinor: number }
    >();
    for (const p of input.products.filter((x) => x.currency === currency)) {
      const id = normalizeName(p.productName);
      const current = byProduct.get(id) ?? {
        productName: p.productName,
        quantity: 0,
        totalMinor: 0,
      };
      current.quantity += p.quantity;
      current.totalMinor += p.totalMinor;
      byProduct.set(id, current);
    }

    const buckets = new Map<string, number>();
    for (const row of input.daily.filter((x) => x.currency === currency)) {
      const start = bucketStartOf(row.date, input.bucket, input.weekStart);
      buckets.set(start, (buckets.get(start) ?? 0) + row.totalMinor);
    }

    return {
      currency,
      totalSalesMinor,
      unitsSold: docs.reduce((acc, d) => acc + (d.details.unitsSold ?? 0), 0),
      averageTicketMinor:
        tickets > 0
          ? Math.round(
              withCount.reduce((acc, d) => acc + d.details.totalSalesMinor, 0) /
                tickets,
            )
          : null,
      bestProducts: [...byProduct.values()]
        .sort((a, b) => b.totalMinor - a.totalMinor)
        .slice(0, BEST_PRODUCTS),
      series: [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bucketStart, totalMinor]) => ({ bucketStart, totalMinor })),
    };
  });
}
