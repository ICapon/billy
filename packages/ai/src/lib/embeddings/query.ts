import type { EmbeddingProvider } from './provider';

/**
 * Embeds a search query. The cosine search itself lives in `@org/db` (`searchChunks`),
 * because `ai` may only depend on `shared`; the caller combines both.
 */
export async function embedQuery(
  provider: EmbeddingProvider,
  text: string,
): Promise<{ vector: number[]; totalTokens: number }> {
  const { embeddings, totalTokens } = await provider.embed([text], 'query');
  return { vector: embeddings[0], totalTokens };
}
