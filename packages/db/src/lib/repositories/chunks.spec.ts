import { chunksRepository } from './chunks';
import { EMBEDDING_DIMENSIONS } from '../entities';
import { describeDb } from './testing';

const vector = (hot: number): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === hot ? 1 : 0));

describeDb('chunksRepository', (ctx, dbIt) => {
  const repo = () => chunksRepository(ctx().handle.db, ctx().ownerId);

  dbIt('replaces the chunks of a file', async () => {
    const file = await ctx().newFile();
    await repo().replaceForFile(file.id, [
      { chunkIndex: 0, content: 'a', embedding: vector(0), tokenCount: 1 },
      { chunkIndex: 1, content: 'b', embedding: vector(1), tokenCount: 1 },
    ]);
    expect(await repo().countByFile(file.id)).toBe(2);
    await repo().replaceForFile(file.id, [
      { chunkIndex: 0, content: 'c', embedding: vector(2), tokenCount: 1 },
    ]);
    expect(await repo().countByFile(file.id)).toBe(1);
  });

  dbIt('searchChunks returns the nearest chunk first', async () => {
    const file = await ctx().newFile();
    await repo().replaceForFile(file.id, [
      {
        chunkIndex: 0,
        content: 'harina',
        embedding: vector(10),
        tokenCount: 1,
      },
      {
        chunkIndex: 1,
        content: 'sueldos',
        embedding: vector(20),
        tokenCount: 1,
      },
    ]);
    const matches = await repo().searchChunks(vector(20), {
      limit: 2,
      fileId: file.id,
    });
    expect(matches[0].content).toBe('sueldos');
    expect(matches[0].similarity).toBeCloseTo(1, 5);
    expect(matches[1].similarity).toBeCloseTo(0, 5);
  });
});
