import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TotalsRow } from '@org/shared';
import { LossesTab } from '../src/app/components/results/losses-tab';
import * as api from '../src/app/lib/files-api';
import { formatMoney } from '../src/app/lib/format';

jest.mock('../src/app/lib/files-api');
const mocked = api as jest.Mocked<typeof api>;

const period = { from: '2026-01-01', to: '2026-03-31' };
const norm = (value: string) => value.replace(/\s/g, ' ');
const money = (minor: number, currency = 'USD') =>
  norm(formatMoney(minor, currency));
const containing = (value: string) => (content: string) =>
  norm(content).includes(value);

const row = (overrides: Partial<TotalsRow>): TotalsRow => ({
  bucketStart: '2026-01-01',
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
  row({ bucketStart, kind: 'income', category: 'sales', totalMinor, ...extra });

// January: loss of 20.00 (income 30, expenses 50). February: profit of 30.00. March: even.
const rows: TotalsRow[] = [
  row({ bucketStart: '2026-01-01', category: 'staff', totalMinor: 3500 }),
  row({ bucketStart: '2026-01-01', category: 'supplies', totalMinor: 1500 }),
  income('2026-01-01', 3000),
  row({ bucketStart: '2026-02-01', totalMinor: 1000 }),
  income('2026-02-01', 4000),
  row({ bucketStart: '2026-03-01', totalMinor: 700 }),
  income('2026-03-01', 700),
];

beforeEach(() => {
  jest.resetAllMocks();
  mocked.getTotals.mockResolvedValue(rows);
});

describe('LossesTab', () => {
  it('highlights the losing period with its amount and not the profitable ones', async () => {
    render(<LossesTab period={period} refreshKey={0} />);
    const heading = await screen.findByText('Periodos con pérdida', {
      selector: 'h3',
    });
    const list = heading.parentElement as HTMLElement;
    const items = list.querySelectorAll('li button');
    expect(items).toHaveLength(1);
    expect(norm(items[0].textContent ?? '')).toContain(money(-2000));
  });

  it('shows the net result, the number of losing periods and the largest loss', async () => {
    render(<LossesTab period={period} refreshKey={0} />);
    await screen.findByText('Resultado neto');
    expect(screen.getAllByText(containing(money(1000))).length).toBeGreaterThan(
      0,
    ); // net: -20 + 30 + 0 = 10
    expect(
      screen.getByText('Mayor pérdida').parentElement?.textContent,
    ).toContain(money(2000).slice(0, 4));
    expect(
      screen.getByText('Periodos con pérdida', { selector: 'span' })
        .parentElement?.textContent,
    ).toContain('1');
  });

  it('shows the main expense categories when a losing period is selected', async () => {
    render(<LossesTab period={period} refreshKey={0} />);
    const losing = (
      await screen.findAllByRole('button', { pressed: false })
    ).find((b) =>
      norm(b.textContent ?? '').includes(money(-2000)),
    ) as HTMLElement;
    fireEvent.click(losing);
    expect(await screen.findByText('Mayores gastos del periodo')).toBeTruthy();
    expect(screen.getByText('Personal')).toBeTruthy();
    expect(screen.getByText('Insumos')).toBeTruthy();
  });

  it('switches between week and month and asks for the new grouping', async () => {
    render(<LossesTab period={period} refreshKey={0} />);
    await screen.findByText('Resultado neto');
    expect(mocked.getTotals).toHaveBeenLastCalledWith({
      ...period,
      groupBy: 'month',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }));
    await waitFor(() =>
      expect(mocked.getTotals).toHaveBeenLastCalledWith({
        ...period,
        groupBy: 'week',
      }),
    );
  });

  it('says there were no losses instead of showing empty alerts', async () => {
    mocked.getTotals.mockResolvedValue([
      row({ totalMinor: 100 }),
      income('2026-01-01', 900),
    ]);
    render(<LossesTab period={period} refreshKey={0} />);
    expect(
      await screen.findByText(/No hubo pérdidas en este rango/),
    ).toBeTruthy();
  });

  it('labels the unconfirmed amount', async () => {
    mocked.getTotals.mockResolvedValue([
      row({ unconfirmedMinor: 250 }),
      income('2026-01-01', 100),
    ]);
    render(<LossesTab period={period} refreshKey={0} />);
    expect(await screen.findByText(/aún sin confirmar/)).toBeTruthy();
  });

  it('explains the empty state', async () => {
    mocked.getTotals.mockResolvedValue([]);
    render(<LossesTab period={period} refreshKey={0} />);
    expect(
      await screen.findByText(/No hay gastos ni ingresos en este periodo/),
    ).toBeTruthy();
  });
});
