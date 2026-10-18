import { UnreadableFileError } from '../../errors';

export interface DigitalReadResult {
  text: string;
  /** False when the file has (almost) no machine-readable text, e.g. a scanned PDF. */
  usable: boolean;
  pages: number | null;
}

/** A PDF page needs at least this many characters to count as having a text layer. */
export const MIN_CHARS_PER_PAGE = 40;

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function isTextLike(mime: string): boolean {
  return mime === 'text/csv' || mime === 'text/plain' || mime === XLSX_MIME;
}

function decodeText(data: Buffer): string {
  const text = data.toString('utf8');
  // Strip a UTF-8 byte order mark (U+FEFF) when present.
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function readXlsx(data: Buffer): Promise<string> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    throw new UnreadableFileError(
      'The spreadsheet is corrupted or protected with a password',
    );
  }
  const sheets: string[] = [];
  workbook.eachSheet((sheet) => {
    const lines: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells = (row.values as unknown[]).slice(1).map(cellToText);
      if (cells.some((cell) => cell !== '')) lines.push(cells.join('\t'));
    });
    if (lines.length > 0)
      sheets.push(`## Sheet: ${sheet.name}\n${lines.join('\n')}`);
  });
  return sheets.join('\n\n');
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const cell = value as {
      result?: unknown;
      text?: string;
      richText?: { text: string }[];
    };
    if (cell.result !== undefined) return cellToText(cell.result);
    if (cell.richText) return cell.richText.map((part) => part.text).join('');
    if (cell.text !== undefined) return cell.text;
    return '';
  }
  return String(value).trim();
}

async function readPdfText(
  data: Buffer,
): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return { text, pages: totalPages };
  } catch (error) {
    const name = (error as { name?: string }).name ?? '';
    if (name === 'PasswordException') {
      throw new UnreadableFileError('The PDF is protected with a password');
    }
    throw new UnreadableFileError('The PDF is corrupted or cannot be opened');
  }
}

/** Reads files that carry their own text: CSV, XLSX, plain text and PDFs with a text layer. */
export async function readDigital(
  data: Buffer,
  mime: string,
): Promise<DigitalReadResult> {
  if (mime === 'text/csv' || mime === 'text/plain') {
    const text = decodeText(data).trim();
    if (!text) throw new UnreadableFileError('The file is empty');
    return { text, usable: true, pages: null };
  }
  if (mime === XLSX_MIME) {
    const text = (await readXlsx(data)).trim();
    if (!text) throw new UnreadableFileError('The spreadsheet has no data');
    return { text, usable: true, pages: null };
  }
  if (mime === 'application/pdf') {
    const { text, pages } = await readPdfText(data);
    const trimmed = text.trim();
    return {
      text: trimmed,
      usable: trimmed.length >= MIN_CHARS_PER_PAGE * Math.max(1, pages),
      pages,
    };
  }
  throw new UnreadableFileError(`No digital reader for ${mime}`);
}
