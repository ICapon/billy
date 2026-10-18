import { allowedMimeTypes, type AllowedMimeType } from '@org/shared';

const EXTENSION_TO_MIME: Record<string, AllowedMimeType> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  csv: 'text/csv',
  txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Browsers send these for files they do not recognise, so the extension decides. */
const GENERIC_MIME = new Set([
  '',
  'application/octet-stream',
  'application/vnd.ms-excel',
  'application/csv',
  'text/x-csv',
]);

function isAllowed(mime: string): mime is AllowedMimeType {
  return (allowedMimeTypes as readonly string[]).includes(mime);
}

/** Returns the canonical MIME type of an upload, or null when the type is not accepted. */
export function resolveMimeType(
  fileName: string,
  declaredMime: string,
): AllowedMimeType | null {
  const declared = declaredMime.toLowerCase().split(';')[0].trim();
  const extension = fileName.includes('.')
    ? fileName.split('.').pop()?.toLowerCase()
    : undefined;
  const byExtension = extension ? EXTENSION_TO_MIME[extension] : undefined;

  if (GENERIC_MIME.has(declared)) return byExtension ?? null;
  if (isAllowed(declared)) {
    // A declared type that disagrees with the extension is suspicious, except text/plain
    // which some systems use for CSV.
    if (byExtension && byExtension !== declared && declared !== 'text/plain') {
      return byExtension;
    }
    return declared;
  }
  return null;
}

export type UploadRejection =
  | { reason: 'unsupported_type'; message: string }
  | { reason: 'too_large'; message: string }
  | { reason: 'empty'; message: string }
  | { reason: 'batch_limit'; message: string };

export function rejectUnsupportedType(fileName: string): UploadRejection {
  return {
    reason: 'unsupported_type',
    message: `"${fileName}" is not a supported file type (PDF, JPG, PNG, WEBP, HEIC, CSV, XLSX or TXT)`,
  };
}

export function rejectTooLarge(maxBytes: number): UploadRejection {
  return {
    reason: 'too_large',
    message: `The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`,
  };
}

export function rejectEmpty(): UploadRejection {
  return { reason: 'empty', message: 'The file is empty' };
}

export function rejectBatchLimit(maxFiles: number): UploadRejection {
  return {
    reason: 'batch_limit',
    message: `Only ${maxFiles} files can be uploaded at once`,
  };
}

/** Whether another file still fits in the batch (accepted count so far). */
export function fitsInBatch(acceptedSoFar: number, maxFiles: number): boolean {
  return acceptedSoFar < maxFiles;
}
