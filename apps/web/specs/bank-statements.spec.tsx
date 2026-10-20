import { fireEvent, render, screen } from '@testing-library/react';
import type { BankStatementsView } from '@org/shared';
import { BankStatementsTab } from '../src/app/components/results/bank-statements-tab';
import * as api from '../src/app/lib/files-api';
import { formatMoney } from '../src/app/lib/format';

jest.mock('../src/app/lib/files-api');
const mocked = api as jest.Mocked<typeof api>;

const period = { from: '2026-01-01', to: '2026-03-31' };

/** Matches an element whose own text contains the amount, ignoring non-breaking spaces. */
const containing = (text: string) => (content: string) =>
  content.replace(/\s/g, ' ').includes(text.replace(/\s/g, ' '));
const money = (minor: number, currency = 'USD') => formatMoney(minor, currency);
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const view: BankStatementsView = {
  currency: 'USD',
  statements: [
    {
      documentId: id(1),
      fileId: id(11),
      accountIdentifier: '****1234',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      openingBalanceMinor: 100_000,
      closingBalanceMinor: 149_500,
      totalDepositsMinor: 80_000,
      totalWithdrawalsMinor: 30_000,
      totalFeesMinor: 500,
      netChangeMinor: 49_500,
      consistency: 'ok',
      notes: null,
    },
    {
      documentId: id(2),
      fileId: id(12),
      accountIdentifier: '****1234',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      openingBalanceMinor: 90_000,
      closingBalanceMinor: 95_000,
      totalDepositsMinor: 10_000,
      totalWithdrawalsMinor: 5_000,
      totalFeesMinor: 0,
      netChangeMinor: 5_000,
      consistency: 'inconsistent',
      notes: 'Closing balance does not match',
    },
  ],
  balanceSeries: [
    {
      date: '2026-01-31',
      balanceMinor: 149_500,
      accountIdentifier: '****1234',
    },
    { date: '2026-03-31', balanceMinor: 95_000, accountIdentifier: '****1234' },
  ],
  flows: [
    {
      periodStart: '2026-01-01',
      depositsMinor: 80_000,
      withdrawalsMinor: 30_000,
    },
    {
      periodStart: '2026-03-01',
      depositsMinor: 10_000,
      withdrawalsMinor: 5_000,
    },
  ],
  gaps: [
    {
      kind: 'balance',
      accountIdentifier: '****1234',
      afterDocumentId: id(1),
      beforeDocumentId: id(2),
      closingBalanceMinor: 149_500,
      openingBalanceMinor: 90_000,
      missingFrom: null,
      missingTo: null,
    },
    {
      kind: 'missing_period',
      accountIdentifier: '****1234',
      afterDocumentId: id(1),
      beforeDocumentId: id(2),
      closingBalanceMinor: null,
      openingBalanceMinor: null,
      missingFrom: '2026-02-01',
      missingTo: '2026-02-28',
    },
  ],
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('BankStatementsTab', () => {
  it('shows the figures of each statement, the totals and its review state', async () => {
    mocked.getBankStatements.mockResolvedValue([view]);
    render(<BankStatementsTab period={period} refreshKey={0} />);
    expect(await screen.findByText('Saldo más reciente')).toBeTruthy();
    expect(
      screen.getAllByText(containing(money(149_500))).length,
    ).toBeGreaterThan(0); // closing balance of January
    expect(screen.getByText('Requiere revisión')).toBeTruthy();
    expect(screen.getByText('Cuadra')).toBeTruthy();
    expect(mocked.getBankStatements).toHaveBeenCalledWith(period);
  });

  it('lists the continuity gaps with both amounts and the missing days', async () => {
    mocked.getBankStatements.mockResolvedValue([view]);
    render(<BankStatementsTab period={period} refreshKey={0} />);
    expect(
      await screen.findByText(
        /no coincide con el saldo inicial del siguiente estado/,
      ),
    ).toBeTruthy();
    const gap =
      screen.getByText(/no coincide con el saldo inicial/, { selector: 'li' })
        .textContent ?? '';
    expect(gap.replace(/\s/g, ' ')).toContain(
      money(149_500).replace(/\s/g, ' '),
    );
    expect(gap.replace(/\s/g, ' ')).toContain(
      money(90_000).replace(/\s/g, ' '),
    );
    expect(screen.getByText(/Falta un estado de cuenta entre/)).toBeTruthy();
  });

  it('explains the empty state and links to the upload screen', async () => {
    mocked.getBankStatements.mockResolvedValue([]);
    render(<BankStatementsTab period={period} refreshKey={0} />);
    expect(
      await screen.findByText(/No hay estados de cuenta en este periodo/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Subir un estado de cuenta' })
        .getAttribute('href'),
    ).toBe('/upload');
  });

  it('shows an error with a retry that loads the data', async () => {
    mocked.getBankStatements.mockRejectedValueOnce(new Error('sin conexión'));
    mocked.getBankStatements.mockResolvedValueOnce([view]);
    render(<BankStatementsTab period={period} refreshKey={0} />);
    expect(await screen.findByText('sin conexión')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Saldo más reciente')).toBeTruthy();
  });

  it('offers one tab per currency', async () => {
    mocked.getBankStatements.mockResolvedValue([
      view,
      { ...view, currency: 'EUR' },
    ]);
    render(<BankStatementsTab period={period} refreshKey={0} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'EUR' }));
    expect(
      screen.getAllByText(containing(money(149_500, 'EUR'))).length,
    ).toBeGreaterThan(0);
  });
});
