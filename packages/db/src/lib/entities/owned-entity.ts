import {
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Shared columns. `ownerId` is the single fixed business owner in v1 (no login yet). */
export abstract class OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_id', type: 'text' })
  ownerId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
