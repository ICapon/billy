import type { NewDocument } from '@org/db';
import type { BankStatementsView } from '@org/shared';
import { createTestApp, type TestApp } from '../../testing/test-app';

const statement = (
  periodStart: string,
  periodEnd: string,
  opening: number,
  closing: number,
  extra: Partial<NewDocument> & { account?: string } = {},
): NewDocument => ({
  type: 'bank_statement',
  typeConfidence: 0.95,
  periodStart,
  periodEnd,
  issueDate: null,
  currency: 'USD',
  consistency: 'ok',
  consistencyNotes: null,
  details: {
    accountIdentifier: extra.account ?? '****1234',
    openingBalanceMinor: opening,
    closingBalanceMinor: closing,
    totalDepositsMinor: 80_000,
    totalWithdrawalsMinor: 30_000,
    totalFeesMinor: 500,
  },
  ...extra,
});

describe('GET /api/documents/bank-statements (integration)', () => {
  let t: TestApp | null = null;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  const run = (name: string, fn: (t: TestApp) => Promise<void>) =>
    it(name, async () => {
      if (t) await fn(t);
    });

  const seed = async (app: TestApp, docs: NewDocument[]) => {
    const file = await app.repos.files.insert({
      originalName: 'estado.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
      storageKey: `${app.ownerId}/estado.pdf`,
      status: 'completed',
      documentType: 'bank_statement',
    });
    return app.repos.documents.replaceForFile(file.id, docs);
  };

  const get = async (app: TestApp, query: string) => {
    const response = await fetch(
      `${app.base}/api/documents/bank-statements?${query}`,
    );
    return {
      status: response.status,
      body: (await response.json()) as BankStatementsView[],
    };
  };

  run(
    'returns the statement figures, the balance series and the monthly flows',
    async (app) => {
      await seed(app, [
        statement('2040-01-01', '2040-01-31', 100_000, 149_500),
        statement('2040-02-01', '2040-02-29', 149_500, 199_000),
      ]);
      const { status, body } = await get(app, 'from=2040-01-01&to=2040-12-31');
      expect(status).toBe(200);
      const usd = body.find((v) => v.currency === 'USD');
      expect(usd?.statements).toHaveLength(2);
      expect(usd?.statements[0]).toMatchObject({
        openingBalanceMinor: 100_000,
        closingBalanceMinor: 149_500,
        totalDepositsMinor: 80_000,
        totalWithdrawalsMinor: 30_000,
        totalFeesMinor: 500,
        netChangeMinor: 49_500,
        consistency: 'ok',
      });
      expect(usd?.balanceSeries.map((p) => p.balanceMinor)).toEqual([
        149_500, 199_000,
      ]);
      expect(usd?.flows).toHaveLength(2);
      expect(usd?.gaps).toEqual([]);
    },
  );

  run('applies the period-end rule and keeps currencies apart', async (app) => {
    await seed(app, [
      statement('2041-01-01', '2041-01-31', 1, 2),
      statement('2041-02-01', '2041-02-28', 2, 3),
      statement('2041-01-01', '2041-01-31', 5, 6, { currency: 'EUR' }),
    ]);
    const jan = await get(app, 'from=2041-01-01&to=2041-01-31');
    expect(jan.body.map((v) => [v.currency, v.statements.length])).toEqual([
      ['EUR', 1],
      ['USD', 1],
    ]);
    const none = await get(app, 'from=2041-03-01&to=2041-03-31');
    expect(none.body).toEqual([]);
  });

  run('reports balance gaps and missing periods', async (app) => {
    await seed(app, [
      statement('2042-01-01', '2042-01-31', 100, 1000),
      statement('2042-03-01', '2042-03-31', 4000, 5000), // February missing and opening differs
    ]);
    const { body } = await get(app, 'from=2042-01-01&to=2042-12-31');
    const gaps = body[0].gaps;
    expect(gaps.map((g) => g.kind).sort()).toEqual([
      'balance',
      'missing_period',
    ]);
    expect(gaps.find((g) => g.kind === 'missing_period')).toMatchObject({
      missingFrom: '2042-02-01',
      missingTo: '2042-02-28',
    });
    expect(gaps.find((g) => g.kind === 'balance')).toMatchObject({
      closingBalanceMinor: 1000,
      openingBalanceMinor: 4000,
    });
  });

  run(
    'marks an inconsistent statement and skips rows with unreadable details',
    async (app) => {
      await seed(app, [
        statement('2043-01-01', '2043-01-31', 1, 2, {
          consistency: 'inconsistent',
          consistencyNotes: 'does not balance',
        }),
        {
          ...statement('2043-02-01', '2043-02-28', 1, 2),
          details: { nonsense: true },
        },
      ]);
      const { body } = await get(app, 'from=2043-01-01&to=2043-12-31');
      expect(body[0].statements).toHaveLength(1);
      expect(body[0].statements[0]).toMatchObject({
        consistency: 'inconsistent',
        notes: 'does not balance',
      });
    },
  );

  run('validates the dates', async (app) => {
    for (const query of [
      '',
      'from=2040-01-01',
      'from=bad&to=2040-02-01',
      'from=2040-03-01&to=2040-02-01',
    ]) {
      expect((await get(app, query)).status).toBe(400);
    }
  });
});
