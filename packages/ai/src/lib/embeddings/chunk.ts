import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

/** Roughly 4 characters per token for Spanish/English text. */
const CHARS_PER_TOKEN = 4;
export const CHUNK_TOKENS = 800;
export const CHUNK_OVERLAP_TOKENS = 100;

export interface TextChunk {
  chunkIndex: number;
  content: string;
  tokenCount: number;
}

export const estimateTokens = (text: string): number =>
  Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));

/** Splits extracted text into overlapping chunks (~800 tokens, 100 overlap). */
export async function chunkText(text: string): Promise<TextChunk[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_TOKENS * CHARS_PER_TOKEN,
    chunkOverlap: CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN,
  });
  const parts = await splitter.splitText(trimmed);
  return parts.map((content, chunkIndex) => ({
    chunkIndex,
    content,
    tokenCount: estimateTokens(content),
  }));
}
