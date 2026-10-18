import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { readingMethods, type ReadingMethod } from '@org/shared';
import { BusinessFileEntity } from './business-file.entity';
import { numberTransformer } from './columns';
import { OwnedEntity } from './owned-entity';

export const runStatuses = ['succeeded', 'low_confidence', 'error'] as const;
export type RunStatus = (typeof runStatuses)[number];

@Entity('extraction_runs')
@Index('extraction_runs_file_idx', ['fileId'])
export class ExtractionRunEntity extends OwnedEntity {
  @Column({ name: 'file_id', type: 'uuid' })
  fileId!: string;

  @ManyToOne(() => BusinessFileEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file?: BusinessFileEntity;

  @Column({ type: 'enum', enum: readingMethods, enumName: 'reading_method' })
  tier!: ReadingMethod;

  @Column({ type: 'enum', enum: runStatuses, enumName: 'run_status' })
  status!: RunStatus;

  @Column({
    type: 'numeric',
    precision: 3,
    scale: 2,
    nullable: true,
    transformer: numberTransformer,
  })
  confidence!: number | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'raw_text_key', type: 'text', nullable: true })
  rawTextKey!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;
}
