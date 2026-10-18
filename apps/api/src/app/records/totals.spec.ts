import type { TransactionData } from '@org/db';
import type { RecordsPage, TotalsRow } from '@org/shared';
import { createTestApp, type TestApp } from '../../testing/test-app';

// 2032-03-01 is a Monday; weeks: 03-01..03-07, 03-08..03-14 (Monday start)
const rec = (overrides: Partial<TransactionData>): TransactionData => ({
  occurredOn: '2032-03-02',
  amountMinor: 1000,
  currency: 'USD',
  kind: 'expense',
  category: 'supplies',
  counterparty: 'Proveedor',
  confidence: 0.9,
  lineItems: [],
  ...overrides,
});

describe('Records queries (integration)', () => {
  let t: TestApp | null = null;
  let sunday: TestApp | null = null;

  async function seed(app: TestApp) {
    const mk = (name: string, status: 'completed' | 'needs_review') =>
      app.repos.files.insert({
        originalName: name,
        mimeType: 'text/csv',
        sizeBytes: 1,
        sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
        storageKey: `${app.ownerId}/${name}`,
        status,
      });
    const [ok, review] = [
      await mk('ok.csv', 'completed'),
      await mk('review.csv', 'needs_review'),
    ];
    const created = await app.repos.records.replaceExtracted(ok.id, [
      rec({ occurredOn: '2032-03-01', amountMinor: 1000 }), // Monday
      rec({ occurredOn: '2032-03-07', amountMinor: 2000 }), // Sunday, same Monday-week
      rec({ occurredOn: '2032-03-08', amountMinor: 4000 }), // next Monday-week
      rec({
        occurredOn: '2032-03-03',
        amountMinor: 7000,
        category: 'staff',
        counterparty: 'Ana',
      }),
      rec({
        occurredOn: '2032-03-04',
        amountMinor: 9000,
        kind: 'income',
        category: 'sales',
      }),
      rec({ occurredOn: '2032-04-02', amountMinor: 500 }),
    ]);
    await app.repos.records.replaceExtracted(review.id, [
      rec({ amountMinor: 999999 }),
    ]);
    await app.repos.records.confirm(created[0].id);
    const other = await mk('merged.csv', 'completed');
    const [merged] = await app.repos.records.replaceExtracted(other.id, [
      rec({
        occurredOn: '2032-03-02',
        amountMinor: 888888,
        counterparty: 'Fusionado',
      }),
    ]);
    await app.repos.records.excludeAsMerged(merged.id);
  }

  beforeAll(async () => {
    t = await createTestApp();
    if (t) await seed(t);
    sunday = await createTestApp({ BUSINESS_WEEK_START: 'sunday' });
    if (sunday) await seed(sunday);
  });
  afterAll(async () => {
    await t?.close();
    await sunday?.close();
  });

  const run = (name: string, fn: (t: TestApp) => Promise<void>) =>
    it(name, async () => {
      if (t) await fn(t);
    });

  const totals = async (app: TestApp, query: string) => {
    const response = await fetch(`${app.base}/api/records/totals?${query}`);
    expect(response.status).toBe(200);
    return (await response.json()) as TotalsRow[];
  };

  run(
    'groups expenses by Monday-start week with confirmed/unconfirmed parts',
    async (app) => {
      const rows = await totals(
        app,
        'from=2032-03-01&to=2032-03-31&groupBy=week&kind=expense',
      );
      const supplies = rows.filter((r) => r.category === 'supplies');
      const byWeek = Object.fromEntries(
        supplies.map((r) => [r.bucketStart, r]),
      );
      expect(byWeek['2032-03-01']).toMatchObject({
        totalMinor: 3000,
        confirmedMinor: 1000,
        unconfirmedMinor: 2000,
      });
      expect(byWeek['2032-03-08']).toMatchObject({
        totalMinor: 4000,
        confirmedMinor: 0,
        unconfirmedMinor: 4000,
      });
      // excluded: the needs_review file (999999) and the merged duplicate (888888)
      expect(rows.some((r) => r.totalMinor >= 888888)).toBe(false);
    },
  );

  run(
    'groups by month and separates staff expenses and income',
    async (app) => {
      const rows = await totals(
        app,
        'from=2032-03-01&to=2032-04-30&groupBy=month',
      );
      const find = (bucket: string, kind: string, category: string) =>
        rows.find(
          (r) =>
            r.bucketStart === bucket &&
            r.kind === kind &&
            r.category === category,
        );
      expect(find('2032-03-01', 'expense', 'supplies')?.totalMinor).toBe(7000);
      expect(find('2032-03-01', 'expense', 'staff')?.totalMinor).toBe(7000);
      expect(find('2032-03-01', 'income', 'sales')?.totalMinor).toBe(9000);
      expect(find('2032-04-01', 'expense', 'supplies')?.totalMinor).toBe(500);

      const staffOnly = await totals(
        app,
        'from=2032-03-01&to=2032-04-30&groupBy=month&category=staff',
      );
      expect(staffOnly).toHaveLength(1);
      expect(staffOnly[0].category).toBe('staff');
    },
  );

  run('applies the date range inclusively', async (app) => {
    const rows = await totals(
      app,
      'from=2032-03-02&to=2032-03-07&groupBy=month&kind=expense&category=supplies',
    );
    expect(rows[0].totalMinor).toBe(2000); // only 03-07 (03-01 is before the range)
  });

  it('weeks start on Sunday when configured', async () => {
    if (!sunday) return;
    const rows = await totals(
      sunday,
      'from=2032-03-01&to=2032-03-31&groupBy=week&kind=expense&category=supplies',
    );
    const byWeek = Object.fromEntries(
      rows.map((r) => [r.bucketStart, r.totalMinor]),
    );
    // 2032-02-29 is the Sunday before 03-01; 03-07 is a Sunday that starts the next week
    expect(byWeek['2032-02-29']).toBe(1000);
    expect(byWeek['2032-03-07']).toBe(6000);
  });

  run('validates the query', async (app) => {
    for (const query of [
      '',
      'from=2032-03-01&to=2032-03-31',
      'from=2032-03-01&to=2032-03-31&groupBy=year',
      'from=bad&to=2032-03-31&groupBy=week',
      'from=2032-03-01&to=2032-03-31&groupBy=week&category=pizza',
    ]) {
      expect(
        (await fetch(`${app.base}/api/records/totals?${query}`)).status,
      ).toBe(400);
    }
  });

  run('lists records with filters and cursor pagination', async (app) => {
    const get = async (query: string) =>
      (await (
        await fetch(`${app.base}/api/records?${query}`)
      ).json()) as RecordsPage;

    const staff = await get('category=staff');
    expect(staff.items).toHaveLength(1);
    expect(staff.items[0].counterparty).toBe('Ana');

    const range = await get('from=2032-03-01&to=2032-03-04&kind=expense');
    expect(
      range.items.every(
        (r) => r.occurredOn >= '2032-03-01' && r.occurredOn <= '2032-03-04',
      ),
    ).toBe(true);

    const page1 = await get('limit=2');
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await get(`limit=2&cursor=${page1.nextCursor}`);
    expect(page2.items[0].id).not.toBe(page1.items[0].id);
    expect(
      page2.items.every((r) => !page1.items.some((p) => p.id === r.id)),
    ).toBe(true);

    expect((await fetch(`${app.base}/api/records?limit=0`)).status).toBe(400);
  });
});
