import type { Database } from '../client';
import { DocumentChunkEntity } from '../entities';

export interface ChunkInput {
  chunkIndex: number;
  content: string;
  embedding: number[];
  tokenCount: number;
}

export interface ChunkMatch {
  id: string;
  fileId: string;
  chunkIndex: number;
  content: string;
  /** 1 = identical direction, 0 = orthogonal. */
  similarity: number;
}

export function chunksRepository(db: Database, ownerId: string) {
  return {
    async replaceForFile(fileId: string, chunks: ChunkInput[]): Promise<void> {
      await db.transaction(async (manager) => {
        await manager.delete(DocumentChunkEntity, { ownerId, fileId });
        if (chunks.length === 0) return;
        await manager
          .createQueryBuilder()
          .insert()
          .into(DocumentChunkEntity)
          .values(chunks.map((chunk) => ({ ...chunk, ownerId, fileId })))
          .execute();
      });
    },

    countByFile(fileId: string): Promise<number> {
      return db.getRepository(DocumentChunkEntity).countBy({ ownerId, fileId });
    },

    /** Semantic search: nearest chunks to a query vector (cosine distance). */
    async searchChunks(
      queryVector: number[],
      options: { limit?: number; fileId?: string } = {},
    ): Promise<ChunkMatch[]> {
      const vector = `[${queryVector.join(',')}]`;
      const params: unknown[] = [vector, ownerId, options.limit ?? 5];
      let fileFilter = '';
      if (options.fileId) {
        params.push(options.fileId);
        fileFilter = 'AND file_id = $4';
      }
      const rows: {
        id: string;
        file_id: string;
        chunk_index: number;
        content: string;
        similarity: string;
      }[] = await db.query(
        `SELECT id, file_id, chunk_index, content,
                1 - (embedding <=> $1::vector) AS similarity
           FROM document_chunks
          WHERE owner_id = $2 ${fileFilter}
          ORDER BY embedding <=> $1::vector
          LIMIT $3`,
        params,
      );
      return rows.map((row) => ({
        id: row.id,
        fileId: row.file_id,
        chunkIndex: row.chunk_index,
        content: row.content,
        similarity: Number(row.similarity),
      }));
    },
  };
}

export type ChunksRepository = ReturnType<typeof chunksRepository>;
