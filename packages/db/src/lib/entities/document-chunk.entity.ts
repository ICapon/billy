import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BusinessFileEntity } from './business-file.entity';
import { EMBEDDING_DIMENSIONS, vectorTransformer } from './columns';
import { OwnedEntity } from './owned-entity';

// The HNSW cosine index on `embedding` lives in the migration (TypeORM cannot declare it).
@Entity('document_chunks')
@Index('document_chunks_file_idx', ['fileId'])
export class DocumentChunkEntity extends OwnedEntity {
  @Column({ name: 'file_id', type: 'uuid' })
  fileId!: string;

  @ManyToOne(() => BusinessFileEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file?: BusinessFileEntity;

  @Column({ name: 'chunk_index', type: 'integer' })
  chunkIndex!: number;

  @Column({ type: 'text' })
  content!: string;

  @Column({
    // pgvector type, known to TypeORM at runtime but missing from its column-type union
    type: 'vector' as 'text',
    length: EMBEDDING_DIMENSIONS,
    transformer: vectorTransformer,
  })
  embedding!: number[];

  @Column({ name: 'token_count', type: 'integer' })
  tokenCount!: number;
}
