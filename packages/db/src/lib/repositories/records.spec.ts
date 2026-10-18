import { filesRepository } from './files';
import { recordsRepository, type TransactionData } from './records';
import { describeDb } from './testing';

const expense = (
  overrides: Partial<TransactionData> = {},
): TransactionData => ({
  occurredOn: '2026-10-12',
  amountMinor: 10000,
  currency: 'USD',
  kind: 'expense',
  category: 'supplies',
  counterparty: 'Mayorista',
  confidence: 0.9,
  lineItems: [],
  ...overrides,
});

describeDb('recordsRepository', (ctx, dbIt) => {
  const repo = () => recordsRepository(ctx().handle.db, ctx().ownerId);
  const files = () => filesRepository(ctx().handle.db, ctx().ownerId);

  dbIt('stores records with line items and derives is_staff', async () => {
    const file = await ctx().newFile();
    const [record] = await repo().replaceExtracted(file.id, [
      expense({
        category: 'staff',
        lineItems: [
          {
            productName: '  Harina ',
            quantity: 2.5,
            unitPriceMinor: 400,
            totalMinor: 1000,
            direction: 'purchase',
          },
        ],
      }),
    ]);
    expect(record.isStaff).toBe(true);
    expect(record.lineItems[0].productKey).toBe('harina');
    expect(record.lineItems[0].quantity).toBe(2.5);
  });

  dbIt(
    're-extraction keeps confirmed records and skips their twins',
    async () => {
      const file = await ctx().newFile();
      const [first] = await repo().replaceExtracted(file.id, [
        expense(),
        expense({ amountMinor: 555, counterparty: 'Otro' }),
      ]);
      await repo().update(first.id, { amountMinor: 12345 });

      const rerun = await repo().replaceExtracted(file.id, [
        expense({ amountMinor: 12345 }),
        expense({ amountMinor: 777, counterparty: 'Nuevo' }),
      ]);
      const all = await repo().listByFile(file.id);
      expect(rerun).toHaveLength(1);
      expect(all.map((r) => r.amountMinor).sort((a, b) => a - b)).toEqual([
        777, 12345,
      ]);
      expect(all.find((r) => r.amountMinor === 12345)?.confirmed).toBe(true);
    },
  );

  dbIt(
    'update marks the record confirmed and replaces line items',
    async () => {
      const file = await ctx().newFile();
      const [record] = await repo().replaceExtracted(file.id, [expense()]);
      const updated = await repo().update(record.id, {
        category: 'staff',
        lineItems: [
          {
            productName: 'Pan',
            quantity: 1,
            unitPriceMinor: null,
            totalMinor: 100,
            direction: 'sale',
          },
        ],
      });
      expect(updated?.confirmed).toBe(true);
      expect(updated?.isStaff).toBe(true);
      expect(updated?.lineItems).toHaveLength(1);
      expect(await repo().countUnconfirmedByFile(file.id)).toBe(0);
    },
  );

  dbIt(
    'totals group by week (Monday) and split confirmed/unconfirmed',
    async () => {
      const file = await ctx().newFile({ status: 'completed' });
      const [a] = await repo().replaceExtracted(file.id, [
        // 2031-10-13 is a Monday, 2031-10-19 a Sunday (same week); 2031-10-20 starts the next
        expense({ occurredOn: '2031-10-13', amountMinor: 1000 }),
        expense({ occurredOn: '2031-10-19', amountMinor: 2000 }),
        expense({ occurredOn: '2031-10-20', amountMinor: 4000 }),
        expense({
          occurredOn: '2031-10-14',
          amountMinor: 9000,
          kind: 'income',
          category: 'sales',
        }),
      ]);
      await repo().confirm(a.id);

      const weekly = await repo().totals({
        from: '2031-10-01',
        to: '2031-10-31',
        groupBy: 'week',
        kind: 'expense',
      });
      const byBucket = Object.fromEntries(
        weekly.map((r) => [r.bucketStart, r]),
      );
      expect(byBucket['2031-10-13'].totalMinor).toBe(3000);
      expect(byBucket['2031-10-13'].confirmedMinor).toBe(1000);
      expect(byBucket['2031-10-13'].unconfirmedMinor).toBe(2000);
      expect(byBucket['2031-10-20'].totalMinor).toBe(4000);

      const monthly = await repo().totals({
        from: '2031-10-01',
        to: '2031-10-31',
        groupBy: 'month',
      });
      const income = monthly.find((r) => r.kind === 'income');
      expect(income?.totalMinor).toBe(9000);
      expect(income?.bucketStart).toBe('2031-10-01');
    },
  );

  dbIt('totals exclude needs_review files and merged duplicates', async () => {
    const good = await ctx().newFile({ status: 'completed' });
    const review = await ctx().newFile({ status: 'needs_review' });
    const [kept, merged] = await repo().replaceExtracted(good.id, [
      expense({ occurredOn: '2026-03-02', amountMinor: 500 }),
      expense({ occurredOn: '2026-03-02', amountMinor: 700 }),
    ]);
    await repo().replaceExtracted(review.id, [
      expense({ occurredOn: '2026-03-02', amountMinor: 100000 }),
    ]);
    await repo().excludeAsMerged(merged.id);

    const rows = await repo().totals({
      from: '2026-03-01',
      to: '2026-03-31',
      groupBy: 'month',
    });
    expect(rows.reduce((sum, r) => sum + r.totalMinor, 0)).toBe(500);
    expect(kept.id).toBeDefined();
  });

  dbIt('products aggregate purchases and sales separately', async () => {
    const file = await ctx().newFile({ status: 'completed' });
    await repo().replaceExtracted(file.id, [
      expense({
        occurredOn: '2026-05-04',
        lineItems: [
          {
            productName: 'Harina',
            quantity: 2,
            unitPriceMinor: 500,
            totalMinor: 1000,
            direction: 'purchase',
          },
          {
            productName: 'harina ',
            quantity: 1,
            unitPriceMinor: 500,
            totalMinor: 500,
            direction: 'purchase',
          },
        ],
      }),
      expense({
        occurredOn: '2026-05-05',
        kind: 'income',
        category: 'sales',
        lineItems: [
          {
            productName: 'Pan',
            quantity: 10,
            unitPriceMinor: 100,
            totalMinor: 1000,
            direction: 'sale',
          },
        ],
      }),
    ]);
    const purchases = await repo().products({
      direction: 'purchase',
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(purchases).toEqual([
      {
        productName: expect.stringMatching(/harina/i),
        currency: 'USD',
        quantity: 3,
        totalMinor: 1500,
      },
    ]);
    const sales = await repo().products({
      direction: 'sale',
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(sales[0]).toMatchObject({ quantity: 10, totalMinor: 1000 });
  });

  dbIt('list filters by product and paginates', async () => {
    const file = await ctx().newFile({ status: 'completed' });
    await repo().replaceExtracted(file.id, [
      expense({
        occurredOn: '2026-06-01',
        lineItems: [
          {
            productName: 'Queso fresco',
            quantity: 1,
            unitPriceMinor: null,
            totalMinor: 10,
            direction: 'purchase',
          },
        ],
      }),
      expense({ occurredOn: '2026-06-02' }),
      expense({ occurredOn: '2026-06-03' }),
    ]);
    const byProduct = await repo().list({
      product: 'queso',
      limit: 10,
      fileId: file.id,
    });
    expect(byProduct.items).toHaveLength(1);

    const page1 = await repo().list({ fileId: file.id, limit: 2 });
    expect(page1.items.map((r) => r.occurredOn)).toEqual([
      '2026-06-03',
      '2026-06-02',
    ]);
    const page2 = await repo().list({
      fileId: file.id,
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.items.map((r) => r.occurredOn)).toEqual(['2026-06-01']);
    expect(page2.nextCursor).toBeNull();
  });

  dbIt('deleting a file removes its records', async () => {
    const file = await ctx().newFile();
    const [record] = await repo().replaceExtracted(file.id, [expense()]);
    await files().delete(file.id);
    expect(await repo().findById(record.id)).toBeNull();
  });
});
