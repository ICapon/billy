import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  EmployeeHistory,
  PayrollLineView,
  PayrollView,
} from '@org/shared';
import { PayrollTab } from '../src/app/components/results/payroll-tab';
import * as api from '../src/app/lib/files-api';
import { formatMoney } from '../src/app/lib/format';

jest.mock('../src/app/lib/files-api');
const mocked = api as jest.Mocked<typeof api>;

const period = { from: '2026-01-01', to: '2026-03-31' };
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const money = (minor: number) => formatMoney(minor, 'USD').replace(/\s/g, ' ');
const text = (value: string) => (content: string) =>
  content.replace(/\s/g, ' ').includes(value);

const view: PayrollView = {
  currency: 'USD',
  periods: [
    {
      documentId: id(1),
      fileId: id(11),
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      employees: 2,
      grossMinor: 300_000,
      netMinor: 240_000,
      deductionsMinor: 60_000,
      totalCostMinor: 340_000,
      consistency: 'ok',
    },
    {
      documentId: id(2),
      fileId: id(12),
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      employees: 2,
      grossMinor: 310_000,
      netMinor: 100_000,
      deductionsMinor: 60_000,
      totalCostMinor: 310_000,
      consistency: 'inconsistent',
    },
  ],
};

const lines: PayrollLineView[] = [
  {
    employeeKey: 'ana lopez',
    employeeName: 'Ana López',
    grossMinor: 200_000,
    deductionsMinor: 40_000,
    netMinor: 160_000,
  },
  {
    employeeKey: 'beto ruiz',
    employeeName: 'Beto Ruiz',
    grossMinor: 100_000,
    deductionsMinor: 20_000,
    netMinor: 80_000,
  },
];

const history: EmployeeHistory = {
  employeeKey: 'ana lopez',
  employeeName: 'Ana López',
  history: [
    {
      documentId: id(1),
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      currency: 'USD',
      grossMinor: 200_000,
      deductionsMinor: 40_000,
      netMinor: 160_000,
    },
    {
      documentId: id(2),
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      currency: 'USD',
      grossMinor: 210_000,
      deductionsMinor: 42_000,
      netMinor: 168_000,
    },
  ],
};

beforeEach(() => {
  jest.resetAllMocks();
  mocked.getPayroll.mockResolvedValue([view]);
  mocked.getPayrollLines.mockResolvedValue(lines);
  mocked.getEmployeeHistory.mockResolvedValue(history);
});

describe('PayrollTab', () => {
  it('shows the totals, a row per period and the review state of an inconsistent payroll', async () => {
    render(<PayrollTab period={period} refreshKey={0} />);
    expect((await screen.findAllByText('Costo total')).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(text(money(650_000))).length).toBeGreaterThan(0); // total cost of both periods
    expect(screen.getByText('Requiere revisión')).toBeTruthy();
    expect(screen.getByText('Cuadra')).toBeTruthy();
    expect(mocked.getPayroll).toHaveBeenCalledWith(period);
  });

  it('lists the employees of the selected period', async () => {
    render(<PayrollTab period={period} refreshKey={0} />);
    const firstPeriod = (
      await screen.findAllByRole('button', { expanded: false })
    )[0];
    fireEvent.click(firstPeriod);
    expect(await screen.findByText('Ana López')).toBeTruthy();
    expect(screen.getByText('Beto Ruiz')).toBeTruthy();
    expect(mocked.getPayrollLines).toHaveBeenCalledWith(id(1));
  });

  it('shows the pay history of the selected employee', async () => {
    render(<PayrollTab period={period} refreshKey={0} />);
    fireEvent.click(
      (await screen.findAllByRole('button', { expanded: false }))[0],
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Ana López' }));
    await waitFor(() =>
      expect(mocked.getEmployeeHistory).toHaveBeenCalledWith('ana lopez'),
    );
    expect(await screen.findByText('Historial de pago')).toBeTruthy();
    expect(screen.getAllByText(text(money(168_000))).length).toBeGreaterThan(0);
  });

  it('explains the empty state and links to the upload screen', async () => {
    mocked.getPayroll.mockResolvedValue([]);
    render(<PayrollTab period={period} refreshKey={0} />);
    expect(
      await screen.findByText(/No hay nóminas en este periodo/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Subir una nómina' })
        .getAttribute('href'),
    ).toBe('/upload');
  });
});
