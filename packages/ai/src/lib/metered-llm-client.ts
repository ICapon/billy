import { calculateCostMicroUsd } from './cost/calculate-cost';
import type {
  LlmClient,
  StructuredRequest,
  StructuredResponse,
} from './llm-client';

export interface LlmUsageEvent {
  model: string;
  kind: 'llm_text' | 'llm_vision';
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
}

export interface MeterHooks {
  /** Called before every paid request; throw `CostLimitReachedError` to stop it. */
  beforeCall(): Promise<void>;
  /** Called after every successful request with its cost. */
  afterCall(event: LlmUsageEvent): Promise<void>;
}

/** Wraps an LLM client so each call is budget-checked before and costed after. */
export class MeteredLlmClient implements LlmClient {
  constructor(
    private readonly inner: LlmClient,
    private readonly hooks: MeterHooks,
  ) {}

  async generateStructured(
    request: StructuredRequest,
  ): Promise<StructuredResponse> {
    await this.hooks.beforeCall();
    const response = await this.inner.generateStructured(request);
    const usesVision = request.content.some(
      (b) => b.type === 'image' || b.type === 'pdf',
    );
    await this.hooks.afterCall({
      model: response.model || request.model,
      kind: usesVision ? 'llm_vision' : 'llm_text',
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      costMicroUsd: calculateCostMicroUsd(request.model, response.usage),
    });
    return response;
  }
}
