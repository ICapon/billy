import { costSummarySchema, costsQuerySchema } from './costs';

describe('costsQuerySchema', () => {
  it('accepts YYYY-MM and rejects other formats', () => {
    expect(costsQuerySchema.safeParse({ month: '2026-10' }).success).toBe(true);
    expect(costsQuerySchema.safeParse({ month: '2026-13' }).success).toBe(
      false,
    );
    expect(costsQuerySchema.safeParse({ month: 'oct' }).success).toBe(false);
  });
});

describe('costSummarySchema', () => {
  it('accepts a summary without a limit', () => {
    expect(
      costSummarySchema.safeParse({
        month: '2026-10',
        totalMicroUsd: 1200,
        limitMicroUsd: null,
        limitReached: false,
        avgPerFileMicroUsd: 400,
        byKind: { llm_text: 1200 },
        byTier: { digital: 2, ocr: 1, vision: 0 },
      }).success,
    ).toBe(true);
  });
});
