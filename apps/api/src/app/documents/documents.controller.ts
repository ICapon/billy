import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  BankStatementsViewDto,
  CommercialViewDto,
  DocumentIdParamDto,
  DocumentsPeriodQueryDto,
  EmployeeHistoryDto,
  EmployeeKeyParamDto,
  PayrollLineViewDto,
  PayrollViewDto,
  SalesViewDto,
} from '../dto';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('bank-statements')
  @ApiOperation({
    summary: 'Bank statements with balances, flows and continuity gaps',
    description:
      'Included when the statement period ends inside the range (inclusive UTC dates). ' +
      'One entry per currency. Gaps flag an opening balance that differs from the previous ' +
      'closing balance of the same account, or days with no statement in between.',
  })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Inclusive start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Inclusive end date (YYYY-MM-DD)',
  })
  @ApiBadRequestResponse({
    description: 'Missing or malformed dates, or from after to',
  })
  @ZodResponse({ type: [BankStatementsViewDto] })
  bankStatements(@Query() query: DocumentsPeriodQueryDto) {
    return this.documents.bankStatements(query);
  }

  @Get('payroll')
  @ApiOperation({
    summary: 'Payroll totals per pay period',
    description:
      'Included when the pay period ends inside the range (inclusive UTC dates). One entry per ' +
      'currency. The total cost is the employer cost when the document states it, otherwise the ' +
      'gross total, and it is the same amount recorded as a staff expense.',
  })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Inclusive start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Inclusive end date (YYYY-MM-DD)',
  })
  @ApiBadRequestResponse({
    description: 'Missing or malformed dates, or from after to',
  })
  @ZodResponse({ type: [PayrollViewDto] })
  payroll(@Query() query: DocumentsPeriodQueryDto) {
    return this.documents.payroll(query);
  }

  // Static segments first, so `employees` is not read as a document id.
  @Get('payroll/employees/:key')
  @ApiOperation({
    summary: 'Pay history of one employee',
    description:
      'The key is the normalized `employeeKey` returned with the payroll lines.',
  })
  @ApiNotFoundResponse({ description: 'Unknown employee' })
  @ZodResponse({ type: EmployeeHistoryDto })
  employeeHistory(@Param() { key }: EmployeeKeyParamDto) {
    return this.documents.employeeHistory(key);
  }

  @Get('payroll/:documentId')
  @ApiOperation({ summary: 'Employee lines of one payroll document' })
  @ApiNotFoundResponse({ description: 'Document not found or not a payroll' })
  @ZodResponse({ type: [PayrollLineViewDto] })
  payrollLines(@Param() { documentId }: DocumentIdParamDto) {
    return this.documents.payrollLines(documentId);
  }

  @Get('commercial')
  @ApiOperation({
    summary:
      'Invoices and receipts: totals, taxes, paid or pending and top counterparties',
    description:
      'Included by issue date (inclusive UTC dates). One entry per currency and kind. Taxes ' +
      'count as 0 when a document does not state them; paid and pending only add documents ' +
      'that say so.',
  })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Inclusive start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Inclusive end date (YYYY-MM-DD)',
  })
  @ApiBadRequestResponse({
    description: 'Missing or malformed dates, or from after to',
  })
  @ZodResponse({ type: [CommercialViewDto] })
  commercial(@Query() query: DocumentsPeriodQueryDto) {
    return this.documents.commercial(query);
  }

  @Get('sales')
  @ApiOperation({
    summary:
      'Sales reports: total, units, average ticket, best products and sales over time',
    description:
      'Reports whose period ends inside the range. The series is bucketed by day (ranges up to ' +
      '31 days) or week. One entry per currency.',
  })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Inclusive start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Inclusive end date (YYYY-MM-DD)',
  })
  @ApiBadRequestResponse({
    description: 'Missing or malformed dates, or from after to',
  })
  @ZodResponse({ type: [SalesViewDto] })
  sales(@Query() query: DocumentsPeriodQueryDto) {
    return this.documents.sales(query);
  }
}
