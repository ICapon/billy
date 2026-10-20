import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  bankStatementDetailsSchema,
  bucketFor,
  buildBankStatementsView,
  buildCommercialView,
  buildEmployeeHistory,
  buildPayrollView,
  buildSalesView,
  commercialDetailsSchema,
  payrollDetailsSchema,
  salesReportDetailsSchema,
  type ActivityQuery,
  type BankStatementDocument,
  type BankStatementsView,
  type CommercialDocument,
  type CommercialView,
  type EmployeeHistory,
  type PayrollDocument,
  type PayrollLineView,
  type PayrollView,
  type SalesView,
} from '@org/shared';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { RepositoriesService } from '../database/repositories.service';

/** Read-only views per document type (bank statements, payroll, invoices and receipts, sales). */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly repos: RepositoriesService,
    @Inject(APP_CONFIG) readonly config: AppConfig,
  ) {}

  /** Statements whose period ends inside the range; rows with unreadable details are skipped. */
  async bankStatements(period: ActivityQuery): Promise<BankStatementsView[]> {
    const rows = await this.repos.documents.listByType(
      'bank_statement',
      period,
    );
    const documents: BankStatementDocument[] = [];
    for (const row of rows) {
      const details = bankStatementDetailsSchema.safeParse(row.details);
      if (!details.success || !row.periodEnd) {
        this.logger.warn(
          `document=${row.id} skipped: unreadable bank statement details`,
        );
        continue;
      }
      documents.push({
        documentId: row.id,
        fileId: row.fileId,
        currency: row.currency,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        details: details.data,
        consistency: row.consistency,
        notes: row.consistencyNotes,
      });
    }
    return buildBankStatementsView(documents);
  }

  /** Pay periods whose period ends inside the range, with the employer cost per period. */
  async payroll(period: ActivityQuery): Promise<PayrollView[]> {
    const rows = await this.repos.documents.listByType('payroll', period);
    const documents: PayrollDocument[] = [];
    for (const row of rows) {
      const details = payrollDetailsSchema.safeParse(row.details);
      if (!details.success || !row.periodEnd) {
        this.logger.warn(
          `document=${row.id} skipped: unreadable payroll details`,
        );
        continue;
      }
      documents.push({
        documentId: row.id,
        fileId: row.fileId,
        currency: row.currency,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        details: details.data,
        consistency: row.consistency,
      });
    }
    return buildPayrollView(documents);
  }

  /** The employee lines of one payroll document. */
  async payrollLines(documentId: string): Promise<PayrollLineView[]> {
    const document = await this.repos.documents.findById(documentId);
    if (!document || document.type !== 'payroll') {
      throw new NotFoundException('Payroll document not found');
    }
    const lines = await this.repos.documents.payrollLines(documentId);
    return lines.map((line) => ({
      employeeKey: line.employeeKey,
      employeeName: line.employeeName,
      grossMinor: line.grossMinor,
      deductionsMinor: line.deductionsMinor,
      netMinor: line.netMinor,
    }));
  }

  /** Every period an employee appears in; the key is the normalized employee key. */
  async employeeHistory(employeeKey: string): Promise<EmployeeHistory> {
    const rows = await this.repos.documents.employeeHistory(employeeKey);
    const history = buildEmployeeHistory(
      rows.flatMap(({ line, document }) =>
        document.periodEnd
          ? [
              {
                employeeKey: line.employeeKey,
                employeeName: line.employeeName,
                documentId: document.id,
                currency: document.currency,
                periodStart: document.periodStart,
                periodEnd: document.periodEnd,
                grossMinor: line.grossMinor,
                deductionsMinor: line.deductionsMinor,
                netMinor: line.netMinor,
              },
            ]
          : [],
      ),
    );
    if (!history) throw new NotFoundException('Employee not found');
    return history;
  }

  /** Invoices and receipts placed by issue date, one entry per currency and kind. */
  async commercial(period: ActivityQuery): Promise<CommercialView[]> {
    const rows = await this.repos.documents.listByType(
      ['invoice', 'receipt'],
      period,
    );
    const documents: CommercialDocument[] = [];
    for (const row of rows) {
      const details = commercialDetailsSchema.safeParse(row.details);
      if (
        !details.success ||
        (row.type !== 'invoice' && row.type !== 'receipt')
      ) {
        this.logger.warn(
          `document=${row.id} skipped: unreadable invoice/receipt details`,
        );
        continue;
      }
      documents.push({
        type: row.type,
        currency: row.currency,
        details: details.data,
      });
    }
    return buildCommercialView(documents);
  }

  /** Sales reports whose period ends inside the range, with best products and a series. */
  async sales(period: ActivityQuery): Promise<SalesView[]> {
    const [rows, products, daily] = await Promise.all([
      this.repos.documents.listByType('sales_report', period),
      this.repos.documents.salesProducts(period),
      this.repos.documents.salesDaily(period),
    ]);
    const documents = rows.flatMap((row) => {
      const details = salesReportDetailsSchema.safeParse(row.details);
      if (!details.success) {
        this.logger.warn(
          `document=${row.id} skipped: unreadable sales report details`,
        );
        return [];
      }
      return [{ currency: row.currency, details: details.data }];
    });
    return buildSalesView({
      documents,
      products,
      daily,
      bucket: bucketFor(period),
      weekStart: this.config.weekStart,
    });
  }
}
