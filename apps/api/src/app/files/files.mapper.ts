import type { BusinessFileRow } from '@org/db';
import type { BusinessFile } from '@org/shared';

export function toBusinessFile(row: BusinessFileRow): BusinessFile {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    failureReason: row.failureReason,
    readingMethod: row.readingMethod,
    totalCostMicroUsd: row.totalCostMicroUsd,
    duplicateOf: row.duplicateOf,
    documentType: row.documentType,
    documentTypeConfidence: row.documentTypeConfidence,
    documentTypeManual: row.documentTypeManual,
    uploadedAt: row.uploadedAt.toISOString(),
  };
}
