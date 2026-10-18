import type { TransactionWithItems } from '@org/db';
import type { Transaction, TransactionCategory } from '@org/shared';

export function toTransaction(row: TransactionWithItems): Transaction {
  return {
    id: row.id,
    fileId: row.fileId,
    occurredOn: row.occurredOn,
    amountMinor: row.amountMinor,
    currency: row.currency,
    kind: row.kind,
    category: row.category as TransactionCategory,
    isStaff: row.isStaff,
    counterparty: row.counterparty,
    confidence: row.confidence,
    confirmed: row.confirmed,
    excludedReason: row.excludedReason,
    lineItems: row.lineItems.map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      totalMinor: item.totalMinor,
      direction: item.direction,
    })),
  };
}
