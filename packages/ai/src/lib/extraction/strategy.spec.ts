import { ocrIsUsable, planTiers } from './strategy';

const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('planTiers', () => {
  it('reads CSV, XLSX and text directly, with no paid escalation', () => {
    expect(planTiers('text/csv', false)).toEqual(['digital']);
    expect(planTiers(XLSX, false)).toEqual(['digital']);
    expect(planTiers('text/plain', false)).toEqual(['digital']);
  });

  it('prefers the text layer of a PDF and escalates to vision', () => {
    expect(planTiers('application/pdf', true)).toEqual(['digital', 'vision']);
  });

  it('uses OCR for scanned PDFs and images, then vision', () => {
    expect(planTiers('application/pdf', false)).toEqual(['ocr', 'vision']);
    for (const mime of [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
    ]) {
      expect(planTiers(mime, false)).toEqual(['ocr', 'vision']);
    }
  });

  it('rejects unsupported types', () => {
    expect(() => planTiers('application/zip', false)).toThrow('Unsupported');
  });
});

describe('ocrIsUsable', () => {
  const text = 'Total a pagar 120.50 USD fecha 12/10/2026';

  it('accepts confident, long enough OCR output', () => {
    expect(ocrIsUsable({ text, confidence: 0.85 }, 0.7)).toBe(true);
    expect(ocrIsUsable({ text, confidence: 0.7 }, 0.7)).toBe(true);
  });

  it('rejects low confidence or almost empty output', () => {
    expect(ocrIsUsable({ text, confidence: 0.4 }, 0.7)).toBe(false);
    expect(ocrIsUsable({ text: 'abc', confidence: 0.99 }, 0.7)).toBe(false);
  });
});
