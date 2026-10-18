import type { Bucket, Period, WeekStart } from '@org/shared';
import type { Database } from '../client';

const DAY_MS = 86_400_000;

/** [from 00:00Z, to + 1 day 00:00Z) for an inclusive UTC date range. */
function utcRange(period: Period): { start: Date; end: Date } {
  const start = new Date(`${period.from}T00:00:00Z`);
  const end = new Date(new Date(`${period.to}T00:00:00Z`).getTime() + DAY_MS);
  return { start, end };
}

const FINISHED = `('completed', 'needs_review', 'failed')`;

export interface ActivityCounts {
  received: number;
  processing: number;
  queuedLimit: number;
  completed: number;
  needsReview: number;
  failed: number;
}

export interface ActivityRows {
  counts: ActivityCounts;
  /** Files with at least one finished run, used for the average. */
  avgAnalysisSeconds: number | null;
  byMethod: { digital: number; ocr: number; vision: number };
  uploaded: { bucketStart: string; count: number }[];
  finished: { bucketStart: string; count: number }[];
}

export interface AttentionRows {
  needsReview: number;
  failed: number;
  queuedLimit: number;
  pendingDuplicates: number;
  unconfirmed: { currency: string; amountMinor: number }[];
}

export function dashboardRepository(db: Database, ownerId: string) {
  /** SQL fragment that truncates a UTC timestamp column to its bucket start. */
  const bucketSql = (column: string, bucket: Bucket, weekStart: WeekStart) => {
    if (bucket === 'day') {
      return `date_trunc('day', ${column} AT TIME ZONE 'UTC')::date::text`;
    }
    const offset =
      weekStart === 'sunday' ? `interval '1 day'` : `interval '0 day'`;
    return `(date_trunc('week', (${column} AT TIME ZONE 'UTC') + ${offset}) - ${offset})::date::text`;
  };

  return {
    /**
     * Activity of the files uploaded inside the period (inclusive UTC dates). Series are
     * sparse; the caller zero-fills them.
     */
    async activity(
      period: Period,
      bucket: Bucket,
      weekStart: WeekStart,
    ): Promise<ActivityRows> {
      const { start, end } = utcRange(period);
      const inPeriod = `f.owner_id = $1 AND f.uploaded_at >= $2 AND f.uploaded_at < $3`;
      const params = [ownerId, start, end];

      const [statusRows, methodRows, avgRows, uploadedRows, finishedRows] =
        await Promise.all([
          db.query(
            `SELECT f.status, count(*)::int AS count FROM business_files f
              WHERE ${inPeriod} GROUP BY f.status`,
            params,
          ),
          db.query(
            `SELECT f.reading_method AS method, count(*)::int AS count FROM business_files f
              WHERE ${inPeriod} AND f.reading_method IS NOT NULL GROUP BY f.reading_method`,
            params,
          ),
          // total processing time per file, then the mean over finished files
          db.query(
            `SELECT avg(t.seconds)::float8 AS seconds FROM (
               SELECT sum(extract(epoch FROM (r.finished_at - r.started_at))) AS seconds
                 FROM business_files f
                 JOIN extraction_runs r ON r.file_id = f.id
                WHERE ${inPeriod} AND f.status IN ${FINISHED} AND r.finished_at IS NOT NULL
                GROUP BY f.id
             ) t`,
            params,
          ),
          db.query(
            `SELECT ${bucketSql('f.uploaded_at', bucket, weekStart)} AS bucket_start,
                    count(*)::int AS count
               FROM business_files f WHERE ${inPeriod} GROUP BY 1`,
            params,
          ),
          // finished analyses: same files, placed on the day their status last changed
          db.query(
            `SELECT ${bucketSql('f.updated_at', bucket, weekStart)} AS bucket_start,
                    count(*)::int AS count
               FROM business_files f
              WHERE ${inPeriod} AND f.status IN ${FINISHED}
                AND f.updated_at >= $2 AND f.updated_at < $3
              GROUP BY 1`,
            params,
          ),
        ]);

      const byStatus = Object.fromEntries(
        (statusRows as { status: string; count: number }[]).map((r) => [
          r.status,
          r.count,
        ]),
      );
      const byMethod = Object.fromEntries(
        (methodRows as { method: string; count: number }[]).map((r) => [
          r.method,
          r.count,
        ]),
      );
      const seconds =
        (avgRows as { seconds: number | null }[])[0]?.seconds ?? null;
      const toSeries = (rows: unknown) =>
        (rows as { bucket_start: string; count: number }[]).map((r) => ({
          bucketStart: r.bucket_start,
          count: r.count,
        }));

      return {
        counts: {
          received: byStatus['received'] ?? 0,
          processing: byStatus['processing'] ?? 0,
          queuedLimit: byStatus['queued_limit'] ?? 0,
          completed: byStatus['completed'] ?? 0,
          needsReview: byStatus['needs_review'] ?? 0,
          failed: byStatus['failed'] ?? 0,
        },
        avgAnalysisSeconds: seconds === null ? null : Number(seconds),
        byMethod: {
          digital: byMethod['digital'] ?? 0,
          ocr: byMethod['ocr'] ?? 0,
          vision: byMethod['vision'] ?? 0,
        },
        uploaded: toSeries(uploadedRows),
        finished: toSeries(finishedRows),
      };
    },

    /** Pending work, regardless of date. Unconfirmed money follows the totals' exclusions. */
    async attention(): Promise<AttentionRows> {
      const [statusRows, duplicateRows, unconfirmedRows] = await Promise.all([
        db.query(
          `SELECT status, count(*)::int AS count FROM business_files
            WHERE owner_id = $1 AND status IN ('needs_review', 'failed', 'queued_limit')
            GROUP BY status`,
          [ownerId],
        ),
        db.query(
          `SELECT count(*)::int AS count FROM duplicate_candidates
            WHERE owner_id = $1 AND status = 'pending'`,
          [ownerId],
        ),
        db.query(
          `SELECT t.currency, sum(t.amount_minor)::text AS amount
             FROM transactions t JOIN business_files f ON f.id = t.file_id
            WHERE t.owner_id = $1 AND t.confirmed = false
              AND t.excluded_reason IS NULL AND f.status <> 'needs_review'
            GROUP BY t.currency ORDER BY t.currency`,
          [ownerId],
        ),
      ]);
      const byStatus = Object.fromEntries(
        (statusRows as { status: string; count: number }[]).map((r) => [
          r.status,
          r.count,
        ]),
      );
      return {
        needsReview: byStatus['needs_review'] ?? 0,
        failed: byStatus['failed'] ?? 0,
        queuedLimit: byStatus['queued_limit'] ?? 0,
        pendingDuplicates:
          (duplicateRows as { count: number }[])[0]?.count ?? 0,
        unconfirmed: (
          unconfirmedRows as { currency: string; amount: string }[]
        ).map((r) => ({
          currency: r.currency,
          amountMinor: Number(r.amount),
        })),
      };
    },
  };
}

export type DashboardRepository = ReturnType<typeof dashboardRepository>;
