import type {
  ConverseRequest,
  ConverseResponse,
  LlmClient,
  StructuredRequest,
  StructuredResponse,
} from '../llm-client';

type Scripted =
  | { output: unknown; usage?: { inputTokens: number; outputTokens: number } }
  | Error;

type ScriptedTurn =
  | (Pick<ConverseResponse, 'content'> &
      Partial<Pick<ConverseResponse, 'stopReason' | 'usage'>>)
  | Error;

/**
 * Deterministic LLM double: returns queued responses in order and records every request.
 * Fixtures are recorded outputs, so tests never reach the network.
 */
export class FakeLlmClient implements LlmClient {
  readonly requests: StructuredRequest[] = [];
  readonly converseRequests: ConverseRequest[] = [];
  private readonly queue: Scripted[];
  private readonly turns: ScriptedTurn[] = [];

  constructor(responses: Scripted[] = []) {
    this.queue = [...responses];
  }

  enqueue(response: Scripted): this {
    this.queue.push(response);
    return this;
  }

  /** Queues the next chat turn (text and/or tool_use blocks). */
  enqueueTurn(turn: ScriptedTurn): this {
    this.turns.push(turn);
    return this;
  }

  async converse(request: ConverseRequest): Promise<ConverseResponse> {
    // Copy the turns: the loop appends to its message list after each call.
    this.converseRequests.push({
      ...request,
      messages: request.messages.map((m) => ({ ...m })),
    });
    const next = this.turns.shift();
    if (!next) throw new Error('FakeLlmClient: no scripted turn left');
    if (next instanceof Error) throw next;
    return {
      content: next.content,
      stopReason:
        next.stopReason ??
        (next.content.some((b) => b.type === 'tool_use')
          ? 'tool_use'
          : 'end_turn'),
      usage: next.usage ?? { inputTokens: 100, outputTokens: 50 },
      model: request.model,
    };
  }

  async generateStructured(
    request: StructuredRequest,
  ): Promise<StructuredResponse> {
    this.requests.push(request);
    const next = this.queue.shift();
    if (!next) throw new Error('FakeLlmClient: no scripted response left');
    if (next instanceof Error) throw next;
    return {
      output: next.output,
      usage: next.usage ?? { inputTokens: 100, outputTokens: 50 },
      model: request.model,
    };
  }
}
