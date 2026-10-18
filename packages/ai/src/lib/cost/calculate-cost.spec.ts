import { calculateCostMicroUsd } from './calculate-cost';
import { priceFor } from './pricing';

describe('calculateCostMicroUsd', () => {
  it('converts tokens and per-million prices into micro-USD', () => {
    // 10k input at $1/M = $0.01 = 10,000 micro-USD; 2k output at $5/M = $0.01 = 10,000
    expect(
      calculateCostMicroUsd('claude-haiku-5-5', {
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(20_000);
  });

  it('charges output tokens more than input tokens', () => {
    const usage = { inputTokens: 1000, outputTokens: 1000 };
    expect(calculateCostMicroUsd('claude-sonnet-5-5', usage)).toBe(18_000);
  });

  it('rounds fractional micro-USD up', () => {
    expect(
      calculateCostMicroUsd('voyage-3.5-lite', {
        inputTokens: 10,
        outputTokens: 0,
      }),
    ).toBe(1);
    expect(
      calculateCostMicroUsd('claude-haiku-5-5', {
        inputTokens: 0,
        outputTokens: 0,
      }),
    ).toBe(0);
  });

  it('prices unknown model ids by family and falls back to the most expensive', () => {
    expect(priceFor('claude-haiku-9-9')).toEqual(priceFor('claude-haiku-5-5'));
    expect(priceFor('claude-sonnet-9-9')).toEqual(
      priceFor('claude-sonnet-5-5'),
    );
    expect(priceFor('mystery-model')).toEqual(priceFor('claude-opus-5-5'));
  });
});
