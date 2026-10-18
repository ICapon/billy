import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OcrEngine, OcrResult } from '../types';

/**
 * Tesseract needs language data. It is shipped with the @tesseract.js-data packages (no
 * network at runtime) but each package has its own folder, so both files are gathered into
 * one directory that is used as `langPath`. Imports are static strings so the bundler can
 * leave them external.
 */
const languagePackages: Record<
  string,
  () => Promise<{ default: { langPath: string } }>
> = {
  eng: () => import('@tesseract.js-data/eng'),
  spa: () => import('@tesseract.js-data/spa'),
};

async function prepareLanguageData(
  languages: readonly string[],
): Promise<string> {
  const target = join(tmpdir(), 'billy-tessdata');
  mkdirSync(target, { recursive: true });
  for (const language of languages) {
    const file = `${language}.traineddata.gz`;
    const destination = join(target, file);
    if (existsSync(destination)) continue;
    const load = languagePackages[language];
    if (!load)
      throw new Error(`No bundled OCR language data for "${language}"`);
    const info = (await load()).default;
    copyFileSync(join(info.langPath, file), destination);
  }
  return target;
}

type TesseractWorker = Awaited<
  ReturnType<(typeof import('tesseract.js'))['createWorker']>
>;

/** Local OCR (no API cost). Spanish first, English as a fallback. */
export function createTesseractOcr(
  languages: readonly string[] = ['spa', 'eng'],
): OcrEngine {
  let worker: Promise<TesseractWorker> | null = null;

  const getWorker = () => {
    worker ??= (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker([...languages], 1, {
        langPath: await prepareLanguageData(languages),
        gzip: true,
        cacheMethod: 'none',
      });
    })();
    return worker;
  };

  return {
    async recognize(images: Buffer[]): Promise<OcrResult> {
      const instance = await getWorker();
      let text = '';
      let weighted = 0;
      let characters = 0;
      for (const image of images) {
        const { data } = await instance.recognize(image);
        const pageText = data.text.trim();
        text += `${pageText}\n\n`;
        weighted += (data.confidence / 100) * pageText.length;
        characters += pageText.length;
      }
      return {
        text: text.trim(),
        confidence: characters === 0 ? 0 : weighted / characters,
      };
    },

    async close(): Promise<void> {
      if (!worker) return;
      const instance = await worker;
      worker = null;
      await instance.terminate();
    },
  };
}
