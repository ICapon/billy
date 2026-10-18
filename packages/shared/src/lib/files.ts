import { z } from 'zod';

export const fileStatuses = [
  'received',
  'queued_limit',
  'processing',
  'completed',
  'needs_review',
  'failed',
] as const;
export const fileStatusSchema = z.enum(fileStatuses);
export type FileStatus = z.infer<typeof fileStatusSchema>;

export const readingMethods = ['digital', 'ocr', 'vision'] as const;
export const readingMethodSchema = z.enum(readingMethods);
export type ReadingMethod = z.infer<typeof readingMethodSchema>;

export const allowedMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;
export type AllowedMimeType = (typeof allowedMimeTypes)[number];

export const MAX_FILE_NAME_LENGTH = 255;
export const DEFAULT_MAX_FILE_SIZE_MB = 20;
export const DEFAULT_MAX_FILES_PER_BATCH = 20;

export const businessFileSchema = z.object({
  id: z.uuid(),
  originalName: z.string().min(1).max(MAX_FILE_NAME_LENGTH),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  status: fileStatusSchema,
  failureReason: z.string().nullable(),
  readingMethod: readingMethodSchema.nullable(),
  totalCostMicroUsd: z.number().int().nonnegative(),
  duplicateOf: z.uuid().nullable(),
  uploadedAt: z.iso.datetime(),
});
export type BusinessFile = z.infer<typeof businessFileSchema>;

export const duplicateModeSchema = z.enum(['skip', 'keep']);
export type DuplicateMode = z.infer<typeof duplicateModeSchema>;

export const uploadOutcomes = ['accepted', 'rejected', 'duplicate'] as const;
export const uploadResultSchema = z.object({
  name: z.string(),
  outcome: z.enum(uploadOutcomes),
  reason: z.string().nullable(),
  file: businessFileSchema.nullable(),
  existingFileId: z.uuid().nullable(),
});
export type UploadResult = z.infer<typeof uploadResultSchema>;

export const uploadResponseSchema = z.object({
  results: z.array(uploadResultSchema),
});
export type UploadResponse = z.infer<typeof uploadResponseSchema>;

export const filesQuerySchema = z.object({
  status: fileStatusSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type FilesQuery = z.infer<typeof filesQuerySchema>;

export const filesPageSchema = z.object({
  items: z.array(businessFileSchema),
  nextCursor: z.string().nullable(),
});
export type FilesPage = z.infer<typeof filesPageSchema>;
