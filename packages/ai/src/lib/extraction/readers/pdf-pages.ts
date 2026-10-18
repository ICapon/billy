import { UnreadableFileError } from '../../errors';

/** Pages rendered for OCR; longer documents are read up to this limit. */
export const MAX_OCR_PAGES = 10;

/** Renders PDF pages to PNG so scanned documents can be OCR'd. */
export async function renderPdfPages(
  data: Buffer,
  maxPages = MAX_OCR_PAGES,
): Promise<Buffer[]> {
  const { getDocumentProxy, renderPageAsImage } = await import('unpdf');
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const total = Math.min(pdf.numPages, maxPages);
    const pages: Buffer[] = [];
    for (let page = 1; page <= total; page++) {
      const image = await renderPageAsImage(pdf, page, {
        canvasImport: () => import('@napi-rs/canvas'),
        scale: 2,
      });
      pages.push(Buffer.from(image));
    }
    return pages;
  } catch (error) {
    const name = (error as { name?: string }).name ?? '';
    if (name === 'PasswordException') {
      throw new UnreadableFileError('The PDF is protected with a password');
    }
    throw new UnreadableFileError('The PDF could not be rendered');
  }
}
