import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  calculateCostMicroUsd,
  chunkText,
  ConfigurationError,
  CostLimitReachedError,
  extractFile,
  MeteredLlmClient,
  UnreadableFileError,
  type EmbeddingProvider,
  type ExtractFileResult,
  type LlmClient,
  type OcrEngine,
} from '@org/ai';
import type { BusinessFileRow } from '@org/db';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { RepositoriesService } from '../database/repositories.service';
import { StorageService } from '../storage/storage.service';
import { CostGuardService } from './cost-guard.service';
import { DuplicatesService } from './duplicates.service';
import { EMBEDDINGS, LLM_CLIENT, OCR_ENGINE } from './tokens';

/** What the pipeline needs from object storage (the S3 service, or a fake in tests). */
export type FileStorage = Pick<StorageService, 'getBuffer' | 'putText'>;

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly repos: RepositoriesService,
    private readonly storage: StorageService,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    @Inject(OCR_ENGINE) private readonly ocr: OcrEngine,
    @Inject(EMBEDDINGS) private readonly embeddings: EmbeddingProvider | null,
    private readonly guard: CostGuardService,
    private readonly duplicates: DuplicatesService,
  ) {}

  /**
   * Runs the whole pipeline for one file: read (cheapest adequate method) -> structure ->
   * persist records and cost -> index for search. Errors that retrying cannot fix mark the file
   * as failed without throwing; transient errors mark it failed and rethrow so BullMQ retries.
   */
  async process(fileId: string): Promise<void> {
    const file = await this.repos.files.findById(fileId);
    if (!file) {
      this.logger.warn(`File ${fileId} no longer exists, skipping`);
      return;
    }
    const started = Date.now();
    await this.repos.files.update(fileId, {
      status: 'processing',
      failureReason: null,
    });

    try {
      await this.guard.assertCanSpend();
      const data = await this.storage.getBuffer(file.storageKey);
      const llm = new MeteredLlmClient(this.llm, {
        beforeCall: () => this.guard.assertCanSpend(),
        afterCall: (event) =>
          this.recordCost(file.id, {
            kind: event.kind,
            model: event.model,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            costMicroUsd: event.costMicroUsd,
          }),
      });

      const result = await extractFile(
        { data, mimeType: file.mimeType, fileName: file.originalName },
        {
          llm,
          ocr: this.ocr,
          config: {
            extractionModel: this.config.extractionModel,
            visionModel: this.config.visionModel,
            ocrMinConfidence: this.config.ocrMinConfidence,
            recordMinConfidence: this.config.recordMinConfidence,
            currency: this.config.currency,
          },
        },
        // The owner chose the type: read the file as that type, never reclassify it.
        {
          forcedType:
            file.documentTypeManual && file.documentType
              ? file.documentType
              : undefined,
        },
      );

      await this.persist(file, result);
      this.logger.log(
        `file=${file.id} tier=${result.method} type=${result.documentType ?? 'none'} status=${result.outcome} documents=${result.documents.length} records=${result.records.length} ms=${Date.now() - started}`,
      );
    } catch (error) {
      await this.handleFailure(file, error, Date.now() - started);
    }
  }

  private async handleFailure(
    file: BusinessFileRow,
    error: unknown,
    elapsedMs: number,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof CostLimitReachedError) {
      await this.repos.files.update(file.id, { status: 'queued_limit' });
      this.logger.warn(
        `file=${file.id} status=queued_limit (cost limit reached)`,
      );
      return;
    }
    await this.repos.files.update(file.id, {
      status: 'failed',
      failureReason: message,
    });
    this.logger.error(
      `file=${file.id} status=failed ms=${elapsedMs}: ${message}`,
    );
    // Corrupted files and missing configuration cannot be fixed by retrying.
    if (
      error instanceof UnreadableFileError ||
      error instanceof ConfigurationError
    ) {
      return;
    }
    throw error;
  }

  private async persist(
    file: BusinessFileRow,
    result: ExtractFileResult,
  ): Promise<void> {
    let rawTextKey: string | null = null;
    if (result.rawText) {
      rawTextKey = `${file.storageKey}.extracted.txt`;
      await this.storage.putText(rawTextKey, result.rawText);
    }

    await this.repos.runs.insertMany(
      file.id,
      result.runs.map((run) => ({
        ...run,
        rawTextKey: run.tier === result.method ? rawTextKey : null,
      })),
    );

    // Reading without an API (parsing, OCR) costs nothing but is logged for the cost views.
    for (const run of result.runs) {
      if (run.tier === 'digital' || run.tier === 'ocr') {
        await this.repos.costs.insert({
          fileId: file.id,
          kind: run.tier === 'digital' ? 'parse' : 'ocr',
          costMicroUsd: 0,
        });
      }
    }

    // Documents first (replacing them unlinks any confirmed record that is kept), then the
    // records, each pointing at the new document it came from.
    const documentIds = await this.repos.documents.replaceForFile(
      file.id,
      result.documents.map(({ records: _records, ...document }) => document),
    );
    const created = await this.repos.records.replaceExtracted(
      file.id,
      result.documents.flatMap((document, index) =>
        document.records.map((record) => ({
          ...record,
          documentId: documentIds[index],
        })),
      ),
    );
    try {
      await this.duplicates.detectFor(created);
    } catch (error) {
      this.logger.warn(
        `file=${file.id} duplicate detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await this.index(file, result.rawText);

    await this.repos.files.update(file.id, {
      status: result.outcome,
      readingMethod: result.method,
      documentType: result.documentType,
      documentTypeConfidence: result.documentTypeConfidence,
      failureReason:
        result.outcome === 'needs_review' ? result.issues.join('; ') : null,
    });
  }

  /** Chunks the text and stores embeddings. Indexing problems never fail the file. */
  private async index(
    file: BusinessFileRow,
    rawText: string | null,
  ): Promise<void> {
    if (!rawText) return;
    if (!this.embeddings) {
      this.logger.warn(
        `file=${file.id} not indexed: no embeddings provider configured`,
      );
      return;
    }
    try {
      const chunks = await chunkText(rawText);
      if (chunks.length === 0) return;
      await this.guard.assertCanSpend();
      const { embeddings, totalTokens } = await this.embeddings.embed(
        chunks.map((c) => c.content),
        'document',
      );
      await this.repos.chunks.replaceForFile(
        file.id,
        chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] })),
      );
      await this.recordCost(file.id, {
        kind: 'embedding',
        model: this.embeddings.model,
        inputTokens: totalTokens,
        outputTokens: 0,
        costMicroUsd: calculateCostMicroUsd(this.embeddings.model, {
          inputTokens: totalTokens,
          outputTokens: 0,
        }),
      });
    } catch (error) {
      this.logger.warn(
        `file=${file.id} indexing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async recordCost(
    fileId: string,
    entry: {
      kind: 'llm_text' | 'llm_vision' | 'embedding';
      model: string;
      inputTokens: number;
      outputTokens: number;
      costMicroUsd: number;
    },
  ): Promise<void> {
    await this.repos.costs.insert({ fileId, ...entry });
    await this.repos.files.addCost(fileId, entry.costMicroUsd);
  }
}
