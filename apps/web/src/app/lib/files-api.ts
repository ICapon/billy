import {
  activitySummarySchema,
  bankStatementsViewSchema,
  commercialViewSchema,
  employeeHistorySchema,
  payrollLineViewSchema,
  payrollViewSchema,
  recordsPageSchema,
  salesViewSchema,
  attentionItemsSchema,
  businessFileDetailSchema,
  costSummarySchema,
  duplicateCandidateSchema,
  filesPageSchema,
  reanalyzeEstimateSchema,
  reanalyzeResultSchema,
  productRowSchema,
  totalsRowSchema,
  transactionSchema,
  uploadResponseSchema,
  type ActivitySummary,
  type AttentionItems,
  type BankStatementsView,
  type CommercialView,
  type EmployeeHistory,
  type PayrollLineView,
  type PayrollView,
  type RecordsPage,
  type SalesView,
  type BusinessFileDetail,
  type CostSummary,
  type DuplicateCandidate,
  type Transaction,
  type TransactionUpdate,
  type DocumentType,
  type DuplicateMode,
  type ReanalyzeEstimate,
  type FilesPage,
  type FileStatus,
  type ProductRow,
  type TotalsRow,
  type TransactionCategory,
  type TransactionKind,
  type UploadResult,
} from '@org/shared';

// The browser talks to the API through the /backend proxy (apps/web/src/app/backend).
const BASE = '/backend';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readError(response: Response): Promise<ApiError> {
  let message = `Error ${response.status}`;
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (body.message) {
      message = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message;
    }
  } catch {
    // keep the generic message
  }
  return new ApiError(message, response.status);
}

async function request<T>(
  path: string,
  parse: (data: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    cache: 'no-store',
    ...init,
  });
  if (!response.ok) throw await readError(response);
  return parse(await response.json());
}

export function listFiles(
  params: {
    status?: FileStatus;
    documentType?: DocumentType | 'unclassified';
    cursor?: string;
    limit?: number;
  } = {},
): Promise<FilesPage> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.documentType) query.set('documentType', params.documentType);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));
  const suffix = query.size ? `?${query}` : '';
  return request(`/files${suffix}`, (data) => filesPageSchema.parse(data));
}

export function getFile(id: string): Promise<BusinessFileDetail> {
  return request(`/files/${id}`, (data) =>
    businessFileDetailSchema.parse(data),
  );
}

export async function deleteFile(id: string): Promise<void> {
  const response = await fetch(`${BASE}/files/${id}`, { method: 'DELETE' });
  if (!response.ok) throw await readError(response);
}

export async function retryFile(id: string): Promise<void> {
  const response = await fetch(`${BASE}/files/${id}/retry`, { method: 'POST' });
  if (!response.ok) throw await readError(response);
}

export function downloadUrl(id: string, inline = false): string {
  return `${BASE}/files/${id}/download${inline ? '?inline=1' : ''}`;
}

const json = { 'Content-Type': 'application/json' };

export function updateRecord(
  id: string,
  patch: TransactionUpdate,
): Promise<Transaction> {
  return request(`/records/${id}`, (data) => transactionSchema.parse(data), {
    method: 'PATCH',
    headers: json,
    body: JSON.stringify(patch),
  });
}

export function confirmRecord(id: string): Promise<Transaction> {
  return request(
    `/records/${id}/confirm`,
    (data) => transactionSchema.parse(data),
    {
      method: 'POST',
    },
  );
}

export async function deleteRecord(id: string): Promise<void> {
  const response = await fetch(`${BASE}/records/${id}`, { method: 'DELETE' });
  if (!response.ok) throw await readError(response);
}

export function listDuplicates(): Promise<DuplicateCandidate[]> {
  return request('/duplicates', (data) =>
    duplicateCandidateSchema.array().parse(data),
  );
}

export async function resolveDuplicate(
  id: string,
  body:
    { action: 'keep_both' } | { action: 'merge'; keepTransactionId: string },
): Promise<void> {
  const response = await fetch(`${BASE}/duplicates/${id}/resolve`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await readError(response);
}

/**
 * Uploads one file with progress. XMLHttpRequest is used because fetch cannot report upload
 * progress. A network failure rejects, so the caller can offer "retry" for that file only.
 */
export function uploadFile(
  file: File,
  options: {
    onDuplicate?: DuplicateMode;
    onProgress?: (fraction: number) => void;
  } = {},
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('onDuplicate', options.onDuplicate ?? 'skip');
    form.append('files', file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/files`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        options.onProgress?.(event.loaded / event.total);
    };
    xhr.onerror = () =>
      reject(new ApiError('No se pudo conectar con el servidor', 0));
    xhr.onload = () => {
      try {
        if (xhr.status !== 207 && xhr.status !== 200 && xhr.status !== 201) {
          throw new ApiError(`Error ${xhr.status}`, xhr.status);
        }
        const { results } = uploadResponseSchema.parse(
          JSON.parse(xhr.responseText),
        );
        const [result] = results;
        if (!result)
          throw new ApiError('Respuesta vacía del servidor', xhr.status);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    xhr.send(form);
  });
}

export interface TotalsParams {
  from: string;
  to: string;
  groupBy: 'week' | 'month';
  kind?: TransactionKind;
  category?: TransactionCategory;
}

export function getTotals(params: TotalsParams): Promise<TotalsRow[]> {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    groupBy: params.groupBy,
  });
  if (params.kind) query.set('kind', params.kind);
  if (params.category) query.set('category', params.category);
  return request(`/records/totals?${query}`, (data) =>
    totalsRowSchema.array().parse(data),
  );
}

export function getProducts(params: {
  direction: 'purchase' | 'sale';
  from: string;
  to: string;
  limit?: number;
}): Promise<ProductRow[]> {
  const { limit, ...rest } = params;
  const query = new URLSearchParams(rest);
  if (limit) query.set('limit', String(limit));
  return request(`/records/products?${query}`, (data) =>
    productRowSchema.array().parse(data),
  );
}

export function getCostSummary(month?: string): Promise<CostSummary> {
  const suffix = month ? `?month=${month}` : '';
  return request(`/costs/summary${suffix}`, (data) =>
    costSummarySchema.parse(data),
  );
}

export function getActivity(params: {
  from: string;
  to: string;
}): Promise<ActivitySummary> {
  const query = new URLSearchParams(params);
  return request(`/dashboard/activity?${query}`, (data) =>
    activitySummarySchema.parse(data),
  );
}

export function getAttention(): Promise<AttentionItems> {
  return request('/dashboard/attention', (data) =>
    attentionItemsSchema.parse(data),
  );
}

async function post(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) throw await readError(response);
  return response;
}

/** The owner corrects the type: the file is read again as that type. */
export async function updateFileType(
  id: string,
  documentType: DocumentType,
): Promise<void> {
  await post(`/files/${id}/type`, {
    method: 'PATCH',
    headers: json,
    body: JSON.stringify({ documentType }),
  });
}

export async function reanalyzeFile(id: string): Promise<void> {
  await post(`/files/${id}/reanalyze`, { method: 'POST' });
}

export function getReanalyzeEstimate(): Promise<ReanalyzeEstimate> {
  return request('/files/reanalyze/estimate?scope=unclassified', (data) =>
    reanalyzeEstimateSchema.parse(data),
  );
}

/** Returns how many files were queued. */
export async function reanalyzeAll(): Promise<number> {
  const response = await post('/files/reanalyze', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ scope: 'unclassified' }),
  });
  return reanalyzeResultSchema.parse(await response.json()).queued;
}

export function getBankStatements(params: {
  from: string;
  to: string;
}): Promise<BankStatementsView[]> {
  const query = new URLSearchParams(params);
  return request(`/documents/bank-statements?${query}`, (data) =>
    bankStatementsViewSchema.array().parse(data),
  );
}

export function getPayroll(params: {
  from: string;
  to: string;
}): Promise<PayrollView[]> {
  const query = new URLSearchParams(params);
  return request(`/documents/payroll?${query}`, (data) =>
    payrollViewSchema.array().parse(data),
  );
}

export function getPayrollLines(
  documentId: string,
): Promise<PayrollLineView[]> {
  return request(`/documents/payroll/${documentId}`, (data) =>
    payrollLineViewSchema.array().parse(data),
  );
}

export function getEmployeeHistory(
  employeeKey: string,
): Promise<EmployeeHistory> {
  return request(
    `/documents/payroll/employees/${encodeURIComponent(employeeKey)}`,
    (data) => employeeHistorySchema.parse(data),
  );
}

export function getCommercial(params: {
  from: string;
  to: string;
}): Promise<CommercialView[]> {
  const query = new URLSearchParams(params);
  return request(`/documents/commercial?${query}`, (data) =>
    commercialViewSchema.array().parse(data),
  );
}

export function getSales(params: {
  from: string;
  to: string;
}): Promise<SalesView[]> {
  const query = new URLSearchParams(params);
  return request(`/documents/sales?${query}`, (data) =>
    salesViewSchema.array().parse(data),
  );
}

/** Records behind a figure: the same filters the API accepts on `/records`. */
export function getRecords(params: {
  from?: string;
  to?: string;
  kind?: TransactionKind;
  documentType?: DocumentType;
  documentId?: string;
  limit?: number;
}): Promise<RecordsPage> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return request(`/records?${query}`, (data) => recordsPageSchema.parse(data));
}
