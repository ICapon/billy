import { In } from 'typeorm';
import type { Database } from '../client';
import {
  DuplicateCandidateEntity,
  TransactionEntity,
  type DuplicateCandidateRow,
  type TransactionRow,
} from '../entities';

export function duplicatesRepository(db: Database, ownerId: string) {
  const candidates = db.getRepository(DuplicateCandidateEntity);

  return {
    /**
     * Records in OTHER files with the same date and kind and an amount within one minor
     * unit; the caller decides whether the counterparty also matches.
     */
    findSameDateAndAmount(
      transaction: Pick<
        TransactionRow,
        'id' | 'fileId' | 'occurredOn' | 'amountMinor' | 'kind'
      >,
    ): Promise<TransactionRow[]> {
      return db
        .getRepository(TransactionEntity)
        .createQueryBuilder('t')
        .where('t.owner_id = :ownerId AND t.file_id <> :fileId', {
          ownerId,
          fileId: transaction.fileId,
        })
        .andWhere('t.occurred_on = :date AND t.kind = :kind', {
          date: transaction.occurredOn,
          kind: transaction.kind,
        })
        .andWhere('abs(t.amount_minor - :amount) <= 1', {
          amount: transaction.amountMinor,
        })
        .andWhere('t.excluded_reason IS NULL')
        .getMany();
    },

    /** Inserts the pair ordered by id; a pair that already exists is left untouched. */
    async insertPair(aId: string, bId: string): Promise<void> {
      const [first, second] = aId < bId ? [aId, bId] : [bId, aId];
      await candidates
        .createQueryBuilder()
        .insert()
        .values({ ownerId, transactionId: first, matchesTransactionId: second })
        .orIgnore()
        .execute();
    },

    listPending(): Promise<DuplicateCandidateRow[]> {
      return candidates.find({
        where: { ownerId, status: 'pending' },
        order: { createdAt: 'ASC' },
      });
    },

    findById(id: string): Promise<DuplicateCandidateRow | null> {
      return candidates.findOneBy({ id, ownerId });
    },

    async resolve(
      id: string,
      status: 'kept_both' | 'merged',
    ): Promise<DuplicateCandidateRow | null> {
      await candidates.update(
        { id, ownerId },
        { status, resolvedAt: new Date() },
      );
      return candidates.findOneBy({ id, ownerId });
    },

    countPendingFor(transactionIds: string[]): Promise<number> {
      if (transactionIds.length === 0) return Promise.resolve(0);
      return candidates.countBy({
        ownerId,
        status: 'pending',
        transactionId: In(transactionIds),
      });
    },
  };
}

export type DuplicatesRepository = ReturnType<typeof duplicatesRepository>;
