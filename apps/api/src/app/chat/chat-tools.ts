import {
  calculateCostMicroUsd,
  embedQuery,
  type EmbeddingProvider,
  type ToolDefinition,
  type ToolHandler,
  type ToolOutput,
} from '@org/ai';
import {
  documentTypeSchema,
  documentTypes,
  transactionCategorySchema,
  transactionKindSchema,
  type DocumentType,
} from '@org/shared';
import { z } from 'zod';
import type { AppConfig } from '../config/config.module';
import type { RepositoriesService } from '../database/repositories.service';

const MAX_SEARCH_RESULTS = 8;
const MAX_RECORDS = 50;
/** Files still being worked on are listed (name and status only) so the model can say so. */
const PENDING_STATUSES = ['received', 'processing', 'queued_limit', 'failed'];

const isoDate = z.iso.date();

const searchInput = z.object({
  query: z.string().trim().min(1).max(500),
  fileId: z.uuid().optional(),
  limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional(),
});
const listDocumentsInput = z.object({
  types: z.array(documentTypeSchema).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
const getDocumentInput = z.object({ documentId: z.uuid() });
const totalsInput = z.object({
  from: isoDate,
  to: isoDate,
  groupBy: z.enum(['week', 'month']),
  kind: transactionKindSchema.optional(),
});
const listRecordsInput = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  category: transactionCategorySchema.optional(),
  fileId: z.uuid().optional(),
  limit: z.number().int().min(1).max(MAX_RECORDS).optional(),
});

function definition(
  name: string,
  description: string,
  schema: z.ZodType,
): ToolDefinition {
  const { $schema: _ignored, ...inputSchema } = z.toJSONSchema(schema, {
    io: 'input',
  }) as Record<string, unknown>;
  return { name, description, inputSchema };
}

export const chatToolDefinitions: ToolDefinition[] = [
  definition(
    'search_documents',
    'Semantic search over the text of the analyzed documents. Use it for free-text questions ("what does the contract say about..."). Returns the best matching passages with their file.',
    searchInput,
  ),
  definition(
    'list_documents',
    'Lists analyzed documents (bank statements, payroll, invoices, receipts, sales reports) with their period and key figures, optionally filtered by type and date range. Also lists files still being analyzed or failed. Amounts are in minor units.',
    listDocumentsInput,
  ),
  definition(
    'get_document',
    'Full extracted details of one document, including payroll lines for payroll documents. Use a documentId from list_documents.',
    getDocumentInput,
  ),
  definition(
    'get_totals',
    'Income and expense totals per week or month, by category and currency, for a date range (inclusive YYYY-MM-DD). Amounts in minor units; confirmed and unconfirmed parts are separate.',
    totalsInput,
  ),
  definition(
    'list_records',
    'Lists individual income/expense records, newest first, optionally filtered by date range, category or file. Amounts in minor units.',
    listRecordsInput,
  ),
];

export interface ChatToolDeps {
  repos: RepositoriesService;
  config: AppConfig;
  embeddings: EmbeddingProvider | null;
}

/** Scalar fields of a document's details: a compact per-type summary of key figures. */
function summarizeDetails(details: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) =>
      ['string', 'number', 'boolean'].includes(typeof value),
    ),
  );
}

/**
 * Read-only tools over the owner's repositories. They take no owner argument: every
 * repository is already scoped to the configured owner.
 */
export function createChatToolHandler(deps: ChatToolDeps): ToolHandler {
  const { repos, config, embeddings } = deps;

  const fileNames = async (ids: string[]) =>
    new Map(
      (await repos.files.findManyByIds([...new Set(ids)])).map((f) => [
        f.id,
        f.originalName,
      ]),
    );

  const handlers: Record<string, (input: unknown) => Promise<ToolOutput>> = {
    async search_documents(raw) {
      const input = searchInput.parse(raw);
      if (!embeddings) {
        throw new Error(
          'Semantic search is not configured (no embeddings key); use the other tools',
        );
      }
      const { vector, totalTokens } = await embedQuery(embeddings, input.query);
      await repos.costs.insert({
        kind: 'embedding',
        model: embeddings.model,
        inputTokens: totalTokens,
        outputTokens: 0,
        costMicroUsd: calculateCostMicroUsd(embeddings.model, {
          inputTokens: totalTokens,
          outputTokens: 0,
        }),
      });
      const matches = await repos.chunks.searchChunks(vector, {
        limit: input.limit ?? 5,
        fileId: input.fileId,
      });
      const names = await fileNames(matches.map((m) => m.fileId));
      return {
        data: matches.map((m) => ({
          fileId: m.fileId,
          fileName: names.get(m.fileId) ?? null,
          similarity: Number(m.similarity.toFixed(3)),
          passage: m.content,
        })),
        fileIds: matches.map((m) => m.fileId),
      };
    },

    async list_documents(raw) {
      const input = listDocumentsInput.parse(raw);
      const types: DocumentType[] = input.types?.length
        ? input.types
        : [...documentTypes];
      const period = {
        from: input.from ?? '0001-01-01',
        to: input.to ?? '9999-12-31',
      };
      // Invoices/receipts are placed by issue date, the rest by period end: query per type.
      const documents = (
        await Promise.all(
          types.map((type) => repos.documents.listByType(type, period)),
        )
      ).flat();
      const names = await fileNames(documents.map((d) => d.fileId));
      const pending = (await repos.files.list({ limit: 50 })).items.filter(
        (f) => PENDING_STATUSES.includes(f.status),
      );
      return {
        data: {
          documents: documents.map((d) => ({
            documentId: d.id,
            fileId: d.fileId,
            fileName: names.get(d.fileId) ?? null,
            type: d.type,
            periodStart: d.periodStart,
            periodEnd: d.periodEnd,
            issueDate: d.issueDate,
            currency: d.currency,
            consistency: d.consistency,
            consistencyNotes: d.consistencyNotes,
            keyFigures: summarizeDetails(d.details),
          })),
          filesNotAnalyzed: pending.map((f) => ({
            fileId: f.id,
            fileName: f.originalName,
            status: f.status,
          })),
        },
        fileIds: documents.map((d) => d.fileId),
      };
    },

    async get_document(raw) {
      const { documentId } = getDocumentInput.parse(raw);
      const document = await repos.documents.findById(documentId);
      if (!document) throw new Error('Document not found');
      const [file] = await repos.files.findManyByIds([document.fileId]);
      const payrollLines =
        document.type === 'payroll'
          ? (await repos.documents.payrollLines(document.id)).map((l) => ({
              employee: l.employeeName,
              grossMinor: l.grossMinor,
              deductionsMinor: l.deductionsMinor,
              netMinor: l.netMinor,
            }))
          : undefined;
      return {
        data: {
          documentId: document.id,
          fileId: document.fileId,
          fileName: file?.originalName ?? null,
          type: document.type,
          periodStart: document.periodStart,
          periodEnd: document.periodEnd,
          issueDate: document.issueDate,
          currency: document.currency,
          consistency: document.consistency,
          consistencyNotes: document.consistencyNotes,
          details: document.details,
          payrollLines,
        },
        fileIds: [document.fileId],
      };
    },

    async get_totals(raw) {
      const input = totalsInput.parse(raw);
      const rows = await repos.records.totals({
        ...input,
        weekStart: config.weekStart,
      });
      return { data: { currencyDefault: config.currency, rows } };
    },

    async list_records(raw) {
      const input = listRecordsInput.parse(raw);
      const page = await repos.records.list({
        from: input.from,
        to: input.to,
        category: input.category,
        fileId: input.fileId,
        limit: input.limit ?? 25,
      });
      return {
        data: {
          records: page.items
            .filter((t) => t.excludedReason === null)
            .map((t) => ({
              fileId: t.fileId,
              occurredOn: t.occurredOn,
              amountMinor: t.amountMinor,
              currency: t.currency,
              kind: t.kind,
              category: t.category,
              counterparty: t.counterparty,
              confirmed: t.confirmed,
            })),
          truncated: page.nextCursor !== null,
        },
        fileIds: [...new Set(page.items.map((t) => t.fileId))],
      };
    },
  };

  return async (name, input) => {
    const handler = handlers[name];
    if (!handler) throw new Error(`Unknown tool "${name}"`);
    return handler(input);
  };
}
