import type { TransactionData } from '@org/db';
import type { Transaction } from '@org/shared';
import { createTestApp, type TestApp } from '../../testing/test-app';

const sample = (overrides: Partial<TransactionData> = {}): TransactionData => ({
  occurredOn: '2026-10-12',
  amountMinor: 10000,
  currency: 'USD',
  kind: 'expense',
  category: 'supplies',
  counterparty: 'Mayorista',
  confidence: 0.6,
  lineItems: [],
  ...overrides,
});

describe('RecordsController (integration)', () => {
  let t: TestApp | null = null;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  const run = (name: string, fn: (t: TestApp) => Promise<void>) =>
    it(name, async () => {
      if (t) await fn(t);
    });

  const reviewFile = async (t: TestApp, records: TransactionData[]) => {
    const file = await t.repos.files.insert({
      originalName: 'review.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 5,
      sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
      storageKey: `${t.ownerId}/review.pdf`,
      status: 'needs_review',
      failureReason: 'Record 1 has low confidence (0.60)',
    });
    const created = await t.repos.records.replaceExtracted(file.id, records);
    return { file, created };
  };

  const patch = (t: TestApp, id: string, body: unknown) =>
    fetch(`${t.base}/api/records/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  run(
    'corrects a record, marks it confirmed and completes the file when all are confirmed',
    async (t) => {
      const { file, created } = await reviewFile(t, [
        sample(),
        sample({ amountMinor: 500 }),
      ]);

      const response = await patch(t, created[0].id, {
        amountMinor: 12345,
        category: 'staff',
        lineItems: [
          {
            productName: 'Sueldo',
            quantity: 1,
            unitPriceMinor: null,
            totalMinor: 12345,
            direction: 'purchase',
          },
        ],
      });
      expect(response.status).toBe(200);
      const updated = (await response.json()) as Transaction;
      expect(updated).toMatchObject({
        amountMinor: 12345,
        category: 'staff',
        isStaff: true,
        confirmed: true,
      });
      expect(updated.lineItems).toHaveLength(1);

      // one record still unconfirmed: the file keeps waiting
      expect((await t.repos.files.findById(file.id))?.status).toBe(
        'needs_review',
      );

      const confirm = await fetch(
        `${t.base}/api/records/${created[1].id}/confirm`,
        { method: 'POST' },
      );
      expect(confirm.status).toBe(200);
      expect(((await confirm.json()) as Transaction).confirmed).toBe(true);

      const completed = await t.repos.files.findById(file.id);
      expect(completed?.status).toBe('completed');
      expect(completed?.failureReason).toBeNull();
    },
  );

  run('validates edits with the shared schema', async (t) => {
    const { created } = await reviewFile(t, [sample()]);
    expect((await patch(t, created[0].id, { category: 'pizza' })).status).toBe(
      400,
    );
    expect((await patch(t, created[0].id, { amountMinor: -5 })).status).toBe(
      400,
    );
    expect(
      (await patch(t, created[0].id, { occurredOn: '12/10/2026' })).status,
    ).toBe(400);
    expect((await patch(t, 'not-a-uuid', {})).status).toBe(400);
  });

  run('returns 404 for unknown records', async (t) => {
    const id = '3f0e8b4e-7c1a-4d6e-9a53-1f6f5d0c2b11';
    expect((await patch(t, id, { amountMinor: 1 })).status).toBe(404);
    expect(
      (await fetch(`${t.base}/api/records/${id}/confirm`, { method: 'POST' }))
        .status,
    ).toBe(404);
    expect(
      (await fetch(`${t.base}/api/records/${id}`, { method: 'DELETE' })).status,
    ).toBe(404);
  });

  run(
    'deleting the last unconfirmed record completes a file whose others are confirmed',
    async (t) => {
      const { file, created } = await reviewFile(t, [
        sample(),
        sample({ amountMinor: 99 }),
      ]);
      await fetch(`${t.base}/api/records/${created[0].id}/confirm`, {
        method: 'POST',
      });

      const response = await fetch(`${t.base}/api/records/${created[1].id}`, {
        method: 'DELETE',
      });
      expect(response.status).toBe(204);
      expect(await t.repos.records.findById(created[1].id)).toBeNull();
      expect((await t.repos.files.findById(file.id))?.status).toBe('completed');
    },
  );

  run('does not complete a file that has no records', async (t) => {
    const { file, created } = await reviewFile(t, [sample()]);
    await fetch(`${t.base}/api/records/${created[0].id}`, { method: 'DELETE' });
    expect((await t.repos.files.findById(file.id))?.status).toBe(
      'needs_review',
    );
  });
});
