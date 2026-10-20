import {
  checkBankStatement,
  checkCommercial,
  checkPayroll,
  checkSalesReport,
  employeeKey,
  type ConsistencyResult,
  type ExtractedLogicalDocument,
  type ExtractionOutput,
} from '@org/shared';
import { toMinorUnits, toRecord } from './money';
import type { ExtractedRecord, StoredDocument } from './types';

const unchecked: ConsistencyResult = { state: 'unchecked', notes: [] };

const latest = (dates: string[]): string | null =>
  dates.length === 0 ? null : dates.reduce((a, b) => (a > b ? a : b));

/** Never assumes a period silently: a missing end falls back to the data, then to today. */
function resolvePeriod(
  doc: ExtractedLogicalDocument,
  today: Date,
): { periodEnd: string; guessed: boolean } {
  if (doc.periodEnd) return { periodEnd: doc.periodEnd, guessed: false };
  const fallback =
    latest(doc.transactions.map((t) => t.date)) ??
    doc.issueDate ??
    today.toISOString().slice(0, 10);
  return { periodEnd: fallback, guessed: true };
}

/**
 * Converts what the model returned into what is stored: details in minor units, payroll lines,
 * the consistency state of each document and the ordinary records (including the payroll
 * `staff` expense, so the staff total always matches the payroll view).
 */
export function buildStoredDocuments(
  output: ExtractionOutput,
  context: { currency: string; today: Date },
): StoredDocument[] {
  return output.documents.map((doc) => {
    const currency = (doc.currency ?? context.currency).toUpperCase();
    const { periodEnd, guessed } = resolvePeriod(doc, context.today);
    const records: ExtractedRecord[] = doc.transactions.map((t) =>
      toRecord(t, currency),
    );
    const notes: string[] =
      guessed &&
      doc.type !== 'other' &&
      doc.type !== 'invoice' &&
      doc.type !== 'receipt'
        ? ['The period of the document was not found']
        : [];

    let details: Record<string, unknown> = {};
    let payrollLines: StoredDocument['payrollLines'] = [];
    let check: ConsistencyResult = unchecked;

    switch (doc.type) {
      case 'bank_statement': {
        const b = doc.bankStatement;
        const d = {
          accountIdentifier: b.accountIdentifier,
          openingBalanceMinor: toMinorUnits(b.openingBalance),
          closingBalanceMinor: toMinorUnits(b.closingBalance),
          totalDepositsMinor: toMinorUnits(b.totalDeposits),
          totalWithdrawalsMinor: toMinorUnits(b.totalWithdrawals),
          totalFeesMinor: toMinorUnits(b.totalFees),
        };
        details = d;
        check = checkBankStatement(d);
        break;
      }
      case 'payroll': {
        const p = doc.payroll;
        payrollLines = p.employees.map((e) => ({
          employeeName: e.name,
          employeeKey: employeeKey(e.name),
          grossMinor: toMinorUnits(e.gross),
          deductionsMinor: toMinorUnits(e.deductions),
          netMinor: toMinorUnits(e.net),
        }));
        const sum = (
          pick: (l: StoredDocument['payrollLines'][number]) => number,
        ) => payrollLines.reduce((acc, l) => acc + pick(l), 0);
        // Totals the model could not read are rebuilt from the employee lines.
        const d = {
          grossTotalMinor:
            toMinorUnits(p.grossTotal) || sum((l) => l.grossMinor),
          deductionsTotalMinor:
            toMinorUnits(p.deductionsTotal) || sum((l) => l.deductionsMinor),
          netTotalMinor: toMinorUnits(p.netTotal) || sum((l) => l.netMinor),
          employerTotalCostMinor:
            p.employerTotalCost === null
              ? null
              : toMinorUnits(p.employerTotalCost),
          employeeCount: payrollLines.length,
        };
        details = d;
        check = checkPayroll(d, payrollLines);
        const cost = d.employerTotalCostMinor ?? d.grossTotalMinor;
        if (cost > 0) {
          records.push({
            occurredOn: periodEnd,
            amountMinor: cost,
            currency,
            kind: 'expense',
            category: 'staff',
            counterparty: null,
            confidence: Math.round(doc.typeConfidence * 100) / 100,
            lineItems: [],
          });
        }
        break;
      }
      case 'invoice':
      case 'receipt': {
        const c = doc.commercial;
        const d = {
          counterparty: c.counterparty,
          subtotalMinor: c.subtotal === null ? null : toMinorUnits(c.subtotal),
          taxMinor: c.tax === null ? null : toMinorUnits(c.tax),
          totalMinor: toMinorUnits(c.total),
          paymentStatus: c.paymentStatus,
        };
        details = d;
        check = checkCommercial(d);
        break;
      }
      case 'sales_report': {
        const s = doc.salesReport;
        const d = {
          totalSalesMinor: toMinorUnits(s.totalSales),
          unitsSold: s.unitsSold,
          transactionCount: s.transactionCount,
        };
        details = d;
        const listed = records
          .filter((r) => r.kind === 'income')
          .reduce((acc, r) => acc + r.amountMinor, 0);
        check = checkSalesReport(d, records.length > 1 ? listed : null);
        break;
      }
      default:
        break;
    }

    const allNotes = [...notes, ...check.notes];
    return {
      type: doc.type,
      typeConfidence: Math.round(doc.typeConfidence * 100) / 100,
      periodStart: doc.periodStart,
      periodEnd,
      issueDate: doc.issueDate,
      currency,
      consistency:
        check.state === 'inconsistent' || notes.length > 0
          ? 'inconsistent'
          : check.state,
      consistencyNotes: allNotes.length > 0 ? allNotes.join('; ') : null,
      details,
      payrollLines,
      records,
    };
  });
}
