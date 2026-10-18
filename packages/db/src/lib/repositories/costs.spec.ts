import { costsRepository, currentMonth, monthRange } from './costs';
import { filesRepository } from './files';
import { describeDb } from './testing';

describe('monthRange', () => {
  it('returns the UTC bounds of a month', () => {
    const { start, end } = monthRange('2026-12');
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(currentMonth(new Date('2026-10-18T10:00:00Z'))).toBe('2026-10');
  });
});

describeDb('costsRepository', (ctx, dbIt) => {
  const repo = () => costsRepository(ctx().handle.db, ctx().ownerId);

  dbIt('sums the month to date and groups by kind', async () => {
    const file = await ctx().newFile();
    await repo().insert({
      fileId: file.id,
      kind: 'llm_text',
      model: 'm',
      inputTokens: 10,
      outputTokens: 5,
      costMicroUsd: 300,
    });
    await repo().insert({
      fileId: file.id,
      kind: 'embedding',
      costMicroUsd: 100,
    });
    expect(await repo().monthToDate()).toBe(400);
    expect(await repo().byKind()).toEqual({ llm_text: 300, embedding: 100 });
    expect(await repo().filesWithCost()).toBe(1);
    expect(await repo().monthToDate('2020-01')).toBe(0);
  });

  dbIt('keeps counting spent money after the file is deleted', async () => {
    const file = await ctx().newFile();
    const before = await repo().monthToDate();
    await repo().insert({
      fileId: file.id,
      kind: 'llm_vision',
      costMicroUsd: 1000,
    });
    await filesRepository(ctx().handle.db, ctx().ownerId).delete(file.id);
    expect(await repo().monthToDate()).toBe(before + 1000);
  });
});
