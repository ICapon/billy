import { In } from 'typeorm';
import type {
  LineDirection,
  ProductRow,
  TotalsRow,
  TransactionCategory,
  TransactionKind,
} from '@org/shared';
import type { Database } from '../client';
import {
  LineItemEntity,
  TransactionEntity,
  type LineItemRow,
  type TransactionRow,
} from '../entities';
import { decodeCursor, encodeCursor } from './cursor';

export interface LineItemData {
  productName: string;
  quantity: number;
  unitPriceMinor: number | null;
  totalMinor: number;
  direction: LineDirection;
  confidence?: number;
}

export interface TransactionData {
  occurredOn: string;
  amountMinor: number;
  currency: string;
  kind: TransactionKind;
  category: TransactionCategory;
  counterparty: string | null;
  confidence: number;
  confirmed?: boolean;
  lineItems: LineItemData[];
}

export interface TransactionWithItems extends TransactionRow {
  lineItems: LineItemRow[];
}

export interface RecordFilters {
  from?: string;
  to?: string;
  kind?: TransactionKind;
  category?: TransactionCategory;
  product?: string;
  fileId?: string;
}

export interface RecordsPageParams extends RecordFilters {
  cursor?: string;
  limit: number;
}

export type WeekStart = 'monday' | 'sunday';

export function productKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

const toLineItem = (
  ownerId: string,
  transactionId: string,
  item: LineItemData,
): Partial<LineItemEntity> => ({
  ownerId,
  transactionId,
  productName: item.productName.trim(),
  productKey: productKey(item.productName),
  quantity: item.quantity,
  unitPriceMinor: item.unitPriceMinor,
  totalMinor: item.totalMinor,
  direction: item.direction,
  confidence: item.confidence ?? 1,
});

export function recordsRepository(db: Database, ownerId: string) {
  const transactions = db.getRepository(TransactionEntity);

  const attachItems = async (
    rows: TransactionRow[],
  ): Promise<TransactionWithItems[]> => {
    if (rows.length === 0) return [];
    const items = await db.getRepository(LineItemEntity).find({
      where: { ownerId, transactionId: In(rows.map((r) => r.id)) },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return rows.map((row) => ({
      ...row,
      lineItems: items.filter((item) => item.transactionId === row.id),
    }));
  };

  /** Applies the shared date/kind/category/file/product filters to a `t` query builder. */
  const applyFilters = <
    T extends { andWhere: (sql: string, params?: object) => T },
  >(
    query: T,
    filters: RecordFilters,
  ): T => {
    if (filters.from)
      query.andWhere('t.occurred_on >= :from', { from: filters.from });
    if (filters.to) query.andWhere('t.occurred_on <= :to', { to: filters.to });
    if (filters.kind) query.andWhere('t.kind = :kind', { kind: filters.kind });
    if (filters.category)
      query.andWhere('t.category = :category', { category: filters.category });
    if (filters.fileId)
      query.andWhere('t.file_id = :fileId', { fileId: filters.fileId });
    if (filters.product) {
      query.andWhere(
        `EXISTS (SELECT 1 FROM line_items li WHERE li.transaction_id = t.id AND li.product_key LIKE :product ESCAPE '\\')`,
        { product: `%${escapeLike(filters.product.trim().toLowerCase())}%` },
      );
    }
    return query;
  };

  return {
    /**
     * Replaces the file's unconfirmed records with freshly extracted ones. Confirmed
     * records are kept, and an extracted record matching a confirmed one (same date,
     * amount and counterparty) is skipped, so a re-run never undoes the owner's edits.
     */
    async replaceExtracted(
      fileId: string,
      data: TransactionData[],
    ): Promise<TransactionWithItems[]> {
      const created = await db.transaction(async (manager) => {
        await manager.delete(TransactionEntity, {
          ownerId,
          fileId,
          confirmed: false,
        });
        const kept = await manager.findBy(TransactionEntity, {
          ownerId,
          fileId,
        });
        const sameAsKept = (candidate: TransactionData) =>
          kept.some(
            (row) =>
              row.occurredOn === candidate.occurredOn &&
              row.amountMinor === candidate.amountMinor &&
              (row.counterparty ?? '').toLowerCase() ===
                (candidate.counterparty ?? '').toLowerCase(),
          );

        const inserted: TransactionRow[] = [];
        for (const item of data.filter((d) => !sameAsKept(d))) {
          const row = await manager.save(
            TransactionEntity,
            manager.create(TransactionEntity, {
              ownerId,
              fileId,
              occurredOn: item.occurredOn,
              amountMinor: item.amountMinor,
              currency: item.currency,
              kind: item.kind,
              category: item.category,
              isStaff: item.category === 'staff',
              counterparty: item.counterparty,
              confidence: item.confidence,
              confirmed: item.confirmed ?? false,
              excludedReason: null,
            }),
          );
          if (item.lineItems.length > 0) {
            await manager.insert(
              LineItemEntity,
              item.lineItems.map((li) => toLineItem(ownerId, row.id, li)),
            );
          }
          inserted.push(row);
        }
        return inserted;
      });
      // Read after commit: attachItems uses the pool, not the transaction.
      const reloaded = await transactions.find({
        where: { id: In(created.map((c) => c.id)), ownerId },
      });
      // Rows inserted in one transaction share created_at: keep the insertion order.
      const byId = new Map(reloaded.map((row) => [row.id, row]));
      return attachItems(
        created.flatMap((row) => {
          const found = byId.get(row.id);
          return found ? [found] : [];
        }),
      );
    },

    async findById(id: string): Promise<TransactionWithItems | null> {
      const row = await transactions.findOneBy({ id, ownerId });
      if (!row) return null;
      const [withItems] = await attachItems([row]);
      return withItems;
    },

    async listByFile(fileId: string): Promise<TransactionWithItems[]> {
      const rows = await transactions.find({
        where: { ownerId, fileId },
        order: { occurredOn: 'ASC', id: 'ASC' },
      });
      return attachItems(rows);
    },

    async list(
      params: RecordsPageParams,
    ): Promise<{ items: TransactionWithItems[]; nextCursor: string | null }> {
      const query = transactions
        .createQueryBuilder('t')
        .where('t.owner_id = :ownerId', { ownerId });
      applyFilters(query, params);
      const cursor = decodeCursor(params.cursor);
      if (cursor) {
        query.andWhere(
          '(t.occurred_on < :cursorDate OR (t.occurred_on = :cursorDate AND t.id < :cursorId))',
          { cursorDate: cursor.sortValue, cursorId: cursor.id },
        );
      }
      const rows = await query
        .orderBy('t.occurred_on', 'DESC')
        .addOrderBy('t.id', 'DESC')
        .limit(params.limit + 1)
        .getMany();
      const page = rows.slice(0, params.limit);
      const last = page[page.length - 1];
      return {
        items: await attachItems(page),
        nextCursor:
          rows.length > params.limit && last
            ? encodeCursor(last.occurredOn, last.id)
            : null,
      };
    },

    /** Applies an owner edit and marks the record (and its line items) as confirmed. */
    async update(
      id: string,
      patch: Partial<
        Omit<TransactionData, 'lineItems' | 'confidence' | 'confirmed'>
      > & {
        lineItems?: LineItemData[];
      },
    ): Promise<TransactionWithItems | null> {
      const { lineItems: newItems, ...fields } = patch;
      const found = await db.transaction(async (manager) => {
        const result = await manager.update(
          TransactionEntity,
          { id, ownerId },
          {
            ...fields,
            ...(fields.category !== undefined
              ? { isStaff: fields.category === 'staff' }
              : {}),
            confirmed: true,
          },
        );
        if (!result.affected) return false;
        if (newItems) {
          await manager.delete(LineItemEntity, { transactionId: id, ownerId });
          if (newItems.length > 0) {
            await manager.insert(
              LineItemEntity,
              newItems.map((li) => toLineItem(ownerId, id, li)),
            );
          }
        }
        return true;
      });
      return found ? this.findById(id) : null;
    },

    async confirm(id: string): Promise<TransactionRow | null> {
      await transactions.update({ id, ownerId }, { confirmed: true });
      return transactions.findOneBy({ id, ownerId });
    },

    async delete(id: string): Promise<TransactionRow | null> {
      const row = await transactions.findOneBy({ id, ownerId });
      if (!row) return null;
      await transactions.delete({ id, ownerId });
      return row;
    },

    countUnconfirmedByFile(fileId: string): Promise<number> {
      return transactions
        .createQueryBuilder('t')
        .where('t.owner_id = :ownerId AND t.file_id = :fileId', {
          ownerId,
          fileId,
        })
        .andWhere('t.confirmed = false AND t.excluded_reason IS NULL')
        .getCount();
    },

    async excludeAsMerged(id: string): Promise<void> {
      await transactions.update(
        { id, ownerId },
        { excludedReason: 'merged_duplicate' },
      );
    },

    /**
     * Totals per week/month bucket, kind, category and currency, split into confirmed and
     * unconfirmed amounts. Excludes merged duplicates and records of files in `needs_review`.
     */
    async totals(
      params: RecordFilters & {
        from: string;
        to: string;
        groupBy: 'week' | 'month';
        weekStart?: WeekStart;
      },
    ): Promise<TotalsRow[]> {
      const unit = params.groupBy === 'month' ? 'month' : 'week';
      const offset =
        unit === 'week' && params.weekStart === 'sunday' ? '1 day' : '0 day';
      const query = transactions
        .createQueryBuilder('t')
        .innerJoin('business_files', 'f', 'f.id = t.file_id')
        .select(
          `(date_trunc('${unit}', t.occurred_on::timestamp + interval '${offset}') - interval '${offset}')::date::text`,
          'bucket_start',
        )
        .addSelect('t.kind', 'kind')
        .addSelect('t.category', 'category')
        .addSelect('t.currency', 'currency')
        .addSelect('SUM(t.amount_minor)', 'total')
        .addSelect(
          'COALESCE(SUM(t.amount_minor) FILTER (WHERE t.confirmed), 0)',
          'confirmed',
        )
        .where('t.owner_id = :ownerId', { ownerId })
        .andWhere('t.excluded_reason IS NULL')
        .andWhere("f.status <> 'needs_review'");
      applyFilters(query, {
        from: params.from,
        to: params.to,
        kind: params.kind,
        category: params.category,
      });
      const rows = await query
        .groupBy('bucket_start')
        .addGroupBy('t.kind')
        .addGroupBy('t.category')
        .addGroupBy('t.currency')
        .orderBy('bucket_start')
        .addOrderBy('t.kind')
        .addOrderBy('t.category')
        .getRawMany<{
          bucket_start: string;
          kind: TransactionKind;
          category: string;
          currency: string;
          total: string;
          confirmed: string;
        }>();
      return rows.map((row) => {
        const total = Number(row.total);
        const confirmed = Number(row.confirmed);
        return {
          bucketStart: row.bucket_start,
          kind: row.kind,
          category: row.category as TransactionCategory,
          currency: row.currency,
          totalMinor: total,
          confirmedMinor: confirmed,
          unconfirmedMinor: total - confirmed,
        };
      });
    },

    async products(params: {
      direction: LineDirection;
      from?: string;
      to?: string;
      limit?: number;
    }): Promise<ProductRow[]> {
      const query = db
        .getRepository(LineItemEntity)
        .createQueryBuilder('li')
        .innerJoin(TransactionEntity, 't', 't.id = li.transaction_id')
        .innerJoin('business_files', 'f', 'f.id = t.file_id')
        .select('li.product_key', 'key')
        .addSelect('MIN(li.product_name)', 'product_name')
        .addSelect('t.currency', 'currency')
        .addSelect('SUM(li.quantity)', 'quantity')
        .addSelect('SUM(li.total_minor)', 'total')
        .where('t.owner_id = :ownerId', { ownerId })
        .andWhere('t.excluded_reason IS NULL')
        .andWhere("f.status <> 'needs_review'")
        .andWhere('li.direction = :direction', { direction: params.direction });
      applyFilters(query, { from: params.from, to: params.to });
      const rows = await query
        .groupBy('li.product_key')
        .addGroupBy('t.currency')
        .orderBy('SUM(li.total_minor)', 'DESC')
        .limit(params.limit)
        .getRawMany<{
          product_name: string;
          currency: string;
          quantity: string;
          total: string;
        }>();
      return rows.map((row) => ({
        productName: row.product_name,
        currency: row.currency,
        quantity: Number(row.quantity),
        totalMinor: Number(row.total),
      }));
    },
  };
}

export type RecordsRepository = ReturnType<typeof recordsRepository>;
