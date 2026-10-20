import type { BusinessFile, FilesPage, ReanalyzeEstimate } from '@org/shared';
import { createTestApp, type TestApp } from '../../testing/test-app';

describe('File types and re-analysis (integration)', () => {
  let t: TestApp | null = null;
  let limited: TestApp | null = null;

  beforeAll(async () => {
    t = await createTestApp();
    limited = await createTestApp({ PROCESSING_COST_LIMIT_USD: '0.05' });
  });
  afterAll(async () => {
    await t?.close();
    await limited?.close();
  });

  const run = (name: string, fn: (t: TestApp) => Promise<void>) =>
    it(name, async () => {
      if (t) await fn(t);
    });

  const add = (app: TestApp, overrides: Record<string, unknown> = {}) =>
    app.repos.files.insert({
      originalName: 'doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
      storageKey: `${app.ownerId}/doc.pdf`,
      status: 'completed',
      ...overrides,
    });

  const send = (app: TestApp, method: string, path: string, body?: unknown) =>
    fetch(`${app.base}/api/files${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  run(
    'corrects the type: manual flag, confidence 1, queued again',
    async (app) => {
      const file = await add(app, {
        status: 'needs_review',
        failureReason: 'low confidence',
      });
      app.enqueueExtraction.mockClear();

      const response = await send(app, 'PATCH', `/${file.id}/type`, {
        documentType: 'payroll',
      });
      expect(response.status).toBe(202);

      const row = await app.repos.files.findById(file.id);
      expect(row).toMatchObject({
        documentType: 'payroll',
        documentTypeConfidence: 1,
        documentTypeManual: true,
        status: 'received',
        failureReason: null,
      });
      expect(app.enqueueExtraction).toHaveBeenCalledWith(file.id);

      const detail = (await (
        await fetch(`${app.base}/api/files/${file.id}`)
      ).json()) as BusinessFile;
      expect(detail).toMatchObject({
        documentType: 'payroll',
        documentTypeManual: true,
      });
    },
  );

  run('validates the type and the file', async (app) => {
    const file = await add(app);
    expect(
      (
        await send(app, 'PATCH', `/${file.id}/type`, {
          documentType: 'contract',
        })
      ).status,
    ).toBe(400);
    expect((await send(app, 'PATCH', `/${file.id}/type`, {})).status).toBe(400);
    expect(
      (
        await send(app, 'PATCH', `/3f0e8b4e-7c1a-4d6e-9a53-1f6f5d0c2b11/type`, {
          documentType: 'other',
        })
      ).status,
    ).toBe(404);
    const busy = await add(app, { status: 'processing' });
    expect(
      (await send(app, 'PATCH', `/${busy.id}/type`, { documentType: 'other' }))
        .status,
    ).toBe(409);
    expect((await app.repos.files.findById(busy.id))?.documentType).toBeNull();
  });

  run('re-analyzes a finished file only', async (app) => {
    app.enqueueExtraction.mockClear();
    for (const status of ['completed', 'needs_review', 'failed'] as const) {
      const file = await add(app, { status });
      expect((await send(app, 'POST', `/${file.id}/reanalyze`)).status).toBe(
        202,
      );
      expect((await app.repos.files.findById(file.id))?.status).toBe(
        'received',
      );
    }
    expect(app.enqueueExtraction).toHaveBeenCalledTimes(3);

    for (const status of ['received', 'processing', 'queued_limit'] as const) {
      const file = await add(app, { status });
      expect((await send(app, 'POST', `/${file.id}/reanalyze`)).status).toBe(
        409,
      );
    }
    expect(
      (
        await send(
          app,
          'POST',
          `/3f0e8b4e-7c1a-4d6e-9a53-1f6f5d0c2b11/reanalyze`,
        )
      ).status,
    ).toBe(404);
  });

  run('filters the list by document type and by unclassified', async (app) => {
    const typed = await add(app, {
      documentType: 'bank_statement',
      originalName: 'estado.pdf',
    });
    const untyped = await add(app, { originalName: 'viejo.pdf' });
    const list = async (query: string) =>
      (
        (await (
          await send(app, 'GET', `?${query}&limit=100`)
        ).json()) as FilesPage
      ).items;

    expect(
      (await list('documentType=bank_statement')).map((f) => f.id),
    ).toEqual([typed.id]);
    const unclassified = (await list('documentType=unclassified')).map(
      (f) => f.id,
    );
    expect(unclassified).toContain(untyped.id);
    expect(unclassified).not.toContain(typed.id);
    expect((await send(app, 'GET', '?documentType=contract')).status).toBe(400);
  });

  run(
    'estimates and queues a bulk re-analysis of the unclassified files',
    async () => {
      const app = await createTestApp();
      if (!app) return;
      try {
        const estimate = async () =>
          (await (
            await send(app, 'GET', '/reanalyze/estimate?scope=unclassified')
          ).json()) as ReanalyzeEstimate;

        expect(await estimate()).toEqual({
          files: 0,
          estimatedMicroUsd: 0,
          limitMicroUsd: null,
          remainingMicroUsd: null,
        });

        await add(app);
        await add(app, { status: 'failed' });
        await add(app, { documentType: 'receipt' }); // already classified: not counted
        await add(app, { status: 'processing' }); // not finished: not counted
        const withFiles = await estimate();
        expect(withFiles.files).toBe(2);
        expect(withFiles.estimatedMicroUsd).toBe(2 * 12_000); // default per file without cost history

        // with cost history the average per file is used
        const cost = await add(app, { documentType: 'other' });
        await app.repos.costs.insert({
          fileId: cost.id,
          kind: 'llm_text',
          costMicroUsd: 3000,
        });
        expect((await estimate()).estimatedMicroUsd).toBe(2 * 3000);

        app.enqueueExtraction.mockClear();
        const queued = await send(app, 'POST', '/reanalyze', {
          scope: 'unclassified',
        });
        expect(queued.status).toBe(202);
        expect(await queued.json()).toEqual({ queued: 2 });
        expect(app.enqueueExtraction).toHaveBeenCalledTimes(2);
        expect((await estimate()).files).toBe(0); // now waiting in the queue, so not counted again
        expect(
          (await send(app, 'POST', '/reanalyze', { scope: 'everything' }))
            .status,
        ).toBe(400);
        expect((await send(app, 'GET', '/reanalyze/estimate')).status).toBe(
          400,
        );
      } finally {
        await app.close();
      }
    },
  );

  it('shows the limit and the remaining budget in the estimate', async () => {
    if (!limited) return;
    await limited.repos.costs.insert({
      kind: 'llm_text',
      costMicroUsd: 20_000,
    });
    const estimate = (await (
      await send(limited, 'GET', '/reanalyze/estimate?scope=unclassified')
    ).json()) as ReanalyzeEstimate;
    expect(estimate.limitMicroUsd).toBe(50_000);
    expect(estimate.remainingMicroUsd).toBe(30_000);
  });
});
