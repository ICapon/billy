import type {
  LlmClient,
  StructuredRequest,
  StructuredResponse,
} from '../llm-client';

type Scripted =
  | { output: unknown; usage?: { inputTokens: number; outputTokens: number } }
  | Error;

/**
 * Deterministic LLM double: returns queued responses in order and records every request.
 * Fixtures are recorded outputs, so tests never reach the network.
 */
export class FakeLlmClient implements LlmClient {
  readonly requests: StructuredRequest[] = [];
  private readonly queue: Scripted[];

  constructor(responses: Scripted[] = []) {
    this.queue = [...responses];
  }

  enqueue(response: Scripted): this {
    this.queue.push(response);
    return this;
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
