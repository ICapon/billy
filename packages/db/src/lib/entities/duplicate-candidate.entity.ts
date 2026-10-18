import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { duplicateStatuses } from '@org/shared';
import { OwnedEntity } from './owned-entity';
import { TransactionEntity } from './transaction.entity';

export type DuplicateStatus = (typeof duplicateStatuses)[number];

@Entity('duplicate_candidates')
// The pair is stored ordered (smaller id first) so one row exists per unordered pair.
@Index(
  'duplicate_candidates_pair_uq',
  ['transactionId', 'matchesTransactionId'],
  {
    unique: true,
  },
)
export class DuplicateCandidateEntity extends OwnedEntity {
  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction?: TransactionEntity;

  @Column({ name: 'matches_transaction_id', type: 'uuid' })
  matchesTransactionId!: string;

  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'matches_transaction_id' })
  matchesTransaction?: TransactionEntity;

  @Column({
    type: 'enum',
    enum: duplicateStatuses,
    enumName: 'duplicate_status',
    default: 'pending',
  })
  status!: DuplicateStatus;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;
}
