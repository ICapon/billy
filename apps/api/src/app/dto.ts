import {
  chatStatusSchema,
  conversationDetailSchema,
  conversationSchema,
  conversationsPageSchema,
  conversationsQuerySchema,
  sendMessageResultSchema,
  sendMessageSchema,
  bankStatementsViewSchema,
  commercialViewSchema,
  salesViewSchema,
  employeeHistorySchema,
  payrollLineViewSchema,
  payrollViewSchema,
  activityQuerySchema,
  activitySummarySchema,
  attentionItemsSchema,
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
  reanalyzeEstimateSchema,
  reanalyzeResultSchema,
  reanalyzeScopeSchema,
  setFileTypeSchema,
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

export class SetFileTypeDto extends createZodDto(setFileTypeSchema) {}
export class ReanalyzeScopeDto extends createZodDto(reanalyzeScopeSchema) {}
export class ReanalyzeEstimateDto extends createZodDto(
  reanalyzeEstimateSchema,
) {}
export class ReanalyzeResultDto extends createZodDto(reanalyzeResultSchema) {}

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

export class ActivityQueryDto extends createZodDto(activityQuerySchema) {}
export class ActivitySummaryDto extends createZodDto(activitySummarySchema) {}
export class AttentionItemsDto extends createZodDto(attentionItemsSchema) {}

/** Period (inclusive UTC dates) shared by the document views. */
export class DocumentsPeriodQueryDto extends createZodDto(
  activityQuerySchema,
) {}
export class BankStatementsViewDto extends createZodDto(
  bankStatementsViewSchema,
) {}

export class CommercialViewDto extends createZodDto(commercialViewSchema) {}
export class SalesViewDto extends createZodDto(salesViewSchema) {}
export class PayrollViewDto extends createZodDto(payrollViewSchema) {}
export class PayrollLineViewDto extends createZodDto(payrollLineViewSchema) {}
export class EmployeeHistoryDto extends createZodDto(employeeHistorySchema) {}
export class EmployeeKeyParamDto extends createZodDto(
  z.object({ key: z.string().min(1).max(200) }),
) {}
export class DocumentIdParamDto extends createZodDto(
  z.object({ documentId: z.uuid() }),
) {}

export class CostsQueryDto extends createZodDto(costsQuerySchema) {}
export class CostSummaryDto extends createZodDto(costSummarySchema) {}

export class ChatStatusDto extends createZodDto(chatStatusSchema) {}
export class ConversationDto extends createZodDto(conversationSchema) {}
export class ConversationDetailDto extends createZodDto(
  conversationDetailSchema,
) {}
export class ConversationsQueryDto extends createZodDto(
  conversationsQuerySchema,
) {}
export class ConversationsPageDto extends createZodDto(
  conversationsPageSchema,
) {}
export class SendMessageDto extends createZodDto(sendMessageSchema) {}
export class SendMessageResultDto extends createZodDto(
  sendMessageResultSchema,
) {}
