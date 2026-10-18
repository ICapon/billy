import { ConfigurationError } from '../errors';
import type { EmbeddingProvider, EmbeddingResult } from './provider';

const ENDPOINT = 'https://api.voyageai.com/v1/embeddings';
/** Voyage accepts up to 128 inputs per request. */
const MAX_BATCH = 128;

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
  usage: { total_tokens: number };
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly apiKey: string | undefined,
    readonly model: string,
    readonly dimensions: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new ConfigurationError('VOYAGE_API_KEY is not set');
  }

  async embed(
    texts: string[],
    inputType: 'document' | 'query',
  ): Promise<EmbeddingResult> {
    const embeddings: number[][] = [];
    let totalTokens = 0;
    for (let start = 0; start < texts.length; start += MAX_BATCH) {
      const batch = texts.slice(start, start + MAX_BATCH);
      const response = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          input: batch,
          model: this.model,
          input_type: inputType,
          output_dimension: this.dimensions,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Embedding request failed (${response.status}): ${(await response.text()).slice(0, 200)}`,
        );
      }
      const body = (await response.json()) as VoyageResponse;
      const ordered = [...body.data].sort((a, b) => a.index - b.index);
      embeddings.push(...ordered.map((item) => item.embedding));
      totalTokens += body.usage.total_tokens;
    }
    return { embeddings, totalTokens };
  }
}
