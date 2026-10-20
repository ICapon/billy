import type { ExtractedDocumentRow, PayrollLineRow } from '@org/db';
import type { FileDocument } from '@org/shared';

export function toFileDocument(
  row: ExtractedDocumentRow,
  lines: PayrollLineRow[],
): FileDocument {
  return {
    id: row.id,
    type: row.type,
    typeConfidence: row.typeConfidence,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    issueDate: row.issueDate,
    currency: row.currency,
    consistency: row.consistency,
    consistencyNotes: row.consistencyNotes,
    details: row.details,
    payrollLines: lines.map((line) => ({
      employeeName: line.employeeName,
      grossMinor: line.grossMinor,
      deductionsMinor: line.deductionsMinor,
      netMinor: line.netMinor,
    })),
  };
}
