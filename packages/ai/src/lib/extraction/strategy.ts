import type { ReadingMethod } from '@org/shared';
import { isTextLike } from './readers/digital';

/** OCR output shorter than this is treated as "nothing readable". */
export const MIN_OCR_CHARS = 20;

/**
 * Ordered reading tiers, cheapest first (research R3):
 * - CSV / XLSX / TXT: direct parsing only (vision would not read them better);
 * - PDF with a text layer: direct text, then vision as an escalation;
 * - scanned PDF and images: local OCR, then vision as an escalation.
 */
export function planTiers(
  mime: string,
  hasTextLayer: boolean,
): ReadingMethod[] {
  if (isTextLike(mime)) return ['digital'];
  if (mime === 'application/pdf') {
    return hasTextLayer ? ['digital', 'vision'] : ['ocr', 'vision'];
  }
  if (mime.startsWith('image/')) return ['ocr', 'vision'];
  throw new Error(`Unsupported file type: ${mime}`);
}

/** Whether OCR output is good enough to spend an LLM call structuring it. */
export function ocrIsUsable(
  result: { text: string; confidence: number },
  minConfidence: number,
): boolean {
  return (
    result.text.length >= MIN_OCR_CHARS && result.confidence >= minConfidence
  );
}
