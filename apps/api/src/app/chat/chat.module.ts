import { Module } from '@nestjs/common';
import {
  AnthropicLlmClient,
  VoyageEmbeddingProvider,
  type EmbeddingProvider,
  type LlmClient,
} from '@org/ai';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { CHAT_EMBEDDINGS, CHAT_LLM } from './chat.tokens';

@Module({
  controllers: [ChatController],
  providers: [
    {
      provide: CHAT_LLM,
      inject: [APP_CONFIG],
      // null without a key: the chat reports 503 instead of the API failing to boot.
      useFactory: (config: AppConfig): LlmClient | null =>
        config.anthropicApiKey
          ? new AnthropicLlmClient(config.anthropicApiKey)
          : null,
    },
    {
      provide: CHAT_EMBEDDINGS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): EmbeddingProvider | null =>
        config.embedding.apiKey
          ? new VoyageEmbeddingProvider(
              config.embedding.apiKey,
              config.embedding.model,
              config.embedding.dimensions,
            )
          : null,
    },
    ChatService,
  ],
})
export class ChatModule {}
