import { filesRepository } from './files';
import { describeDb } from './testing';

describeDb('filesRepository', (ctx, dbIt) => {
  const repo = () => filesRepository(ctx().handle.db, ctx().ownerId);

  dbIt('inserts and finds a file by id and by hash', async () => {
    const file = await ctx().newFile({ sha256: 'a'.repeat(64) });
    expect(file.status).toBe('received');
    expect((await repo().findById(file.id))?.originalName).toBe('file.pdf');
    expect((await repo().findBySha256('a'.repeat(64)))?.id).toBe(file.id);
  });

  dbIt('does not see files of another owner', async () => {
    const file = await ctx().newFile();
    const other = filesRepository(ctx().handle.db, 'someone-else');
    expect(await other.findById(file.id)).toBeNull();
  });

  dbIt(
    'allows a kept copy of the same content (duplicate_of set)',
    async () => {
      const sha = 'b'.repeat(64);
      const original = await ctx().newFile({ sha256: sha });
      const copy = await ctx().newFile({
        sha256: sha,
        duplicateOf: original.id,
      });
      expect(copy.duplicateOf).toBe(original.id);
      expect((await repo().findBySha256(sha))?.id).toBe(original.id);
      await expect(ctx().newFile({ sha256: sha })).rejects.toThrow();
    },
  );

  dbIt('lists with status filter and keyset pagination', async () => {
    for (let i = 0; i < 3; i++) await ctx().newFile({ status: 'failed' });
    const first = await repo().list({ status: 'failed', limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await repo().list({
      status: 'failed',
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.length).toBeGreaterThanOrEqual(1);
    const ids = new Set([...first.items, ...second.items].map((f) => f.id));
    expect(ids.size).toBe(first.items.length + second.items.length);
  });

  dbIt('updates status and accumulates cost', async () => {
    const file = await ctx().newFile();
    await repo().update(file.id, { status: 'processing' });
    await repo().addCost(file.id, 150);
    await repo().addCost(file.id, 50);
    const reloaded = await repo().findById(file.id);
    expect(reloaded?.status).toBe('processing');
    expect(reloaded?.totalCostMicroUsd).toBe(200);
  });

  dbIt('deletes a file and returns the removed row', async () => {
    const file = await ctx().newFile();
    const removed = await repo().delete(file.id);
    expect(removed?.storageKey).toBe(file.storageKey);
    expect(await repo().findById(file.id)).toBeNull();
  });
});
