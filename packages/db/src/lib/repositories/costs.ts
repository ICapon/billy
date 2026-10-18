import type { CostKind } from '@org/shared';
import type { Database } from '../client';
import { CostEntryEntity } from '../entities';

export interface CostEntryInput {
  fileId?: string | null;
  runId?: string | null;
  kind: CostKind;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costMicroUsd: number;
}

/** Month as "YYYY-MM" -> [start, end) in UTC. */
export function monthRange(month: string): { start: Date; end: Date } {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

export function currentMonth(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function costsRepository(db: Database, ownerId: string) {
  const repo = db.getRepository(CostEntryEntity);
  const inMonth = (month: string) => {
    const { start, end } = monthRange(month);
    return repo
      .createQueryBuilder('c')
      .where(
        'c.owner_id = :ownerId AND c.created_at >= :start AND c.created_at < :end',
        {
          ownerId,
          start,
          end,
        },
      );
  };

  return {
    async insert(entry: CostEntryInput): Promise<void> {
      await repo.insert({
        ownerId,
        fileId: entry.fileId ?? null,
        runId: entry.runId ?? null,
        kind: entry.kind,
        model: entry.model ?? null,
        inputTokens: entry.inputTokens ?? null,
        outputTokens: entry.outputTokens ?? null,
        costMicroUsd: entry.costMicroUsd,
      });
    },

    async monthToDate(month: string = currentMonth()): Promise<number> {
      const row = await inMonth(month)
        .select('COALESCE(SUM(c.cost_micro_usd), 0)', 'total')
        .getRawOne<{ total: string }>();
      return Number(row?.total ?? 0);
    },

    async byKind(
      month: string = currentMonth(),
    ): Promise<Record<string, number>> {
      const rows = await inMonth(month)
        .select('c.kind', 'kind')
        .addSelect('SUM(c.cost_micro_usd)', 'total')
        .groupBy('c.kind')
        .getRawMany<{ kind: string; total: string }>();
      return Object.fromEntries(rows.map((r) => [r.kind, Number(r.total)]));
    },

    /** Distinct files that incurred cost in the month (for the per-file average). */
    async filesWithCost(month: string = currentMonth()): Promise<number> {
      const row = await inMonth(month)
        .select('COUNT(DISTINCT c.file_id)', 'count')
        .getRawOne<{ count: string }>();
      return Number(row?.count ?? 0);
    },
  };
}

export type CostsRepository = ReturnType<typeof costsRepository>;
