import { randomUUID } from 'node:crypto';
import {
  bankStatementDoc,
  CostLimitReachedError,
  extraction,
  FakeLlmClient,
  otherDoc,
  payrollDoc,
  receiptDoc,
  UnreadableFileError,
  type EmbeddingProvider,
  type OcrEngine,
} from '@org/ai';
import { EMBEDDING_DIMENSIONS, type BusinessFileRow } from '@org/db';
import { createTestContext, type WorkerTestContext } from '../../testing/db';
import { CostGuardService } from './cost-guard.service';
import { DuplicatesService } from './duplicates.service';
import { ExtractionService } from './extraction.service';

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
const usage = { inputTokens: 1000, outputTokens: 200 };
const ok = (...transactions: unknown[]) => ({
  output: extraction(receiptDoc(transactions as never)),
  usage,
});
const weak = ok(
  transaction({ confidence: { date: 0.3, amount: 0.4, kind: 0.9 } }),
);

class MemoryStorage {
  readonly objects = new Map<string, Buffer | string>();
  async getBuffer(key: string): Promise<Buffer> {
    const value = this.objects.get(key);
    if (value === undefined) throw new Error(`missing object ${key}`);
    return Buffer.from(value);
  }
  async putText(key: string, text: string): Promise<void> {
    this.objects.set(key, text);
  }
}

const fakeEmbeddings = (): EmbeddingProvider => ({
  model: 'voyage-3.5-lite',
  dimensions: EMBEDDING_DIMENSIONS,
  embed: async (texts) => ({
    embeddings: texts.map(() =>
      Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0)),
    ),
    totalTokens: 100,
  }),
});

const ocrReturning = (text: string, confidence: number): OcrEngine => ({
  recognize: async () => ({ text, confidence }),
  close: async () => undefined,
});

describe('ExtractionService (integration, fake LLM/OCR/storage, real Postgres)', () => {
  let ctx: WorkerTestContext | null = null;

  beforeAll(async () => {
    ctx = await createTestContext();
    if (!ctx)
      console.warn(
        'SKIPPED ExtractionService: Postgres is not reachable. Run `pnpm infra:up` and `pnpm nx run db:migrate`.',
      );
  });
  afterAll(async () => ctx?.cleanup());

  const run = (name: string, fn: (c: WorkerTestContext) => Promise<void>) =>
    it(name, async () => {
      if (ctx) await fn(ctx);
    });

  async function setup(
    c: WorkerTestContext,
    options: {
      mime: string;
      content: string | Buffer;
      name?: string;
      llm: FakeLlmClient;
      ocr?: OcrEngine;
      embeddings?: EmbeddingProvider | null;
      guard?: CostGuardService;
      documentType?: 'payroll' | 'bank_statement' | 'receipt' | 'other';
      documentTypeManual?: boolean;
    },
  ) {
    const storage = new MemoryStorage();
    const key = `${c.config.ownerId}/${randomUUID()}`;
    storage.objects.set(key, options.content);
    const file = await c.repos.files.insert({
      originalName: options.name ?? 'doc',
      mimeType: options.mime,
      sizeBytes: 10,
      sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
      storageKey: key,
      documentType: options.documentType ?? null,
      documentTypeManual: options.documentTypeManual ?? false,
    });
    const service = new ExtractionService(
      c.config,
      c.repos,
      storage as never,
      options.llm,
      options.ocr ?? ocrReturning('', 0),
      options.embeddings === undefined ? fakeEmbeddings() : options.embeddings,
      options.guard ?? new CostGuardService(c.config, c.repos),
      new DuplicatesService(c.repos),
    );
    const reload = () =>
      c.repos.files.findById(file.id) as Promise<BusinessFileRow>;
    return { service, file, storage, reload };
  }

  run(
    'completes a CSV: records, line items, runs, costs, text and search index',
    async (c) => {
      const llm = new FakeLlmClient([ok(transaction())]);
      const { service, file, storage, reload } = await setup(c, {
        mime: 'text/csv',
        content: 'fecha,total\n2026-10-12,42.5\n',
        llm,
      });

      await service.process(file.id);

      const done = await reload();
      expect(done.status).toBe('completed');
      expect(done.readingMethod).toBe('digital');
      expect(done.failureReason).toBeNull();
      expect(done.totalCostMicroUsd).toBeGreaterThan(0);

      const records = await c.repos.records.listByFile(file.id);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        amountMinor: 4250,
        currency: 'USD',
        kind: 'expense',
        category: 'supplies',
        confirmed: false,
      });
      expect(records[0].lineItems[0]).toMatchObject({
        productKey: 'harina',
        totalMinor: 4250,
      });

      const runs = await c.repos.runs.listByFile(file.id);
      expect(runs.map((r) => [r.tier, r.status])).toEqual([
        ['digital', 'succeeded'],
      ]);
      expect(runs[0].rawTextKey).toBe(`${file.storageKey}.extracted.txt`);
      expect(storage.objects.get(`${file.storageKey}.extracted.txt`)).toContain(
        'fecha,total',
      );

      expect(await c.repos.chunks.countByFile(file.id)).toBeGreaterThan(0);
      const byKind = await c.repos.costs.byKind();
      expect(byKind['parse']).toBe(0);
      expect(byKind['llm_text']).toBeGreaterThan(0);
      expect(byKind['embedding']).toBeGreaterThan(0);
      expect(llm.requests).toHaveLength(1);
    },
  );

  run(
    'escalates a blurry photo from OCR to vision and records vision cost',
    async (c) => {
      const llm = new FakeLlmClient([ok(transaction())]);
      const { service, file, reload } = await setup(c, {
        mime: 'image/jpeg',
        content: Buffer.from('jpeg-bytes'),
        llm,
        ocr: ocrReturning('smudge', 0.2),
        embeddings: null,
      });

      await service.process(file.id);

      expect((await reload()).readingMethod).toBe('vision');
      expect((await reload()).status).toBe('completed');
      const runs = await c.repos.runs.listByFile(file.id);
      expect(runs.map((r) => [r.tier, r.status])).toEqual([
        ['ocr', 'low_confidence'],
        ['vision', 'succeeded'],
      ]);
      const byKind = await c.repos.costs.byKind();
      expect(byKind['llm_vision']).toBeGreaterThan(0);
    },
  );

  run('sends low confidence results to review with the reasons', async (c) => {
    const llm = new FakeLlmClient([weak]);
    const { service, file, reload } = await setup(c, {
      mime: 'text/csv',
      content: 'a,b',
      llm,
      embeddings: null,
    });
    await service.process(file.id);

    const done = await reload();
    expect(done.status).toBe('needs_review');
    expect(done.failureReason).toContain('low confidence');
    expect(await c.repos.records.listByFile(file.id)).toHaveLength(1);
  });

  run(
    'marks transient failures as failed, rethrows, and a retry then succeeds',
    async (c) => {
      const llm = new FakeLlmClient([
        new Error('network down'),
        ok(transaction()),
      ]);
      const { service, file, reload } = await setup(c, {
        mime: 'text/csv',
        content: 'a,b',
        llm,
        embeddings: null,
      });

      await expect(service.process(file.id)).rejects.toThrow('network down');
      const failed = await reload();
      expect(failed.status).toBe('failed');
      expect(failed.failureReason).toContain('network down');

      await service.process(file.id);
      const retried = await reload();
      expect(retried.status).toBe('completed');
      expect(retried.failureReason).toBeNull();
    },
  );

  run(
    'does not rethrow unreadable files, and keeps the original object',
    async (c) => {
      const { service, file, storage, reload } = await setup(c, {
        mime: 'text/csv',
        content: '   ',
        llm: new FakeLlmClient(),
        embeddings: null,
      });
      await expect(service.process(file.id)).resolves.toBeUndefined();
      const done = await reload();
      expect(done.status).toBe('failed');
      expect(done.failureReason).toContain('empty');
      expect(storage.objects.has(file.storageKey)).toBe(true);
      expect(UnreadableFileError).toBeDefined();
    },
  );

  run(
    'queues the file when the monthly cost limit is already reached',
    async (c) => {
      await c.repos.costs.insert({ kind: 'llm_text', costMicroUsd: 500 });
      const limited = { ...c.config, costLimitMicroUsd: 100 };
      const llm = new FakeLlmClient([ok(transaction())]);
      const { service, file, reload } = await setup(
        { ...c, config: limited },
        { mime: 'text/csv', content: 'a,b', llm },
      );

      await service.process(file.id);
      expect((await reload()).status).toBe('queued_limit');
      expect(llm.requests).toHaveLength(0);
      expect(CostLimitReachedError).toBeDefined();
    },
  );

  run(
    'a re-run keeps confirmed records and does not duplicate them',
    async (c) => {
      const llm = new FakeLlmClient([
        ok(
          transaction(),
          transaction({ amount: 10, lineItems: [], counterparty: 'Otro' }),
        ),
        ok(transaction({ amount: 77, lineItems: [], counterparty: 'Nuevo' })),
      ]);
      const { service, file } = await setup(c, {
        mime: 'text/csv',
        content: 'a,b',
        llm,
        embeddings: null,
      });
      await service.process(file.id);
      const [first] = await c.repos.records.listByFile(file.id);
      await c.repos.records.update(first.id, {
        amountMinor: first.amountMinor + 1,
      });

      await service.process(file.id);
      const amounts = (await c.repos.records.listByFile(file.id))
        .map((r) => r.amountMinor)
        .sort((a, b) => a - b);
      expect(amounts).toHaveLength(2);
      expect(amounts).toContain(first.amountMinor + 1);
      expect(amounts).toContain(7700);
    },
  );

  run('skips jobs for files that no longer exist', async (c) => {
    const service = new ExtractionService(
      c.config,
      c.repos,
      new MemoryStorage() as never,
      new FakeLlmClient(),
      ocrReturning('', 0),
      null,
      new CostGuardService(c.config, c.repos),
      new DuplicatesService(c.repos),
    );
    await expect(service.process(randomUUID())).resolves.toBeUndefined();
  });

  run(
    'stores the documents of a payroll with its lines, a staff expense and the file type',
    async (c) => {
      const llm = new FakeLlmClient([
        { output: extraction(payrollDoc()), usage },
      ]);
      const { service, file, reload } = await setup(c, {
        mime: 'text/csv',
        content: 'nomina',
        llm,
        embeddings: null,
      });

      await service.process(file.id);

      const done = await reload();
      expect(done.status).toBe('completed');
      expect(done.documentType).toBe('payroll');
      expect(done.documentTypeConfidence).toBe(0.95);
      expect(done.documentTypeManual).toBe(false);

      const [document] = await c.repos.documents.listByFile(file.id);
      expect(document).toMatchObject({
        type: 'payroll',
        periodEnd: '2026-09-30',
        consistency: 'ok',
        currency: 'USD',
      });
      expect(document.details).toMatchObject({
        grossTotalMinor: 300000,
        netTotalMinor: 240000,
        employeeCount: 2,
      });
      const lines = await c.repos.documents.payrollLines(document.id);
      expect(lines.map((l) => [l.employeeKey, l.netMinor])).toEqual([
        ['ana lopez', 160000],
        ['beto ruiz', 80000],
      ]);

      const records = await c.repos.records.listByFile(file.id);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        category: 'staff',
        isStaff: true,
        amountMinor: 300000,
        documentId: document.id,
      });
    },
  );

  run(
    'stores a bank statement summary and no transactions, and replaces the documents on a re-run',
    async (c) => {
      const llm = new FakeLlmClient([
        { output: extraction(bankStatementDoc()), usage },
        {
          output: extraction(
            bankStatementDoc({}, { closingBalance: 1500, totalDeposits: 850 }),
          ),
          usage,
        },
      ]);
      const { service, file } = await setup(c, {
        mime: 'text/csv',
        content: 'estado',
        llm,
        embeddings: null,
      });

      await service.process(file.id);
      expect(await c.repos.records.listByFile(file.id)).toEqual([]);
      const [first] = await c.repos.documents.listByFile(file.id);
      expect(first.details).toMatchObject({ closingBalanceMinor: 145000 });

      await service.process(file.id);
      const documents = await c.repos.documents.listByFile(file.id);
      expect(documents).toHaveLength(1);
      expect(documents[0].id).not.toBe(first.id);
      expect(documents[0].details).toMatchObject({
        closingBalanceMinor: 150000,
      });
    },
  );

  run('sends an inconsistent document to review', async (c) => {
    const llm = new FakeLlmClient([
      {
        output: extraction(bankStatementDoc({}, { closingBalance: 9000 })),
        usage,
      },
    ]);
    const { service, file, reload } = await setup(c, {
      mime: 'text/csv',
      content: 'estado',
      llm,
      embeddings: null,
    });
    await service.process(file.id);
    const done = await reload();
    expect(done.status).toBe('needs_review');
    expect(done.failureReason).toContain('Closing balance');
    const [document] = await c.repos.documents.listByFile(file.id);
    expect(document.consistency).toBe('inconsistent');
    expect(document.consistencyNotes).toContain('Closing balance');
  });

  run('never reclassifies a file whose type the owner chose', async (c) => {
    const llm = new FakeLlmClient([
      { output: extraction(payrollDoc()), usage },
    ]);
    const { service, file, reload } = await setup(c, {
      mime: 'text/csv',
      content: 'nomina',
      llm,
      embeddings: null,
      documentType: 'payroll',
      documentTypeManual: true,
    });

    await service.process(file.id);

    expect(llm.requests[0].system).toContain(
      'The owner states that this file is a payroll',
    );
    const done = await reload();
    expect(done.documentType).toBe('payroll');
    expect(done.documentTypeManual).toBe(true);
    expect(done.documentTypeConfidence).toBe(1);

    // the model disagrees: the type stays, the file waits for review
    const disagree = new FakeLlmClient([
      { output: extraction(otherDoc()), usage },
    ]);
    const second = await setup(c, {
      mime: 'text/csv',
      content: 'x',
      llm: disagree,
      embeddings: null,
      documentType: 'payroll',
      documentTypeManual: true,
    });
    await second.service.process(second.file.id);
    expect((await second.reload()).documentType).toBe('payroll');
    expect((await second.reload()).status).toBe('needs_review');
  });

  run(
    'keeps confirmed records, unlinked, when a file is re-analyzed with new documents',
    async (c) => {
      const llm = new FakeLlmClient([
        { output: extraction(receiptDoc([transaction() as never])), usage },
        {
          output: extraction(
            receiptDoc([
              transaction({
                amount: 77,
                lineItems: [],
                counterparty: 'Nuevo',
              }) as never,
            ]),
          ),
          usage,
        },
      ]);
      const { service, file } = await setup(c, {
        mime: 'text/csv',
        content: 'x',
        llm,
        embeddings: null,
      });
      await service.process(file.id);
      const [first] = await c.repos.records.listByFile(file.id);
      await c.repos.records.confirm(first.id);
      expect(first.documentId).not.toBeNull();

      await service.process(file.id);
      const records = await c.repos.records.listByFile(file.id);
      const kept = records.find((r) => r.id === first.id);
      expect(kept?.documentId).toBeNull();
      const fresh = records.find((r) => r.amountMinor === 7700);
      expect(fresh?.documentId).not.toBeNull();
    },
  );

  run(
    'writes no employee name, amount or raw model output to the logs or the failure reason',
    async (c) => {
      const { Logger } = await import('@nestjs/common');
      const lines: string[] = [];
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(
        (level) =>
          jest.spyOn(Logger.prototype, level).mockImplementation(((
            message: unknown,
          ) => {
            lines.push(String(message));
          }) as never),
      );
      try {
        const ok1 = await setup(c, {
          mime: 'text/csv',
          content: 'nomina',
          llm: new FakeLlmClient([
            { output: extraction(payrollDoc({}, { netTotal: 100 })), usage },
          ]),
          embeddings: null,
        });
        await ok1.service.process(ok1.file.id);
        const bad = await setup(c, {
          mime: 'text/csv',
          content: 'nomina',
          llm: new FakeLlmClient([
            { output: { documents: 'Ana López cobra 2000' } },
            { output: { documents: 'Ana López cobra 2000' } },
          ]),
          embeddings: null,
        });
        await expect(bad.service.process(bad.file.id)).rejects.toThrow();

        const failed = await bad.reload();
        const review = await ok1.reload();
        const everything = [
          ...lines,
          failed.failureReason ?? '',
          review.failureReason ?? '',
        ].join('\n');
        expect(everything).not.toMatch(/Ana|Beto|López|Ruiz/);
        expect(everything.length).toBeGreaterThan(0);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
    },
  );
});
