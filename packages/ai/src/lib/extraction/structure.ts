import {
  extractionOutputSchema,
  transactionCategories,
  type DocumentType,
  type ExtractionOutput,
  type ExtractedLogicalDocument,
} from '@org/shared';
import { z } from 'zod';
import type { LlmClient, LlmContentBlock } from '../llm-client';

export const TOOL_NAME = 'record_transactions';

/** Longest text sent in one request; bigger inputs are split on line boundaries. */
export const MAX_CHARS_PER_REQUEST = 40_000;

function jsonSchema(): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(
    extractionOutputSchema,
  ) as Record<string, unknown>;
  return schema;
}

const TYPE_LABELS: Record<DocumentType, string> = {
  bank_statement: 'bank statement',
  payroll: 'payroll',
  invoice: 'invoice',
  receipt: 'receipt',
  sales_report: 'sales report',
  other: 'other document',
};

export function buildSystemPrompt(
  today: Date,
  fallbackCurrency: string,
  forcedType?: DocumentType,
): string {
  return [
    'You read business documents (bank statements, payroll, invoices, receipts, sales reports,',
    'spreadsheets) for a small business, classify each one and extract its data.',
    'Documents are usually in Spanish; English also appears. Call the tool exactly once.',
    '',
    forcedType
      ? `The owner states that this file is a ${TYPE_LABELS[forcedType]} (type "${forcedType}"). Use that type.`
      : 'Classify every document with one type: bank_statement, payroll, invoice, receipt, sales_report or other.',
    'A file can hold several documents (for example many receipts, or an invoice plus a receipt):',
    'return one item in "documents" per logical document. typeConfidence (0..1) says how sure you',
    'are of the type; use "other" with low confidence when none fits. Put the detail block that',
    'matches the type ("bankStatement", "payroll", "commercial" for invoice and receipt,',
    '"salesReport"); "other" has none.',
    '',
    'Per type:',
    '- bank_statement: accountIdentifier (masked number or null), openingBalance, closingBalance',
    '  (may be negative), totalDeposits, totalWithdrawals (money out EXCLUDING fees) and totalFees.',
    '  Fill periodStart and periodEnd. Return transactions: [] (the movements are not needed).',
    '- payroll: periodStart/periodEnd of the pay period; grossTotal, deductionsTotal, netTotal;',
    '  employerTotalCost only when the document states it (else null); employees[] with name,',
    '  gross, deductions and net for each employee. Return transactions: [].',
    '- invoice / receipt: counterparty (supplier or customer), subtotal and tax (null when not',
    '  shown), total, paymentStatus (paid / pending / unknown), issueDate. Return one transaction',
    '  per document with its line items.',
    '- sales_report: periodStart/periodEnd, totalSales, unitsSold and transactionCount (null when',
    '  not shown). Return one income transaction per day when the report lists days, otherwise one',
    '  for the period (date = period end), with sale line items per product.',
    '- other: only the general transactions you can read.',
    '',
    'General rules:',
    '- kind: "expense" when the business pays money (purchases, rent, payroll, utilities);',
    '  "income" when the business receives money (sales, services rendered).',
    `- category must be one of: ${transactionCategories.join(', ')}. Salaries, wages and`,
    '  payroll are "staff". Use "other" only if nothing fits.',
    '- amounts are positive decimal numbers in major units (12.50), except balances which may be negative.',
    `- currency: ISO 4217 code if shown, otherwise null (the business default is ${fallbackCurrency}).`,
    '- dates: ISO YYYY-MM-DD. Dates are day-first (DD/MM/YYYY) unless the document clearly',
    '  uses another order. Lower the date confidence when day and month are ambiguous.',
    `  Today is ${today.toISOString().slice(0, 10)}; use it to infer a missing year.`,
    '- transaction lineItems: product lines when present. direction is "purchase" for products the',
    '  business buys (expense documents) and "sale" for products it sells (income documents).',
    '  total is the line total; unitPrice may be null.',
    '- transaction confidence.date / amount / kind: 0..1, how sure you are of each. Be honest: use',
    '  low values for blurry, partial, handwritten or ambiguous content. Never invent values;',
    '  if the file has no documents you can read, return an empty list.',
  ].join('\n');
}

/** Splits long text into parts of at most `maxChars`, on line boundaries. */
export function splitText(
  text: string,
  maxChars = MAX_CHARS_PER_REQUEST,
): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current.length + line.length + 1 > maxChars && current) {
      parts.push(current);
      current = '';
    }
    // A single enormous line is cut hard rather than dropped.
    let rest = line;
    while (rest.length > maxChars) {
      parts.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    current += `${current ? '\n' : ''}${rest}`;
  }
  if (current) parts.push(current);
  return parts;
}

export interface StructureInput {
  llm: LlmClient;
  model: string;
  fileName: string;
  today: Date;
  fallbackCurrency: string;
  /** Document content: text for the cheap path, image/pdf blocks for vision. */
  content: LlmContentBlock[];
  /** Set when the owner chose the type: the model reads the file as that type. */
  forcedType?: DocumentType;
}

/**
 * Asks the model for structured transactions and validates the answer with the shared zod
 * schema. An invalid answer is retried once, telling the model what was wrong.
 */
export async function structureContent(
  input: StructureInput,
): Promise<ExtractionOutput> {
  const header: LlmContentBlock = {
    type: 'text',
    text: `File name: ${input.fileName}\nClassify and extract the documents in this file.`,
  };
  const request = {
    model: input.model,
    system: buildSystemPrompt(
      input.today,
      input.fallbackCurrency,
      input.forcedType,
    ),
    toolName: TOOL_NAME,
    toolDescription:
      'Record every document found in the file, with its type, its data and its transactions.',
    inputSchema: jsonSchema(),
  };

  let content: LlmContentBlock[] = [header, ...input.content];
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await input.llm.generateStructured({
      ...request,
      content,
    });
    const parsed = extractionOutputSchema.safeParse(response.output);
    if (parsed.success) return parsed.data;
    lastError = z.prettifyError(parsed.error);
    // The raw answer is shown to the model only, never stored in an error (it may hold names)
    const feedback = `${lastError}\nReceived: ${JSON.stringify(response.output)?.slice(0, 300)}`;
    content = [
      header,
      ...input.content,
      {
        type: 'text',
        text: `Your previous answer was invalid:\n${feedback}\nCall the tool again with a corrected answer.`,
      },
    ];
  }
  throw new Error(`The model returned invalid structured output: ${lastError}`);
}

/** Periodic documents split across parts are merged back into one. */
const MERGEABLE: DocumentType[] = ['bank_statement', 'payroll', 'sales_report'];

const mergeKey = (doc: ExtractedLogicalDocument): string | null =>
  MERGEABLE.includes(doc.type)
    ? `${doc.type}|${doc.periodStart ?? ''}|${doc.periodEnd ?? ''}`
    : null;

/** Weight used to pick the part that carries the document's totals. */
function weight(doc: ExtractedLogicalDocument): number {
  switch (doc.type) {
    case 'bank_statement':
      return (
        doc.bankStatement.totalDeposits + doc.bankStatement.totalWithdrawals
      );
    case 'payroll':
      return doc.payroll.grossTotal;
    case 'sales_report':
      return doc.salesReport.totalSales;
    default:
      return 0;
  }
}

/**
 * Merges the documents returned for the parts of a long text: a periodic document that
 * appears in several parts (same type and period) becomes one, taking the totals from the part
 * that carries the biggest ones and adding up transactions and payroll employees.
 */
export function mergeDocuments(
  documents: ExtractedLogicalDocument[],
): ExtractedLogicalDocument[] {
  const merged: ExtractedLogicalDocument[] = [];
  const byKey = new Map<string, number>();
  for (const doc of documents) {
    const key = mergeKey(doc);
    const at = key === null ? undefined : byKey.get(key);
    if (key === null || at === undefined) {
      if (key !== null) byKey.set(key, merged.length);
      merged.push(doc);
      continue;
    }
    const current = merged[at];
    const primary = weight(doc) > weight(current) ? doc : current;
    const combined = {
      ...primary,
      typeConfidence: Math.min(current.typeConfidence, doc.typeConfidence),
      transactions: [...current.transactions, ...doc.transactions],
    } as ExtractedLogicalDocument;
    if (
      combined.type === 'payroll' &&
      current.type === 'payroll' &&
      doc.type === 'payroll'
    ) {
      combined.payroll = {
        ...(primary.type === 'payroll' ? primary.payroll : combined.payroll),
        employees: [...current.payroll.employees, ...doc.payroll.employees],
      };
    }
    merged[at] = combined;
  }
  return merged;
}

/** Structures long text in parts and merges the documents. */
export async function structureText(
  input: Omit<StructureInput, 'content'> & { text: string },
): Promise<ExtractionOutput> {
  const { text, ...rest } = input;
  const documents: ExtractedLogicalDocument[] = [];
  for (const part of splitText(text)) {
    const output = await structureContent({
      ...rest,
      content: [{ type: 'text', text: part }],
    });
    documents.push(...output.documents);
  }
  return { documents: mergeDocuments(documents) };
}
