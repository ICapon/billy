import type { ExtractedTransaction } from '@org/shared';
import { buildStoredDocuments } from './documents-to-records';
import {
  bankStatementDoc,
  extraction,
  otherDoc,
  payrollDoc,
  receiptDoc,
} from '../testing/fixtures';
import { evaluateDocument, evaluateExtraction } from './confidence';

const today = new Date('2026-10-18T12:00:00Z');

const base: ExtractedTransaction = {
  date: '2026-10-12',
  amount: 100,
  currency: 'USD',
  kind: 'expense',
  category: 'supplies',
  counterparty: 'Proveedor',
  lineItems: [],
  confidence: { date: 0.95, amount: 0.97, kind: 0.99 },
};

const doc = (...transactions: ExtractedTransaction[]) => ({
  transactions,
});
const options = { minRecordConfidence: 0.8, today };

describe('evaluateDocument', () => {
  it('completes a confident, consistent document', () => {
    const result = evaluateDocument(doc(base), options);
    expect(result).toEqual({
      outcome: 'completed',
      confidence: 0.95,
      issues: [],
    });
  });

  it('sends a document without transactions to review', () => {
    const result = evaluateDocument(doc(), options);
    expect(result.outcome).toBe('needs_review');
    expect(result.confidence).toBeNull();
  });

  it('flags any record below the minimum confidence', () => {
    const weak = { ...base, confidence: { ...base.confidence, amount: 0.5 } };
    const result = evaluateDocument(doc(base, weak), options);
    expect(result.outcome).toBe('needs_review');
    expect(result.confidence).toBe(0.5);
    expect(result.issues[0]).toContain('Record 2');
  });

  it('accepts confidence exactly at the threshold', () => {
    const edge = { ...base, confidence: { date: 0.8, amount: 0.9, kind: 0.9 } };
    expect(evaluateDocument(doc(edge), options).outcome).toBe('completed');
  });

  it('reconciles line items to the total within 1%', () => {
    const items = (total: number) => [
      {
        productName: 'A',
        quantity: 1,
        unitPrice: total,
        total,
        direction: 'purchase' as const,
      },
    ];
    expect(
      evaluateDocument(doc({ ...base, lineItems: items(100.9) }), options)
        .outcome,
    ).toBe('completed');
    const off = evaluateDocument(
      doc({ ...base, lineItems: items(80) }),
      options,
    );
    expect(off.outcome).toBe('needs_review');
    expect(off.issues[0]).toContain('add up to 80.00');
  });

  it('flags implausible dates', () => {
    expect(
      evaluateDocument(doc({ ...base, date: '1990-01-01' }), options).outcome,
    ).toBe('needs_review');
    expect(
      evaluateDocument(doc({ ...base, date: '2031-01-01' }), options).outcome,
    ).toBe('needs_review');
    expect(
      evaluateDocument(doc({ ...base, date: '2027-06-01' }), options).outcome,
    ).toBe('completed');
  });
});

describe('evaluateExtraction', () => {
  const evaluate = (...documents: Parameters<typeof extraction>) => {
    const output = extraction(...documents);
    const stored = buildStoredDocuments(output, { currency: 'USD', today });
    return evaluateExtraction(output, stored, options);
  };

  it('completes confident, consistent documents of several types', () => {
    const result = evaluate(receiptDoc(), bankStatementDoc(), payrollDoc());
    expect(result).toMatchObject({ outcome: 'completed', issues: [] });
  });

  it('sends a file without documents to review', () => {
    const result = evaluate();
    expect(result.outcome).toBe('needs_review');
    expect(result.issues).toEqual(['No documents were found in the file']);
  });

  it('flags a low confidence in the type', () => {
    const result = evaluate(receiptDoc(undefined, { typeConfidence: 0.5 }));
    expect(result.outcome).toBe('needs_review');
    expect(result.issues[0]).toContain('low confidence in the type');
    expect(result.confidence).toBe(0.5);
  });

  it('requires transactions except for statements and payroll', () => {
    expect(evaluate(bankStatementDoc(), payrollDoc()).outcome).toBe(
      'completed',
    );
    const result = evaluate(otherDoc([]));
    expect(result.outcome).toBe('needs_review');
    expect(result.issues[0]).toContain('no transactions were found');
  });

  it('sends an inconsistent bank statement to review', () => {
    const result = evaluate(bankStatementDoc({}, { closingBalance: 5000 }));
    expect(result.outcome).toBe('needs_review');
    expect(result.issues.join(' ')).toContain('Closing balance 5000.00');
  });

  it('sends an inconsistent payroll to review without naming employees', () => {
    const result = evaluate(payrollDoc({}, { netTotal: 100 }));
    expect(result.outcome).toBe('needs_review');
    expect(result.issues.join(' ')).not.toMatch(/Ana|Beto/);
  });

  it('reports transaction problems with the document label', () => {
    const weak = {
      ...receiptDoc().transactions[0],
      confidence: { date: 0.3, amount: 0.9, kind: 0.9 },
    };
    const result = evaluate(receiptDoc([weak]));
    expect(result.outcome).toBe('needs_review');
    expect(result.issues[0]).toContain(
      'Document 1 (receipt): Record 1 has low confidence',
    );
  });
});
