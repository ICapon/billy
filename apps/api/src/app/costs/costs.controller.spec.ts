import type { CostSummary } from '@org/shared';
import { createTestApp, type TestApp } from '../../testing/test-app';

describe('CostsController (integration)', () => {
  let t: TestApp | null = null;
  let limited: TestApp | null = null;

  beforeAll(async () => {
    t = await createTestApp();
    limited = await createTestApp({ PROCESSING_COST_LIMIT_USD: '0.001' });
    for (const app of [t, limited]) {
      if (!app) continue;
      const file = await app.repos.files.insert({
        originalName: 'costo.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
        storageKey: `${app.ownerId}/costo.pdf`,
        status: 'completed',
        readingMethod: 'ocr',
      });
      const other = await app.repos.files.insert({
        originalName: 'csv.csv',
        mimeType: 'text/csv',
        sizeBytes: 1,
        sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
        storageKey: `${app.ownerId}/csv.csv`,
        status: 'completed',
        readingMethod: 'digital',
      });
      await app.repos.costs.insert({
        fileId: file.id,
        kind: 'ocr',
        costMicroUsd: 0,
      });
      await app.repos.costs.insert({
        fileId: file.id,
        kind: 'llm_text',
        costMicroUsd: 600,
      });
      await app.repos.costs.insert({
        fileId: other.id,
        kind: 'parse',
        costMicroUsd: 0,
      });
      await app.repos.costs.insert({
        fileId: other.id,
        kind: 'llm_text',
        costMicroUsd: 400,
      });
    }
  });
  afterAll(async () => {
    await t?.close();
    await limited?.close();
  });

  const get = async (app: TestApp, query = '') =>
    (await (
      await fetch(`${app.base}/api/costs/summary${query}`)
    ).json()) as CostSummary;

  it('summarizes the month: total, per kind, per file and per tier, with no limit', async () => {
    if (!t) return;
    const summary = await get(t);
    expect(summary).toMatchObject({
      totalMicroUsd: 1000,
      limitMicroUsd: null,
      limitReached: false,
      avgPerFileMicroUsd: 500,
      byKind: { ocr: 0, llm_text: 1000, parse: 0 },
      byTier: { digital: 1, ocr: 1, vision: 0 },
    });
    expect(summary.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('reports when the monthly limit is reached', async () => {
    if (!limited) return;
    const summary = await get(limited);
    expect(summary.limitMicroUsd).toBe(1000); // $0.001
    expect(summary.limitReached).toBe(true); // 1000 >= 1000
  });

  it('returns zeros for a month without costs and validates the month', async () => {
    if (!t) return;
    const empty = await get(t, '?month=2020-01');
    expect(empty).toMatchObject({
      totalMicroUsd: 0,
      avgPerFileMicroUsd: 0,
      byKind: {},
    });
    expect(
      (await fetch(`${t.base}/api/costs/summary?month=2020-13`)).status,
    ).toBe(400);
    expect((await fetch(`${t.base}/api/costs/summary?month=abc`)).status).toBe(
      400,
    );
  });
});
