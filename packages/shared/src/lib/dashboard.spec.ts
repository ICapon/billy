import type { TotalsRow } from './records';
import {
  summarizeFinance,
  activityQuerySchema,
  activitySummarySchema,
  attentionItemsSchema,
  bucketFor,
  bucketStartOf,
  bucketStarts,
  fillSeries,
  periodDays,
  periodFromPreset,
  validatePeriod,
} from './dashboard';

const today = new Date('2026-10-18T15:00:00Z'); // a Sunday

const validSummary = {
  from: '2026-09-19',
  to: '2026-10-18',
  bucket: 'day',
  counts: {
    received: 0,
    processing: 1,
    queuedLimit: 0,
    completed: 5,
    needsReview: 1,
    failed: 1,
  },
  total: 8,
  finished: 7,
  successRate: 5 / 7,
  avgAnalysisSeconds: 12.5,
  series: [{ bucketStart: '2026-09-19', uploaded: 2, finished: 1 }],
  byMethod: { digital: 3, ocr: 2, vision: 1 },
};

describe('dashboard schemas', () => {
  it('accepts a valid activity summary', () => {
    expect(activitySummarySchema.safeParse(validSummary).success).toBe(true);
    expect(
      activitySummarySchema.safeParse({
        ...validSummary,
        successRate: null,
        avgAnalysisSeconds: null,
      }).success,
    ).toBe(true);
  });

  it('rejects negative counts, rates above 1 and bad dates', () => {
    const counts = { ...validSummary.counts, failed: -1 };
    expect(
      activitySummarySchema.safeParse({ ...validSummary, counts }).success,
    ).toBe(false);
    expect(
      activitySummarySchema.safeParse({ ...validSummary, successRate: 1.2 })
        .success,
    ).toBe(false);
    expect(
      activitySummarySchema.safeParse({ ...validSummary, from: '18/10/2026' })
        .success,
    ).toBe(false);
    expect(
      activitySummarySchema.safeParse({ ...validSummary, bucket: 'month' })
        .success,
    ).toBe(false);
  });

  it('requires from on or before to in the activity query', () => {
    expect(
      activityQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-01' })
        .success,
    ).toBe(true);
    expect(
      activityQuerySchema.safeParse({ from: '2026-10-02', to: '2026-10-01' })
        .success,
    ).toBe(false);
    expect(activityQuerySchema.safeParse({ from: '2026-10-02' }).success).toBe(
      false,
    );
  });

  it('validates attention items', () => {
    const items = {
      needsReview: 1,
      failed: 0,
      queuedLimit: 2,
      pendingDuplicates: 3,
      unconfirmed: [{ currency: 'USD', amountMinor: 12500 }],
    };
    expect(attentionItemsSchema.safeParse(items).success).toBe(true);
    expect(
      attentionItemsSchema.safeParse({ ...items, failed: -1 }).success,
    ).toBe(false);
    expect(
      attentionItemsSchema.safeParse({
        ...items,
        unconfirmed: [{ currency: 'usd', amountMinor: 1 }],
      }).success,
    ).toBe(false);
  });
});

describe('period presets', () => {
  it('builds inclusive UTC ranges ending today', () => {
    expect(periodFromPreset('7d', today)).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
    });
    expect(periodFromPreset('30d', today)).toEqual({
      from: '2026-09-19',
      to: '2026-10-18',
    });
    expect(periodFromPreset('90d', today)).toEqual({
      from: '2026-07-21',
      to: '2026-10-18',
    });
    expect(periodDays(periodFromPreset('30d', today))).toBe(30);
  });

  it('this month starts on day 1 and custom falls back to the default', () => {
    expect(periodFromPreset('month', today)).toEqual({
      from: '2026-10-01',
      to: '2026-10-18',
    });
    expect(periodFromPreset('custom', today)).toEqual(
      periodFromPreset('30d', today),
    );
  });

  it('crosses month and year boundaries', () => {
    expect(periodFromPreset('7d', new Date('2027-01-03T00:00:00Z')).from).toBe(
      '2026-12-28',
    );
  });
});

describe('validatePeriod', () => {
  it('accepts a valid range, including a single day', () => {
    expect(validatePeriod({ from: '2026-10-01', to: '2026-10-31' })).toBeNull();
    expect(validatePeriod({ from: '2026-10-01', to: '2026-10-01' })).toBeNull();
  });

  it('explains missing, malformed and inverted ranges', () => {
    expect(validatePeriod({})).toContain('dos fechas');
    expect(validatePeriod({ from: '2026-10-01' })).toContain('dos fechas');
    expect(validatePeriod({ from: 'x', to: '2026-10-01' })).toContain(
      'dos fechas',
    );
    expect(validatePeriod({ from: '2026-10-05', to: '2026-10-01' })).toContain(
      'anterior',
    );
  });
});

describe('buckets', () => {
  it('uses days up to 31 days and weeks beyond', () => {
    expect(bucketFor({ from: '2026-10-01', to: '2026-10-31' })).toBe('day');
    expect(bucketFor({ from: '2026-10-01', to: '2026-11-01' })).toBe('week');
    expect(bucketFor({ from: '2026-10-01', to: '2026-10-01' })).toBe('day');
  });

  it('finds the week start for Monday and Sunday weeks', () => {
    expect(bucketStartOf('2026-10-18', 'week', 'monday')).toBe('2026-10-12'); // Sunday belongs to the Monday week
    expect(bucketStartOf('2026-10-12', 'week', 'monday')).toBe('2026-10-12');
    expect(bucketStartOf('2026-10-18', 'week', 'sunday')).toBe('2026-10-18');
    expect(bucketStartOf('2026-10-17', 'week', 'sunday')).toBe('2026-10-11');
    expect(bucketStartOf('2026-10-17', 'day')).toBe('2026-10-17');
  });

  it('lists every bucket including the partial first week', () => {
    expect(
      bucketStarts({ from: '2026-10-14', to: '2026-10-27' }, 'week', 'monday'),
    ).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
    expect(
      bucketStarts({ from: '2026-10-01', to: '2026-10-03' }, 'day'),
    ).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });

  it('zero-fills a sparse series in order', () => {
    const series = fillSeries(
      { from: '2026-10-01', to: '2026-10-04' },
      'day',
      'monday',
      [{ bucketStart: '2026-10-02', count: 3 }],
      [{ bucketStart: '2026-10-04', count: 1 }],
    );
    expect(series).toEqual([
      { bucketStart: '2026-10-01', uploaded: 0, finished: 0 },
      { bucketStart: '2026-10-02', uploaded: 3, finished: 0 },
      { bucketStart: '2026-10-03', uploaded: 0, finished: 0 },
      { bucketStart: '2026-10-04', uploaded: 0, finished: 1 },
    ]);
  });
});

describe('summarizeFinance', () => {
  const row = (overrides: Partial<TotalsRow>): TotalsRow => ({
    bucketStart: '2026-10-05',
    kind: 'expense',
    category: 'supplies',
    totalMinor: 1000,
    confirmedMinor: 400,
    unconfirmedMinor: 600,
    currency: 'USD',
    ...overrides,
  });

  it('returns nothing for no rows', () => {
    expect(summarizeFinance([])).toEqual([]);
  });

  it('adds expenses, income and the difference, which can be negative', () => {
    const [usd] = summarizeFinance([
      row({ totalMinor: 5000 }),
      row({
        kind: 'income',
        category: 'sales',
        totalMinor: 2000,
        bucketStart: '2026-10-12',
      }),
    ]);
    expect(usd).toMatchObject({
      currency: 'USD',
      expensesMinor: 5000,
      incomeMinor: 2000,
      netMinor: -3000,
    });
  });

  it('measures staff cost and its share of expenses, and ignores staff-like income', () => {
    const [usd] = summarizeFinance([
      row({ category: 'staff', totalMinor: 3000 }),
      row({ category: 'rent', totalMinor: 1000 }),
      row({ kind: 'income', category: 'staff', totalMinor: 9999 }),
    ]);
    expect(usd.staffMinor).toBe(3000);
    expect(usd.staffShare).toBeCloseTo(0.75, 5);
  });

  it('has no staff share (null) when there are no expenses', () => {
    const [usd] = summarizeFinance([
      row({ kind: 'income', category: 'sales', totalMinor: 700 }),
    ]);
    expect(usd.expensesMinor).toBe(0);
    expect(usd.staffShare).toBeNull();
    expect(usd.byCategory).toEqual([]);
  });

  it('lists expense categories largest first, with shares that add up to 1', () => {
    const [usd] = summarizeFinance([
      row({ category: 'rent', totalMinor: 1000 }),
      row({ category: 'supplies', totalMinor: 6000 }),
      row({
        category: 'supplies',
        totalMinor: 1000,
        bucketStart: '2026-10-12',
      }),
      row({ category: 'staff', totalMinor: 2000 }),
    ]);
    expect(usd.byCategory.map((c) => [c.category, c.totalMinor])).toEqual([
      ['supplies', 7000],
      ['staff', 2000],
      ['rent', 1000],
    ]);
    expect(usd.byCategory.reduce((acc, c) => acc + c.share, 0)).toBeCloseTo(
      1,
      5,
    );
  });

  it('builds a week-ordered series with zeros for a kind that has no rows that week', () => {
    const [usd] = summarizeFinance([
      row({ bucketStart: '2026-10-12', totalMinor: 400 }),
      row({
        bucketStart: '2026-10-05',
        kind: 'income',
        category: 'sales',
        totalMinor: 900,
      }),
      row({ bucketStart: '2026-10-12', category: 'rent', totalMinor: 100 }),
    ]);
    expect(usd.weekly).toEqual([
      { bucketStart: '2026-10-05', expensesMinor: 0, incomeMinor: 900 },
      { bucketStart: '2026-10-12', expensesMinor: 500, incomeMinor: 0 },
    ]);
  });

  it('sums the unconfirmed parts and never mixes currencies', () => {
    const result = summarizeFinance([
      row({ totalMinor: 1000, unconfirmedMinor: 250 }),
      row({ totalMinor: 700, unconfirmedMinor: 100, category: 'rent' }),
      row({ currency: 'EUR', totalMinor: 50, unconfirmedMinor: 50 }),
    ]);
    expect(result.map((r) => r.currency)).toEqual(['EUR', 'USD']);
    expect(result[1]).toMatchObject({
      expensesMinor: 1700,
      unconfirmedMinor: 350,
    });
    expect(result[0]).toMatchObject({
      expensesMinor: 50,
      unconfirmedMinor: 50,
    });
  });
});
