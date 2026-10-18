import type {
  ExtractedTransaction,
  ReadingMethod,
  TransactionCategory,
  TransactionKind,
  LineDirection,
} from '@org/shared';
import type { LlmClient } from '../llm-client';

export type FileOutcome = 'completed' | 'needs_review';

export interface ExtractFileInput {
  data: Buffer;
  mimeType: string;
  fileName: string;
  /** Used to anchor relative dates; defaults to now. */
  today?: Date;
}

export interface OcrResult {
  text: string;
  /** Mean word confidence, 0..1. */
  confidence: number;
}

export interface OcrEngine {
  recognize(images: Buffer[]): Promise<OcrResult>;
  close(): Promise<void>;
}

export interface ExtractionConfig {
  extractionModel: string;
  visionModel: string;
  ocrMinConfidence: number;
  recordMinConfidence: number;
  /** ISO code applied when a document shows no currency. */
  currency: string;
}

export interface ExtractFileDeps {
  llm: LlmClient;
  ocr: OcrEngine;
  config: ExtractionConfig;
}

export interface ExtractionRun {
  tier: ReadingMethod;
  status: 'succeeded' | 'low_confidence' | 'error';
  confidence: number | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date;
}

export interface ExtractedRecord {
  occurredOn: string;
  amountMinor: number;
  currency: string;
  kind: TransactionKind;
  category: TransactionCategory;
  counterparty: string | null;
  confidence: number;
  lineItems: {
    productName: string;
    quantity: number;
    unitPriceMinor: number | null;
    totalMinor: number;
    direction: LineDirection;
  }[];
}

export interface ExtractFileResult {
  outcome: FileOutcome;
  /** Tier whose result is returned. */
  method: ReadingMethod;
  transactions: ExtractedTransaction[];
  records: ExtractedRecord[];
  /** Text read from the file (digital or OCR); null when only vision was used. */
  rawText: string | null;
  runs: ExtractionRun[];
  issues: string[];
}
