import { z } from 'zod';
import type { TotalsRow, TransactionCategory } from './records';

/** Week boundaries follow BUSINESS_WEEK_START, like the analysis screen. */
export type WeekStart = 'monday' | 'sunday';

const nonNegativeInt = z.number().int().nonnegative();

export const activityQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((value) => value.from <= value.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

export const bucketKinds = ['day', 'week'] as const;
export const bucketSchema = z.enum(bucketKinds);
export type Bucket = z.infer<typeof bucketSchema>;

export const activitySummarySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  bucket: bucketSchema,
  counts: z.object({
    received: nonNegativeInt,
    processing: nonNegativeInt,
    queuedLimit: nonNegativeInt,
    completed: nonNegativeInt,
    needsReview: nonNegativeInt,
    failed: nonNegativeInt,
  }),
  total: nonNegativeInt,
  /** completed + needsReview + failed */
  finished: nonNegativeInt,
  /** completed / finished, or null when nothing finished */
  successRate: z.number().min(0).max(1).nullable(),
  /** mean of the per-file processing time in seconds, null when no file has runs */
  avgAnalysisSeconds: z.number().nonnegative().nullable(),
  series: z.array(
    z.object({
      bucketStart: z.iso.date(),
      uploaded: nonNegativeInt,
      finished: nonNegativeInt,
    }),
  ),
  byMethod: z.object({
    digital: nonNegativeInt,
    ocr: nonNegativeInt,
    vision: nonNegativeInt,
  }),
});
export type ActivitySummary = z.infer<typeof activitySummarySchema>;

export const attentionItemsSchema = z.object({
  needsReview: nonNegativeInt,
  failed: nonNegativeInt,
  queuedLimit: nonNegativeInt,
  pendingDuplicates: nonNegativeInt,
  unconfirmed: z.array(
    z.object({
      currency: z.string().regex(/^[A-Z]{3}$/),
      amountMinor: z.number().int(),
    }),
  ),
});
export type AttentionItems = z.infer<typeof attentionItemsSchema>;

// ---------------------------------------------------------------- periods

export const periodPresets = ['7d', '30d', '90d', 'month', 'custom'] as const;
export type PeriodPreset = (typeof periodPresets)[number];
export const DEFAULT_PERIOD_PRESET: PeriodPreset = '30d';

export interface Period {
  /** Inclusive UTC date, YYYY-MM-DD */
  from: string;
  /** Inclusive UTC date, YYYY-MM-DD */
  to: string;
}

const DAY_MS = 86_400_000;

const toIso = (date: Date): string => date.toISOString().slice(0, 10);
const parse = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
/** Adds (or subtracts) days to an ISO UTC date. */
export const addDays = (iso: string, days: number): string =>
  toIso(new Date(parse(iso).getTime() + days * DAY_MS));

/** Inclusive UTC period of a preset ending today. `custom` falls back to the default. */
export function periodFromPreset(
  preset: PeriodPreset,
  today: Date = new Date(),
): Period {
  const to = toIso(today);
  switch (preset) {
    case '7d':
      return { from: addDays(to, -6), to };
    case '90d':
      return { from: addDays(to, -89), to };
    case 'month':
      return { from: `${to.slice(0, 8)}01`, to };
    case '30d':
    case 'custom':
    default:
      return { from: addDays(to, -29), to };
  }
}

/** A readable (Spanish) error, or null when the period is valid. */
export function validatePeriod(period: {
  from?: string;
  to?: string;
}): string | null {
  const valid = (value?: string) =>
    !!value && z.iso.date().safeParse(value).success;
  if (!valid(period.from) || !valid(period.to)) {
    return 'Indica las dos fechas del periodo';
  }
  if ((period.from as string) > (period.to as string)) {
    return 'La fecha inicial debe ser anterior o igual a la final';
  }
  return null;
}

export function periodDays(period: Period): number {
  return (
    Math.round(
      (parse(period.to).getTime() - parse(period.from).getTime()) / DAY_MS,
    ) + 1
  );
}

/** Daily buckets for periods of up to 31 days, weekly ones for longer periods. */
export function bucketFor(period: Period): Bucket {
  return periodDays(period) <= 31 ? 'day' : 'week';
}

/** First day of the bucket that contains `date`. */
export function bucketStartOf(
  date: string,
  bucket: Bucket,
  weekStart: WeekStart = 'monday',
): string {
  if (bucket === 'day') return date;
  const dow = parse(date).getUTCDay(); // 0 = Sunday
  const back = weekStart === 'monday' ? (dow + 6) % 7 : dow;
  return addDays(date, -back);
}

/** Every bucket start between from and to, inclusive. */
export function bucketStarts(
  period: Period,
  bucket: Bucket,
  weekStart: WeekStart = 'monday',
): string[] {
  const starts: string[] = [];
  const step = bucket === 'day' ? 1 : 7;
  for (
    let current = bucketStartOf(period.from, bucket, weekStart);
    current <= period.to;
    current = addDays(current, step)
  ) {
    starts.push(current);
  }
  return starts;
}

/** Zero-fills a sparse series so every bucket of the period is present, in order. */
export function fillSeries(
  period: Period,
  bucket: Bucket,
  weekStart: WeekStart,
  uploaded: { bucketStart: string; count: number }[],
  finished: { bucketStart: string; count: number }[],
): ActivitySummary['series'] {
  const up = new Map(uploaded.map((r) => [r.bucketStart, r.count]));
  const fin = new Map(finished.map((r) => [r.bucketStart, r.count]));
  return bucketStarts(period, bucket, weekStart).map((bucketStart) => ({
    bucketStart,
    uploaded: up.get(bucketStart) ?? 0,
    finished: fin.get(bucketStart) ?? 0,
  }));
}

// --------------------------------------------------------------- finance

export interface CategoryShare {
  category: TransactionCategory;
  totalMinor: number;
  /** 0..1 of the currency's expenses */
  share: number;
}

export interface FinancialSummary {
  currency: string;
  expensesMinor: number;
  incomeMinor: number;
  /** income - expenses, can be negative */
  netMinor: number;
  staffMinor: number;
  /** staff / expenses, null when there are no expenses */
  staffShare: number | null;
  unconfirmedMinor: number;
  /** expense categories, largest first */
  byCategory: CategoryShare[];
  weekly: { bucketStart: string; expensesMinor: number; incomeMinor: number }[];
}

/**
 * Turns the weekly rows of `/records/totals` into the dashboard's financial summary, one entry
 * per currency (currencies are never added together). Because it works on the same rows the
 * analysis screen uses, both always agree.
 */
export function summarizeFinance(rows: TotalsRow[]): FinancialSummary[] {
  const currencies = [...new Set(rows.map((r) => r.currency))].sort();

  return currencies.map((currency) => {
    const own = rows.filter((r) => r.currency === currency);
    const sum = (list: TotalsRow[]) =>
      list.reduce((acc, r) => acc + r.totalMinor, 0);

    const expenseRows = own.filter((r) => r.kind === 'expense');
    const expensesMinor = sum(expenseRows);
    const incomeMinor = sum(own.filter((r) => r.kind === 'income'));
    const staffMinor = sum(expenseRows.filter((r) => r.category === 'staff'));

    const categoryTotals = new Map<TransactionCategory, number>();
    for (const row of expenseRows) {
      categoryTotals.set(
        row.category,
        (categoryTotals.get(row.category) ?? 0) + row.totalMinor,
      );
    }
    const byCategory = [...categoryTotals.entries()]
      .map(([category, totalMinor]) => ({
        category,
        totalMinor,
        share: expensesMinor > 0 ? totalMinor / expensesMinor : 0,
      }))
      .sort((a, b) => b.totalMinor - a.totalMinor);

    const weeks = new Map<
      string,
      { expensesMinor: number; incomeMinor: number }
    >();
    for (const row of own) {
      const week = weeks.get(row.bucketStart) ?? {
        expensesMinor: 0,
        incomeMinor: 0,
      };
      if (row.kind === 'expense') week.expensesMinor += row.totalMinor;
      else week.incomeMinor += row.totalMinor;
      weeks.set(row.bucketStart, week);
    }

    return {
      currency,
      expensesMinor,
      incomeMinor,
      netMinor: incomeMinor - expensesMinor,
      staffMinor,
      staffShare: expensesMinor > 0 ? staffMinor / expensesMinor : null,
      unconfirmedMinor: own.reduce((acc, r) => acc + r.unconfirmedMinor, 0),
      byCategory,
      weekly: [...weeks.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bucketStart, week]) => ({ bucketStart, ...week })),
    };
  });
}
