import type { FileStatus, ReadingMethod } from '@org/shared';
import type { Database } from '../client';
import {
  BusinessFileEntity,
  type BusinessFileRow,
  type NewBusinessFileRow,
} from '../entities';
import { decodeCursor, encodeCursor } from './cursor';

export interface ListFilesParams {
  status?: FileStatus;
  /** Inclusive, ISO date (YYYY-MM-DD). */
  from?: string;
  /** Inclusive, ISO date (YYYY-MM-DD). */
  to?: string;
  cursor?: string;
  limit: number;
}

export interface FileUpdate {
  status?: FileStatus;
  failureReason?: string | null;
  readingMethod?: ReadingMethod | null;
}

export function filesRepository(db: Database, ownerId: string) {
  const repo = db.getRepository(BusinessFileEntity);

  const findById = (id: string) => repo.findOneBy({ id, ownerId });

  return {
    async insert(
      data: Omit<NewBusinessFileRow, 'ownerId'>,
    ): Promise<BusinessFileRow> {
      const saved = await repo.save(repo.create({ ...data, ownerId }));
      // Re-read so database defaults (status, uploaded_at, ...) are populated.
      return repo.findOneByOrFail({ id: saved.id });
    },

    findById,

    /** The original upload for a content hash (copies kept on purpose are excluded). */
    findBySha256(sha256: string): Promise<BusinessFileRow | null> {
      return repo
        .createQueryBuilder('f')
        .where('f.owner_id = :ownerId AND f.sha256 = :sha256', {
          ownerId,
          sha256,
        })
        .andWhere('f.duplicate_of IS NULL')
        .getOne();
    },

    async list(
      params: ListFilesParams,
    ): Promise<{ items: BusinessFileRow[]; nextCursor: string | null }> {
      const query = repo
        .createQueryBuilder('f')
        .where('f.owner_id = :ownerId', { ownerId });
      if (params.status)
        query.andWhere('f.status = :status', { status: params.status });
      if (params.from) {
        query.andWhere('f.uploaded_at >= :from', {
          from: new Date(params.from),
        });
      }
      if (params.to) {
        const end = new Date(params.to);
        end.setUTCDate(end.getUTCDate() + 1);
        query.andWhere('f.uploaded_at < :to', { to: end });
      }
      const cursor = decodeCursor(params.cursor);
      if (cursor) {
        query.andWhere(
          '(f.uploaded_at < :at OR (f.uploaded_at = :at AND f.id < :cursorId))',
          { at: new Date(cursor.sortValue), cursorId: cursor.id },
        );
      }
      const rows = await query
        .orderBy('f.uploaded_at', 'DESC')
        .addOrderBy('f.id', 'DESC')
        .limit(params.limit + 1)
        .getMany();

      const items = rows.slice(0, params.limit);
      const last = items[items.length - 1];
      return {
        items,
        nextCursor:
          rows.length > params.limit && last
            ? encodeCursor(last.uploadedAt.toISOString(), last.id)
            : null,
      };
    },

    listByStatus(status: FileStatus): Promise<BusinessFileRow[]> {
      return repo.findBy({ ownerId, status });
    },

    async update(
      id: string,
      patch: FileUpdate,
    ): Promise<BusinessFileRow | null> {
      await repo.update({ id, ownerId }, patch);
      return findById(id);
    },

    async addCost(id: string, microUsd: number): Promise<void> {
      await repo.increment({ id, ownerId }, 'totalCostMicroUsd', microUsd);
    },

    /** Deletes the row (records, runs and chunks cascade). Returns the removed row. */
    async delete(id: string): Promise<BusinessFileRow | null> {
      const row = await findById(id);
      if (!row) return null;
      await repo.delete({ id, ownerId });
      return row;
    },

    async countByTier(): Promise<Record<string, number>> {
      const rows: { tier: string; count: string }[] = await repo
        .createQueryBuilder('f')
        .select('f.reading_method', 'tier')
        .addSelect('count(*)', 'count')
        .where('f.owner_id = :ownerId AND f.reading_method IS NOT NULL', {
          ownerId,
        })
        .groupBy('f.reading_method')
        .getRawMany();
      return Object.fromEntries(rows.map((r) => [r.tier, Number(r.count)]));
    },
  };
}

export type FilesRepository = ReturnType<typeof filesRepository>;
