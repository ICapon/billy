import { priceFor } from './pricing';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Cost in micro-USD, rounded up so a paid call never records as free. */
export function calculateCostMicroUsd(
  model: string,
  usage: TokenUsage,
): number {
  const price = priceFor(model);
  const cost =
    usage.inputTokens * price.inputPerMTok +
    usage.outputTokens * price.outputPerMTok;
  return Math.ceil(cost);
}
