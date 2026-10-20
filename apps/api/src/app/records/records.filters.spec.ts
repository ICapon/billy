import type { TransactionData } from '@org/db';
import { createTestApp, type TestApp } from '../../testing/test-app';

const record = (occurredOn: string, amountMinor: number): TransactionData => ({
  occurredOn,
  amountMinor,
  currency: 'USD',
  kind: 'expense',
  category: 'supplies',
  counterparty: null,
  confidence: 0.9,
  lineItems: [],
});

describe('GET /api/records document filters (integration)', () => {
  let t: TestApp | null = null;
  const ids = { receipt: '', invoice: '', doc: '' };

  beforeAll(async () => {
    t = await createTestApp();
    if (!t) return;
    const mk = async (name: string, documentType: 'receipt' | 'invoice') => {
      const file = await t!.repos.files.insert({
        originalName: name,
        mimeType: 'text/csv',
        sizeBytes: 1,
        sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
        storageKey: `${t!.ownerId}/${name}`,
        status: 'completed',
      });
      await t!.repos.files.update(file.id, { documentType });
      return file;
    };
    const receipt = await mk('r.csv', 'receipt');
    const invoice = await mk('i.csv', 'invoice');
    ids.receipt = receipt.id;
    ids.invoice = invoice.id;
    await t.repos.records.replaceExtracted(receipt.id, [
      record('2060-01-05', 1000),
    ]);
    const [docId] = await t.repos.documents.replaceForFile(invoice.id, [
      {
        type: 'invoice',
        typeConfidence: 0.9,
        periodStart: null,
        periodEnd: null,
        issueDate: '2060-01-06',
        currency: 'USD',
        consistency: 'ok',
        consistencyNotes: null,
        details: {},
      },
    ]);
    ids.doc = docId;
    await t.repos.records.replaceExtracted(invoice.id, [
      { ...record('2060-01-06', 2000), documentId: docId },
    ]);
  });
  afterAll(async () => t?.close());

  const amounts = async (query: string) => {
    const response = await fetch(`${t!.base}/api/records?${query}`);
    return {
      status: response.status,
      body: (await response.json()) as { items: { amountMinor: number }[] },
    };
  };

  it('filters by document type', async () => {
    if (!t) return;
    const { status, body } = await amounts('documentType=receipt');
    expect(status).toBe(200);
    expect(body.items.map((r) => r.amountMinor)).toEqual([1000]);
  });

  it('filters by document id', async () => {
    if (!t) return;
    const { body } = await amounts(`documentId=${ids.doc}`);
    expect(body.items.map((r) => r.amountMinor)).toEqual([2000]);
  });

  it('rejects an unknown document type', async () => {
    if (!t) return;
    expect((await amounts('documentType=nope')).status).toBe(400);
  });
});
