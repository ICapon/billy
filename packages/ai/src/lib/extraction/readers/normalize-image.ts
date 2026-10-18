export type NormalizedMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface NormalizedImage {
  data: Buffer;
  mime: NormalizedMime;
}

/**
 * Tesseract and the vision API do not accept HEIC/HEIF (what iPhones produce), so those are
 * converted to JPEG first. Other formats pass through unchanged.
 */
export async function normalizeImage(
  data: Buffer,
  mime: string,
): Promise<NormalizedImage> {
  if (mime === 'image/heic' || mime === 'image/heif') {
    const { default: convert } = await import('heic-convert');
    const output = await convert({
      buffer: data,
      format: 'JPEG',
      quality: 0.9,
    });
    return { data: Buffer.from(output), mime: 'image/jpeg' };
  }
  if (mime === 'image/png' || mime === 'image/webp' || mime === 'image/jpeg') {
    return { data, mime };
  }
  throw new Error(`Unsupported image type: ${mime}`);
}
