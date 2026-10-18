import {
  fitsInBatch,
  rejectBatchLimit,
  rejectTooLarge,
  rejectUnsupportedType,
  resolveMimeType,
} from './upload-validation';

describe('resolveMimeType', () => {
  it('accepts supported types as declared', () => {
    expect(resolveMimeType('a.pdf', 'application/pdf')).toBe('application/pdf');
    expect(resolveMimeType('a.png', 'image/png')).toBe('image/png');
  });

  it('uses the extension for generic browser types', () => {
    expect(resolveMimeType('ventas.csv', 'application/vnd.ms-excel')).toBe(
      'text/csv',
    );
    expect(resolveMimeType('foto.HEIC', '')).toBe('image/heic');
    expect(resolveMimeType('foto.heic', 'application/octet-stream')).toBe(
      'image/heic',
    );
  });

  it('accepts XLSX and TXT', () => {
    expect(
      resolveMimeType(
        'n.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(resolveMimeType('n.txt', 'text/plain')).toBe('text/plain');
  });

  it('rejects unsupported types', () => {
    expect(resolveMimeType('virus.exe', 'application/x-msdownload')).toBeNull();
    expect(resolveMimeType('mystery', 'application/octet-stream')).toBeNull();
    expect(resolveMimeType('doc.docx', 'application/msword')).toBeNull();
  });

  it('trusts the extension when the declared type disagrees', () => {
    expect(resolveMimeType('receipt.pdf', 'image/png')).toBe('application/pdf');
  });
});

describe('batch and rejection helpers', () => {
  it('limits the number of accepted files per batch', () => {
    expect(fitsInBatch(19, 20)).toBe(true);
    expect(fitsInBatch(20, 20)).toBe(false);
  });

  it('builds readable rejection reasons', () => {
    expect(rejectTooLarge(20 * 1024 * 1024).message).toContain('20 MB');
    expect(rejectUnsupportedType('x.exe').message).toContain('x.exe');
    expect(rejectBatchLimit(20).message).toContain('20');
    expect(rejectBatchLimit(20).reason).toBe('batch_limit');
  });
});
