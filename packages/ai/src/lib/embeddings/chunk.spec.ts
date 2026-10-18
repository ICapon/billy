import { CHUNK_TOKENS, chunkText, estimateTokens } from './chunk';
import type { EmbeddingProvider } from './provider';
import { VoyageEmbeddingProvider } from './voyage';
import { embedQuery } from './query';

describe('chunkText', () => {
  it('returns nothing for empty text', async () => {
    expect(await chunkText('   \n ')).toEqual([]);
  });

  it('keeps short text in a single chunk', async () => {
    const chunks = await chunkText('Factura 123\nTotal 42.50');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      content: 'Factura 123\nTotal 42.50',
    });
  });

  it('splits long text into ordered, bounded, overlapping chunks', async () => {
    const text = Array.from({ length: 2000 }, (_, i) => `palabra${i}`).join(
      ' ',
    );
    const chunks = await chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
    expect(chunks.every((c) => c.tokenCount <= CHUNK_TOKENS + 5)).toBe(true);
    // the next chunk starts with words that end the previous one (overlap)
    const firstWordOfSecond = chunks[1].content.split(' ')[0];
    expect(chunks[0].content.split(' ')).toContain(firstWordOfSecond);
  });

  it('estimates tokens from length', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('embedding providers', () => {
  it('embedQuery embeds one text as a query', async () => {
    const provider: EmbeddingProvider = {
      model: 'm',
      dimensions: 3,
      embed: jest
        .fn()
        .mockResolvedValue({ embeddings: [[1, 2, 3]], totalTokens: 4 }),
    };
    const result = await embedQuery(provider, 'cuánto gasté en sueldos');
    expect(result).toEqual({ vector: [1, 2, 3], totalTokens: 4 });
    expect(provider.embed).toHaveBeenCalledWith(
      ['cuánto gasté en sueldos'],
      'query',
    );
  });

  it('Voyage batches requests, restores order and sums tokens', async () => {
    const calls: number[] = [];
    const fetchImpl = jest.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as {
        input: string[];
        output_dimension: number;
      };
      calls.push(body.input.length);
      expect(body.output_dimension).toBe(2);
      return new Response(
        JSON.stringify({
          // returned out of order on purpose
          data: body.input
            .map((text, index) => ({ index, embedding: [index, Number(text)] }))
            .reverse(),
          usage: { total_tokens: body.input.length },
        }),
      );
    }) as unknown as typeof fetch;

    const provider = new VoyageEmbeddingProvider(
      'key',
      'voyage-3.5-lite',
      2,
      fetchImpl,
    );
    const texts = Array.from({ length: 130 }, (_, i) => String(i));
    const { embeddings, totalTokens } = await provider.embed(texts, 'document');

    expect(calls).toEqual([128, 2]);
    expect(embeddings).toHaveLength(130);
    expect(embeddings[0]).toEqual([0, 0]);
    expect(embeddings[5]).toEqual([5, 5]);
    expect(totalTokens).toBe(130);
  });

  it('Voyage surfaces API errors and requires a key', async () => {
    expect(() => new VoyageEmbeddingProvider(undefined, 'm', 2)).toThrow(
      'VOYAGE_API_KEY',
    );
    const failing = jest.fn(
      async () => new Response('rate limited', { status: 429 }),
    ) as unknown as typeof fetch;
    const provider = new VoyageEmbeddingProvider('key', 'm', 2, failing);
    await expect(provider.embed(['a'], 'query')).rejects.toThrow('429');
  });
});
