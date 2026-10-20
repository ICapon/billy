import type { NewDocument, TransactionData } from '@org/db';
import type { CommercialView, SalesView } from '@org/shared';
import { createTestApp, type TestApp } from '../../testing/test-app';

const commercial = (
  type: 'invoice' | 'receipt',
  issueDate: string,
  counterparty: string | null,
  total: number,
  extra: {
    tax?: number | null;
    status?: 'paid' | 'pending' | 'unknown';
    currency?: string;
  } = {},
): NewDocument => ({
  type,
  typeConfidence: 0.95,
  periodStart: null,
  periodEnd: null,
  issueDate,
  currency: extra.currency ?? 'USD',
  consistency: 'ok',
  consistencyNotes: null,
  details: {
    counterparty,
    subtotalMinor: null,
    taxMinor: extra.tax ?? null,
    totalMinor: total,
    paymentStatus: extra.status ?? 'unknown',
  },
});

const sales = (
  periodEnd: string,
  total: number,
  units: number | null,
  count: number | null,
  currency = 'USD',
): NewDocument => ({
  type: 'sales_report',
  typeConfidence: 0.95,
  periodStart: `${periodEnd.slice(0, 8)}01`,
  periodEnd,
  issueDate: null,
  currency,
  consistency: 'ok',
  consistencyNotes: null,
  details: {
    totalSalesMinor: total,
    unitsSold: units,
    transactionCount: count,
  },
});

const income = (
  occurredOn: string,
  amountMinor: number,
  documentId: string,
  lineItems: TransactionData['lineItems'] = [],
): TransactionData => ({
  occurredOn,
  amountMinor,
  currency: 'USD',
  kind: 'income',
  category: 'sales',
  counterparty: null,
  confidence: 0.9,
  documentId,
  lineItems,
});

describe('Invoices, receipts and sales views (integration)', () => {
  let t: TestApp | null = null;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  const run = (name: string, fn: (t: TestApp) => Promise<void>) =>
    it(name, async () => {
      if (t) await fn(t);
    });

  const file = (app: TestApp, name: string) =>
    app.repos.files.insert({
      originalName: name,
      mimeType: 'application/pdf',
      sizeBytes: 1,
      sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
      storageKey: `${app.ownerId}/${name}`,
      status: 'completed',
    });

  const get = async <T>(app: TestApp, path: string) => {
    const response = await fetch(`${app.base}/api/documents/${path}`);
    return { status: response.status, body: (await response.json()) as T };
  };

  run(
    'totals invoices and receipts by issue date, with taxes, paid/pending and top counterparties',
    async (app) => {
      const f = await file(app, 'facturas.pdf');
      await app.repos.documents.replaceForFile(f.id, [
        commercial('invoice', '2070-03-05', 'Súper Mercado, S.A.', 10_000, {
          tax: 1_600,
          status: 'paid',
        }),
        commercial('invoice', '2070-03-20', 'SUPER MERCADO SA', 5_000, {
          status: 'pending',
        }),
        commercial('invoice', '2070-03-25', 'Ferretería', 3_000),
        commercial('invoice', '2070-04-02', 'Fuera de rango', 99_999), // outside the range
        commercial('receipt', '2070-03-10', 'Café', 800, {
          tax: 100,
          status: 'paid',
        }),
        commercial('invoice', '2070-03-11', 'Euro SL', 700, {
          currency: 'EUR',
        }),
      ]);
      const { status, body } = await get<CommercialView[]>(
        app,
        'commercial?from=2070-03-01&to=2070-03-31',
      );
      expect(status).toBe(200);
      const usdInvoice = body.find(
        (v) => v.currency === 'USD' && v.kind === 'invoice',
      );
      expect(usdInvoice).toMatchObject({
        documents: 3,
        totalMinor: 18_000,
        taxMinor: 1_600,
        paidMinor: 10_000,
        pendingMinor: 5_000,
      });
      expect(usdInvoice?.topCounterparties[0]).toEqual({
        counterparty: 'Súper Mercado, S.A.',
        totalMinor: 15_000,
        documents: 2,
      });
      expect(body.find((v) => v.kind === 'receipt')).toMatchObject({
        documents: 1,
        totalMinor: 800,
        taxMinor: 100,
      });
      expect(body.find((v) => v.currency === 'EUR')).toMatchObject({
        totalMinor: 700,
      });
      expect(body.some((v) => v.totalMinor >= 99_999)).toBe(false);
    },
  );

  run(
    'reports sales totals, units, average ticket, best products and the series',
    async (app) => {
      const f = await file(app, 'ventas.pdf');
      const [id] = await app.repos.documents.replaceForFile(f.id, [
        sales('2071-03-31', 100_000, 20, 8),
      ]);
      await app.repos.records.replaceExtracted(f.id, [
        income('2071-03-10', 40_000, id, [
          {
            productName: 'Pan',
            quantity: 10,
            unitPriceMinor: null,
            totalMinor: 25_000,
            direction: 'sale',
          },
          {
            productName: 'Leche',
            quantity: 4,
            unitPriceMinor: null,
            totalMinor: 15_000,
            direction: 'sale',
          },
        ]),
        income('2071-03-11', 60_000, id, [
          {
            productName: 'PAN',
            quantity: 6,
            unitPriceMinor: null,
            totalMinor: 35_000,
            direction: 'sale',
          },
          {
            productName: 'Queso',
            quantity: 2,
            unitPriceMinor: null,
            totalMinor: 25_000,
            direction: 'sale',
          },
        ]),
      ]);
      const { status, body } = await get<SalesView[]>(
        app,
        'sales?from=2071-03-01&to=2071-03-31',
      );
      expect(status).toBe(200);
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        currency: 'USD',
        totalSalesMinor: 100_000,
        unitsSold: 20,
        averageTicketMinor: 12_500,
      });
      expect(
        body[0].bestProducts.map((p) => [
          p.productName.toLowerCase(),
          p.quantity,
          p.totalMinor,
        ]),
      ).toEqual([
        ['pan', 16, 60_000],
        ['queso', 2, 25_000],
        ['leche', 4, 15_000],
      ]);
      expect(body[0].series).toEqual([
        { bucketStart: '2071-03-10', totalMinor: 40_000 },
        { bucketStart: '2071-03-11', totalMinor: 60_000 },
      ]);
    },
  );

  run(
    'buckets the series by week for long ranges and uses the period-end rule',
    async (app) => {
      const f = await file(app, 'ventas2.pdf');
      const [a, b] = await app.repos.documents.replaceForFile(f.id, [
        sales('2072-03-31', 5_000, null, null),
        sales('2072-09-30', 9_000, null, null), // outside the range below
      ]);
      await app.repos.records.replaceExtracted(f.id, [
        income('2072-03-02', 2_000, a), // Monday (2072-03-02)
        income('2072-03-04', 3_000, a), // same week
        income('2072-09-02', 9_000, b),
      ]);
      const { body } = await get<SalesView[]>(
        app,
        'sales?from=2072-01-01&to=2072-06-30',
      );
      expect(body[0].totalSalesMinor).toBe(5_000);
      expect(body[0].averageTicketMinor).toBeNull();
      expect(body[0].series).toEqual([
        { bucketStart: '2072-02-29', totalMinor: 5_000 },
      ]);
    },
  );

  run(
    'returns nothing for an empty range and validates the dates',
    async (app) => {
      expect(
        (await get<unknown[]>(app, 'commercial?from=2080-01-01&to=2080-01-31'))
          .body,
      ).toEqual([]);
      expect(
        (await get<unknown[]>(app, 'sales?from=2080-01-01&to=2080-01-31')).body,
      ).toEqual([]);
      for (const path of [
        'commercial',
        'sales',
        'commercial?from=2080-02-01&to=2080-01-01',
        'sales?from=x&to=y',
      ]) {
        expect((await get(app, path)).status).toBe(400);
      }
    },
  );
});
