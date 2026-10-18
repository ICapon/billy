import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { lineDirections, type LineDirection } from '@org/shared';
import { numberTransformer } from './columns';
import { OwnedEntity } from './owned-entity';
import { TransactionEntity } from './transaction.entity';

@Entity('line_items')
@Index('line_items_transaction_idx', ['transactionId'])
@Index('line_items_direction_product_idx', ['direction', 'productKey'])
export class LineItemEntity extends OwnedEntity {
  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction?: TransactionEntity;

  @Column({ name: 'product_name', type: 'text' })
  productName!: string;

  /** Lower-cased, trimmed product name used for grouping and filtering. */
  @Column({ name: 'product_key', type: 'text' })
  productKey!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    transformer: numberTransformer,
  })
  quantity!: number;

  @Column({
    name: 'unit_price_minor',
    type: 'bigint',
    nullable: true,
    transformer: numberTransformer,
  })
  unitPriceMinor!: number | null;

  @Column({
    name: 'total_minor',
    type: 'bigint',
    transformer: numberTransformer,
  })
  totalMinor!: number;

  @Column({ type: 'enum', enum: lineDirections, enumName: 'line_direction' })
  direction!: LineDirection;

  @Column({
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 1,
    transformer: numberTransformer,
  })
  confidence!: number;
}
