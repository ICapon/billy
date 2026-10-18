import { CostLimitReachedError, UnreadableFileError } from '../errors';
import { FakeLlmClient } from '../testing/fake-llm-client';
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

const ok = (...transactions: unknown[]) => ({ output: { transactions } });
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
