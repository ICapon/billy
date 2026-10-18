import { duplicatesRepository } from './duplicates';
import { recordsRepository, type TransactionData } from './records';
import { describeDb } from './testing';

const record = (overrides: Partial<TransactionData> = {}): TransactionData => ({
  occurredOn: '2026-08-10',
  amountMinor: 5000,
  currency: 'USD',
  kind: 'expense',
  category: 'supplies',
  counterparty: 'Proveedor',
  confidence: 0.9,
  lineItems: [],
  ...overrides,
});

describeDb('duplicatesRepository', (ctx, dbIt) => {
  const repo = () => duplicatesRepository(ctx().handle.db, ctx().ownerId);
  const records = () => recordsRepository(ctx().handle.db, ctx().ownerId);

  dbIt('finds same date/amount records in other files only', async () => {
    const a = await ctx().newFile();
    const b = await ctx().newFile();
    const [inA] = await records().replaceExtracted(a.id, [
      record(),
      record({ amountMinor: 5001 }),
    ]);
    const [inB] = await records().replaceExtracted(b.id, [
      record({ amountMinor: 5001 }),
      record({ occurredOn: '2026-08-11' }),
    ]);
    const matches = await repo().findSameDateAndAmount(inA);
    expect(matches.map((m) => m.id)).toEqual([inB.id]);
  });

  dbIt('stores each unordered pair once and resolves it', async () => {
    const a = await ctx().newFile();
    const b = await ctx().newFile();
    const [x] = await records().replaceExtracted(a.id, [
      record({ amountMinor: 1 }),
    ]);
    const [y] = await records().replaceExtracted(b.id, [
      record({ amountMinor: 1 }),
    ]);
    await repo().insertPair(x.id, y.id);
    await repo().insertPair(y.id, x.id);
    const pending = (await repo().listPending()).filter((c) =>
      [x.id, y.id].includes(c.transactionId),
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].transactionId < pending[0].matchesTransactionId).toBe(
      true,
    );
    const resolved = await repo().resolve(pending[0].id, 'kept_both');
    expect(resolved?.status).toBe('kept_both');
    expect(await repo().countPendingFor([x.id, y.id])).toBe(0);
  });
});
