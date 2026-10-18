import { randomUUID } from 'node:crypto';
import {
  CostLimitReachedError,
  FakeLlmClient,
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
const ok = (...transactions: unknown[]) => ({
  output: { transactions },
  usage: { inputTokens: 1000, outputTokens: 200 },
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
});
