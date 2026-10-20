import { CostLimitReachedError, UnreadableFileError } from '../errors';
import { FakeLlmClient } from '../testing/fake-llm-client';
import {
  bankStatementDoc,
  extraction,
  otherDoc,
  payrollDoc,
  receiptDoc,
  salesReportDoc,
} from '../testing/fixtures';
import { extractFile } from './extract-file';
import type { ExtractionConfig, OcrEngine } from './types';

const config: ExtractionConfig = {
  extractionModel: 'claude-haiku-5-5',
  visionModel: 'claude-sonnet-5-5',
  ocrMinConfidence: 0.7,
  recordMinConfidence: 0.8,
  currency: 'USD',
};

const today = new Date('2026-10-18T12:00:00Z');

const transaction = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-10-12',
  amount: 42.5,
  currency: null,
  kind: 'expense',
  category: 'supplies',
  counterparty: 'Mayorista',
  lineItems: [
    {
      productName: 'Harina',
      quantity: 5,
      unitPrice: 8.5,
      total: 42.5,
      direction: 'purchase',
    },
  ],
  confidence: { date: 0.95, amount: 0.96, kind: 0.99 },
  ...overrides,
});

const ok = (...transactions: unknown[]) => ({
  output: extraction(receiptDoc(transactions as never)),
});
const weak = ok(
  transaction({ confidence: { date: 0.4, amount: 0.5, kind: 0.9 } }),
);

const ocrReturning = (text: string, confidence: number): OcrEngine => ({
  recognize: jest.fn().mockResolvedValue({ text, confidence }),
  close: jest.fn(),
});
const unusedOcr = ocrReturning('', 0);
const goodOcrText =
  'SUPERMERCADO LA ESQUINA total 42.50 fecha 12/10/2026 harina x5';

const png = Buffer.from('fake-png');
const readers = {
  digital: jest.fn(),
  normalize: jest.fn().mockResolvedValue({ data: png, mime: 'image/jpeg' }),
  renderPdf: jest.fn().mockResolvedValue([png]),
};

const base = { fileName: 'doc', today };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('extractFile', () => {
  it('reads a CSV directly with one cheap text call (digital tier)', async () => {
    readers.digital.mockResolvedValue({
      text: 'fecha,total\n2026-10-12,42.5',
      usable: true,
      pages: null,
    });
    const llm = new FakeLlmClient([ok(transaction())]);
    const result = await extractFile(
      { ...base, data: Buffer.from('x'), mimeType: 'text/csv' },
      { llm, ocr: unusedOcr, config, readers },
    );

    expect(result.method).toBe('digital');
    expect(result.outcome).toBe('completed');
    expect(result.records[0]).toMatchObject({
      amountMinor: 4250,
      currency: 'USD',
      category: 'supplies',
    });
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0].model).toBe('claude-haiku-5-5');
    expect(llm.requests[0].content.every((b) => b.type === 'text')).toBe(true);
    expect(result.rawText).toContain('fecha,total');
    expect(unusedOcr.recognize).not.toHaveBeenCalled();
  });

  it('uses the PDF text layer when present, with no OCR and no vision', async () => {
    readers.digital.mockResolvedValue({
      text: 'Factura 42.50',
      usable: true,
      pages: 1,
    });
    const llm = new FakeLlmClient([ok(transaction())]);
    const result = await extractFile(
      { ...base, data: Buffer.from('%PDF'), mimeType: 'application/pdf' },
      { llm, ocr: unusedOcr, config, readers },
    );
    expect(result.method).toBe('digital');
    expect(unusedOcr.recognize).not.toHaveBeenCalled();
  });

  it('OCRs a clear photo and structures the text with the cheap model', async () => {
    const llm = new FakeLlmClient([ok(transaction())]);
    const result = await extractFile(
      { ...base, data: Buffer.from('img'), mimeType: 'image/jpeg' },
      { llm, ocr: ocrReturning(goodOcrText, 0.9), config, readers },
    );
    expect(result.method).toBe('ocr');
    expect(result.outcome).toBe('completed');
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0].model).toBe('claude-haiku-5-5');
    expect(result.runs.map((r) => [r.tier, r.status])).toEqual([
      ['ocr', 'succeeded'],
    ]);
    expect(readers.normalize).toHaveBeenCalled();
  });

  it('skips the text call and escalates to vision when OCR confidence is low', async () => {
    const llm = new FakeLlmClient([ok(transaction())]);
    const result = await extractFile(
      { ...base, data: Buffer.from('img'), mimeType: 'image/png' },
      { llm, ocr: ocrReturning('smudged', 0.3), config, readers },
    );
    expect(result.method).toBe('vision');
    expect(result.outcome).toBe('completed');
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0].model).toBe('claude-sonnet-5-5');
    expect(llm.requests[0].content.some((b) => b.type === 'image')).toBe(true);
    expect(result.runs.map((r) => [r.tier, r.status])).toEqual([
      ['ocr', 'low_confidence'],
      ['vision', 'succeeded'],
    ]);
  });

  it('escalates to vision when the structured result is low confidence', async () => {
    const llm = new FakeLlmClient([weak, ok(transaction())]);
    const result = await extractFile(
      { ...base, data: Buffer.from('img'), mimeType: 'image/jpeg' },
      { llm, ocr: ocrReturning(goodOcrText, 0.9), config, readers },
    );
    expect(result.method).toBe('vision');
    expect(llm.requests.map((r) => r.model)).toEqual([
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
    ]);
  });

  it('sends a scanned PDF to OCR, then to vision as a PDF document', async () => {
    readers.digital.mockResolvedValue({ text: '', usable: false, pages: 2 });
    const llm = new FakeLlmClient([ok(transaction())]);
    const result = await extractFile(
      { ...base, data: Buffer.from('%PDF'), mimeType: 'application/pdf' },
      { llm, ocr: ocrReturning('', 0), config, readers },
    );
    expect(readers.renderPdf).toHaveBeenCalled();
    expect(result.method).toBe('vision');
    expect(llm.requests[0].content.some((b) => b.type === 'pdf')).toBe(true);
  });

  it('marks the file for review when even vision is not confident', async () => {
    const llm = new FakeLlmClient([weak, weak]);
    const result = await extractFile(
      { ...base, data: Buffer.from('img'), mimeType: 'image/jpeg' },
      { llm, ocr: ocrReturning(goodOcrText, 0.9), config, readers },
    );
    expect(result.outcome).toBe('needs_review');
    expect(result.method).toBe('vision');
    expect(result.issues.join(' ')).toContain('low confidence');
  });

  it('does not escalate a spreadsheet: it needs review instead', async () => {
    readers.digital.mockResolvedValue({
      text: 'rows',
      usable: true,
      pages: null,
    });
    const llm = new FakeLlmClient([weak]);
    const result = await extractFile(
      { ...base, data: Buffer.from('x'), mimeType: 'text/csv' },
      { llm, ocr: unusedOcr, config, readers },
    );
    expect(result.outcome).toBe('needs_review');
    expect(result.method).toBe('digital');
    expect(llm.requests).toHaveLength(1);
  });

  it('retries invalid model output once with the validation error, then succeeds', async () => {
    readers.digital.mockResolvedValue({
      text: 'rows',
      usable: true,
      pages: null,
    });
    const llm = new FakeLlmClient([
      { output: { transactions: [{ date: 'yesterday' }] } },
      ok(transaction()),
    ]);
    const result = await extractFile(
      { ...base, data: Buffer.from('x'), mimeType: 'text/csv' },
      { llm, ocr: unusedOcr, config, readers },
    );
    expect(result.outcome).toBe('completed');
    expect(llm.requests).toHaveLength(2);
    const retryText = llm.requests[1].content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n');
    expect(retryText).toContain('previous answer was invalid');
  });

  it('falls back to vision when the text path keeps returning invalid output', async () => {
    const invalid = { output: { nope: true } };
    const llm = new FakeLlmClient([invalid, invalid, ok(transaction())]);
    const result = await extractFile(
      { ...base, data: Buffer.from('img'), mimeType: 'image/jpeg' },
      { llm, ocr: ocrReturning(goodOcrText, 0.9), config, readers },
    );
    expect(result.method).toBe('vision');
    expect(result.runs.map((r) => r.status)).toEqual(['error', 'succeeded']);
  });

  it('fails when the only attempt errors', async () => {
    readers.digital.mockResolvedValue({
      text: 'rows',
      usable: true,
      pages: null,
    });
    const llm = new FakeLlmClient([new Error('boom')]);
    await expect(
      extractFile(
        { ...base, data: Buffer.from('x'), mimeType: 'text/csv' },
        { llm, ocr: unusedOcr, config, readers },
      ),
    ).rejects.toThrow('boom');
  });

  it('propagates unreadable files and cost-limit stops', async () => {
    readers.digital.mockRejectedValue(
      new UnreadableFileError('password protected'),
    );
    await expect(
      extractFile(
        { ...base, data: Buffer.from('x'), mimeType: 'application/pdf' },
        { llm: new FakeLlmClient(), ocr: unusedOcr, config, readers },
      ),
    ).rejects.toBeInstanceOf(UnreadableFileError);

    readers.digital.mockResolvedValue({
      text: 'rows',
      usable: true,
      pages: null,
    });
    await expect(
      extractFile(
        { ...base, data: Buffer.from('x'), mimeType: 'text/csv' },
        {
          llm: new FakeLlmClient([new CostLimitReachedError()]),
          ocr: unusedOcr,
          config,
          readers,
        },
      ),
    ).rejects.toBeInstanceOf(CostLimitReachedError);
  });

  it('returns several records for a multi-receipt document', async () => {
    readers.digital.mockResolvedValue({
      text: 'two receipts',
      usable: true,
      pages: 2,
    });
    const llm = new FakeLlmClient([
      ok(
        transaction(),
        transaction({ date: '2026-10-13', amount: 10, lineItems: [] }),
      ),
    ]);
    const result = await extractFile(
      { ...base, data: Buffer.from('%PDF'), mimeType: 'application/pdf' },
      { llm, ocr: unusedOcr, config, readers },
    );
    expect(result.records).toHaveLength(2);
  });
});

describe('extractFile with document types', () => {
  const csv = async (
    llm: FakeLlmClient,
    options?: Parameters<typeof extractFile>[2],
  ) => {
    readers.digital.mockResolvedValue({
      text: 'rows',
      usable: true,
      pages: null,
    });
    return extractFile(
      { ...base, data: Buffer.from('x'), mimeType: 'text/csv' },
      { llm, ocr: unusedOcr, config, readers },
      options,
    );
  };

  it('classifies a receipt and keeps its ordinary records', async () => {
    const result = await csv(new FakeLlmClient([ok(transaction())]));
    expect(result.documentType).toBe('receipt');
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      type: 'receipt',
      currency: 'USD',
      consistency: 'ok',
    });
    expect(result.documents[0].records).toHaveLength(1);
  });

  it('stores a bank statement summary in minor units and no transactions', async () => {
    const result = await csv(
      new FakeLlmClient([{ output: extraction(bankStatementDoc()) }]),
    );
    expect(result.outcome).toBe('completed');
    expect(result.documentType).toBe('bank_statement');
    expect(result.records).toEqual([]);
    expect(result.documents[0]).toMatchObject({
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      consistency: 'ok',
      details: {
        accountIdentifier: '****1234',
        openingBalanceMinor: 100000,
        closingBalanceMinor: 145000,
        totalDepositsMinor: 80000,
        totalWithdrawalsMinor: 34500,
        totalFeesMinor: 500,
      },
    });
  });

  it('turns a payroll into employee lines and one staff expense for the total cost', async () => {
    const result = await csv(
      new FakeLlmClient([{ output: extraction(payrollDoc()) }]),
    );
    expect(result.outcome).toBe('completed');
    const [payroll] = result.documents;
    expect(payroll.payrollLines).toEqual([
      {
        employeeName: 'Ana López',
        employeeKey: 'ana lopez',
        grossMinor: 200000,
        deductionsMinor: 40000,
        netMinor: 160000,
      },
      {
        employeeName: 'Beto Ruiz',
        employeeKey: 'beto ruiz',
        grossMinor: 100000,
        deductionsMinor: 20000,
        netMinor: 80000,
      },
    ]);
    expect(payroll.details).toMatchObject({
      grossTotalMinor: 300000,
      netTotalMinor: 240000,
      employeeCount: 2,
    });
    expect(payroll.records).toEqual([
      expect.objectContaining({
        occurredOn: '2026-09-30',
        amountMinor: 300000,
        kind: 'expense',
        category: 'staff',
      }),
    ]);

    const withCost = await csv(
      new FakeLlmClient([
        { output: extraction(payrollDoc({}, { employerTotalCost: 3400 })) },
      ]),
    );
    expect(withCost.documents[0].records[0].amountMinor).toBe(340000);
  });

  it('rebuilds payroll totals from the employee lines when the model left them at zero', async () => {
    const result = await csv(
      new FakeLlmClient([
        {
          output: extraction(
            payrollDoc({}, { grossTotal: 0, deductionsTotal: 0, netTotal: 0 }),
          ),
        },
      ]),
    );
    expect(result.documents[0].details).toMatchObject({
      grossTotalMinor: 300000,
      deductionsTotalMinor: 60000,
      netTotalMinor: 240000,
    });
    expect(result.outcome).toBe('completed');
  });

  it('splits a mixed file into documents and picks the type with the most records', async () => {
    const result = await csv(
      new FakeLlmClient([
        {
          output: extraction(
            bankStatementDoc(),
            receiptDoc([
              transaction() as never,
              transaction({ amount: 5, lineItems: [] }) as never,
            ]),
            otherDoc(),
          ),
        },
      ]),
    );
    expect(result.documents.map((d) => d.type)).toEqual([
      'bank_statement',
      'receipt',
      'other',
    ]);
    expect(result.documentType).toBe('receipt');
    expect(result.records).toHaveLength(3);
  });

  it('sends an inconsistent document to review and keeps the notes free of names', async () => {
    const result = await csv(
      new FakeLlmClient([
        { output: extraction(payrollDoc({}, { netTotal: 100 })) },
      ]),
    );
    expect(result.outcome).toBe('needs_review');
    expect(result.documents[0].consistency).toBe('inconsistent');
    expect(result.documents[0].consistencyNotes).not.toMatch(/Ana|Beto/);
    expect(result.issues.join(' ')).not.toMatch(/Ana|Beto/);
  });

  it('keeps a sales report together with its income records and checks the listed total', async () => {
    const result = await csv(
      new FakeLlmClient([{ output: extraction(salesReportDoc()) }]),
    );
    expect(result.documentType).toBe('sales_report');
    expect(result.documents[0].details).toMatchObject({
      totalSalesMinor: 10000,
      unitsSold: 20,
      transactionCount: 8,
    });
  });

  it('reads the file as the forced type and says so in the prompt', async () => {
    const llm = new FakeLlmClient([{ output: extraction(payrollDoc()) }]);
    const result = await csv(llm, { forcedType: 'payroll' });
    expect(llm.requests[0].system).toContain(
      'The owner states that this file is a payroll',
    );
    expect(result.documentType).toBe('payroll');
    expect(result.documentTypeConfidence).toBe(1);
    expect(result.outcome).toBe('completed');
  });

  it('flags a forced type that the model contradicts, keeping the forced type', async () => {
    const result = await csv(
      new FakeLlmClient([{ output: extraction(receiptDoc()) }]),
      {
        forcedType: 'payroll',
      },
    );
    expect(result.documentType).toBe('payroll');
    expect(result.outcome).toBe('needs_review');
    expect(result.issues.join(' ')).toContain('read as payroll');
  });

  it('marks an unrecognized document as other with its confidence', async () => {
    const result = await csv(
      new FakeLlmClient([
        { output: extraction(otherDoc(undefined, { typeConfidence: 0.4 })) },
      ]),
    );
    expect(result.documentType).toBe('other');
    expect(result.documentTypeConfidence).toBe(0.4);
    expect(result.outcome).toBe('needs_review');
  });
});
