import { FakeLlmClient } from '../testing/fake-llm-client';
import {
  bankStatementDoc,
  extraction,
  otherDoc,
  payrollDoc,
  receiptDoc,
  salesReportDoc,
  sampleTransaction,
} from '../testing/fixtures';
import {
  MAX_CHARS_PER_REQUEST,
  mergeDocuments,
  splitText,
  structureContent,
  structureText,
  TOOL_NAME,
} from './structure';

const base = {
  model: 'claude-haiku-5-5',
  fileName: 'ventas.csv',
  today: new Date('2026-10-18T00:00:00Z'),
  fallbackCurrency: 'USD',
};

const answer = (...documents: Parameters<typeof extraction>) => ({
  output: extraction(...documents),
});

describe('structureContent', () => {
  it('forces the tool call and describes the types and rules in the system prompt', async () => {
    const llm = new FakeLlmClient([answer(receiptDoc())]);
    const output = await structureContent({
      ...base,
      llm,
      content: [{ type: 'text', text: 'rows' }],
    });
    expect(output.documents).toHaveLength(1);
    expect(output.documents[0].type).toBe('receipt');

    const [request] = llm.requests;
    expect(request.toolName).toBe(TOOL_NAME);
    expect(request.system).toContain('2026-10-18');
    for (const word of [
      'bank_statement',
      'payroll',
      'sales_report',
      'staff',
      'day-first',
    ]) {
      expect(request.system).toContain(word);
    }
    expect(request.system).toContain('Classify every document');
    expect(request.system).not.toContain('The owner states');
    expect(JSON.stringify(request.inputSchema)).toContain('documents');
    expect(request.inputSchema).not.toHaveProperty('$schema');
  });

  it('tells the model the type when the owner chose it', async () => {
    const llm = new FakeLlmClient([answer(payrollDoc())]);
    await structureContent({
      ...base,
      llm,
      forcedType: 'payroll',
      content: [{ type: 'text', text: 'rows' }],
    });
    expect(llm.requests[0].system).toContain(
      'The owner states that this file is a payroll',
    );
    expect(llm.requests[0].system).not.toContain('Classify every document');
  });

  it('accepts several documents of different types in one answer', async () => {
    const llm = new FakeLlmClient([
      answer(receiptDoc(), bankStatementDoc(), otherDoc()),
    ]);
    const output = await structureContent({
      ...base,
      llm,
      content: [{ type: 'text', text: 'mixed' }],
    });
    expect(output.documents.map((d) => d.type)).toEqual([
      'receipt',
      'bank_statement',
      'other',
    ]);
  });

  it('retries once on invalid output and includes the validation error', async () => {
    const wrongBlock = { ...payrollDoc(), type: 'bank_statement' }; // detail block does not match
    const llm = new FakeLlmClient([
      { output: { documents: [wrongBlock] } },
      answer(payrollDoc()),
    ]);
    const output = await structureContent({
      ...base,
      llm,
      content: [{ type: 'text', text: 'rows' }],
    });
    expect(output.documents[0].type).toBe('payroll');
    expect(llm.requests).toHaveLength(2);
    const retry = llm.requests[1].content.at(-1);
    expect((retry as { text: string }).text).toContain(
      'previous answer was invalid',
    );
  });

  it('gives up after the retry fails too, without putting the raw answer in the error', async () => {
    const secret = { documents: 'Ana López cobra 2000' };
    const llm = new FakeLlmClient([{ output: secret }, { output: secret }]);
    const error = await structureContent({
      ...base,
      llm,
      content: [{ type: 'text', text: 'rows' }],
    }).catch((e: Error) => e);
    expect((error as Error).message).toContain('invalid structured output');
    expect((error as Error).message).not.toContain('Ana');
    expect(llm.requests).toHaveLength(2);
  });

  it('accepts a file with no documents', async () => {
    const llm = new FakeLlmClient([answer()]);
    const output = await structureContent({
      ...base,
      llm,
      content: [{ type: 'text', text: 'nothing here' }],
    });
    expect(output.documents).toEqual([]);
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

  it('merges the documents of every part, joining a periodic document split in two', async () => {
    const llm = new FakeLlmClient([
      answer(
        payrollDoc(
          {},
          {
            grossTotal: 1000,
            deductionsTotal: 200,
            netTotal: 800,
            employees: [
              { name: 'Ana', gross: 1000, deductions: 200, net: 800 },
            ],
          },
        ),
        receiptDoc(),
      ),
      answer(
        payrollDoc(
          {},
          {
            employees: [
              { name: 'Beto', gross: 2000, deductions: 400, net: 1600 },
            ],
          },
        ),
        receiptDoc(),
      ),
    ]);
    const text = `${'a'.repeat(MAX_CHARS_PER_REQUEST - 10)}\n${'b'.repeat(100)}`;
    const output = await structureText({ ...base, llm, text });
    expect(llm.requests).toHaveLength(2);
    const types = output.documents.map((d) => d.type);
    expect(types.filter((t) => t === 'payroll')).toHaveLength(1);
    expect(types.filter((t) => t === 'receipt')).toHaveLength(2); // receipts are never merged
    const payroll = output.documents.find((d) => d.type === 'payroll');
    if (payroll?.type !== 'payroll') throw new Error('expected payroll');
    expect(payroll.payroll.employees.map((e) => e.name)).toEqual([
      'Ana',
      'Beto',
    ]);
    expect(payroll.payroll.grossTotal).toBe(3000); // totals come from the part that has them
  });
});

describe('mergeDocuments', () => {
  it('merges statements and sales reports of the same period and adds their transactions', () => {
    const tx = sampleTransaction({
      kind: 'income',
      category: 'sales',
      lineItems: [],
    });
    const merged = mergeDocuments([
      salesReportDoc([tx], { typeConfidence: 0.9 }),
      salesReportDoc([tx, tx], { typeConfidence: 0.8 }),
      bankStatementDoc(),
      bankStatementDoc({ periodEnd: '2026-10-31' }), // other period: stays apart
    ]);
    expect(merged.map((d) => d.type)).toEqual([
      'sales_report',
      'bank_statement',
      'bank_statement',
    ]);
    expect(merged[0].transactions).toHaveLength(3);
    expect(merged[0].typeConfidence).toBe(0.8);
  });
});
