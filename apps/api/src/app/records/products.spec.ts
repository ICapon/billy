import type { TransactionData } from '@org/db';
import type { ProductRow, RecordsPage } from '@org/shared';
import { createTestApp, type TestApp } from '../../testing/test-app';

const base: TransactionData = {
  occurredOn: '2032-06-02',
  amountMinor: 0,
  currency: 'USD',
  kind: 'expense',
  category: 'supplies',
  counterparty: 'Mayorista',
  confidence: 0.9,
  lineItems: [],
};

describe('Products (integration)', () => {
  let t: TestApp | null = null;
  beforeAll(async () => {
    t = await createTestApp();
    if (!t) return;
    const file = await t.repos.files.insert({
      originalName: 'productos.csv',
      mimeType: 'text/csv',
      sizeBytes: 1,
      sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
      storageKey: `${t.ownerId}/productos.csv`,
      status: 'completed',
    });
    await t.repos.records.replaceExtracted(file.id, [
      {
        ...base,
        amountMinor: 1500,
        lineItems: [
          {
            productName: 'Harina',
            quantity: 2,
            unitPriceMinor: 500,
            totalMinor: 1000,
            direction: 'purchase',
          },
          {
            productName: 'Azúcar',
            quantity: 1,
            unitPriceMinor: 500,
            totalMinor: 500,
            direction: 'purchase',
          },
        ],
      },
      {
        ...base,
        occurredOn: '2032-06-10',
        amountMinor: 700,
        lineItems: [
          {
            productName: 'harina',
            quantity: 1,
            unitPriceMinor: 700,
            totalMinor: 700,
            direction: 'purchase',
          },
        ],
      },
      {
        ...base,
        kind: 'income',
        category: 'sales',
        amountMinor: 3000,
        lineItems: [
          {
            productName: 'Pan',
            quantity: 30,
            unitPriceMinor: 100,
            totalMinor: 3000,
            direction: 'sale',
          },
        ],
      },
    ]);
  });
  afterAll(async () => t?.close());

  const run = (name: string, fn: (t: TestApp) => Promise<void>) =>
    it(name, async () => {
      if (t) await fn(t);
    });

  const products = async (app: TestApp, query: string) => {
    const response = await fetch(`${app.base}/api/records/products?${query}`);
    expect(response.status).toBe(200);
    return (await response.json()) as ProductRow[];
  };

  run(
    'lists purchased products grouped case-insensitively, biggest first',
    async (app) => {
      const rows = await products(app, 'direction=purchase');
      expect(
        rows.map((r) => [
          r.productName.toLowerCase(),
          r.quantity,
          r.totalMinor,
        ]),
      ).toEqual([
        ['harina', 3, 1700],
        ['azúcar', 1, 500],
      ]);
    },
  );

  run('lists sold products separately', async (app) => {
    const rows = await products(app, 'direction=sale');
    expect(rows).toEqual([
      { productName: 'Pan', quantity: 30, totalMinor: 3000, currency: 'USD' },
    ]);
  });

  run('filters products by date range', async (app) => {
    const rows = await products(
      app,
      'direction=purchase&from=2032-06-05&to=2032-06-30',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].totalMinor).toBe(700);
  });

  run('requires a valid direction', async (app) => {
    expect((await fetch(`${app.base}/api/records/products`)).status).toBe(400);
    expect(
      (await fetch(`${app.base}/api/records/products?direction=gift`)).status,
    ).toBe(400);
  });

  run('filters records by product name', async (app) => {
    const response = await fetch(`${app.base}/api/records?product=hari`);
    const page = (await response.json()) as RecordsPage;
    expect(page.items).toHaveLength(2);
    expect(
      page.items.every((r) =>
        r.lineItems.some((i) => /harina/i.test(i.productName)),
      ),
    ).toBe(true);
  });
});
