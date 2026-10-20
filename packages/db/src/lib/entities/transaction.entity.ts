import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { transactionKinds, type TransactionKind } from '@org/shared';
import { BusinessFileEntity } from './business-file.entity';
import { ExtractedDocumentEntity } from './extracted-document.entity';
import { numberTransformer } from './columns';
import { OwnedEntity } from './owned-entity';

@Entity('transactions')
@Index('transactions_owner_date_idx', ['ownerId', 'occurredOn'])
@Index('transactions_owner_kind_date_idx', ['ownerId', 'kind', 'occurredOn'])
@Index('transactions_file_idx', ['fileId'])
@Index('transactions_document_idx', ['documentId'])
export class TransactionEntity extends OwnedEntity {
  @Column({ name: 'file_id', type: 'uuid' })
  fileId!: string;

  @ManyToOne(() => BusinessFileEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file?: BusinessFileEntity;

  /** The logical document this record came from; null for records kept after a re-analysis. */
  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId!: string | null;

  @ManyToOne(() => ExtractedDocumentEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'document_id' })
  document?: ExtractedDocumentEntity | null;

  /** ISO date (YYYY-MM-DD); pg `date` columns are returned as strings. */
  @Column({ name: 'occurred_on', type: 'date' })
  occurredOn!: string;

  @Column({
    name: 'amount_minor',
    type: 'bigint',
    transformer: numberTransformer,
  })
  amountMinor!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({
    type: 'enum',
    enum: transactionKinds,
    enumName: 'transaction_kind',
  })
  kind!: TransactionKind;

  @Column({ type: 'text' })
  category!: string;

  @Column({ name: 'is_staff', type: 'boolean', default: false })
  isStaff!: boolean;

  @Column({ type: 'text', nullable: true })
  counterparty!: string | null;

  @Column({
    type: 'numeric',
    precision: 3,
    scale: 2,
    transformer: numberTransformer,
  })
  confidence!: number;

  @Column({ type: 'boolean', default: false })
  confirmed!: boolean;

  @Column({
    name: 'excluded_reason',
    type: 'enum',
    enum: ['merged_duplicate'],
    enumName: 'excluded_reason',
    nullable: true,
  })
  excludedReason!: 'merged_duplicate' | null;
}
