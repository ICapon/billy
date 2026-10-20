import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import {
  consistencyStates,
  documentTypes,
  type Consistency,
  type DocumentType,
} from '@org/shared';
import { BusinessFileEntity } from './business-file.entity';
import { numberTransformer } from './columns';
import { OwnedEntity } from './owned-entity';

/** One logical document found in a file (a file can hold several). */
@Entity('extracted_documents')
@Index('extracted_documents_owner_type_end_idx', [
  'ownerId',
  'type',
  'periodEnd',
])
@Index('extracted_documents_file_idx', ['fileId'])
export class ExtractedDocumentEntity extends OwnedEntity {
  @Column({ name: 'file_id', type: 'uuid' })
  fileId!: string;

  @ManyToOne(() => BusinessFileEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file?: BusinessFileEntity;

  /** Position inside the file, starting at 0. */
  @Column({ type: 'integer' })
  ordinal!: number;

  @Column({ type: 'enum', enum: documentTypes, enumName: 'document_type' })
  type!: DocumentType;

  @Column({
    name: 'type_confidence',
    type: 'numeric',
    precision: 3,
    scale: 2,
    transformer: numberTransformer,
  })
  typeConfidence!: number;

  /** ISO dates (YYYY-MM-DD); pg `date` columns are returned as strings. */
  @Column({ name: 'period_start', type: 'date', nullable: true })
  periodStart!: string | null;

  @Column({ name: 'period_end', type: 'date', nullable: true })
  periodEnd!: string | null;

  @Column({ name: 'issue_date', type: 'date', nullable: true })
  issueDate!: string | null;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({
    type: 'enum',
    enum: consistencyStates,
    enumName: 'document_consistency',
    default: 'unchecked',
  })
  consistency!: Consistency;

  @Column({ name: 'consistency_notes', type: 'text', nullable: true })
  consistencyNotes!: string | null;

  /** Validated with the shared schema of the type (`parseDetails`). */
  @Column({ type: 'jsonb', default: () => `'{}'` })
  details!: Record<string, unknown>;
}
