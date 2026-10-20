import { z } from 'zod';

export const documentTypes = [
  'bank_statement',
  'payroll',
  'invoice',
  'receipt',
  'sales_report',
  'other',
] as const;
export const documentTypeSchema = z.enum(documentTypes);
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const consistencyStates = ['ok', 'inconsistent', 'unchecked'] as const;
export const consistencySchema = z.enum(consistencyStates);
export type Consistency = z.infer<typeof consistencySchema>;
