export interface EmbeddingResult {
  embeddings: number[][];
  /** Tokens billed by the provider, used for cost accounting. */
  totalTokens: number;
}

/** Vendor-neutral embedding seam (research R7). */
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(
    texts: string[],
    inputType: 'document' | 'query',
  ): Promise<EmbeddingResult>;
}
