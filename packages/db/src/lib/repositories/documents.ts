import { In } from 'typeorm';
import type { Consistency, DocumentType } from '@org/shared';
import type { Database } from '../client';
import {
  ExtractedDocumentEntity,
  LineItemEntity,
  PayrollLineEntity,
  TransactionEntity,
  type ExtractedDocumentRow,
  type PayrollLineRow,
} from '../entities';

export interface PayrollLineData {
  employeeName: string;
  employeeKey: string;
  grossMinor: number;
  deductionsMinor: number;
  netMinor: number;
}

export interface NewDocument {
  type: DocumentType;
  typeConfidence: number;
  periodStart: string | null;
  periodEnd: string | null;
  issueDate: string | null;
  currency: string;
  consistency: Consistency;
  consistencyNotes: string | null;
  details: Record<string, unknown>;
  payrollLines?: PayrollLineData[];
}

export interface DocumentPeriod {
  /** Inclusive, ISO date (YYYY-MM-DD). */
  from: string;
  /** Inclusive, ISO date (YYYY-MM-DD). */
  to: string;
}

/** Invoices and receipts are placed by issue date, everything else by period end. */
const dateExpression = (types: DocumentType[]): string =>
  types.every((t) => t === 'invoice' || t === 'receipt')
    ? 'coalesce(d.issue_date, d.period_end)'
    : 'd.period_end';

export function documentsRepository(db: Database, ownerId: string) {
  const documents = db.getRepository(ExtractedDocumentEntity);
  const lines = db.getRepository(PayrollLineEntity);

  return {
    /**
     * Replaces every document of a file (payroll lines go with them) and returns the new ids in
     * the order given, which is the `ordinal`. Records that were kept (confirmed) lose their
     * link, because the foreign key is SET NULL.
     */
    async replaceForFile(
      fileId: string,
      docs: NewDocument[],
    ): Promise<string[]> {
      return db.transaction(async (manager) => {
        await manager.delete(ExtractedDocumentEntity, { ownerId, fileId });
        const ids: string[] = [];
        for (const [ordinal, doc] of docs.entries()) {
          const { payrollLines, ...fields } = doc;
          const saved = await manager.save(
            ExtractedDocumentEntity,
            manager.create(ExtractedDocumentEntity, {
              ...fields,
              ownerId,
              fileId,
              ordinal,
            }),
          );
          ids.push(saved.id);
          if (payrollLines && payrollLines.length > 0) {
            await manager.insert(
              PayrollLineEntity,
              payrollLines.map((line) => ({
                ...line,
                ownerId,
                documentId: saved.id,
              })),
            );
          }
        }
        return ids;
      });
    },

    findById(id: string): Promise<ExtractedDocumentRow | null> {
      return documents.findOneBy({ id, ownerId });
    },

    listByFile(fileId: string): Promise<ExtractedDocumentRow[]> {
      return documents.find({
        where: { ownerId, fileId },
        order: { ordinal: 'ASC' },
      });
    },

    listByFiles(fileIds: string[]): Promise<ExtractedDocumentRow[]> {
      if (fileIds.length === 0) return Promise.resolve([]);
      return documents.find({
        where: { ownerId, fileId: In(fileIds) },
        order: { fileId: 'ASC', ordinal: 'ASC' },
      });
    },

    /** Documents of the given types inside the period (statement/payroll/sales: period end). */
    listByType(
      types: DocumentType | DocumentType[],
      period: DocumentPeriod,
    ): Promise<ExtractedDocumentRow[]> {
      const list = Array.isArray(types) ? types : [types];
      const date = dateExpression(list);
      return documents
        .createQueryBuilder('d')
        .where('d.owner_id = :ownerId AND d.type IN (:...list)', {
          ownerId,
          list,
        })
        .andWhere(`${date} >= :from AND ${date} <= :to`, period)
        .orderBy(date, 'ASC')
        .addOrderBy('d.id', 'ASC')
        .getMany();
    },

    /** Products sold according to the sales reports whose period ends inside the range. */
    async salesProducts(period: DocumentPeriod): Promise<
      {
        currency: string;
        productName: string;
        quantity: number;
        totalMinor: number;
      }[]
    > {
      const rows = await db
        .getRepository(LineItemEntity)
        .createQueryBuilder('li')
        .innerJoin(TransactionEntity, 't', 't.id = li.transaction_id')
        .innerJoin(ExtractedDocumentEntity, 'd', 'd.id = t.document_id')
        .select('d.currency', 'currency')
        .addSelect('MIN(li.product_name)', 'product_name')
        .addSelect('SUM(li.quantity)', 'quantity')
        .addSelect('SUM(li.total_minor)', 'total')
        .where('d.owner_id = :ownerId AND d.type = :type', {
          ownerId,
          type: 'sales_report',
        })
        .andWhere('d.period_end >= :from AND d.period_end <= :to', period)
        .andWhere("li.direction = 'sale' AND t.excluded_reason IS NULL")
        .groupBy('d.currency')
        .addGroupBy('li.product_key')
        .getRawMany<{
          currency: string;
          product_name: string;
          quantity: string;
          total: string;
        }>();
      return rows.map((r) => ({
        currency: r.currency,
        productName: r.product_name,
        quantity: Number(r.quantity),
        totalMinor: Number(r.total),
      }));
    },

    /** Sales recorded per day (or per period) by the sales reports of the range. */
    async salesDaily(
      period: DocumentPeriod,
    ): Promise<{ currency: string; date: string; totalMinor: number }[]> {
      const rows = await db
        .getRepository(TransactionEntity)
        .createQueryBuilder('t')
        .innerJoin(ExtractedDocumentEntity, 'd', 'd.id = t.document_id')
        .select('d.currency', 'currency')
        .addSelect('t.occurred_on::text', 'date')
        .addSelect('SUM(t.amount_minor)', 'total')
        .where('d.owner_id = :ownerId AND d.type = :type', {
          ownerId,
          type: 'sales_report',
        })
        .andWhere('d.period_end >= :from AND d.period_end <= :to', period)
        .andWhere("t.kind = 'income' AND t.excluded_reason IS NULL")
        .groupBy('d.currency')
        .addGroupBy('t.occurred_on')
        .orderBy('t.occurred_on', 'ASC')
        .getRawMany<{ currency: string; date: string; total: string }>();
      return rows.map((r) => ({
        currency: r.currency,
        date: r.date,
        totalMinor: Number(r.total),
      }));
    },

    payrollLines(documentId: string): Promise<PayrollLineRow[]> {
      return lines.find({
        where: { ownerId, documentId },
        order: { employeeName: 'ASC', id: 'ASC' },
      });
    },

    /** Lines of the given documents, for building per-period views. */
    payrollLinesFor(documentIds: string[]): Promise<PayrollLineRow[]> {
      if (documentIds.length === 0) return Promise.resolve([]);
      return lines.find({ where: { ownerId, documentId: In(documentIds) } });
    },

    /** Every payroll line of an employee with the period of its document, oldest first. */
    async employeeHistory(
      employeeKey: string,
    ): Promise<{ line: PayrollLineRow; document: ExtractedDocumentRow }[]> {
      const found = await lines.find({ where: { ownerId, employeeKey } });
      if (found.length === 0) return [];
      const docs = await documents.findBy({
        ownerId,
        id: In([...new Set(found.map((l) => l.documentId))]),
      });
      const byId = new Map(docs.map((d) => [d.id, d]));
      return found
        .flatMap((line) => {
          const document = byId.get(line.documentId);
          return document ? [{ line, document }] : [];
        })
        .sort((a, b) =>
          (a.document.periodEnd ?? '').localeCompare(
            b.document.periodEnd ?? '',
          ),
        );
    },
  };
}

export type DocumentsRepository = ReturnType<typeof documentsRepository>;
