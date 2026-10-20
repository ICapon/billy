import type { TransactionData } from '@org/db';
import { analyzeResults, type TotalsRow } from '@org/shared';
import { createTestApp, type TestApp } from '../../testing/test-app';

// 2060-01-05 is a Monday. Weeks: 01-05, 01-12, 01-19; January and February.
const record = (
  occurredOn: string,
  kind: 'expense' | 'income',
  amountMinor: number,
  category: TransactionData['category'] = kind === 'income'
    ? 'sales'
    : 'supplies',
): TransactionData => ({
  occurredOn,
  amountMinor,
  currency: 'USD',
  kind,
  category,
  counterparty: null,
  confidence: 0.9,
  lineItems: [],
});

describe('Loss analysis over /api/records/totals (integration)', () => {
  let t: TestApp | null = null;
  beforeAll(async () => {
    t = await createTestApp();
    if (!t) return;
    const mk = (name: string, status: 'completed' | 'needs_review') =>
      t!.repos.files.insert({
        originalName: name,
        mimeType: 'text/csv',
        sizeBytes: 1,
        sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
        storageKey: `${t!.ownerId}/${name}`,
        status,
      });
    const [good, review, merged] = [
      await mk('ok.csv', 'completed'),
      await mk('review.csv', 'needs_review'),
      await mk('merged.csv', 'completed'),
    ];
    await t.repos.records.replaceExtracted(good.id, [
      // week of 01-05: income 3000, expenses 5000 -> loss of 2000
      record('2060-01-06', 'income', 3000),
      record('2060-01-07', 'expense', 3500, 'staff'),
      record('2060-01-08', 'expense', 1500),
      // week of 01-12: income 4000, expenses 1000 -> profit
      record('2060-01-13', 'income', 4000),
      record('2060-01-14', 'expense', 1000),
      // week of 01-19: only expenses -> loss
      record('2060-01-21', 'expense', 800),
      // February: income 900, expenses 900 -> exactly even, no loss
      record('2060-02-02', 'income', 900),
      record('2060-02-03', 'expense', 900),
    ]);
    // must be ignored: a file waiting for review and a merged duplicate
    await t.repos.records.replaceExtracted(review.id, [
      record('2060-01-06', 'expense', 999_999),
    ]);
    const [dup] = await t.repos.records.replaceExtracted(merged.id, [
      record('2060-01-07', 'expense', 888_888),
    ]);
    await t.repos.records.excludeAsMerged(dup.id);
  });
  afterAll(async () => t?.close());

  const analyze = async (groupBy: 'week' | 'month') => {
    const response = await fetch(
      `${t!.base}/api/records/totals?from=2060-01-01&to=2060-02-28&groupBy=${groupBy}`,
    );
    expect(response.status).toBe(200);
    return analyzeResults((await response.json()) as TotalsRow[]);
  };

  it('flags exactly the losing weeks, with the right amounts', async () => {
    if (!t) return;
    const [usd] = await analyze('week');
    const byWeek = Object.fromEntries(
      usd.periods.map((p) => [p.bucketStart, p]),
    );
    expect(byWeek['2060-01-05']).toMatchObject({
      incomeMinor: 3000,
      expensesMinor: 5000,
      netMinor: -2000,
      isLoss: true,
    });
    expect(byWeek['2060-01-12']).toMatchObject({
      netMinor: 3000,
      isLoss: false,
    });
    expect(byWeek['2060-01-19']).toMatchObject({
      netMinor: -800,
      isLoss: true,
    });
    expect(byWeek['2060-01-05'].topExpenseCategories[0]).toEqual({
      category: 'staff',
      totalMinor: 3500,
    });
    expect(usd.losingPeriods).toBe(2); // the weeks of 01-05 and 01-19
    expect(usd.largestLossMinor).toBe(2000);
  });

  it('flags the losing months only, and ignores files in review and merged duplicates', async () => {
    if (!t) return;
    const [usd] = await analyze('month');
    const byMonth = Object.fromEntries(
      usd.periods.map((p) => [p.bucketStart, p]),
    );
    // January: income 7000, expenses 5000 + 1000 + 800 = 6800 -> profit
    expect(byMonth['2060-01-01']).toMatchObject({
      incomeMinor: 7000,
      expensesMinor: 6800,
      netMinor: 200,
      isLoss: false,
    });
    // February: exactly even
    expect(byMonth['2060-02-01']).toMatchObject({ netMinor: 0, isLoss: false });
    expect(usd.losingPeriods).toBe(0);
    expect(usd.totalNetMinor).toBe(200);
    // nothing from the review file (999,999) or the merged duplicate (888,888) leaks in
    expect(usd.totalExpensesMinor).toBe(7700);
  });
});
