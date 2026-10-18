import { randomUUID } from 'node:crypto';
import { CostLimitReachedError } from '@org/ai';
import { CostEntryEntity } from '@org/db';
import { createTestContext, type WorkerTestContext } from '../../testing/db';
import { CostGuardService } from './cost-guard.service';

describe('CostGuardService (integration)', () => {
  let ctx: WorkerTestContext | null = null;
  beforeAll(async () => {
    ctx = await createTestContext();
    if (!ctx)
      console.warn('SKIPPED CostGuardService: Postgres is not reachable.');
  });
  afterAll(async () => ctx?.cleanup());

  const run = (name: string, fn: (c: WorkerTestContext) => Promise<void>) =>
    it(name, async () => {
      if (ctx) await fn(ctx);
    });

  /** A guard with its own limit; every test uses a fresh owner so spending starts at zero. */
  async function guardFor(limitMicroUsd: number | null) {
    const c = await createTestContext({
      PROCESSING_COST_LIMIT_USD:
        limitMicroUsd === null ? '' : String(limitMicroUsd / 1_000_000),
    });
    if (!c) throw new Error('database unavailable');
    return { c, guard: new CostGuardService(c.config, c.repos) };
  }

  run('never blocks when no limit is configured', async () => {
    const { c, guard } = await guardFor(null);
    try {
      await c.repos.costs.insert({
        kind: 'llm_text',
        costMicroUsd: 999_999_999,
      });
      expect(await guard.isLimitReached()).toBe(false);
      await expect(guard.assertCanSpend()).resolves.toBeUndefined();
    } finally {
      await c.cleanup();
    }
  });

  run(
    'blocks once the month-to-date spend reaches the limit (inclusive)',
    async () => {
      const { c, guard } = await guardFor(1000);
      try {
        await c.repos.costs.insert({ kind: 'llm_text', costMicroUsd: 999 });
        await expect(guard.assertCanSpend()).resolves.toBeUndefined();
        await c.repos.costs.insert({ kind: 'llm_text', costMicroUsd: 1 });
        await expect(guard.assertCanSpend()).rejects.toBeInstanceOf(
          CostLimitReachedError,
        );
      } finally {
        await c.cleanup();
      }
    },
  );

  run('a zero limit blocks all paid calls', async () => {
    const { c, guard } = await guardFor(0);
    try {
      await expect(guard.assertCanSpend()).rejects.toBeInstanceOf(
        CostLimitReachedError,
      );
    } finally {
      await c.cleanup();
    }
  });

  run(
    'spend from a previous month does not count (month rollover)',
    async () => {
      const { c, guard } = await guardFor(1000);
      try {
        const lastMonth = new Date();
        lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
        await c.handle.db.getRepository(CostEntryEntity).insert({
          ownerId: c.config.ownerId,
          kind: 'llm_text',
          costMicroUsd: 50_000,
          createdAt: lastMonth,
        });
        expect(await guard.isLimitReached()).toBe(false);
      } finally {
        await c.cleanup();
      }
    },
  );

  run(
    'releases queued files only when the budget allows spending again',
    async () => {
      const { c, guard } = await guardFor(1000);
      try {
        const file = await c.repos.files.insert({
          originalName: 'esperando.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
          storageKey: `${c.config.ownerId}/esperando.pdf`,
          status: 'queued_limit',
        });
        await c.repos.costs.insert({ kind: 'llm_text', costMicroUsd: 1000 });
        const enqueue = jest.fn().mockResolvedValue(undefined);

        expect(await guard.releaseQueued(enqueue)).toBe(0);
        expect((await c.repos.files.findById(file.id))?.status).toBe(
          'queued_limit',
        );
        expect(enqueue).not.toHaveBeenCalled();

        // the owner raises the limit: same spend, bigger budget
        const raised = new CostGuardService(
          { ...c.config, costLimitMicroUsd: 5000 },
          c.repos,
        );
        expect(await raised.releaseQueued(enqueue)).toBe(1);
        expect((await c.repos.files.findById(file.id))?.status).toBe(
          'received',
        );
        expect(enqueue).toHaveBeenCalledWith(file.id);
      } finally {
        await c.cleanup();
      }
    },
  );
});
