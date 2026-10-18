import type { ExtractedTransaction } from '@org/shared';
import type { ExtractedRecord } from './types';

/** Decimal major units (12.5) to integer minor units (1250). */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/** A record's confidence is the weakest of its critical fields (date, amount, kind). */
export function recordConfidence(transaction: ExtractedTransaction): number {
  const { date, amount, kind } = transaction.confidence;
  return Math.min(date, amount, kind);
}

export function toRecord(
  transaction: ExtractedTransaction,
  fallbackCurrency: string,
): ExtractedRecord {
  return {
    occurredOn: transaction.date,
    amountMinor: toMinorUnits(transaction.amount),
    currency: (transaction.currency ?? fallbackCurrency).toUpperCase(),
    kind: transaction.kind,
    category: transaction.category,
    counterparty: transaction.counterparty?.trim() || null,
    confidence: Math.round(recordConfidence(transaction) * 100) / 100,
    lineItems: transaction.lineItems.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitPriceMinor:
        item.unitPrice === null ? null : toMinorUnits(item.unitPrice),
      totalMinor: toMinorUnits(item.total),
      direction: item.direction,
    })),
  };
}
