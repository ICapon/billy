import type {
  ActivitySummary,
  AttentionItems,
  BusinessFile,
  FilesPage,
  FileStatus,
} from '@org/shared';
import { createTestApp, type TestApp } from '../../testing/test-app';

// 2034-03-01 is a Wednesday. Dates in 2034 keep this suite away from other test data.
const at = (iso: string) => new Date(`${iso}Z`);

describe('DashboardController (integration)', () => {
  let t: TestApp | null = null;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  const run = (name: string, fn: (t: TestApp) => Promise<void>) =>
    it(name, async () => {
      if (t) await fn(t);
    });

  const add = (app: TestApp, status: FileStatus, uploadedAt: string) =>
    app.repos.files.insert({
      originalName: `${status}.csv`,
      mimeType: 'text/csv',
      sizeBytes: 1,
      sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
      storageKey: `${app.ownerId}/${status}.csv`,
      status,
      uploadedAt: at(uploadedAt),
    });

  const activity = async (app: TestApp, from: string, to: string) => {
    const response = await fetch(
      `${app.base}/api/dashboard/activity?from=${from}&to=${to}`,
    );
    expect(response.status).toBe(200);
    return (await response.json()) as ActivitySummary;
  };

  run(
    'returns zeros and a zero-filled series for an empty period',
    async (app) => {
      const summary = await activity(app, '2034-01-01', '2034-01-07');
      expect(summary).toMatchObject({
        bucket: 'day',
        total: 0,
        finished: 0,
        successRate: null,
        avgAnalysisSeconds: null,
        byMethod: { digital: 0, ocr: 0, vision: 0 },
      });
      expect(summary.series).toHaveLength(7);
      expect(
        summary.series.every((p) => p.uploaded === 0 && p.finished === 0),
      ).toBe(true);
    },
  );

  run('matches the files list for the same dates', async (app) => {
    await add(app, 'completed', '2034-03-02T10:00:00');
    await add(app, 'completed', '2034-03-03T10:00:00');
    await add(app, 'needs_review', '2034-03-04T10:00:00');
    await add(app, 'failed', '2034-03-05T10:00:00');
    await add(app, 'processing', '2034-03-06T10:00:00');
    await add(app, 'completed', '2034-04-20T10:00:00'); // outside

    const summary = await activity(app, '2034-03-01', '2034-03-31');
    expect(summary.counts).toEqual({
      received: 0,
      processing: 1,
      queuedLimit: 0,
      completed: 2,
      needsReview: 1,
      failed: 1,
    });
    expect(summary.total).toBe(5);
    expect(summary.finished).toBe(4);
    expect(summary.successRate).toBeCloseTo(0.5, 5);
    expect(summary.series.reduce((a, p) => a + p.uploaded, 0)).toBe(5);

    const list = (await (
      await fetch(
        `${app.base}/api/files?from=2034-03-01&to=2034-03-31&limit=100`,
      )
    ).json()) as FilesPage;
    expect(list.items).toHaveLength(summary.total);
    const byStatus = (status: FileStatus) =>
      list.items.filter((f: BusinessFile) => f.status === status).length;
    expect(byStatus('completed')).toBe(summary.counts.completed);
    expect(byStatus('failed')).toBe(summary.counts.failed);
  });

  run('buckets long periods by week', async (app) => {
    const summary = await activity(app, '2034-03-01', '2034-05-15');
    expect(summary.bucket).toBe('week');
    // Monday-start weeks: the first bucket is the Monday on or before 2034-03-01
    expect(summary.series[0].bucketStart).toBe('2034-02-27');
  });

  run('validates the dates', async (app) => {
    for (const query of [
      '',
      'from=2034-03-01',
      'from=bad&to=2034-03-31',
      'from=2034-03-31&to=2034-03-01',
    ]) {
      expect(
        (await fetch(`${app.base}/api/dashboard/activity?${query}`)).status,
      ).toBe(400);
    }
  });

  const attention = async (app: TestApp) =>
    (await (
      await fetch(`${app.base}/api/dashboard/attention`)
    ).json()) as AttentionItems;

  run('attention returns zeros for an empty business', async () => {
    const empty = await createTestApp();
    if (!empty) return;
    try {
      expect(await attention(empty)).toEqual({
        needsReview: 0,
        failed: 0,
        queuedLimit: 0,
        pendingDuplicates: 0,
        unconfirmed: [],
      });
    } finally {
      await empty.close();
    }
  });

  run(
    'attention matches the files list and the duplicates list, and drops when resolved',
    async (app) => {
      await add(app, 'needs_review', '2020-01-01T10:00:00'); // old, still counts
      await add(app, 'queued_limit', '2034-06-01T10:00:00');

      const before = await attention(app);
      const countByStatus = async (status: string) =>
        (
          (await (
            await fetch(`${app.base}/api/files?status=${status}&limit=100`)
          ).json()) as FilesPage
        ).items.length;
      expect(before.needsReview).toBe(await countByStatus('needs_review'));
      expect(before.failed).toBe(await countByStatus('failed'));
      expect(before.queuedLimit).toBe(await countByStatus('queued_limit'));

      const a = await add(app, 'completed', '2034-06-02T10:00:00');
      const b = await add(app, 'completed', '2034-06-03T10:00:00');
      const base = {
        occurredOn: '2034-06-02',
        amountMinor: 4200,
        currency: 'USD',
        kind: 'expense' as const,
        category: 'supplies' as const,
        counterparty: 'Proveedor',
        confidence: 0.9,
        lineItems: [],
      };
      const [x] = await app.repos.records.replaceExtracted(a.id, [base]);
      const [y] = await app.repos.records.replaceExtracted(b.id, [base]);
      await app.repos.duplicates.insertPair(x.id, y.id);

      const withPair = await attention(app);
      const pending = (await (
        await fetch(`${app.base}/api/duplicates`)
      ).json()) as { id: string }[];
      expect(withPair.pendingDuplicates).toBe(pending.length);
      expect(withPair.unconfirmed).toEqual([
        { currency: 'USD', amountMinor: 8400 },
      ]);

      const resolve = await fetch(
        `${app.base}/api/duplicates/${pending[0].id}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'keep_both' }),
        },
      );
      expect(resolve.status).toBe(204);
      expect((await attention(app)).pendingDuplicates).toBe(
        withPair.pendingDuplicates - 1,
      );
    },
  );
});
