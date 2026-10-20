import type { TotalsRow } from './records';
import {
  analyzeResults,
  buildBankStatementsView,
  buildCommercialView,
  buildEmployeeHistory,
  buildSalesView,
  buildPayrollView,
  payrollTotalCost,
  type BankStatementDocument,
  type CommercialDocument,
  type PayrollDocument,
} from './results';

let counter = 0;
const id = () =>
  `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

const statement = (
  periodStart: string | null,
  periodEnd: string,
  opening: number,
  closing: number,
  overrides: Partial<BankStatementDocument> & {
    account?: string | null;
    deposits?: number;
    withdrawals?: number;
  } = {},
): BankStatementDocument => ({
  documentId: id(),
  fileId: id(),
  currency: 'USD',
  periodStart,
  periodEnd,
  consistency: 'ok',
  notes: null,
  details: {
    accountIdentifier:
      overrides.account === undefined ? '****1234' : overrides.account,
    openingBalanceMinor: opening,
    closingBalanceMinor: closing,
    totalDepositsMinor: overrides.deposits ?? 50_000,
    totalWithdrawalsMinor: overrides.withdrawals ?? 20_000,
    totalFeesMinor: 0,
  },
  ...overrides,
});

describe('buildBankStatementsView', () => {
  it('returns nothing for no statements', () => {
    expect(buildBankStatementsView([])).toEqual([]);
  });

  it('orders statements by period, computes the net change and the balance series', () => {
    const march = statement('2026-03-01', '2026-03-31', 130_000, 150_000);
    const january = statement('2026-01-01', '2026-01-31', 100_000, 115_000);
    const february = statement('2026-02-01', '2026-02-28', 115_000, 130_000);
    const [view] = buildBankStatementsView([march, january, february]);
    expect(view.statements.map((s) => s.periodEnd)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
    expect(view.statements[0].netChangeMinor).toBe(15_000);
    expect(view.balanceSeries.map((p) => p.balanceMinor)).toEqual([
      115_000, 130_000, 150_000,
    ]);
    expect(view.gaps).toEqual([]);
  });

  it('adds deposits and withdrawals per month', () => {
    const [view] = buildBankStatementsView([
      statement('2026-01-01', '2026-01-31', 0, 1, {
        deposits: 100,
        withdrawals: 40,
      }),
      statement('2026-01-15', '2026-01-31', 0, 1, {
        deposits: 20,
        withdrawals: 5,
        account: '****9999',
      }),
      statement('2026-02-01', '2026-02-28', 1, 2, {
        deposits: 7,
        withdrawals: 3,
      }),
    ]);
    expect(view.flows).toEqual([
      { periodStart: '2026-01-01', depositsMinor: 120, withdrawalsMinor: 45 },
      { periodStart: '2026-02-01', depositsMinor: 7, withdrawalsMinor: 3 },
    ]);
  });

  it('flags a balance gap between consecutive statements of the same account', () => {
    const a = statement('2026-01-01', '2026-01-31', 100_000, 115_000);
    const b = statement('2026-02-01', '2026-02-28', 90_000, 100_000);
    const [view] = buildBankStatementsView([a, b]);
    expect(view.gaps).toEqual([
      expect.objectContaining({
        kind: 'balance',
        afterDocumentId: a.documentId,
        beforeDocumentId: b.documentId,
        closingBalanceMinor: 115_000,
        openingBalanceMinor: 90_000,
      }),
    ]);
  });

  it('tolerates a tiny difference and flags a one-cent jump on small balances only beyond 1 cent', () => {
    const a = statement('2026-01-01', '2026-01-31', 0, 115_000);
    expect(
      buildBankStatementsView([
        a,
        statement('2026-02-01', '2026-02-28', 115_001, 0),
      ])[0].gaps,
    ).toEqual([]);
    expect(
      buildBankStatementsView([
        a,
        statement('2026-02-01', '2026-02-28', 118_000, 0),
      ])[0].gaps,
    ).toHaveLength(1);
  });

  it('flags a missing period with the days that have no statement', () => {
    const a = statement('2026-01-01', '2026-01-31', 100, 100);
    const c = statement('2026-03-01', '2026-03-31', 100, 100);
    const [view] = buildBankStatementsView([a, c]);
    expect(view.gaps).toEqual([
      expect.objectContaining({
        kind: 'missing_period',
        missingFrom: '2026-02-01',
        missingTo: '2026-02-28',
      }),
    ]);
  });

  it('reports both problems when they happen together', () => {
    const [view] = buildBankStatementsView([
      statement('2026-01-01', '2026-01-31', 100, 100),
      statement('2026-03-01', '2026-03-31', 5_000, 100),
    ]);
    expect(view.gaps.map((g) => g.kind).sort()).toEqual([
      'balance',
      'missing_period',
    ]);
  });

  it('keeps accounts apart, so different accounts never produce gaps with each other', () => {
    const [view] = buildBankStatementsView([
      statement('2026-01-01', '2026-01-31', 100, 200, { account: '****1111' }),
      statement('2026-02-01', '2026-02-28', 9_000, 9_500, {
        account: '****2222',
      }),
    ]);
    expect(view.gaps).toEqual([]);
  });

  it('groups statements without an account identifier together and never mixes currencies', () => {
    const views = buildBankStatementsView([
      statement('2026-01-01', '2026-01-31', 100, 200, { account: null }),
      statement('2026-02-01', '2026-02-28', 900, 950, { account: null }),
      statement('2026-01-01', '2026-01-31', 5, 6, { currency: 'EUR' }),
    ]);
    expect(views.map((v) => v.currency)).toEqual(['EUR', 'USD']);
    expect(views[1].gaps.map((g) => g.kind)).toEqual(['balance']);
    expect(views[0].gaps).toEqual([]);
  });

  it('handles overdrafts, duplicate periods and a missing period start', () => {
    const [view] = buildBankStatementsView([
      statement('2026-01-01', '2026-01-31', -5_000, -1_000),
      statement(null, '2026-02-28', -1_000, 3_000), // no start: no missing-period check
      statement('2026-01-01', '2026-01-31', -5_000, -1_000), // same period uploaded twice
    ]);
    expect(view.statements).toHaveLength(3);
    expect(view.statements[0].netChangeMinor).toBe(4_000);
    expect(
      view.gaps.every(
        (g) => g.kind !== 'missing_period' || g.missingFrom !== null,
      ),
    ).toBe(true);
  });

  it('carries the consistency state and notes of each statement', () => {
    const [view] = buildBankStatementsView([
      statement('2026-01-01', '2026-01-31', 1, 2, {
        consistency: 'inconsistent',
        notes: 'does not balance',
      }),
    ]);
    expect(view.statements[0]).toMatchObject({
      consistency: 'inconsistent',
      notes: 'does not balance',
    });
  });
});

describe('buildPayrollView', () => {
  const payroll = (
    periodEnd: string,
    overrides: Partial<PayrollDocument> & { employerCost?: number | null } = {},
  ): PayrollDocument => ({
    documentId: id(),
    fileId: id(),
    currency: 'USD',
    periodStart: `${periodEnd.slice(0, 8)}01`,
    periodEnd,
    consistency: 'ok',
    details: {
      grossTotalMinor: 300_000,
      deductionsTotalMinor: 60_000,
      netTotalMinor: 240_000,
      employerTotalCostMinor:
        overrides.employerCost === undefined ? null : overrides.employerCost,
      employeeCount: 2,
    },
    ...overrides,
  });

  it('returns nothing for no payroll', () => {
    expect(buildPayrollView([])).toEqual([]);
  });

  it('lists periods oldest first with employees, gross, net, deductions and total cost', () => {
    const [view] = buildPayrollView([
      payroll('2026-02-28'),
      payroll('2026-01-31'),
    ]);
    expect(view.periods.map((p) => p.periodEnd)).toEqual([
      '2026-01-31',
      '2026-02-28',
    ]);
    expect(view.periods[0]).toMatchObject({
      employees: 2,
      grossMinor: 300_000,
      netMinor: 240_000,
      deductionsMinor: 60_000,
      totalCostMinor: 300_000,
      periodStart: '2026-01-01',
    });
  });

  it('uses the employer cost as the total cost when stated, else the gross total', () => {
    const [view] = buildPayrollView([
      payroll('2026-01-31', { employerCost: 340_000 }),
      payroll('2026-02-28'),
    ]);
    expect(view.periods.map((p) => p.totalCostMinor)).toEqual([
      340_000, 300_000,
    ]);
    expect(payrollTotalCost(payroll('2026-01-31').details)).toBe(300_000);
  });

  it('never mixes currencies and keeps the consistency state', () => {
    const views = buildPayrollView([
      payroll('2026-01-31'),
      payroll('2026-01-31', { currency: 'EUR', consistency: 'inconsistent' }),
    ]);
    expect(views.map((v) => v.currency)).toEqual(['EUR', 'USD']);
    expect(views[0].periods[0].consistency).toBe('inconsistent');
  });
});

describe('buildEmployeeHistory', () => {
  const entry = (periodEnd: string, name: string, gross: number) => ({
    employeeKey: 'ana lopez',
    employeeName: name,
    documentId: id(),
    currency: 'USD',
    periodStart: null,
    periodEnd,
    grossMinor: gross,
    deductionsMinor: gross / 10,
    netMinor: gross - gross / 10,
  });

  it('returns null for an unknown employee', () => {
    expect(buildEmployeeHistory([])).toBeNull();
  });

  it('orders the history oldest first and shows the latest spelling of the name', () => {
    const history = buildEmployeeHistory([
      entry('2026-03-31', 'ANA LÓPEZ', 300),
      entry('2026-01-31', 'Ana Lopez', 100),
      entry('2026-02-28', 'Ana López', 200),
    ]);
    expect(history?.employeeName).toBe('ANA LÓPEZ');
    expect(history?.history.map((h) => h.grossMinor)).toEqual([100, 200, 300]);
    expect(history?.history[0].periodStart).toBe('2026-01-31'); // no start: falls back to the end
  });
});

describe('analyzeResults', () => {
  const row = (overrides: Partial<TotalsRow>): TotalsRow => ({
    bucketStart: '2026-01-05',
    kind: 'expense',
    category: 'supplies',
    totalMinor: 1000,
    confirmedMinor: 1000,
    unconfirmedMinor: 0,
    currency: 'USD',
    ...overrides,
  });
  const income = (
    bucketStart: string,
    totalMinor: number,
    extra: Partial<TotalsRow> = {},
  ) =>
    row({
      bucketStart,
      kind: 'income',
      category: 'sales',
      totalMinor,
      ...extra,
    });

  it('returns nothing for no rows', () => {
    expect(analyzeResults([])).toEqual([]);
  });

  it('flags a period where expenses exceed income and not a profitable one', () => {
    const [result] = analyzeResults([
      row({ bucketStart: '2026-01-05', totalMinor: 5000 }),
      income('2026-01-05', 3000),
      row({ bucketStart: '2026-01-12', totalMinor: 1000 }),
      income('2026-01-12', 4000),
    ]);
    expect(
      result.periods.map((p) => [p.bucketStart, p.isLoss, p.netMinor]),
    ).toEqual([
      ['2026-01-05', true, -2000],
      ['2026-01-12', false, 3000],
    ]);
    expect(result.losingPeriods).toBe(1);
    expect(result.largestLossMinor).toBe(2000);
  });

  it('does not flag equal income and expenses', () => {
    const [result] = analyzeResults([
      row({ totalMinor: 700 }),
      income('2026-01-05', 700),
    ]);
    expect(result.periods[0]).toMatchObject({ isLoss: false, netMinor: 0 });
    expect(result.losingPeriods).toBe(0);
    expect(result.largestLossMinor).toBe(0);
  });

  it('treats an expense-only period as a loss and an income-only period as profit', () => {
    const [result] = analyzeResults([
      row({ bucketStart: '2026-01-05', totalMinor: 900 }),
      income('2026-01-12', 400),
    ]);
    expect(result.periods.map((p) => p.isLoss)).toEqual([true, false]);
  });

  it('accumulates the net result and totals over the range, oldest first', () => {
    const [result] = analyzeResults([
      income('2026-02-02', 5000),
      row({ bucketStart: '2026-01-05', totalMinor: 2000 }),
      row({ bucketStart: '2026-02-02', totalMinor: 1000 }),
    ]);
    expect(result.periods.map((p) => p.bucketStart)).toEqual([
      '2026-01-05',
      '2026-02-02',
    ]);
    expect(result.periods.map((p) => p.cumulativeNetMinor)).toEqual([
      -2000, 2000,
    ]);
    expect(result).toMatchObject({
      totalIncomeMinor: 5000,
      totalExpensesMinor: 3000,
      totalNetMinor: 2000,
    });
  });

  it('lists the top expense categories of a period, largest first, at most three', () => {
    const [result] = analyzeResults([
      row({ category: 'rent', totalMinor: 3000 }),
      row({ category: 'staff', totalMinor: 9000 }),
      row({ category: 'supplies', totalMinor: 1000 }),
      row({
        category: 'supplies',
        totalMinor: 1500,
        bucketStart: '2026-01-05',
      }),
      row({ category: 'utilities', totalMinor: 500 }),
      income('2026-01-05', 100),
    ]);
    expect(result.periods[0].topExpenseCategories).toEqual([
      { category: 'staff', totalMinor: 9000 },
      { category: 'rent', totalMinor: 3000 },
      { category: 'supplies', totalMinor: 2500 },
    ]);
  });

  it('adds the unconfirmed amount of each period', () => {
    const [result] = analyzeResults([
      row({ unconfirmedMinor: 300 }),
      income('2026-01-05', 100, { unconfirmedMinor: 50 }),
    ]);
    expect(result.periods[0].unconfirmedMinor).toBe(350);
  });

  it('never mixes currencies', () => {
    const result = analyzeResults([
      row({ totalMinor: 900, currency: 'USD' }),
      income('2026-01-05', 1000, { currency: 'USD' }),
      row({ totalMinor: 100, currency: 'EUR' }),
    ]);
    expect(result.map((r) => [r.currency, r.losingPeriods])).toEqual([
      ['EUR', 1],
      ['USD', 0],
    ]);
  });
});

describe('buildCommercialView', () => {
  const commercial = (
    type: 'invoice' | 'receipt',
    counterparty: string | null,
    total: number,
    extra: Partial<CommercialDocument['details']> & { currency?: string } = {},
  ): CommercialDocument => ({
    type,
    currency: extra.currency ?? 'USD',
    details: {
      counterparty,
      subtotalMinor: null,
      taxMinor: extra.taxMinor ?? null,
      totalMinor: total,
      paymentStatus: extra.paymentStatus ?? 'unknown',
    },
  });

  it('returns nothing for no documents', () => {
    expect(buildCommercialView([])).toEqual([]);
  });

  it('adds totals, taxes and counts per kind', () => {
    const views = buildCommercialView([
      commercial('invoice', 'Proveedor A', 10_000, { taxMinor: 1_600 }),
      commercial('invoice', 'Proveedor B', 5_000),
      commercial('receipt', 'Café', 800, { taxMinor: 100 }),
    ]);
    const invoice = views.find((v) => v.kind === 'invoice');
    const receipt = views.find((v) => v.kind === 'receipt');
    expect(invoice).toMatchObject({
      documents: 2,
      totalMinor: 15_000,
      taxMinor: 1_600,
    }); // missing tax counts as 0
    expect(receipt).toMatchObject({
      documents: 1,
      totalMinor: 800,
      taxMinor: 100,
    });
  });

  it('separates paid from pending and leaves unknown out of both', () => {
    const [view] = buildCommercialView([
      commercial('invoice', 'A', 1_000, { paymentStatus: 'paid' }),
      commercial('invoice', 'B', 2_500, { paymentStatus: 'pending' }),
      commercial('invoice', 'C', 400, { paymentStatus: 'unknown' }),
    ]);
    expect(view).toMatchObject({
      totalMinor: 3_900,
      paidMinor: 1_000,
      pendingMinor: 2_500,
    });
  });

  it('groups counterparties ignoring case, accents and punctuation, largest first', () => {
    const [view] = buildCommercialView([
      commercial('invoice', 'Súper Mercado, S.A.', 3_000),
      commercial('invoice', 'SUPER MERCADO SA', 2_000),
      commercial('invoice', 'Ferretería', 4_000),
      commercial('invoice', null, 9_999), // no counterparty: counted in totals, not listed
    ]);
    expect(view.topCounterparties).toEqual([
      { counterparty: 'Súper Mercado, S.A.', totalMinor: 5_000, documents: 2 },
      { counterparty: 'Ferretería', totalMinor: 4_000, documents: 1 },
    ]);
    expect(view.totalMinor).toBe(18_999);
  });

  it('keeps at most five counterparties and never mixes currencies', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name, i) =>
      commercial('receipt', name, (i + 1) * 100),
    );
    expect(buildCommercialView(many)[0].topCounterparties).toHaveLength(5);
    const views = buildCommercialView([
      commercial('invoice', 'A', 100),
      commercial('invoice', 'A', 100, { currency: 'EUR' }),
    ]);
    expect(views.map((v) => [v.currency, v.totalMinor])).toEqual([
      ['EUR', 100],
      ['USD', 100],
    ]);
  });
});

describe('buildSalesView', () => {
  const doc = (
    total: number,
    units: number | null,
    count: number | null,
    currency = 'USD',
  ) => ({
    currency,
    details: {
      totalSalesMinor: total,
      unitsSold: units,
      transactionCount: count,
    },
  });
  const input = (
    overrides: Partial<Parameters<typeof buildSalesView>[0]> = {},
  ) => ({
    documents: [doc(100_000, 20, 8)],
    products: [],
    daily: [],
    bucket: 'day' as const,
    weekStart: 'monday' as const,
    ...overrides,
  });

  it('returns nothing without sales reports', () => {
    expect(buildSalesView(input({ documents: [] }))).toEqual([]);
  });

  it('adds sales and units and computes the average ticket', () => {
    const [view] = buildSalesView(
      input({ documents: [doc(100_000, 20, 8), doc(50_000, 10, 2)] }),
    );
    expect(view).toMatchObject({
      totalSalesMinor: 150_000,
      unitsSold: 30,
      averageTicketMinor: 15_000,
    });
  });

  it('has no average ticket when no report states its transaction count', () => {
    const [view] = buildSalesView(
      input({ documents: [doc(100_000, null, null)] }),
    );
    expect(view.averageTicketMinor).toBeNull();
    expect(view.unitsSold).toBe(0);
  });

  it('averages only over reports that state their count', () => {
    const [view] = buildSalesView(
      input({ documents: [doc(100_000, 1, 10), doc(900_000, 1, null)] }),
    );
    expect(view.averageTicketMinor).toBe(10_000);
    expect(view.totalSalesMinor).toBe(1_000_000);
  });

  it('lists the best products, merging spellings, largest first and at most five', () => {
    const products = [
      { currency: 'USD', productName: 'Pan', quantity: 10, totalMinor: 1_000 },
      { currency: 'USD', productName: 'PAN ', quantity: 5, totalMinor: 600 },
      { currency: 'USD', productName: 'Leche', quantity: 3, totalMinor: 900 },
      ...['a', 'b', 'c', 'd', 'e'].map((p, i) => ({
        currency: 'USD',
        productName: p,
        quantity: 1,
        totalMinor: i + 1,
      })),
    ];
    const [view] = buildSalesView(input({ products }));
    expect(view.bestProducts).toHaveLength(5);
    expect(view.bestProducts[0]).toEqual({
      productName: 'Pan',
      quantity: 15,
      totalMinor: 1_600,
    });
    expect(view.bestProducts[1].productName).toBe('Leche');
  });

  it('builds the series by day or by Monday week', () => {
    const daily = [
      { currency: 'USD', date: '2026-10-05', totalMinor: 100 }, // Monday
      { currency: 'USD', date: '2026-10-06', totalMinor: 200 },
      { currency: 'USD', date: '2026-10-12', totalMinor: 400 }, // next Monday
    ];
    expect(buildSalesView(input({ daily }))[0].series).toEqual([
      { bucketStart: '2026-10-05', totalMinor: 100 },
      { bucketStart: '2026-10-06', totalMinor: 200 },
      { bucketStart: '2026-10-12', totalMinor: 400 },
    ]);
    expect(buildSalesView(input({ daily, bucket: 'week' }))[0].series).toEqual([
      { bucketStart: '2026-10-05', totalMinor: 300 },
      { bucketStart: '2026-10-12', totalMinor: 400 },
    ]);
  });

  it('never mixes currencies', () => {
    const views = buildSalesView(
      input({ documents: [doc(100, 1, 1), doc(900, 2, 3, 'EUR')] }),
    );
    expect(views.map((v) => [v.currency, v.totalSalesMinor])).toEqual([
      ['EUR', 900],
      ['USD', 100],
    ]);
  });
});
