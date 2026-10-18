import { FakeLlmClient } from '../testing/fake-llm-client';
import {
  MAX_CHARS_PER_REQUEST,
  splitText,
  structureContent,
  structureText,
  TOOL_NAME,
} from './structure';

const transaction = {
  date: '2026-10-12',
  amount: 10,
  currency: 'USD',
  kind: 'income',
  category: 'sales',
  counterparty: null,
  lineItems: [],
  confidence: { date: 0.9, amount: 0.9, kind: 0.9 },
};

const base = {
  model: 'claude-haiku-5-5',
  fileName: 'ventas.csv',
  today: new Date('2026-10-18T00:00:00Z'),
  fallbackCurrency: 'USD',
};

describe('structureContent', () => {
  it('forces the tool call and describes the rules in the system prompt', async () => {
    const llm = new FakeLlmClient([
      { output: { transactions: [transaction] } },
    ]);
    const document = await structureContent({
      ...base,
      llm,
      content: [{ type: 'text', text: 'rows' }],
    });
    expect(document.transactions).toHaveLength(1);

    const [request] = llm.requests;
    expect(request.toolName).toBe(TOOL_NAME);
    expect(request.system).toContain('2026-10-18');
    expect(request.system).toContain('staff');
    expect(request.system).toContain('day-first');
    expect(JSON.stringify(request.inputSchema)).toContain('transactions');
    expect(request.inputSchema).not.toHaveProperty('$schema');
    expect(request.content[0]).toMatchObject({ type: 'text' });
  });

  it('retries once on invalid output and includes the validation error', async () => {
    const llm = new FakeLlmClient([
      { output: { transactions: [{ ...transaction, kind: 'transfer' }] } },
      { output: { transactions: [transaction] } },
    ]);
    const document = await structureContent({
      ...base,
      llm,
      content: [{ type: 'text', text: 'rows' }],
    });
    expect(document.transactions[0].kind).toBe('income');
    expect(llm.requests).toHaveLength(2);
    const retry = llm.requests[1].content.at(-1);
    expect(retry).toMatchObject({ type: 'text' });
    expect((retry as { text: string }).text).toContain('kind');
  });

  it('gives up after the retry fails too', async () => {
    const bad = { output: { transactions: 'nope' } };
    const llm = new FakeLlmClient([bad, bad]);
    await expect(
      structureContent({
        ...base,
        llm,
        content: [{ type: 'text', text: 'rows' }],
      }),
    ).rejects.toThrow('invalid structured output');
    expect(llm.requests).toHaveLength(2);
  });

  it('accepts an empty document', async () => {
    const llm = new FakeLlmClient([{ output: { transactions: [] } }]);
    const document = await structureContent({
      ...base,
      llm,
      content: [{ type: 'text', text: 'nothing here' }],
    });
    expect(document.transactions).toEqual([]);
  });
});

describe('splitText / structureText', () => {
  it('keeps short text in one part and splits long text on lines', () => {
    expect(splitText('a\nb')).toEqual(['a\nb']);
    const line = 'x'.repeat(1000);
    const long = Array.from({ length: 100 }, () => line).join('\n');
    const parts = splitText(long, 30_000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 30_000)).toBe(true);
    expect(parts.join('\n')).toBe(long);
  });

  it('cuts a single enormous line instead of dropping it', () => {
    const parts = splitText('y'.repeat(MAX_CHARS_PER_REQUEST * 2 + 5));
    expect(parts.length).toBe(3);
    expect(parts.join('').length).toBe(MAX_CHARS_PER_REQUEST * 2 + 5);
  });

  it('merges the transactions of every part', async () => {
    const llm = new FakeLlmClient([
      { output: { transactions: [transaction] } },
      { output: { transactions: [transaction, transaction] } },
    ]);
    const text = `${'a'.repeat(MAX_CHARS_PER_REQUEST - 10)}\n${'b'.repeat(100)}`;
    const document = await structureText({ ...base, llm, text });
    expect(llm.requests).toHaveLength(2);
    expect(document.transactions).toHaveLength(3);
  });
});
