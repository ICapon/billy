import {
  extractedDocumentSchema,
  transactionCategories,
  type ExtractedDocument,
} from '@org/shared';
import { z } from 'zod';
import type { LlmClient, LlmContentBlock } from '../llm-client';

export const TOOL_NAME = 'record_transactions';

/** Longest text sent in one request; bigger inputs are split on line boundaries. */
export const MAX_CHARS_PER_REQUEST = 40_000;

function jsonSchema(): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(
    extractedDocumentSchema,
  ) as Record<string, unknown>;
  return schema;
}

export function buildSystemPrompt(
  today: Date,
  fallbackCurrency: string,
): string {
  return [
    'You extract financial transactions from business documents (receipts, invoices,',
    'sales reports, payroll sheets, spreadsheets, bank statements) for a small business.',
    'Documents are usually in Spanish; English also appears. Call the tool exactly once.',
    '',
    'Rules:',
    '- One transaction per receipt/invoice/payroll entry/ledger row group. A file can hold several.',
    '- kind: "expense" when the business pays money (purchases, rent, payroll, utilities);',
    '  "income" when the business receives money (sales, services rendered).',
    `- category must be one of: ${transactionCategories.join(', ')}. Salaries, wages and`,
    '  payroll are "staff". Use "other" only if nothing fits.',
    '- amount: the document total as a positive decimal number in major units (12.50).',
    `- currency: ISO 4217 code if shown, otherwise null (the business default is ${fallbackCurrency}).`,
    '- date: ISO YYYY-MM-DD. Dates are day-first (DD/MM/YYYY) unless the document clearly',
    '  uses another order. Lower the date confidence when day and month are ambiguous.',
    `  Today is ${today.toISOString().slice(0, 10)}; use it to infer a missing year.`,
    '- lineItems: product lines when present. direction is "purchase" for products the',
    '  business buys (expense documents) and "sale" for products it sells (income documents).',
    '  total is the line total; unitPrice may be null.',
    '- counterparty: the supplier, customer or employee name, or null.',
    '- confidence.date / amount / kind: 0..1, how sure you are of each. Be honest: use low',
    '  values for blurry, partial, handwritten or ambiguous content. Never invent values;',
    '  if the document has no transactions, return an empty list.',
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
}

/**
 * Asks the model for structured transactions and validates the answer with the shared zod
 * schema. An invalid answer is retried once, telling the model what was wrong.
 */
export async function structureContent(
  input: StructureInput,
): Promise<ExtractedDocument> {
  const header: LlmContentBlock = {
    type: 'text',
    text: `File name: ${input.fileName}\nExtract the transactions of this document.`,
  };
  const request = {
    model: input.model,
    system: buildSystemPrompt(input.today, input.fallbackCurrency),
    toolName: TOOL_NAME,
    toolDescription:
      'Record every financial transaction found in the document.',
    inputSchema: jsonSchema(),
  };

  let content: LlmContentBlock[] = [header, ...input.content];
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await input.llm.generateStructured({
      ...request,
      content,
    });
    const parsed = extractedDocumentSchema.safeParse(response.output);
    if (parsed.success) return parsed.data;
    lastError = `${z.prettifyError(parsed.error)}\nReceived: ${JSON.stringify(response.output)?.slice(0, 300)}`;
    content = [
      header,
      ...input.content,
      {
        type: 'text',
        text: `Your previous answer was invalid:\n${lastError}\nCall the tool again with a corrected answer.`,
      },
    ];
  }
  throw new Error(`The model returned invalid structured output: ${lastError}`);
}

/** Structures long text in parts and merges the transactions. */
export async function structureText(
  input: Omit<StructureInput, 'content'> & { text: string },
): Promise<ExtractedDocument> {
  const { text, ...rest } = input;
  const transactions: ExtractedDocument['transactions'] = [];
  for (const part of splitText(text)) {
    const document = await structureContent({
      ...rest,
      content: [{ type: 'text', text: part }],
    });
    transactions.push(...document.transactions);
  }
  return { transactions };
}
