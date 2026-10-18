import type { ReadingMethod } from '@org/shared';
import type { Database } from '../client';
import { ExtractionRunEntity, type ExtractionRunRow } from '../entities';

export interface RunInput {
  tier: ReadingMethod;
  status: 'succeeded' | 'low_confidence' | 'error';
  confidence: number | null;
  error: string | null;
  rawTextKey?: string | null;
  startedAt: Date;
  finishedAt: Date;
}

export function runsRepository(db: Database, ownerId: string) {
  const repo = db.getRepository(ExtractionRunEntity);
  return {
    async insertMany(fileId: string, runs: RunInput[]): Promise<void> {
      if (runs.length === 0) return;
      await repo.insert(
        runs.map((run) => ({
          ...run,
          rawTextKey: run.rawTextKey ?? null,
          ownerId,
          fileId,
        })),
      );
    },

    listByFile(fileId: string): Promise<ExtractionRunRow[]> {
      return repo.find({
        where: { ownerId, fileId },
        order: { startedAt: 'ASC' },
      });
    },
  };
}

export type RunsRepository = ReturnType<typeof runsRepository>;
