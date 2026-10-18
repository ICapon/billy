import type { ExtractedTransaction } from '@org/shared';
import { recordConfidence, toMinorUnits, toRecord } from './money';

const transaction: ExtractedTransaction = {
  date: '2026-10-12',
  amount: 12.5,
  currency: null,
  kind: 'expense',
  category: 'supplies',
  counterparty: '  Mayorista  ',
  lineItems: [
    {
      productName: 'Harina',
      quantity: 2,
      unitPrice: 6.25,
      total: 12.5,
      direction: 'purchase',
    },
  ],
  confidence: { date: 0.9, amount: 0.6, kind: 0.95 },
};

describe('money helpers', () => {
  it('converts major to minor units without float drift', () => {
    expect(toMinorUnits(12.5)).toBe(1250);
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
    expect(toMinorUnits(19.99)).toBe(1999);
  });

  it('uses the weakest critical field as the record confidence', () => {
    expect(recordConfidence(transaction)).toBe(0.6);
  });

  it('builds a record with the fallback currency and trimmed counterparty', () => {
    const record = toRecord(transaction, 'usd');
    expect(record.currency).toBe('USD');
    expect(record.amountMinor).toBe(1250);
    expect(record.counterparty).toBe('Mayorista');
    expect(record.lineItems[0]).toMatchObject({
      unitPriceMinor: 625,
      totalMinor: 1250,
    });
    expect(toRecord({ ...transaction, currency: 'eur' }, 'USD').currency).toBe(
      'EUR',
    );
  });
});
