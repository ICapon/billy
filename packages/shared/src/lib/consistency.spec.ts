import {
  checkBankStatement,
  checkCommercial,
  checkPayroll,
  checkSalesReport,
  toleranceMinor,
} from './consistency';

describe('toleranceMinor', () => {
  it('is the larger of 0.01 and 1% of the reference', () => {
    expect(toleranceMinor(0)).toBe(1);
    expect(toleranceMinor(50)).toBe(1);
    expect(toleranceMinor(10_000)).toBe(100);
    expect(toleranceMinor(-10_000)).toBe(100);
  });
});

describe('checkBankStatement', () => {
  const base = {
    accountIdentifier: null,
    openingBalanceMinor: 100_000,
    totalDepositsMinor: 50_000,
    totalWithdrawalsMinor: 30_000,
    totalFeesMinor: 500,
    closingBalanceMinor: 119_500, // 100000 + 50000 - 30000 - 500
  };

  it('accepts a statement that balances', () => {
    expect(checkBankStatement(base)).toEqual({ state: 'ok', notes: [] });
  });

  it('accepts fees already included in the withdrawals', () => {
    expect(
      checkBankStatement({ ...base, closingBalanceMinor: 120_000 }).state,
    ).toBe('ok');
  });

  it('accepts differences within the tolerance and rejects beyond it', () => {
    expect(
      checkBankStatement({ ...base, closingBalanceMinor: 119_500 + 1_000 })
        .state,
    ).toBe('ok');
    const bad = checkBankStatement({ ...base, closingBalanceMinor: 125_000 });
    expect(bad.state).toBe('inconsistent');
    expect(bad.notes[0]).toContain('Closing balance 1250.00');
  });

  it('handles an overdraft', () => {
    expect(
      checkBankStatement({
        ...base,
        openingBalanceMinor: -10_000,
        closingBalanceMinor: 9_500,
      }).state,
    ).toBe('ok');
  });
});

describe('checkPayroll', () => {
  const details = {
    grossTotalMinor: 300_000,
    deductionsTotalMinor: 60_000,
    netTotalMinor: 240_000,
    employerTotalCostMinor: null,
    employeeCount: 2,
  };
  const lines = [
    { grossMinor: 200_000, deductionsMinor: 40_000, netMinor: 160_000 },
    { grossMinor: 100_000, deductionsMinor: 20_000, netMinor: 80_000 },
  ];

  it('accepts a consistent payroll', () => {
    expect(checkPayroll(details, lines)).toEqual({ state: 'ok', notes: [] });
    expect(checkPayroll(details, [])).toEqual({ state: 'ok', notes: [] });
  });

  it('flags totals and lines that do not add up, without naming anyone', () => {
    const bad = checkPayroll({ ...details, netTotalMinor: 200_000 }, [
      lines[0],
      { grossMinor: 100_000, deductionsMinor: 20_000, netMinor: 10_000 },
    ]);
    expect(bad.state).toBe('inconsistent');
    expect(bad.notes.length).toBeGreaterThanOrEqual(2);
    expect(bad.notes.join(' ')).toMatch(/employee line\(s\)/);
  });

  it('flags lines that do not add up to the stated totals', () => {
    const bad = checkPayroll(details, [lines[0]]);
    expect(bad.state).toBe('inconsistent');
    expect(bad.notes.join(' ')).toContain('gross amounts add up');
  });

  it('checks the employer cost against the gross total', () => {
    expect(
      checkPayroll({ ...details, employerTotalCostMinor: 330_000 }, lines)
        .state,
    ).toBe('ok');
    expect(
      checkPayroll({ ...details, employerTotalCostMinor: 100_000 }, lines)
        .state,
    ).toBe('inconsistent');
  });
});

describe('checkCommercial', () => {
  const base = {
    counterparty: 'X',
    subtotalMinor: 10_000,
    taxMinor: 1_600,
    totalMinor: 11_600,
    paymentStatus: 'paid' as const,
  };

  it('accepts subtotal + tax = total', () => {
    expect(checkCommercial(base).state).toBe('ok');
  });

  it('is not checked when subtotal or tax is missing', () => {
    expect(
      checkCommercial({ ...base, taxMinor: null, totalMinor: 99 }).state,
    ).toBe('ok');
    expect(checkCommercial({ ...base, subtotalMinor: null }).state).toBe('ok');
  });

  it('rejects totals that do not add up', () => {
    const bad = checkCommercial({ ...base, totalMinor: 20_000 });
    expect(bad.state).toBe('inconsistent');
    expect(bad.notes[0]).toContain('Subtotal 100.00 + tax 16.00');
  });
});

describe('checkSalesReport', () => {
  const details = {
    totalSalesMinor: 100_000,
    unitsSold: 10,
    transactionCount: 4,
  };

  it('compares listed sales with the stated total when there are any', () => {
    expect(checkSalesReport(details, 100_500).state).toBe('ok');
    expect(checkSalesReport(details, 60_000).state).toBe('inconsistent');
  });

  it('has nothing to compare without listed sales', () => {
    expect(checkSalesReport(details, null).state).toBe('ok');
    expect(checkSalesReport(details, 0).state).toBe('ok');
  });
});
