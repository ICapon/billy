import type {
  Consistency,
  DocumentType,
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

/** One logical document of a file, in the shape that is stored. */
export interface StoredDocument {
  type: DocumentType;
  typeConfidence: number;
  periodStart: string | null;
  periodEnd: string;
  issueDate: string | null;
  currency: string;
  consistency: Consistency;
  consistencyNotes: string | null;
  /** Type-specific figures in minor units (validated with `parseDetails`). */
  details: Record<string, unknown>;
  payrollLines: {
    employeeName: string;
    employeeKey: string;
    grossMinor: number;
    deductionsMinor: number;
    netMinor: number;
  }[];
  /** Ordinary records of this document (payroll adds its `staff` expense). */
  records: ExtractedRecord[];
}

export interface ExtractFileOptions {
  /** The owner chose the type: the file is read as that type. */
  forcedType?: DocumentType;
}

export interface ExtractFileResult {
  outcome: FileOutcome;
  /** Tier whose result is returned. */
  method: ReadingMethod;
  documents: StoredDocument[];
  /** Type of the file: the forced one, else the document with the most records. */
  documentType: DocumentType | null;
  documentTypeConfidence: number | null;
  /** Every record of every document, in order. */
  records: ExtractedRecord[];
  /** Text read from the file (digital or OCR); null when only vision was used. */
  rawText: string | null;
  runs: ExtractionRun[];
  issues: string[];
}
