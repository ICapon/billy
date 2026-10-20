import { Module, type OnApplicationShutdown, Inject } from '@nestjs/common';
import {
  AnthropicLlmClient,
  createTesseractOcr,
  VoyageEmbeddingProvider,
  type ConverseRequest,
  type ConverseResponse,
  type LlmClient,
  type OcrEngine,
  type StructuredRequest,
  type StructuredResponse,
} from '@org/ai';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { StorageModule } from '../storage/storage.module';
import { CostGuardService } from './cost-guard.service';
import { DuplicatesService } from './duplicates.service';
import { ExtractionService } from './extraction.service';
import { EMBEDDINGS, LLM_CLIENT, OCR_ENGINE } from './tokens';

/** Builds the Anthropic client on first use so a missing key fails the file, not the worker. */
class LazyLlmClient implements LlmClient {
  private client: LlmClient | null = null;
  constructor(private readonly apiKey: string | undefined) {}

  generateStructured(request: StructuredRequest): Promise<StructuredResponse> {
    this.client ??= new AnthropicLlmClient(this.apiKey);
    return this.client.generateStructured(request);
  }

  converse(request: ConverseRequest): Promise<ConverseResponse> {
    this.client ??= new AnthropicLlmClient(this.apiKey);
    return this.client.converse(request);
  }
}

@Module({
  imports: [StorageModule],
  providers: [
    {
      provide: LLM_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): LlmClient =>
        new LazyLlmClient(config.anthropicApiKey),
    },
    { provide: OCR_ENGINE, useFactory: (): OcrEngine => createTesseractOcr() },
    {
      provide: EMBEDDINGS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.embedding.apiKey
          ? new VoyageEmbeddingProvider(
              config.embedding.apiKey,
              config.embedding.model,
              config.embedding.dimensions,
            )
          : null,
    },
    CostGuardService,
    DuplicatesService,
    ExtractionService,
  ],
  exports: [ExtractionService, CostGuardService],
})
export class ExtractionModule implements OnApplicationShutdown {
  constructor(@Inject(OCR_ENGINE) private readonly ocr: OcrEngine) {}

  async onApplicationShutdown(): Promise<void> {
    await this.ocr.close();
  }
}
