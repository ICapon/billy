import type { ExtractedDocument, ReadingMethod } from '@org/shared';
import { CostLimitReachedError, UnreadableFileError } from '../errors';
import { evaluateDocument, type Evaluation } from './confidence';
import { toRecord } from './money';
import { readDigital, type DigitalReadResult } from './readers/digital';
import { normalizeImage } from './readers/normalize-image';
import { renderPdfPages } from './readers/pdf-pages';
import { ocrIsUsable, planTiers } from './strategy';
import { structureContent, structureText } from './structure';
import type {
  ExtractFileDeps,
  ExtractFileInput,
  ExtractFileResult,
  ExtractionRun,
} from './types';

/** Swappable readers, so the pipeline can be tested without real PDFs or images. */
export interface Readers {
  digital: typeof readDigital;
  normalize: typeof normalizeImage;
  renderPdf: typeof renderPdfPages;
}

const defaultReaders: Readers = {
  digital: readDigital,
  normalize: normalizeImage,
  renderPdf: renderPdfPages,
};

interface Attempt {
  tier: ReadingMethod;
  document: ExtractedDocument;
  evaluation: Evaluation;
}

/**
 * Reads a file with the cheapest adequate method and escalates only when the result is not
 * trustworthy. Throws `UnreadableFileError` for files that cannot be opened and
 * `CostLimitReachedError` (from a metered LLM client) when the budget is exhausted.
 */
export async function extractFile(
  input: ExtractFileInput,
  deps: ExtractFileDeps & { readers?: Partial<Readers> },
): Promise<ExtractFileResult> {
  const readers = { ...defaultReaders, ...deps.readers };
  const { config } = deps;
  const today = input.today ?? new Date();
  const mime = input.mimeType;

  const isDigitalFirst =
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    !mime.startsWith('image/');
  const digital: DigitalReadResult | null = isDigitalFirst
    ? await readers.digital(input.data, mime)
    : null;
  const tiers = planTiers(mime, digital?.usable ?? false);

  const structureBase = {
    llm: deps.llm,
    fileName: input.fileName,
    today,
    fallbackCurrency: config.currency,
  };
  const evaluate = (document: ExtractedDocument) =>
    evaluateDocument(document, {
      minRecordConfidence: config.recordMinConfidence,
      today,
    });

  const runs: ExtractionRun[] = [];
  const attempts: Attempt[] = [];
  let rawText: string | null = digital?.text ?? null;
  let lastError: unknown = null;

  const runTier = async (
    tier: ReadingMethod,
  ): Promise<{
    document: ExtractedDocument;
    ocrConfidence: number | null;
    issues: string[];
  }> => {
    if (tier === 'digital') {
      const document = await structureText({
        ...structureBase,
        model: config.extractionModel,
        text: digital?.text ?? '',
      });
      return { document, ocrConfidence: null, issues: [] };
    }

    if (tier === 'ocr') {
      const images =
        mime === 'application/pdf'
          ? await readers.renderPdf(input.data)
          : [(await readers.normalize(input.data, mime)).data];
      const ocr = await deps.ocr.recognize(images);
      rawText = ocr.text || rawText;
      if (!ocrIsUsable(ocr, config.ocrMinConfidence)) {
        return {
          document: { transactions: [] },
          ocrConfidence: ocr.confidence,
          issues: [
            `OCR confidence too low (${ocr.confidence.toFixed(2)}); escalating to a stronger reader`,
          ],
        };
      }
      const document = await structureText({
        ...structureBase,
        model: config.extractionModel,
        text: ocr.text,
      });
      return { document, ocrConfidence: ocr.confidence, issues: [] };
    }

    // vision: the model reads the original pages/image directly
    const content =
      mime === 'application/pdf'
        ? [{ type: 'pdf' as const, data: input.data }]
        : await readers.normalize(input.data, mime).then((image) => [
            {
              type: 'image' as const,
              mediaType: image.mime,
              data: image.data,
            },
          ]);
    const document = await structureContent({
      ...structureBase,
      model: config.visionModel,
      content,
    });
    return { document, ocrConfidence: null, issues: [] };
  };

  for (const [index, tier] of tiers.entries()) {
    const startedAt = new Date();
    const isLast = index === tiers.length - 1;
    try {
      const { document, ocrConfidence, issues } = await runTier(tier);
      const evaluation = evaluate(document);
      const allIssues = [...issues, ...evaluation.issues];
      const merged: Evaluation = {
        ...evaluation,
        outcome: issues.length > 0 ? 'needs_review' : evaluation.outcome,
        issues: allIssues,
      };
      attempts.push({ tier, document, evaluation: merged });
      runs.push({
        tier,
        status: merged.outcome === 'completed' ? 'succeeded' : 'low_confidence',
        confidence:
          ocrConfidence === null
            ? merged.confidence
            : Math.min(ocrConfidence, merged.confidence ?? ocrConfidence),
        error: null,
        startedAt,
        finishedAt: new Date(),
      });
      if (merged.outcome === 'completed') break;
    } catch (error) {
      if (
        error instanceof CostLimitReachedError ||
        error instanceof UnreadableFileError
      ) {
        throw error;
      }
      lastError = error;
      runs.push({
        tier,
        status: 'error',
        confidence: null,
        error: error instanceof Error ? error.message : String(error),
        startedAt,
        finishedAt: new Date(),
      });
      if (isLast && attempts.length === 0) throw error;
    }
  }

  if (attempts.length === 0)
    throw lastError ?? new Error('No reader produced a result');

  // Best attempt: fewest issues; ties go to the later (stronger) tier.
  const best = attempts.reduce((winner, candidate) =>
    candidate.evaluation.issues.length <= winner.evaluation.issues.length
      ? candidate
      : winner,
  );

  return {
    outcome: best.evaluation.outcome,
    method: best.tier,
    transactions: best.document.transactions,
    records: best.document.transactions.map((t) =>
      toRecord(t, config.currency),
    ),
    rawText,
    runs,
    issues: best.evaluation.issues,
  };
}
