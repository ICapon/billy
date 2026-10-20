import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  answerQuestion,
  ChatTurnLimitError,
  ChatTurnTimeoutError,
  ConfigurationError,
  MeteredLlmClient,
  type EmbeddingProvider,
  type LlmClient,
} from '@org/ai';
import {
  chatSuggestions,
  type ChatStatus,
  type Conversation,
  type ConversationDetail,
  type ConversationsPage,
  type ConversationsQuery,
  type SendMessageResult,
} from '@org/shared';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { RepositoriesService } from '../database/repositories.service';
import { createChatToolHandler, chatToolDefinitions } from './chat-tools';
import { toChatMessage, toConversation, toSourceSnapshot } from './chat.mapper';
import { CHAT_EMBEDDINGS, CHAT_LLM } from './chat.tokens';

const RATE_LIMIT_WINDOW_SECONDS = 60;
/** Statuses whose extracted data the chat can read. */
const ANALYZED_STATUSES = ['completed', 'needs_review'] as const;

/** 429 carrying the seconds after which the owner may try again (sent as `Retry-After`). */
export class ChatRateLimitedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      'Too many questions in a short time; wait a moment and try again',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly repos: RepositoriesService,
    @Inject(CHAT_LLM) private readonly llm: LlmClient | null,
    @Inject(CHAT_EMBEDDINGS)
    private readonly embeddings: EmbeddingProvider | null,
  ) {}

  async status(): Promise<ChatStatus> {
    const analyzed = await Promise.all(
      ANALYZED_STATUSES.map((status) =>
        this.repos.files.list({ status, limit: 1 }),
      ),
    );
    return {
      enabled: this.llm !== null,
      hasDocuments: analyzed.some((page) => page.items.length > 0),
      suggestions: [...chatSuggestions],
    };
  }

  async createConversation(): Promise<Conversation> {
    return toConversation(await this.repos.chat.createConversation());
  }

  async listConversations(
    query: ConversationsQuery,
  ): Promise<ConversationsPage> {
    const page = await this.repos.chat.listConversations(query);
    return {
      items: page.items.map(toConversation),
      nextCursor: page.nextCursor,
    };
  }

  async getConversation(id: string): Promise<ConversationDetail> {
    const conversation = await this.requireConversation(id);
    const rows = await this.repos.chat.listMessages(id);
    const existing = await this.existingFileIds(rows.flatMap((r) => r.sources));
    return {
      conversation: toConversation(conversation),
      messages: rows.map((row) => toChatMessage(row, existing)),
    };
  }

  async deleteConversation(id: string): Promise<void> {
    if (!(await this.repos.chat.deleteConversation(id))) {
      throw new NotFoundException('Conversation not found');
    }
  }

  async sendMessage(
    conversationId: string,
    content: string,
  ): Promise<SendMessageResult> {
    await this.requireConversation(conversationId);
    if (content.length > this.config.chat.maxMessageChars) {
      throw new BadRequestException(
        `The message is too long (maximum ${this.config.chat.maxMessageChars} characters)`,
      );
    }
    const llm = this.llm;
    if (!llm) {
      throw new ServiceUnavailableException(
        'The chat is not configured (ANTHROPIC_API_KEY is not set)',
      );
    }

    const userRow = await this.storeQuestion(conversationId, content);
    const history = (
      await this.repos.chat.recentMessages(
        conversationId,
        this.config.chat.contextMessages + 1,
      )
    )
      .filter((m) => m.id !== userRow.id)
      .slice(-this.config.chat.contextMessages)
      .map((m) => ({ role: m.role, content: m.content }));

    const metered = new MeteredLlmClient(llm, {
      // Chat is not blocked by the monthly processing limit (a different spend).
      beforeCall: async () => undefined,
      afterCall: (event) =>
        this.repos.costs.insert({
          kind: event.kind,
          model: event.model,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          costMicroUsd: event.costMicroUsd,
        }),
    });

    let answer;
    try {
      answer = await answerQuestion({
        llm: metered,
        model: this.config.chat.model,
        question: content,
        history,
        tools: chatToolDefinitions,
        handleTool: createChatToolHandler({
          repos: this.repos,
          config: this.config,
          embeddings: this.embeddings,
        }),
        today: new Date().toISOString().slice(0, 10),
        currency: this.config.currency,
        timeoutMs: this.config.chat.turnTimeoutMs,
      });
    } catch (error) {
      this.logger.error(
        `conversation=${conversationId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (error instanceof ConfigurationError) {
        throw new ServiceUnavailableException(error.message);
      }
      if (
        error instanceof ChatTurnLimitError ||
        error instanceof ChatTurnTimeoutError
      ) {
        throw new BadGatewayException(error.message);
      }
      throw new BadGatewayException('The assistant could not answer');
    }

    const sources = await this.resolveSources(answer.sourceFileIds);
    const assistantRow = await this.repos.chat.appendMessage(conversationId, {
      role: 'assistant',
      content: answer.text,
      sources,
    });
    if (!assistantRow) throw new NotFoundException('Conversation not found');

    const existing = new Set(sources.map((s) => s.fileId));
    return {
      userMessage: toChatMessage(userRow, existing),
      assistantMessage: toChatMessage(assistantRow, existing),
    };
  }

  /**
   * Stores the question. If the last message is the same question and was never answered
   * (a failed attempt), it is reused so a retry does not duplicate it.
   */
  private async storeQuestion(conversationId: string, content: string) {
    const rows = await this.repos.chat.recentMessages(conversationId, 1);
    const last = rows[0];
    if (last && last.role === 'user' && last.content === content) return last;

    const sent = await this.repos.chat.countUserMessagesSince(
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (sent >= this.config.chat.rateLimitPerMinute) {
      throw new ChatRateLimitedException(RATE_LIMIT_WINDOW_SECONDS);
    }
    const stored = await this.repos.chat.appendMessage(conversationId, {
      role: 'user',
      content,
    });
    if (!stored) throw new NotFoundException('Conversation not found');
    return stored;
  }

  private async resolveSources(fileIds: string[]) {
    if (fileIds.length === 0) return [];
    const [files, documents] = await Promise.all([
      this.repos.files.findManyByIds(fileIds),
      this.repos.documents.listByFiles(fileIds),
    ]);
    return fileIds.flatMap((id) => {
      const file = files.find((f) => f.id === id);
      return file
        ? [
            toSourceSnapshot(
              file,
              documents.filter((d) => d.fileId === id),
            ),
          ]
        : [];
    });
  }

  private async existingFileIds(sources: { fileId: string }[]) {
    const ids = [...new Set(sources.map((s) => s.fileId))];
    return new Set(
      (await this.repos.files.findManyByIds(ids)).map((f) => f.id),
    );
  }

  private async requireConversation(id: string) {
    const conversation = await this.repos.chat.findConversation(id);
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }
}
