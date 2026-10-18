import type { FileStatus, ReadingMethod } from '@org/shared';
import { dashboardRepository } from './dashboard';
import { duplicatesRepository } from './duplicates';
import { recordsRepository, type TransactionData } from './records';
import { runsRepository } from './runs';
import { describeDb, type DbTestContext } from './testing';

// Dates in 2033 so these suites never overlap other tests' data (owners differ anyway).
const at = (iso: string) => new Date(`${iso}Z`);

describeDb('dashboardRepository', (ctx, dbIt) => {
  const repo = () => dashboardRepository(ctx().handle.db, ctx().ownerId);

  async function file(
    c: DbTestContext,
    options: {
      status: FileStatus;
      uploadedAt: string;
      updatedAt?: string;
      method?: ReadingMethod;
      runSeconds?: number[];
    },
  ) {
    const row = await c.newFile({
      status: options.status,
      uploadedAt: at(options.uploadedAt),
      readingMethod: options.method ?? null,
    });
    if (options.updatedAt) {
      await c.handle.db.query(
        'UPDATE business_files SET updated_at = $1 WHERE id = $2',
        [at(options.updatedAt), row.id],
      );
    }
    if (options.runSeconds?.length) {
      const base = at(options.uploadedAt).getTime();
      await runsRepository(c.handle.db, c.ownerId).insertMany(
        row.id,
        options.runSeconds.map((seconds, i) => ({
          tier: 'digital' as const,
          status: 'succeeded' as const,
          confidence: 0.9,
          error: null,
          startedAt: new Date(base + i * 60_000),
          finishedAt: new Date(base + i * 60_000 + seconds * 1000),
        })),
      );
    }
    return row;
  }

  const period = { from: '2033-03-01', to: '2033-03-31' };

  dbIt(
    'counts files uploaded in the period by status, inclusive of both end dates',
    async () => {
      const c = ctx();
      await file(c, { status: 'completed', uploadedAt: '2033-03-01T00:00:00' });
      await file(c, { status: 'completed', uploadedAt: '2033-03-31T23:59:59' });
      await file(c, {
        status: 'needs_review',
        uploadedAt: '2033-03-10T10:00:00',
      });
      await file(c, { status: 'failed', uploadedAt: '2033-03-11T10:00:00' });
      await file(c, {
        status: 'processing',
        uploadedAt: '2033-03-12T10:00:00',
      });
      await file(c, { status: 'received', uploadedAt: '2033-03-12T11:00:00' });
      await file(c, {
        status: 'queued_limit',
        uploadedAt: '2033-03-12T12:00:00',
      });
      // outside the period
      await file(c, { status: 'completed', uploadedAt: '2033-02-28T23:59:59' });
      await file(c, { status: 'failed', uploadedAt: '2033-04-01T00:00:00' });

      const rows = await repo().activity(period, 'day', 'monday');
      expect(rows.counts).toEqual({
        received: 1,
        processing: 1,
        queuedLimit: 1,
        completed: 2,
        needsReview: 1,
        failed: 1,
      });
      const total = Object.values(rows.counts).reduce((a, b) => a + b, 0);
      expect(rows.uploaded.reduce((a, b) => a + b.count, 0)).toBe(total);
    },
  );

  dbIt(
    'averages the summed run time per file and ignores files without runs',
    async () => {
      const c = ctx();
      const owner = { ...c };
      // a fresh period so earlier tests do not interfere
      const p = { from: '2033-05-01', to: '2033-05-31' };
      await file(owner, {
        status: 'completed',
        uploadedAt: '2033-05-02T10:00:00',
        runSeconds: [10, 20],
      }); // 30 s
      await file(owner, {
        status: 'needs_review',
        uploadedAt: '2033-05-03T10:00:00',
        runSeconds: [10],
      }); // 10 s
      await file(owner, {
        status: 'failed',
        uploadedAt: '2033-05-04T10:00:00',
      }); // no runs: ignored
      await file(owner, {
        status: 'processing',
        uploadedAt: '2033-05-05T10:00:00',
        runSeconds: [999],
      }); // not finished: ignored

      const rows = await repo().activity(p, 'day', 'monday');
      expect(rows.avgAnalysisSeconds).toBeCloseTo(20, 5);
      expect(
        (
          await repo().activity(
            { from: '2033-06-01', to: '2033-06-30' },
            'day',
            'monday',
          )
        ).avgAnalysisSeconds,
      ).toBeNull();
    },
  );

  dbIt(
    'buckets uploads and finished analyses by day and by Monday or Sunday weeks',
    async () => {
      const c = ctx();
      const p = { from: '2033-07-01', to: '2033-08-14' };
      // 2033-07-04 is a Monday; 07-10 a Sunday
      await file(c, {
        status: 'completed',
        uploadedAt: '2033-07-04T09:00:00',
        updatedAt: '2033-07-04T09:05:00',
      });
      await file(c, {
        status: 'failed',
        uploadedAt: '2033-07-10T09:00:00',
        updatedAt: '2033-07-10T09:01:00',
      });
      await file(c, { status: 'received', uploadedAt: '2033-07-11T09:00:00' });
      // finished only after the period ends: counted as uploaded, not as finished in the series
      await file(c, {
        status: 'completed',
        uploadedAt: '2033-08-13T09:00:00',
        updatedAt: '2033-08-20T09:00:00',
      });

      const days = await repo().activity(
        { from: '2033-07-01', to: '2033-07-31' },
        'day',
        'monday',
      );
      expect(days.uploaded).toEqual(
        expect.arrayContaining([
          { bucketStart: '2033-07-04', count: 1 },
          { bucketStart: '2033-07-10', count: 1 },
          { bucketStart: '2033-07-11', count: 1 },
        ]),
      );
      expect(days.finished).toEqual(
        expect.arrayContaining([
          { bucketStart: '2033-07-04', count: 1 },
          { bucketStart: '2033-07-10', count: 1 },
        ]),
      );

      const monday = await repo().activity(p, 'week', 'monday');
      const upMon = Object.fromEntries(
        monday.uploaded.map((r) => [r.bucketStart, r.count]),
      );
      expect(upMon['2033-07-04']).toBe(2); // Mon 07-04 and Sun 07-10 share the Monday week
      expect(upMon['2033-07-11']).toBe(1);
      expect(monday.finished.reduce((a, b) => a + b.count, 0)).toBe(2); // the August file finished after the period

      const sunday = await repo().activity(p, 'week', 'sunday');
      const upSun = Object.fromEntries(
        sunday.uploaded.map((r) => [r.bucketStart, r.count]),
      );
      expect(upSun['2033-07-03']).toBe(1); // Sunday-start week containing Mon 07-04
      expect(upSun['2033-07-10']).toBe(2); // Sun 07-10 and Mon 07-11
    },
  );

  dbIt('counts the reading method of files in the period', async () => {
    const c = ctx();
    await file(c, {
      status: 'completed',
      uploadedAt: '2033-09-02T10:00:00',
      method: 'digital',
    });
    await file(c, {
      status: 'completed',
      uploadedAt: '2033-09-03T10:00:00',
      method: 'digital',
    });
    await file(c, {
      status: 'completed',
      uploadedAt: '2033-09-04T10:00:00',
      method: 'vision',
    });
    await file(c, { status: 'received', uploadedAt: '2033-09-05T10:00:00' });
    const rows = await repo().activity(
      { from: '2033-09-01', to: '2033-09-30' },
      'day',
      'monday',
    );
    expect(rows.byMethod).toEqual({ digital: 2, ocr: 0, vision: 1 });
  });

  dbIt('never mixes data of another owner', async () => {
    const c = ctx();
    await file(c, { status: 'completed', uploadedAt: '2033-10-02T10:00:00' });
    const other = dashboardRepository(c.handle.db, 'someone-else');
    const rows = await other.activity(
      { from: '2033-10-01', to: '2033-10-31' },
      'day',
      'monday',
    );
    expect(Object.values(rows.counts).every((n) => n === 0)).toBe(true);
    const attention = await other.attention();
    expect(
      attention.needsReview +
        attention.failed +
        attention.queuedLimit +
        attention.pendingDuplicates,
    ).toBe(0);
  });

  const expense = (
    overrides: Partial<TransactionData> = {},
  ): TransactionData => ({
    occurredOn: '2033-11-02',
    amountMinor: 1000,
    currency: 'USD',
    kind: 'expense',
    category: 'supplies',
    counterparty: 'Proveedor',
    confidence: 0.9,
    lineItems: [],
    ...overrides,
  });

  dbIt(
    'attention counts pending work regardless of date and uses the totals exclusions',
    async () => {
      const c = ctx();
      const records = recordsRepository(c.handle.db, c.ownerId);
      const duplicates = duplicatesRepository(c.handle.db, c.ownerId);
      // earlier tests of this suite also created files for the same owner: assert on deltas
      const before = await repo().attention();

      await file(c, {
        status: 'needs_review',
        uploadedAt: '2020-01-01T10:00:00',
      }); // very old, still counts
      await file(c, { status: 'failed', uploadedAt: '2033-12-01T10:00:00' });
      await file(c, {
        status: 'queued_limit',
        uploadedAt: '2033-12-02T10:00:00',
      });

      const good = await file(c, {
        status: 'completed',
        uploadedAt: '2033-12-03T10:00:00',
      });
      const review = await file(c, {
        status: 'needs_review',
        uploadedAt: '2033-12-04T10:00:00',
      });
      const [a, , confirmed] = await records.replaceExtracted(good.id, [
        expense({ amountMinor: 1500 }),
        expense({ amountMinor: 2500, currency: 'EUR' }),
        expense({ amountMinor: 9000 }),
      ]);
      await records.confirm(confirmed.id); // confirmed: not counted
      await records.replaceExtracted(review.id, [
        expense({ amountMinor: 777777 }),
      ]); // file in review: not counted

      const other = await file(c, {
        status: 'completed',
        uploadedAt: '2033-12-05T10:00:00',
      });
      const [b] = await records.replaceExtracted(other.id, [
        expense({ amountMinor: 1500 }),
      ]);
      await duplicates.insertPair(a.id, b.id);
      await records.excludeAsMerged(b.id); // merged away: not counted as unconfirmed

      const result = await repo().attention();
      expect(result.needsReview - before.needsReview).toBe(2); // the old one and the one under review
      expect(result.failed - before.failed).toBe(1);
      expect(result.queuedLimit - before.queuedLimit).toBe(1);
      expect(result.pendingDuplicates - before.pendingDuplicates).toBe(1);
      expect(result.unconfirmed).toEqual([
        { currency: 'EUR', amountMinor: 2500 },
        { currency: 'USD', amountMinor: 1500 },
      ]);

      const pair = (await duplicates.listPending()).find(
        (p) => p.transactionId === a.id || p.matchesTransactionId === a.id,
      );
      await duplicates.resolve(pair!.id, 'kept_both');
      expect((await repo().attention()).pendingDuplicates).toBe(
        before.pendingDuplicates,
      );
    },
  );
});
