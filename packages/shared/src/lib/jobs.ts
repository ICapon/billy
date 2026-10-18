import { z } from 'zod';

export const FILE_EXTRACTION_QUEUE = 'file-extraction';

export const jobPayloadSchema = z.object({
  fileId: z.uuid(),
});
export type FileExtractionJob = z.infer<typeof jobPayloadSchema>;
