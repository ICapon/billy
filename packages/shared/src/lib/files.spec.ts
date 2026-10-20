import {
  allowedMimeTypes,
  businessFileSchema,
  fileStatusSchema,
  filesQuerySchema,
  uploadResultSchema,
} from './files';

const validFile = {
  id: '3f0e8b4e-7c1a-4d6e-9a53-1f6f5d0c2b11',
  originalName: 'ticket.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  status: 'received',
  failureReason: null,
  readingMethod: null,
  totalCostMicroUsd: 0,
  duplicateOf: null,
  documentType: null,
  documentTypeConfidence: null,
  documentTypeManual: false,
  uploadedAt: '2026-10-18T10:00:00.000Z',
};

describe('fileStatusSchema', () => {
  it('accepts every lifecycle status', () => {
    for (const status of [
      'received',
      'queued_limit',
      'processing',
      'completed',
      'needs_review',
      'failed',
    ]) {
      expect(fileStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('rejects unknown statuses', () => {
    expect(fileStatusSchema.safeParse('done').success).toBe(false);
  });
});

describe('businessFileSchema', () => {
  it('accepts a valid file', () => {
    expect(businessFileSchema.safeParse(validFile).success).toBe(true);
  });

  it('rejects negative sizes and oversize names', () => {
    expect(
      businessFileSchema.safeParse({ ...validFile, sizeBytes: -1 }).success,
    ).toBe(false);
    expect(
      businessFileSchema.safeParse({
        ...validFile,
        originalName: 'x'.repeat(256),
      }).success,
    ).toBe(false);
  });
});

describe('document type on files', () => {
  it('accepts a classified file and rejects unknown types', () => {
    const classified = {
      ...validFile,
      documentType: 'payroll',
      documentTypeConfidence: 0.93,
      documentTypeManual: true,
    };
    expect(businessFileSchema.safeParse(classified).success).toBe(true);
    expect(
      businessFileSchema.safeParse({ ...classified, documentType: 'contract' })
        .success,
    ).toBe(false);
    expect(
      businessFileSchema.safeParse({ ...classified, documentTypeConfidence: 2 })
        .success,
    ).toBe(false);
  });
});

describe('uploadResultSchema', () => {
  it('accepts a duplicate result with the existing file id', () => {
    const result = uploadResultSchema.safeParse({
      name: 'ticket.pdf',
      outcome: 'duplicate',
      reason: null,
      file: null,
      existingFileId: validFile.id,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown outcomes', () => {
    expect(
      uploadResultSchema.safeParse({
        name: 'a',
        outcome: 'lost',
        reason: null,
        file: null,
        existingFileId: null,
      }).success,
    ).toBe(false);
  });
});

describe('filesQuerySchema', () => {
  it('applies the default page size and coerces strings', () => {
    expect(filesQuerySchema.parse({}).limit).toBe(50);
    expect(filesQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it('rejects bad dates', () => {
    expect(filesQuerySchema.safeParse({ from: '18/10/2026' }).success).toBe(
      false,
    );
  });
});

describe('allowedMimeTypes', () => {
  it('covers documents, images, spreadsheets and text', () => {
    expect(allowedMimeTypes).toContain('application/pdf');
    expect(allowedMimeTypes).toContain('image/heic');
    expect(allowedMimeTypes).toContain('text/csv');
  });
});
