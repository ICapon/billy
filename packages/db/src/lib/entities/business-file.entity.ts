import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import {
  documentTypes,
  fileStatuses,
  readingMethods,
  type DocumentType,
  type FileStatus,
  type ReadingMethod,
} from '@org/shared';
import { numberTransformer } from './columns';
import { OwnedEntity } from './owned-entity';

@Entity('business_files')
// One copy per content hash unless the owner chose "keep both" (duplicate_of is set).
@Index('business_files_owner_sha256_uq', ['ownerId', 'sha256'], {
  unique: true,
  where: '"duplicate_of" IS NULL',
})
@Index('business_files_owner_status_idx', ['ownerId', 'status'])
@Index('business_files_owner_uploaded_idx', ['ownerId', 'uploadedAt'])
export class BusinessFileEntity extends OwnedEntity {
  @Column({ name: 'original_name', type: 'text' })
  originalName!: string;

  @Column({ name: 'mime_type', type: 'text' })
  mimeType!: string;

  @Column({
    name: 'size_bytes',
    type: 'bigint',
    transformer: numberTransformer,
  })
  sizeBytes!: number;

  @Column({ type: 'char', length: 64 })
  sha256!: string;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({
    type: 'enum',
    enum: fileStatuses,
    enumName: 'file_status',
    default: 'received',
  })
  status!: FileStatus;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({
    name: 'reading_method',
    type: 'enum',
    enum: readingMethods,
    enumName: 'reading_method',
    nullable: true,
  })
  readingMethod!: ReadingMethod | null;

  @Column({
    name: 'total_cost_micro_usd',
    type: 'bigint',
    default: 0,
    transformer: numberTransformer,
  })
  totalCostMicroUsd!: number;

  @Column({ name: 'duplicate_of', type: 'uuid', nullable: true })
  duplicateOf!: string | null;

  @ManyToOne(() => BusinessFileEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'duplicate_of' })
  duplicateOfFile?: BusinessFileEntity | null;

  /** null = not classified (analyzed before document types existed). */
  @Column({
    name: 'document_type',
    type: 'enum',
    enum: documentTypes,
    enumName: 'document_type',
    nullable: true,
  })
  documentType!: DocumentType | null;

  @Column({
    name: 'document_type_confidence',
    type: 'numeric',
    precision: 3,
    scale: 2,
    nullable: true,
    transformer: numberTransformer,
  })
  documentTypeConfidence!: number | null;

  /** The owner chose the type: automatic runs only re-read the file for it. */
  @Column({ name: 'document_type_manual', type: 'boolean', default: false })
  documentTypeManual!: boolean;

  @Column({ name: 'uploaded_at', type: 'timestamptz', default: () => 'now()' })
  uploadedAt!: Date;
}
