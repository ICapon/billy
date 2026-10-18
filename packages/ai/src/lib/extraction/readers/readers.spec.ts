import { createCanvas } from '@napi-rs/canvas';
import ExcelJS from 'exceljs';
import { UnreadableFileError } from '../../errors';
import { readDigital } from './digital';
import { normalizeImage } from './normalize-image';
import { createTesseractOcr } from './ocr';
import { renderPdfPages } from './pdf-pages';

const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function pdfWithContent(content: string): Buffer {
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<</Root 1 0 R/Size ${objects.length + 1}>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
}

const textPdf = () =>
  pdfWithContent(
    'BT /F1 14 Tf 72 720 Td (Factura 123 total 42.50 USD fecha 12/10/2026 proveedor Mayorista SA) Tj ET',
  );
const scannedPdf = () => pdfWithContent('0.5 g 72 600 300 100 re f');

describe('readDigital', () => {
  it('reads CSV and plain text, stripping a BOM', async () => {
    const csv = Buffer.from('﻿fecha,total\n2026-10-01,100\n', 'utf8');
    const result = await readDigital(csv, 'text/csv');
    expect(result.text.startsWith('fecha,total')).toBe(true);
    expect(result.usable).toBe(true);
    expect((await readDigital(Buffer.from('hola'), 'text/plain')).text).toBe(
      'hola',
    );
  });

  it('rejects empty text files', async () => {
    await expect(
      readDigital(Buffer.from('  \n'), 'text/csv'),
    ).rejects.toBeInstanceOf(UnreadableFileError);
  });

  it('reads every sheet of an XLSX with ISO dates and formula results', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ventas');
    sheet.addRow(['Fecha', 'Producto', 'Total']);
    sheet.addRow([new Date('2026-10-05T00:00:00Z'), 'Pan', 12.5]);
    sheet.addRow([null, 'Suma', { formula: 'C2*2', result: 25 }]);
    workbook.addWorksheet('Sueldos').addRow(['Ana', 800]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await readDigital(buffer, XLSX);
    expect(result.text).toContain('## Sheet: Ventas');
    expect(result.text).toContain('2026-10-05\tPan\t12.5');
    expect(result.text).toContain('Suma\t25');
    expect(result.text).toContain('## Sheet: Sueldos');
  });

  it('reports a corrupted spreadsheet as unreadable', async () => {
    await expect(readDigital(Buffer.from('not a zip'), XLSX)).rejects.toThrow(
      UnreadableFileError,
    );
  });

  it('extracts the text layer of a PDF', async () => {
    const result = await readDigital(textPdf(), 'application/pdf');
    expect(result.pages).toBe(1);
    expect(result.usable).toBe(true);
    expect(result.text).toContain('Factura 123');
    expect(result.text).toContain('42.50');
  });

  it('marks a PDF without text as not usable (scanned)', async () => {
    const result = await readDigital(scannedPdf(), 'application/pdf');
    expect(result.usable).toBe(false);
  });

  it('reports a corrupted PDF as unreadable', async () => {
    await expect(
      readDigital(Buffer.from('%PDF-1.4 garbage'), 'application/pdf'),
    ).rejects.toBeInstanceOf(UnreadableFileError);
  });
});

describe('renderPdfPages', () => {
  it('renders pages to PNG images', async () => {
    const pages = await renderPdfPages(textPdf());
    expect(pages).toHaveLength(1);
    expect(pages[0].subarray(1, 4).toString()).toBe('PNG');
  });
});

describe('normalizeImage', () => {
  it('passes JPEG, PNG and WEBP through unchanged', async () => {
    const data = Buffer.from('x');
    for (const mime of ['image/jpeg', 'image/png', 'image/webp'] as const) {
      expect(await normalizeImage(data, mime)).toEqual({ data, mime });
    }
  });

  it('rejects unsupported image types', async () => {
    await expect(normalizeImage(Buffer.from('x'), 'image/gif')).rejects.toThrow(
      'Unsupported',
    );
  });
});

describe('createTesseractOcr (real engine, bundled language data)', () => {
  const ocr = createTesseractOcr();
  afterAll(() => ocr.close());

  it('reads printed text from an image with high confidence', async () => {
    const canvas = createCanvas(900, 220);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 900, 220);
    ctx.fillStyle = '#000000';
    ctx.font = '48px sans-serif';
    ctx.fillText('FACTURA TOTAL 42.50', 40, 90);
    ctx.fillText('Fecha 12/10/2026', 40, 170);

    const result = await ocr.recognize([canvas.toBuffer('image/png')]);
    expect(result.text.toUpperCase()).toContain('FACTURA');
    expect(result.text).toContain('42.50');
    expect(result.confidence).toBeGreaterThan(0.6);
  }, 120_000);
});
