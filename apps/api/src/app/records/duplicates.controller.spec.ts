import type { TransactionData } from '@org/db';
import type { DuplicateCandidate } from '@org/shared';
import { createTestApp, type TestApp } from '../../testing/test-app';

const sample = (overrides: Partial<TransactionData> = {}): TransactionData => ({
  occurredOn: '2031-03-04',
  amountMinor: 5000,
  currency: 'USD',
  kind: 'expense',
  category: 'supplies',
  counterparty: 'Proveedor',
  confidence: 0.9,
  lineItems: [],
  ...overrides,
});

describe('DuplicatesController (integration)', () => {
  let t: TestApp | null = null;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  const run = (name: string, fn: (t: TestApp) => Promise<void>) =>
    it(name, async () => {
      if (t) await fn(t);
    });

  async function pair(t: TestApp, amountMinor: number) {
    const mk = (name: string) =>
      t.repos.files.insert({
        originalName: name,
        mimeType: 'application/pdf',
        sizeBytes: 1,
        sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
        storageKey: `${t.ownerId}/${name}`,
        status: 'completed',
      });
    const [fa, fb] = [await mk('factura.pdf'), await mk('extracto.pdf')];
    const [a] = await t.repos.records.replaceExtracted(fa.id, [
      sample({ amountMinor }),
    ]);
    const [b] = await t.repos.records.replaceExtracted(fb.id, [
      sample({ amountMinor }),
    ]);
    await t.repos.duplicates.insertPair(a.id, b.id);
    return { a, b };
  }

  const pending = async (t: TestApp) =>
    (await (
      await fetch(`${t.base}/api/duplicates`)
    ).json()) as DuplicateCandidate[];
  const resolve = (t: TestApp, id: string, body: unknown) =>
    fetch(`${t.base}/api/duplicates/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  run('lists pending pairs with both records', async (t) => {
    const { a, b } = await pair(t, 5001);
    const list = await pending(t);
    const found = list.find((c) => [c.a.id, c.b.id].includes(a.id));
    expect(found?.status).toBe('pending');
    expect([found?.a.id, found?.b.id].sort()).toEqual([a.id, b.id].sort());
  });

  run(
    'keep_both leaves both records counting and closes the pair',
    async (t) => {
      const { a, b } = await pair(t, 5002);
      const candidate = (await pending(t)).find((c) =>
        [c.a.id, c.b.id].includes(a.id),
      );
      const response = await resolve(t, candidate!.id, { action: 'keep_both' });
      expect(response.status).toBe(204);

      expect((await pending(t)).some((c) => c.id === candidate!.id)).toBe(
        false,
      );
      expect((await t.repos.records.findById(a.id))?.excludedReason).toBeNull();
      expect((await t.repos.records.findById(b.id))?.excludedReason).toBeNull();
      expect(
        (await resolve(t, candidate!.id, { action: 'keep_both' })).status,
      ).toBe(409);
    },
  );

  run(
    'merge keeps one record and excludes the other from totals',
    async (t) => {
      const { a, b } = await pair(t, 5003);
      const candidate = (await pending(t)).find((c) =>
        [c.a.id, c.b.id].includes(a.id),
      );
      expect(
        (await resolve(t, candidate!.id, { action: 'merge' })).status,
      ).toBe(400);
      expect(
        (
          await resolve(t, candidate!.id, {
            action: 'merge',
            keepTransactionId: crypto.randomUUID(),
          })
        ).status,
      ).toBe(400);

      const sumTotals = async () =>
        (
          await t.repos.records.totals({
            from: '2031-03-01',
            to: '2031-03-31',
            groupBy: 'month',
          })
        ).reduce((sum: number, row) => sum + row.totalMinor, 0);
      const before = await sumTotals();
      expect(
        (
          await resolve(t, candidate!.id, {
            action: 'merge',
            keepTransactionId: a.id,
          })
        ).status,
      ).toBe(204);
      expect((await t.repos.records.findById(a.id))?.excludedReason).toBeNull();
      expect((await t.repos.records.findById(b.id))?.excludedReason).toBe(
        'merged_duplicate',
      );
      // the pair counted twice before the merge and once after it
      expect(before - (await sumTotals())).toBe(5003);
    },
  );

  run('returns 404 for unknown pairs', async (t) => {
    expect(
      (
        await resolve(t, '3f0e8b4e-7c1a-4d6e-9a53-1f6f5d0c2b11', {
          action: 'keep_both',
        })
      ).status,
    ).toBe(404);
  });
});
