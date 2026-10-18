import { BusinessFileEntity } from './business-file.entity';
import { CostEntryEntity } from './cost-entry.entity';
import { DocumentChunkEntity } from './document-chunk.entity';
import { DuplicateCandidateEntity } from './duplicate-candidate.entity';
import { ExtractionRunEntity } from './extraction-run.entity';
import { LineItemEntity } from './line-item.entity';
import { TransactionEntity } from './transaction.entity';

export * from './columns';
export * from './owned-entity';
export * from './business-file.entity';
export * from './extraction-run.entity';
export * from './transaction.entity';
export * from './line-item.entity';
export * from './duplicate-candidate.entity';
export * from './document-chunk.entity';
export * from './cost-entry.entity';

export const entities = [
  BusinessFileEntity,
  ExtractionRunEntity,
  TransactionEntity,
  LineItemEntity,
  DuplicateCandidateEntity,
  DocumentChunkEntity,
  CostEntryEntity,
];

// Row types used across the repositories and the apps.
export type BusinessFileRow = BusinessFileEntity;
export type NewBusinessFileRow = Partial<BusinessFileEntity>;
export type ExtractionRunRow = ExtractionRunEntity;
export type TransactionRow = TransactionEntity;
export type LineItemRow = LineItemEntity;
export type DuplicateCandidateRow = DuplicateCandidateEntity;
export type DocumentChunkRow = DocumentChunkEntity;
export type CostEntryRow = CostEntryEntity;
