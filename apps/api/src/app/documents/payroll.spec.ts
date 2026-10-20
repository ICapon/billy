import { Logger } from '@nestjs/common';
import type { NewDocument } from '@org/db';
import type {
  EmployeeHistory,
  PayrollLineView,
  PayrollView,
  TotalsRow,
} from '@org/shared';
import { createTestApp, type TestApp } from '../../testing/test-app';

const payroll = (
  periodEnd: string,
  lines: { name: string; key: string; gross: number; deductions: number }[],
  employerCost: number | null = null,
  extra: Partial<NewDocument> = {},
): NewDocument => {
  const gross = lines.reduce((a, l) => a + l.gross, 0);
  const deductions = lines.reduce((a, l) => a + l.deductions, 0);
  return {
    type: 'payroll',
    typeConfidence: 0.95,
    periodStart: `${periodEnd.slice(0, 8)}01`,
    periodEnd,
    issueDate: null,
    currency: 'USD',
    consistency: 'ok',
    consistencyNotes: null,
    details: {
      grossTotalMinor: gross,
      deductionsTotalMinor: deductions,
      netTotalMinor: gross - deductions,
      employerTotalCostMinor: employerCost,
      employeeCount: lines.length,
    },
    payrollLines: lines.map((l) => ({
      employeeName: l.name,
      employeeKey: l.key,
      grossMinor: l.gross,
      deductionsMinor: l.deductions,
      netMinor: l.gross - l.deductions,
    })),
    ...extra,
  };
};

const ana = (gross: number) => ({
  name: 'Ana López',
  key: 'ana lopez',
  gross,
  deductions: gross / 5,
});
const beto = (gross: number) => ({
  name: 'Beto Ruiz',
  key: 'beto ruiz',
  gross,
  deductions: gross / 10,
});

describe('Payroll views (integration)', () => {
  let t: TestApp | null = null;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  const run = (name: string, fn: (t: TestApp) => Promise<void>) =>
    it(name, async () => {
      if (t) await fn(t);
    });

  const seed = async (
    app: TestApp,
    docs: NewDocument[],
    withStaffRecords = true,
  ) => {
    const file = await app.repos.files.insert({
      originalName: 'nomina.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
      storageKey: `${app.ownerId}/nomina.pdf`,
      status: 'completed',
      documentType: 'payroll',
    });
    const ids = await app.repos.documents.replaceForFile(file.id, docs);
    if (withStaffRecords) {
      // What the extraction stores: one staff expense per payroll for its total cost.
      await app.repos.records.replaceExtracted(
        file.id,
        docs.map((d, i) => ({
          occurredOn: d.periodEnd as string,
          amountMinor: Number(
            (d.details['employerTotalCostMinor'] as number | null) ??
              d.details['grossTotalMinor'],
          ),
          currency: d.currency,
          kind: 'expense' as const,
          category: 'staff' as const,
          counterparty: null,
          confidence: 0.95,
          documentId: ids[i],
          lineItems: [],
        })),
      );
    }
    return { file, ids };
  };

  const get = async <T>(app: TestApp, path: string) => {
    const response = await fetch(`${app.base}/api/documents/${path}`);
    return { status: response.status, body: (await response.json()) as T };
  };

  run(
    'returns period totals with employees, gross, net, deductions and total cost',
    async (app) => {
      await seed(app, [
        payroll('2050-01-31', [ana(200_000), beto(100_000)]),
        payroll('2050-02-28', [ana(200_000), beto(100_000)], 340_000),
      ]);
      const { status, body } = await get<PayrollView[]>(
        app,
        'payroll?from=2050-01-01&to=2050-12-31',
      );
      expect(status).toBe(200);
      expect(body).toHaveLength(1);
      expect(body[0].periods[0]).toMatchObject({
        employees: 2,
        grossMinor: 300_000,
        deductionsMinor: 50_000,
        netMinor: 250_000,
        totalCostMinor: 300_000,
      });
      expect(body[0].periods[1].totalCostMinor).toBe(340_000); // employer cost stated
    },
  );

  run(
    'lists the lines of a payroll document and 404s for other documents',
    async (app) => {
      const { ids } = await seed(app, [
        payroll('2051-01-31', [ana(200_000), beto(100_000)]),
      ]);
      const lines = await get<PayrollLineView[]>(app, `payroll/${ids[0]}`);
      expect(lines.status).toBe(200);
      expect(lines.body.map((l) => [l.employeeKey, l.netMinor])).toEqual([
        ['ana lopez', 160_000],
        ['beto ruiz', 90_000],
      ]);

      const other = await seed(
        app,
        [{ ...payroll('2051-02-28', []), type: 'receipt', details: {} }],
        false,
      );
      expect((await get(app, `payroll/${other.ids[0]}`)).status).toBe(404);
      expect(
        (await get(app, 'payroll/3f0e8b4e-7c1a-4d6e-9a53-1f6f5d0c2b11')).status,
      ).toBe(404);
      expect((await get(app, 'payroll/not-a-uuid')).status).toBe(400);
    },
  );

  run('returns the pay history of an employee across periods', async (app) => {
    const carla = (gross: number, name = 'Carla Núñez') => ({
      name,
      key: 'carla nunez',
      gross,
      deductions: gross / 5,
    });
    await seed(app, [
      payroll('2052-02-28', [carla(220_000)]),
      payroll('2052-01-31', [carla(200_000, 'CARLA NUNEZ')]),
    ]);
    const { status, body } = await get<EmployeeHistory>(
      app,
      'payroll/employees/carla%20nunez',
    );
    expect(status).toBe(200);
    expect(body.history.map((h) => h.grossMinor)).toEqual([200_000, 220_000]);
    expect(body.employeeName).toBe('Carla Núñez'); // latest spelling
    expect((await get(app, 'payroll/employees/nobody')).status).toBe(404);
  });

  run(
    'the total cost equals the staff expense of the general totals for the same range',
    async (app) => {
      const owner = await createTestApp();
      if (!owner) return;
      try {
        await seed(owner, [
          payroll('2053-01-31', [ana(200_000), beto(100_000)]),
          payroll('2053-02-28', [ana(200_000), beto(100_000)], 350_000),
        ]);
        const view = await get<PayrollView[]>(
          owner,
          'payroll?from=2053-01-01&to=2053-03-31',
        );
        const payrollCost = view.body[0].periods.reduce(
          (a, p) => a + p.totalCostMinor,
          0,
        );

        const totals = (await (
          await fetch(
            `${owner.base}/api/records/totals?from=2053-01-01&to=2053-03-31&groupBy=month&category=staff`,
          )
        ).json()) as TotalsRow[];
        const staff = totals.reduce((a, r) => a + r.totalMinor, 0);
        expect(payrollCost).toBe(650_000);
        expect(staff).toBe(payrollCost);
      } finally {
        await owner.close();
      }
    },
  );

  run(
    'applies the period-end rule, keeps inconsistent payroll marked and validates the dates',
    async (app) => {
      await seed(app, [
        payroll('2054-01-31', [ana(100)], null, {
          consistency: 'inconsistent',
          consistencyNotes: 'gross - deductions does not equal net',
        }),
        payroll('2054-03-31', [ana(100)]),
      ]);
      const { body } = await get<PayrollView[]>(
        app,
        'payroll?from=2054-01-01&to=2054-02-28',
      );
      expect(body[0].periods).toHaveLength(1);
      expect(body[0].periods[0].consistency).toBe('inconsistent');
      expect(
        (await get(app, 'payroll?from=2054-03-01&to=2054-02-01')).status,
      ).toBe(400);
      expect((await get(app, 'payroll')).status).toBe(400);
    },
  );

  run('never logs employee names while serving the views', async (app) => {
    const lines: string[] = [];
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(
      (level) =>
        jest.spyOn(Logger.prototype, level).mockImplementation(((
          m: unknown,
        ) => {
          lines.push(String(m));
        }) as never),
    );
    try {
      const { ids } = await seed(app, [payroll('2055-01-31', [ana(100)])]);
      await get(app, 'payroll?from=2055-01-01&to=2055-12-31');
      await get(app, `payroll/${ids[0]}`);
      await get(app, 'payroll/employees/ana%20lopez');
      await get(app, 'payroll/employees/nobody'); // an error path
      expect(lines.join('\n')).not.toMatch(/Ana|López|lopez/i);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});
