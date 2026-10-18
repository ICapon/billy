import {
  extractedDocumentSchema,
  productsQuerySchema,
  recordsQuerySchema,
  resolveDuplicateSchema,
  totalsQuerySchema,
  transactionCategories,
  transactionSchema,
  transactionUpdateSchema,
} from './records';

const ids = {
  a: '3f0e8b4e-7c1a-4d6e-9a53-1f6f5d0c2b11',
  b: '6a1d2c3e-8f90-4abc-b123-0e9f8d7c6b5a',
};

const validTransaction = {
  id: ids.a,
  fileId: ids.b,
  occurredOn: '2026-10-12',
  amountMinor: 12500,
  currency: 'USD',
  kind: 'expense',
  category: 'staff',
  isStaff: true,
  counterparty: 'Ana López',
  confidence: 0.92,
  confirmed: false,
  excludedReason: null,
  lineItems: [],
};

describe('transactionSchema', () => {
  it('accepts a valid transaction', () => {
    expect(transactionSchema.safeParse(validTransaction).success).toBe(true);
  });

  it('rejects negative amounts and non-integer minor units', () => {
    expect(
      transactionSchema.safeParse({ ...validTransaction, amountMinor: -1 })
        .success,
    ).toBe(false);
    expect(
      transactionSchema.safeParse({ ...validTransaction, amountMinor: 1.5 })
        .success,
    ).toBe(false);
  });

  it('rejects bad dates, currencies and categories', () => {
    expect(
      transactionSchema.safeParse({
        ...validTransaction,
        occurredOn: '12/10/2026',
      }).success,
    ).toBe(false);
    expect(
      transactionSchema.safeParse({ ...validTransaction, currency: 'usd' })
        .success,
    ).toBe(false);
    expect(
      transactionSchema.safeParse({ ...validTransaction, category: 'pizza' })
        .success,
    ).toBe(false);
  });

  it('keeps staff among the canonical categories', () => {
    expect(transactionCategories).toContain('staff');
    expect(transactionCategories).toContain('other');
  });
});

describe('transactionUpdateSchema', () => {
  it('allows partial updates', () => {
    expect(
      transactionUpdateSchema.safeParse({ amountMinor: 900 }).success,
    ).toBe(true);
    expect(transactionUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('still validates provided fields', () => {
    expect(
      transactionUpdateSchema.safeParse({ kind: 'transfer' }).success,
    ).toBe(false);
  });
});

describe('extractedDocumentSchema', () => {
  const extracted = {
    transactions: [
      {
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
        confidence: { date: 0.9, amount: 0.95, kind: 0.99 },
      },
    ],
  };

  it('accepts several transactions per document', () => {
    expect(extractedDocumentSchema.safeParse(extracted).success).toBe(true);
    expect(
      extractedDocumentSchema.safeParse({
        transactions: [extracted.transactions[0], extracted.transactions[0]],
      }).success,
    ).toBe(true);
  });

  it('rejects confidences outside 0..1 and unknown directions', () => {
    const bad = structuredClone(extracted);
    bad.transactions[0].confidence.amount = 1.5;
    expect(extractedDocumentSchema.safeParse(bad).success).toBe(false);
    const badDirection = structuredClone(extracted) as {
      transactions: { lineItems: { direction: string }[] }[];
    };
    badDirection.transactions[0].lineItems[0].direction = 'gift';
    expect(extractedDocumentSchema.safeParse(badDirection).success).toBe(false);
  });
});

describe('query schemas', () => {
  it('recordsQuerySchema accepts the product filter', () => {
    const parsed = recordsQuerySchema.parse({ product: 'harina', limit: '5' });
    expect(parsed.product).toBe('harina');
    expect(parsed.limit).toBe(5);
  });

  it('totalsQuerySchema requires from, to and groupBy', () => {
    expect(totalsQuerySchema.safeParse({}).success).toBe(false);
    expect(
      totalsQuerySchema.safeParse({
        from: '2026-01-01',
        to: '2026-01-31',
        groupBy: 'week',
      }).success,
    ).toBe(true);
    expect(
      totalsQuerySchema.safeParse({
        from: '2026-01-01',
        to: '2026-01-31',
        groupBy: 'year',
      }).success,
    ).toBe(false);
  });

  it('productsQuerySchema accepts an optional limit between 1 and 100', () => {
    const parse = (limit: unknown) =>
      productsQuerySchema.safeParse({ direction: 'purchase', limit });
    expect(parse('5').success).toBe(true);
    expect(parse(100).success).toBe(true);
    expect(parse(0).success).toBe(false);
    expect(parse(101).success).toBe(false);
    expect(parse('abc').success).toBe(false);
    expect(
      productsQuerySchema.parse({ direction: 'sale' }).limit,
    ).toBeUndefined();
  });

  it('productsQuerySchema requires a direction', () => {
    expect(productsQuerySchema.safeParse({}).success).toBe(false);
    expect(productsQuerySchema.safeParse({ direction: 'sale' }).success).toBe(
      true,
    );
  });
});

describe('resolveDuplicateSchema', () => {
  it('requires keepTransactionId when merging', () => {
    expect(resolveDuplicateSchema.safeParse({ action: 'merge' }).success).toBe(
      false,
    );
    expect(
      resolveDuplicateSchema.safeParse({
        action: 'merge',
        keepTransactionId: ids.a,
      }).success,
    ).toBe(true);
    expect(
      resolveDuplicateSchema.safeParse({ action: 'keep_both' }).success,
    ).toBe(true);
  });
});
