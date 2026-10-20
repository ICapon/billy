import type { Consistency } from './document-types';
import type {
  BankStatementDetails,
  CommercialDetails,
  PayrollDetails,
  SalesReportDetails,
} from './documents';

export interface ConsistencyResult {
  state: Consistency;
  /** Human readable reasons. Never contains employee names. */
  notes: string[];
}

/** The larger of 0.01 and 1% of the reference, in minor units. */
export function toleranceMinor(reference: number): number {
  return Math.max(1, Math.round(Math.abs(reference) * 0.01));
}

const close = (
  a: number,
  b: number,
  reference = Math.max(Math.abs(a), Math.abs(b)),
) => Math.abs(a - b) <= toleranceMinor(reference);

const money = (minor: number) => (minor / 100).toFixed(2);

const result = (notes: string[]): ConsistencyResult => ({
  state: notes.length === 0 ? 'ok' : 'inconsistent',
  notes,
});

/**
 * opening + deposits - withdrawals - fees = closing. Banks differ on whether the fees are
 * already inside the withdrawals, so a statement that balances either way is accepted.
 */
export function checkBankStatement(d: BankStatementDetails): ConsistencyResult {
  const withFees =
    d.openingBalanceMinor +
    d.totalDepositsMinor -
    d.totalWithdrawalsMinor -
    d.totalFeesMinor;
  const feesIncluded =
    d.openingBalanceMinor + d.totalDepositsMinor - d.totalWithdrawalsMinor;
  if (
    close(d.closingBalanceMinor, withFees) ||
    close(d.closingBalanceMinor, feesIncluded)
  ) {
    return result([]);
  }
  return result([
    `Closing balance ${money(d.closingBalanceMinor)} does not match opening ${money(d.openingBalanceMinor)} + deposits ${money(d.totalDepositsMinor)} - withdrawals ${money(d.totalWithdrawalsMinor)} - fees ${money(d.totalFeesMinor)}`,
  ]);
}

export interface PayrollLineAmounts {
  grossMinor: number;
  deductionsMinor: number;
  netMinor: number;
}

/** gross - deductions = net per employee and in total; lines add up to the totals. */
export function checkPayroll(
  d: PayrollDetails,
  lines: PayrollLineAmounts[],
): ConsistencyResult {
  const notes: string[] = [];

  if (
    !close(
      d.grossTotalMinor - d.deductionsTotalMinor,
      d.netTotalMinor,
      d.grossTotalMinor,
    )
  ) {
    notes.push(
      `Total gross ${money(d.grossTotalMinor)} - deductions ${money(d.deductionsTotalMinor)} does not equal net ${money(d.netTotalMinor)}`,
    );
  }
  const badLines = lines.filter(
    (l) => !close(l.grossMinor - l.deductionsMinor, l.netMinor, l.grossMinor),
  ).length;
  if (badLines > 0) {
    notes.push(
      `${badLines} employee line(s) where gross - deductions does not equal net`,
    );
  }
  if (lines.length > 0) {
    const sum = (pick: (l: PayrollLineAmounts) => number) =>
      lines.reduce((acc, l) => acc + pick(l), 0);
    if (
      !close(
        sum((l) => l.grossMinor),
        d.grossTotalMinor,
      )
    ) {
      notes.push(
        `Employee gross amounts add up to ${money(sum((l) => l.grossMinor))} but the total is ${money(d.grossTotalMinor)}`,
      );
    }
    if (
      !close(
        sum((l) => l.netMinor),
        d.netTotalMinor,
      )
    ) {
      notes.push(
        `Employee net amounts add up to ${money(sum((l) => l.netMinor))} but the total is ${money(d.netTotalMinor)}`,
      );
    }
  }
  if (
    d.employerTotalCostMinor !== null &&
    d.employerTotalCostMinor + toleranceMinor(d.grossTotalMinor) <
      d.grossTotalMinor
  ) {
    notes.push(
      `Employer total cost ${money(d.employerTotalCostMinor)} is below the gross total ${money(d.grossTotalMinor)}`,
    );
  }
  return result(notes);
}

/** subtotal + tax = total when the three are stated. */
export function checkCommercial(d: CommercialDetails): ConsistencyResult {
  if (d.subtotalMinor === null || d.taxMinor === null) return result([]);
  if (close(d.subtotalMinor + d.taxMinor, d.totalMinor)) return result([]);
  return result([
    `Subtotal ${money(d.subtotalMinor)} + tax ${money(d.taxMinor)} does not equal total ${money(d.totalMinor)}`,
  ]);
}

/** The listed days or products (when there are any) add up to the stated total. */
export function checkSalesReport(
  d: SalesReportDetails,
  listedTotalMinor: number | null,
): ConsistencyResult {
  if (listedTotalMinor === null || listedTotalMinor === 0) return result([]);
  if (close(listedTotalMinor, d.totalSalesMinor)) return result([]);
  return result([
    `Listed sales add up to ${money(listedTotalMinor)} but the stated total is ${money(d.totalSalesMinor)}`,
  ]);
}
