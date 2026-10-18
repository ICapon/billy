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

/** Seam used by the extraction pipeline so tests never call the real API. */
export interface LlmClient {
  generateStructured(request: StructuredRequest): Promise<StructuredResponse>;
}

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(apiKey: string | undefined) {
    if (!apiKey) {
      throw new ConfigurationError('ANTHROPIC_API_KEY is not set');
    }
    this.client = new Anthropic({ apiKey });
  }

  async generateStructured(
    request: StructuredRequest,
  ): Promise<StructuredResponse> {
    const response = await this.client.messages.create({
      model: request.model,
      // Room for a long transaction list; kept under the SDK's non-streaming limit.
      max_tokens: request.maxTokens ?? 16_000,
      // Extraction is mechanical; thinking tokens were eating the whole budget and
      // truncating the tool call to `{}`.
      thinking: { type: 'disabled' },
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
