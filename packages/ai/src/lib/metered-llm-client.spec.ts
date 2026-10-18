import { CostLimitReachedError } from './errors';
import { MeteredLlmClient } from './metered-llm-client';
import { FakeLlmClient } from './testing/fake-llm-client';

const request = {
  model: 'claude-haiku-5-5',
  system: 's',
  toolName: 't',
  toolDescription: 'd',
  inputSchema: {},
};

describe('MeteredLlmClient', () => {
  it('checks the budget before and records the cost after a text call', async () => {
    const order: string[] = [];
    const afterCall = jest.fn(async () => void order.push('after'));
    const client = new MeteredLlmClient(
      new FakeLlmClient([
        { output: {}, usage: { inputTokens: 10_000, outputTokens: 2_000 } },
      ]),
      { beforeCall: async () => void order.push('before'), afterCall },
    );
    await client.generateStructured({
      ...request,
      content: [{ type: 'text', text: 'x' }],
    });

    expect(order).toEqual(['before', 'after']);
    expect(afterCall).toHaveBeenCalledWith({
      model: 'claude-haiku-5-5',
      kind: 'llm_text',
      inputTokens: 10_000,
      outputTokens: 2_000,
      costMicroUsd: 20_000,
    });
  });

  it('labels image and PDF calls as vision', async () => {
    const afterCall = jest.fn();
    const client = new MeteredLlmClient(new FakeLlmClient([{ output: {} }]), {
      beforeCall: async () => undefined,
      afterCall,
    });
    await client.generateStructured({
      ...request,
      content: [{ type: 'pdf', data: Buffer.from('p') }],
    });
    expect(afterCall.mock.calls[0][0].kind).toBe('llm_vision');
  });

  it('does not call the model when the budget is exhausted', async () => {
    const inner = new FakeLlmClient([{ output: {} }]);
    const client = new MeteredLlmClient(inner, {
      beforeCall: async () => {
        throw new CostLimitReachedError();
      },
      afterCall: async () => undefined,
    });
    await expect(
      client.generateStructured({
        ...request,
        content: [{ type: 'text', text: 'x' }],
      }),
    ).rejects.toBeInstanceOf(CostLimitReachedError);
    expect(inner.requests).toHaveLength(0);
  });
});
