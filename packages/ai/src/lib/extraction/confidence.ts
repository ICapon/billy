import type { ExtractedDocument } from '@org/shared';
import { recordConfidence } from './money';
import type { FileOutcome } from './types';

export interface Evaluation {
  outcome: FileOutcome;
  /** Lowest record confidence, or null when nothing was extracted. */
  confidence: number | null;
  issues: string[];
}

const EARLIEST_DATE = '2000-01-01';
/** Line items must add up to the document total within this relative tolerance. */
const RECONCILE_TOLERANCE = 0.01;

function addYears(date: Date, years: number): string {
  const copy = new Date(date);
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy.toISOString().slice(0, 10);
}

/**
 * Decides whether a file is trustworthy ("completed") or needs the owner's review.
 * Rule (research R5): every record at or above the minimum confidence, line items that add up
 * to the total within 1%, and dates in a plausible range.
 */
export function evaluateDocument(
  document: ExtractedDocument,
  options: { minRecordConfidence: number; today?: Date },
): Evaluation {
  const today = options.today ?? new Date();
  const latest = addYears(today, 1);
  const issues: string[] = [];

  if (document.transactions.length === 0) {
    return {
      outcome: 'needs_review',
      confidence: null,
      issues: ['No transactions were found in the file'],
    };
  }

  let lowest = 1;
  document.transactions.forEach((transaction, index) => {
    const label = `Record ${index + 1}`;
    const confidence = recordConfidence(transaction);
    lowest = Math.min(lowest, confidence);
    if (confidence < options.minRecordConfidence) {
      issues.push(`${label} has low confidence (${confidence.toFixed(2)})`);
    }
    if (transaction.date < EARLIEST_DATE || transaction.date > latest) {
      issues.push(`${label} has an implausible date (${transaction.date})`);
    }
    if (transaction.lineItems.length > 0 && transaction.amount > 0) {
      const sum = transaction.lineItems.reduce(
        (acc, item) => acc + item.total,
        0,
      );
      const difference = Math.abs(sum - transaction.amount);
      if (
        difference > Math.max(0.01, transaction.amount * RECONCILE_TOLERANCE)
      ) {
        issues.push(
          `${label}: line items add up to ${sum.toFixed(2)} but the total is ${transaction.amount.toFixed(2)}`,
        );
      }
    }
  });

  return {
    outcome: issues.length === 0 ? 'completed' : 'needs_review',
    confidence: Math.round(lowest * 100) / 100,
    issues,
  };
}
