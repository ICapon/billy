import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { costKinds, type CostKind } from '@org/shared';
import { BusinessFileEntity } from './business-file.entity';
import { numberTransformer } from './columns';
import { ExtractionRunEntity } from './extraction-run.entity';
import { OwnedEntity } from './owned-entity';

@Entity('cost_entries')
@Index('cost_entries_owner_created_idx', ['ownerId', 'createdAt'])
@Index('cost_entries_file_idx', ['fileId'])
export class CostEntryEntity extends OwnedEntity {
  // SET NULL (not cascade): money already spent still counts toward the monthly limit
  // after the owner deletes the file.
  @Column({ name: 'file_id', type: 'uuid', nullable: true })
  fileId!: string | null;

  @ManyToOne(() => BusinessFileEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'file_id' })
  file?: BusinessFileEntity | null;

  @Column({ name: 'run_id', type: 'uuid', nullable: true })
  runId!: string | null;

  @ManyToOne(() => ExtractionRunEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'run_id' })
  run?: ExtractionRunEntity | null;

  @Column({ type: 'enum', enum: costKinds, enumName: 'cost_kind' })
  kind!: CostKind;

  @Column({ type: 'text', nullable: true })
  model!: string | null;

  @Column({ name: 'input_tokens', type: 'integer', nullable: true })
  inputTokens!: number | null;

  @Column({ name: 'output_tokens', type: 'integer', nullable: true })
  outputTokens!: number | null;

  @Column({
    name: 'cost_micro_usd',
    type: 'bigint',
    transformer: numberTransformer,
  })
  costMicroUsd!: number;
}
