import {
  businessFileDetailSchema,
  businessFileSchema,
  costSummarySchema,
  costsQuerySchema,
  duplicateCandidateSchema,
  filesPageSchema,
  filesQuerySchema,
  productRowSchema,
  productsQuerySchema,
  recordsPageSchema,
  recordsQuerySchema,
  resolveDuplicateSchema,
  totalsQuerySchema,
  totalsRowSchema,
  transactionSchema,
  transactionUpdateSchema,
  uploadResponseSchema,
} from '@org/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** DTOs are generated from the shared zod schemas: validation, types and OpenAPI stay in sync. */
export class IdParamDto extends createZodDto(z.object({ id: z.uuid() })) {}

export class DownloadQueryDto extends createZodDto(
  z.object({ inline: z.enum(['1', 'true']).optional() }),
) {}

export class BusinessFileDto extends createZodDto(businessFileSchema) {}
export class BusinessFileDetailDto extends createZodDto(
  businessFileDetailSchema,
) {}
export class FilesQueryDto extends createZodDto(filesQuerySchema) {}
export class FilesPageDto extends createZodDto(filesPageSchema) {}
export class UploadResponseDto extends createZodDto(uploadResponseSchema) {}

export class TransactionDto extends createZodDto(transactionSchema) {}
export class TransactionUpdateDto extends createZodDto(
  transactionUpdateSchema,
) {}
export class RecordsQueryDto extends createZodDto(recordsQuerySchema) {}
export class RecordsPageDto extends createZodDto(recordsPageSchema) {}
export class TotalsQueryDto extends createZodDto(totalsQuerySchema) {}
export class TotalsRowDto extends createZodDto(totalsRowSchema) {}
export class ProductsQueryDto extends createZodDto(productsQuerySchema) {}
export class ProductRowDto extends createZodDto(productRowSchema) {}

export class DuplicateCandidateDto extends createZodDto(
  duplicateCandidateSchema,
) {}
export class ResolveDuplicateDto extends createZodDto(resolveDuplicateSchema) {}

export class CostsQueryDto extends createZodDto(costsQuerySchema) {}
export class CostSummaryDto extends createZodDto(costSummarySchema) {}
