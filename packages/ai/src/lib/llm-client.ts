import Anthropic from '@anthropic-ai/sdk';
import type { TokenUsage } from './cost/calculate-cost';
import { ConfigurationError } from './errors';

export type LlmContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
      data: Buffer;
    }
  | { type: 'pdf'; data: Buffer };

export interface StructuredRequest {
  model: string;
  system: string;
  content: LlmContentBlock[];
  /** Name and JSON schema of the single tool the model must call to answer. */
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
}

export interface StructuredResponse {
  /** Raw tool input; the caller validates it with zod. */
  output: unknown;
  usage: TokenUsage;
  model: string;
}

/** A piece of a conversational turn (used by the chat, which runs a tool-use loop). */
export type ConverseBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError?: boolean;
    };

export interface ConverseTurn {
  role: 'user' | 'assistant';
  content: ConverseBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ConverseRequest {
  model: string;
  system: string;
  messages: ConverseTurn[];
  tools: ToolDefinition[];
  maxTokens?: number;
  /** Aborts the request (turn timeout). */
  signal?: AbortSignal;
}

export interface ConverseResponse {
  /** Text and tool_use blocks the model produced. */
  content: ConverseBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'other';
  usage: TokenUsage;
  model: string;
}

/** Seam used by the extraction pipeline and the chat so tests never call the real API. */
export interface LlmClient {
  generateStructured(request: StructuredRequest): Promise<StructuredResponse>;
  /** One model turn with tools; the caller runs the loop. */
  converse(request: ConverseRequest): Promise<ConverseResponse>;
}

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(apiKey: string | undefined) {
    if (!apiKey) {
      throw new ConfigurationError('ANTHROPIC_API_KEY is not set');
    }
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Newer models reject `thinking: disabled` and want `between_tools` instead
   * (they don't think up front; their tool-call updates come back as thinking
   * blocks, which callers ignore). Older ones only know `disabled`, so try the
   * new form first and fall back when the API rejects it.
   */
  private async createWithoutThinking(
    params: Omit<Anthropic.MessageCreateParamsNonStreaming, 'thinking'>,
    options?: { signal?: AbortSignal },
  ): Promise<Anthropic.Message> {
    const send = (thinking: { type: string }) =>
      this.client.messages.create(
        {
          ...params,
          thinking,
        } as Anthropic.MessageCreateParamsNonStreaming,
        options,
      );
    try {
      return await send({ type: 'disabled' });
    } catch (error) {
      if (
        error instanceof Anthropic.BadRequestError &&
        error.message.includes('between_tools')
      ) {
        return send({ type: 'between_tools' });
      }
      throw error;
    }
  }

  async generateStructured(
    request: StructuredRequest,
  ): Promise<StructuredResponse> {
    const response = await this.createWithoutThinking({
      model: request.model,
      // Room for a long transaction list; kept under the SDK's non-streaming limit.
      max_tokens: request.maxTokens ?? 16_000,
      // Extraction is mechanical; thinking tokens were eating the whole budget and
      // truncating the tool call to `{}`.
      // Some models reject forced tool_choice ("tool"/"any"), so use "auto"
      // and instruct the model to answer through the tool instead.
      system: `${request.system}\n\nYou must respond by calling the "${request.toolName}" tool exactly once. Do not answer with plain text.`,
      tools: [
        {
          name: request.toolName,
          description: request.toolDescription,
          input_schema: request.inputSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'auto' },
      messages: [
        { role: 'user', content: request.content.map(toAnthropicBlock) },
      ],
    });

    // Temporary diagnostics: shows what the model actually returned.
    console.log(
      '[llm-client] response',
      JSON.stringify({
        model: response.model,
        stopReason: response.stop_reason,
        usage: response.usage,
        blocks: response.content.map((block) =>
          block.type === 'tool_use'
            ? {
                type: block.type,
                name: block.name,
                input: JSON.stringify(block.input).slice(0, 2000),
              }
            : block.type === 'text'
              ? { type: block.type, text: block.text.slice(0, 2000) }
              : { type: block.type },
        ),
      }),
    );

    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        'The model response was cut off (max_tokens); the document is too large for one request',
      );
    }
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('The model did not return structured output');
    }
    return {
      output: toolUse.input,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
    };
  }

  async converse(request: ConverseRequest): Promise<ConverseResponse> {
    const response = await this.createWithoutThinking(
      {
        model: request.model,
        max_tokens: request.maxTokens ?? 4_000,
        system: request.system,
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
        })),
        tool_choice: { type: 'auto' },
        messages: request.messages.map((turn) => ({
          role: turn.role,
          content: turn.content.map(toAnthropicConverseBlock),
        })),
      },
      { signal: request.signal },
    );

    const content: ConverseBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        content.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        content.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }
    return {
      content,
      stopReason:
        response.stop_reason === 'end_turn' ||
        response.stop_reason === 'tool_use' ||
        response.stop_reason === 'max_tokens'
          ? response.stop_reason
          : 'other',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
    };
  }
}

function toAnthropicConverseBlock(
  block: ConverseBlock,
): Anthropic.ContentBlockParam {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'tool_use':
      return {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input,
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: block.toolUseId,
        content: block.content,
        is_error: block.isError ?? false,
      };
  }
}

function toAnthropicBlock(block: LlmContentBlock): Anthropic.ContentBlockParam {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'image':
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: block.mediaType,
          data: block.data.toString('base64'),
        },
      };
    case 'pdf':
      return {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: block.data.toString('base64'),
        },
      };
  }
}
