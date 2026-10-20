import { fireEvent, render, screen } from '@testing-library/react';
import type { CommercialView, SalesView } from '@org/shared';
import { CommercialTab } from '../src/app/components/results/commercial-tab';
import { SalesTab } from '../src/app/components/results/sales-tab';
import * as api from '../src/app/lib/files-api';
import { formatMoney } from '../src/app/lib/format';

jest.mock('../src/app/lib/files-api');
const mocked = api as jest.Mocked<typeof api>;

const period = { from: '2026-03-01', to: '2026-03-31' };
const norm = (value: string) => value.replace(/\s/g, ' ');
const money = (minor: number, currency = 'USD') =>
  norm(formatMoney(minor, currency));
const containing = (value: string) => (content: string) =>
  norm(content).includes(value);

const invoices: CommercialView = {
  currency: 'USD',
  kind: 'invoice',
  documents: 3,
  totalMinor: 18_000,
  taxMinor: 1_600,
  paidMinor: 10_000,
  pendingMinor: 5_000,
  topCounterparties: [
    { counterparty: 'Súper Mercado', totalMinor: 15_000, documents: 2 },
    { counterparty: 'Ferretería', totalMinor: 3_000, documents: 1 },
  ],
};
const receipts: CommercialView = {
  ...invoices,
  kind: 'receipt',
  documents: 1,
  totalMinor: 800,
  taxMinor: 0,
  paidMinor: 800,
  pendingMinor: 0,
  topCounterparties: [],
};

const sales: SalesView = {
  currency: 'USD',
  totalSalesMinor: 100_000,
  unitsSold: 20,
  averageTicketMinor: 12_500,
  bestProducts: [
    { productName: 'Pan', quantity: 16, totalMinor: 60_000 },
    { productName: 'Leche', quantity: 4, totalMinor: 15_000 },
  ],
  series: [
    { bucketStart: '2026-03-10', totalMinor: 40_000 },
    { bucketStart: '2026-03-11', totalMinor: 60_000 },
  ],
};

beforeEach(() => {
  jest.resetAllMocks();
  mocked.getCommercial.mockResolvedValue([invoices, receipts]);
  mocked.getSales.mockResolvedValue([sales]);
  mocked.listFiles.mockResolvedValue({ items: [], nextCursor: null });
});

describe('CommercialTab', () => {
  it('shows totals, taxes, paid versus pending and the top counterparties', async () => {
    render(<CommercialTab period={period} refreshKey={0} />);
    expect(await screen.findByText('Pagado')).toBeTruthy();
    expect(
      screen.getAllByText(containing(money(18_000))).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(containing(money(1_600))).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(containing(money(10_000))).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(containing(money(5_000))).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Súper Mercado (2)')).toBeTruthy();
    expect(mocked.getCommercial).toHaveBeenCalledWith(period);
  });

  it('switches to receipts', async () => {
    render(<CommercialTab period={period} refreshKey={0} />);
    await screen.findByText('Pagado');
    fireEvent.click(screen.getByRole('button', { name: 'Recibos' }));
    expect(screen.getAllByText(containing(money(800))).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByText('Ningún documento indica contraparte.'),
    ).toBeTruthy();
  });

  it('explains the empty state and lists documents of type "other" to classify', async () => {
    mocked.getCommercial.mockResolvedValue([]);
    mocked.listFiles.mockResolvedValue({
      items: [
        {
          id: '3f0e8b4e-7c1a-4d6e-9a53-1f6f5d0c2b11',
          originalName: 'contrato.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          status: 'completed',
          failureReason: null,
          readingMethod: 'digital',
          totalCostMicroUsd: 0,
          duplicateOf: null,
          documentType: 'other',
          documentTypeConfidence: 0.4,
          documentTypeManual: false,
          uploadedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    render(<CommercialTab period={period} refreshKey={0} />);
    expect(
      await screen.findByText(/No hay facturas ni recibos en este periodo/),
    ).toBeTruthy();
    expect(await screen.findByText('contrato.pdf')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Elegir tipo' }).getAttribute('href'),
    ).toContain('/files/');
    expect(mocked.listFiles).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: 'other' }),
    );
  });
});

describe('SalesTab', () => {
  it('shows total sales, units, average ticket, best products and the series', async () => {
    render(<SalesTab period={period} refreshKey={0} />);
    expect(await screen.findByText('Ventas totales')).toBeTruthy();
    expect(
      screen.getAllByText(containing(money(100_000))).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('20')).toBeTruthy();
    expect(
      screen.getAllByText(containing(money(12_500))).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Pan × 16')).toBeTruthy();
    expect(screen.getByText('Ventas por día')).toBeTruthy();
  });

  it('says why there is no average ticket and no product detail', async () => {
    mocked.getSales.mockResolvedValue([
      { ...sales, averageTicketMinor: null, bestProducts: [], series: [] },
    ]);
    render(<SalesTab period={period} refreshKey={0} />);
    expect(
      await screen.findByText(/los reportes no indican transacciones/),
    ).toBeTruthy();
    expect(screen.getByText(/no traen detalle por producto/)).toBeTruthy();
    expect(screen.getByText(/Sin ventas con fecha/)).toBeTruthy();
  });

  it('explains the empty state and links to the upload screen', async () => {
    mocked.getSales.mockResolvedValue([]);
    render(<SalesTab period={period} refreshKey={0} />);
    expect(
      await screen.findByText(/No hay reportes de ventas en este periodo/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Subir un reporte de ventas' })
        .getAttribute('href'),
    ).toBe('/upload');
  });
});
