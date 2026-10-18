import { createTestContext, type WorkerTestContext } from '../../testing/db';
import {
  DuplicatesService,
  normalizeCounterparty,
  sameCounterparty,
} from './duplicates.service';

describe('counterparty matching', () => {
  it('normalizes accents, case and punctuation', () => {
    expect(normalizeCounterparty('  Súper Mercado, S.A. ')).toBe(
      'supermercadosa',
    );
    expect(normalizeCounterparty(null)).toBe('');
  });

  it('matches equal, contained and both-empty counterparties', () => {
    expect(sameCounterparty('Mayorista SA', 'MAYORISTA, S.A.')).toBe(true);
    expect(sameCounterparty('Mayorista', 'Mayorista del Norte SA')).toBe(true);
    expect(sameCounterparty(null, '')).toBe(true);
  });

  it('does not match different, short or one-sided counterparties', () => {
    expect(sameCounterparty('Mayorista', 'Panadería Sol')).toBe(false);
    expect(sameCounterparty('Sol', 'Panadería Sol')).toBe(false); // too short to contain
    expect(sameCounterparty('Mayorista', null)).toBe(false);
  });
});

describe('DuplicatesService (integration)', () => {
  let ctx: WorkerTestContext | null = null;
  beforeAll(async () => {
    ctx = await createTestContext();
    if (!ctx)
      console.warn('SKIPPED DuplicatesService: Postgres is not reachable.');
  });
  afterAll(async () => ctx?.cleanup());

  const run = (name: string, fn: (c: WorkerTestContext) => Promise<void>) =>
    it(name, async () => {
      if (ctx) await fn(ctx);
    });

  const base = {
    occurredOn: '2031-05-06',
    currency: 'USD',
    kind: 'expense' as const,
    category: 'supplies' as const,
    confidence: 0.9,
    lineItems: [],
  };
  const newFile = (c: WorkerTestContext, name: string) =>
    c.repos.files.insert({
      originalName: name,
      mimeType: 'application/pdf',
      sizeBytes: 1,
      sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
      storageKey: `${c.config.ownerId}/${name}`,
      status: 'completed',
    });

  run(
    'flags the same date, amount (±0.01) and counterparty across files',
    async (c) => {
      const service = new DuplicatesService(c.repos);
      const invoice = await newFile(c, 'factura.pdf');
      const statement = await newFile(c, 'extracto.pdf');
      await c.repos.records.replaceExtracted(invoice.id, [
        { ...base, amountMinor: 8800, counterparty: 'Mayorista SA' },
      ]);
      const created = await c.repos.records.replaceExtracted(statement.id, [
        { ...base, amountMinor: 8801, counterparty: 'MAYORISTA' },
      ]);

      expect(await service.detectFor(created)).toBe(1);
      expect(await service.detectFor(created)).toBe(1); // idempotent: still one stored pair
      const pending = (await c.repos.duplicates.listPending()).filter((p) =>
        [p.transactionId, p.matchesTransactionId].includes(created[0].id),
      );
      expect(pending).toHaveLength(1);
    },
  );

  run('ignores different amounts, dates or counterparties', async (c) => {
    const service = new DuplicatesService(c.repos);
    const a = await newFile(c, 'a.pdf');
    const b = await newFile(c, 'b.pdf');
    await c.repos.records.replaceExtracted(a.id, [
      { ...base, amountMinor: 1234, counterparty: 'Panadería Sol' },
    ]);
    const created = await c.repos.records.replaceExtracted(b.id, [
      { ...base, amountMinor: 1300, counterparty: 'Panadería Sol' },
      {
        ...base,
        amountMinor: 1234,
        occurredOn: '2031-05-07',
        counterparty: 'Panadería Sol',
      },
      { ...base, amountMinor: 1234, counterparty: 'Ferretería Norte' },
    ]);
    expect(await service.detectFor(created)).toBe(0);
  });

  run('never pairs records of the same file', async (c) => {
    const service = new DuplicatesService(c.repos);
    const file = await newFile(c, 'mismo.pdf');
    const created = await c.repos.records.replaceExtracted(file.id, [
      { ...base, amountMinor: 4321, counterparty: 'Proveedor' },
      { ...base, amountMinor: 4321, counterparty: 'Proveedor' },
    ]);
    expect(await service.detectFor(created)).toBe(0);
  });
});
