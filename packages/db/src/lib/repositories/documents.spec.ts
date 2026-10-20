import { documentsRepository, type NewDocument } from './documents';
import { filesRepository } from './files';
import { recordsRepository, type TransactionData } from './records';
import { describeDb } from './testing';

const doc = (overrides: Partial<NewDocument> = {}): NewDocument => ({
  type: 'bank_statement',
  typeConfidence: 0.95,
  periodStart: '2035-01-01',
  periodEnd: '2035-01-31',
  issueDate: null,
  currency: 'USD',
  consistency: 'ok',
  consistencyNotes: null,
  details: { openingBalanceMinor: 100 },
  ...overrides,
});

const record = (overrides: Partial<TransactionData> = {}): TransactionData => ({
  occurredOn: '2035-01-10',
  amountMinor: 1000,
  currency: 'USD',
  kind: 'expense',
  category: 'staff',
  counterparty: null,
  confidence: 0.9,
  lineItems: [],
  ...overrides,
});

describeDb('documentsRepository', (ctx, dbIt) => {
  const repo = () => documentsRepository(ctx().handle.db, ctx().ownerId);
  const records = () => recordsRepository(ctx().handle.db, ctx().ownerId);

  dbIt(
    'replaces the documents of a file and returns the ids in order, with payroll lines',
    async () => {
      const file = await ctx().newFile();
      const ids = await repo().replaceForFile(file.id, [
        doc(),
        doc({
          type: 'payroll',
          details: { grossTotalMinor: 300 },
          payrollLines: [
            {
              employeeName: 'Ana López',
              employeeKey: 'ana lopez',
              grossMinor: 200,
              deductionsMinor: 20,
              netMinor: 180,
            },
            {
              employeeName: 'Beto',
              employeeKey: 'beto',
              grossMinor: 100,
              deductionsMinor: 10,
              netMinor: 90,
            },
          ],
        }),
      ]);
      expect(ids).toHaveLength(2);
      const stored = await repo().listByFile(file.id);
      expect(stored.map((d) => [d.ordinal, d.type])).toEqual([
        [0, 'bank_statement'],
        [1, 'payroll'],
      ]);
      expect(stored[0].typeConfidence).toBe(0.95);
      expect(stored[0].periodEnd).toBe('2035-01-31');
      expect(
        (await repo().payrollLines(ids[1])).map((l) => l.employeeKey),
      ).toEqual(['ana lopez', 'beto']);

      // replacing removes the old documents and their lines
      const newIds = await repo().replaceForFile(file.id, [
        doc({ type: 'other', details: {} }),
      ]);
      expect(await repo().findById(ids[0])).toBeNull();
      expect(await repo().payrollLines(ids[1])).toEqual([]);
      expect((await repo().listByFile(file.id)).map((d) => d.id)).toEqual(
        newIds,
      );
    },
  );

  dbIt(
    'lists by type with the right period rule per type (inclusive ends)',
    async () => {
      const file = await ctx().newFile();
      await repo().replaceForFile(file.id, [
        doc({ periodStart: '2036-03-01', periodEnd: '2036-03-31' }), // statement ends in range
        doc({ periodStart: '2036-02-01', periodEnd: '2036-02-29' }), // ends before the range
        doc({
          type: 'invoice',
          periodStart: null,
          periodEnd: null,
          issueDate: '2036-03-15',
          details: {},
        }),
        doc({
          type: 'invoice',
          periodStart: null,
          periodEnd: null,
          issueDate: '2036-04-02',
          details: {},
        }),
        doc({
          type: 'receipt',
          periodStart: null,
          periodEnd: '2036-03-20',
          issueDate: null,
          details: {},
        }), // falls back to period end
      ]);
      const march = { from: '2036-03-01', to: '2036-03-31' };

      expect(
        (await repo().listByType('bank_statement', march)).map(
          (d) => d.periodEnd,
        ),
      ).toEqual(['2036-03-31']);
      expect(
        (await repo().listByType(['invoice', 'receipt'], march))
          .map((d) => d.type)
          .sort(),
      ).toEqual(['invoice', 'receipt']);
      expect(
        await repo().listByType('invoice', {
          from: '2036-03-16',
          to: '2036-04-01',
        }),
      ).toEqual([]);
      expect(
        (
          await repo().listByType('invoice', {
            from: '2036-04-02',
            to: '2036-04-02',
          })
        ).length,
      ).toBe(1);
    },
  );

  dbIt('never returns documents of another owner', async () => {
    const file = await ctx().newFile();
    await repo().replaceForFile(file.id, [doc({ periodEnd: '2037-05-31' })]);
    const other = documentsRepository(ctx().handle.db, 'someone-else');
    expect(
      await other.listByType('bank_statement', {
        from: '2037-05-01',
        to: '2037-05-31',
      }),
    ).toEqual([]);
  });

  dbIt(
    'keeps confirmed records unlinked when the documents are replaced, and cascades on file delete',
    async () => {
      const c = ctx();
      const file = await c.newFile();
      const [id] = await repo().replaceForFile(file.id, [
        doc({ type: 'payroll', details: {} }),
      ]);
      const [kept, dropped] = await records().replaceExtracted(file.id, [
        record({ documentId: id }),
        record({ documentId: id, amountMinor: 5 }),
      ]);
      await records().confirm(kept.id);
      expect((await records().findById(kept.id))?.documentId).toBe(id);

      const [newId] = await repo().replaceForFile(file.id, [
        doc({ type: 'payroll', details: {} }),
      ]);
      expect((await records().findById(kept.id))?.documentId).toBeNull(); // link lost, record kept
      const rerun = await records().replaceExtracted(file.id, [
        record({ documentId: newId, amountMinor: 7 }),
      ]);
      expect(await records().findById(dropped.id)).toBeNull(); // unconfirmed one replaced
      expect(rerun[0].documentId).toBe(newId);
      expect(await records().findById(kept.id)).not.toBeNull();

      await filesRepository(c.handle.db, c.ownerId).delete(file.id);
      expect(await repo().findById(newId)).toBeNull();
    },
  );

  dbIt(
    'returns the history of an employee across periods, oldest first',
    async () => {
      const file = await ctx().newFile();
      await repo().replaceForFile(file.id, [
        doc({
          type: 'payroll',
          periodEnd: '2038-02-28',
          details: {},
          payrollLines: [
            {
              employeeName: 'Ana',
              employeeKey: 'ana',
              grossMinor: 2,
              deductionsMinor: 0,
              netMinor: 2,
            },
          ],
        }),
        doc({
          type: 'payroll',
          periodEnd: '2038-01-31',
          details: {},
          payrollLines: [
            {
              employeeName: 'ANA',
              employeeKey: 'ana',
              grossMinor: 1,
              deductionsMinor: 0,
              netMinor: 1,
            },
          ],
        }),
      ]);
      const history = await repo().employeeHistory('ana');
      expect(history.map((h) => h.document.periodEnd)).toEqual([
        '2038-01-31',
        '2038-02-28',
      ]);
      expect(history.map((h) => h.line.grossMinor)).toEqual([1, 2]);
      expect(await repo().employeeHistory('nobody')).toEqual([]);
    },
  );

  dbIt(
    'lists unclassified finished files and filters files by document type',
    async () => {
      const c = ctx();
      const files = filesRepository(c.handle.db, c.ownerId);
      const done = await c.newFile({ status: 'completed' });
      const waiting = await c.newFile({ status: 'received' });
      const typed = await c.newFile({
        status: 'completed',
        documentType: 'payroll',
      });

      const unclassified = (await files.listUnclassified()).map((f) => f.id);
      expect(unclassified).toContain(done.id);
      expect(unclassified).not.toContain(waiting.id); // not finished yet
      expect(unclassified).not.toContain(typed.id);

      const onlyUntyped = await files.list({
        documentType: 'unclassified',
        limit: 100,
      });
      expect(onlyUntyped.items.map((f) => f.id)).toContain(done.id);
      expect(onlyUntyped.items.map((f) => f.id)).not.toContain(typed.id);
      const payroll = await files.list({ documentType: 'payroll', limit: 100 });
      expect(payroll.items.map((f) => f.id)).toEqual([typed.id]);
    },
  );
});
