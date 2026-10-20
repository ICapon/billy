import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  documentTypes,
  groupByValues,
  lineDirections,
  transactionCategories,
  transactionKinds,
} from '@org/shared';
import { ZodResponse } from 'nestjs-zod';
import {
  IdParamDto,
  ProductRowDto,
  ProductsQueryDto,
  RecordsPageDto,
  RecordsQueryDto,
  TotalsQueryDto,
  TotalsRowDto,
  TransactionDto,
  TransactionUpdateDto,
} from '../dto';
import { RecordsService } from './records.service';

@ApiTags('records')
@Controller('records')
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get()
  @ApiOperation({
    summary: 'List records, newest first',
    description:
      'Filter by date range, kind, category, file or product name (contains).',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Inclusive start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Inclusive end date (YYYY-MM-DD)',
  })
  @ApiQuery({ name: 'kind', required: false, enum: transactionKinds })
  @ApiQuery({ name: 'category', required: false, enum: transactionCategories })
  @ApiQuery({
    name: 'product',
    required: false,
    description: 'Case-insensitive match on line item product name',
  })
  @ApiQuery({ name: 'fileId', required: false })
  @ApiQuery({ name: 'documentType', required: false, enum: documentTypes })
  @ApiQuery({ name: 'documentId', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size (1-200, default 50)',
  })
  @ZodResponse({ type: RecordsPageDto })
  list(@Query() query: RecordsQueryDto) {
    return this.records.list(query);
  }

  @Get('totals')
  @ApiOperation({
    summary: 'Totals grouped by week or month',
    description:
      'Per bucket, kind and category, with the confirmed and unconfirmed parts. Excludes ' +
      'records of files in needs_review and merged duplicates. Weeks start on BUSINESS_WEEK_START ' +
      '(Monday by default). Use category=staff for the staff expense breakdown.',
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
  @ApiQuery({ name: 'groupBy', required: true, enum: groupByValues })
  @ApiQuery({ name: 'kind', required: false, enum: transactionKinds })
  @ApiQuery({ name: 'category', required: false, enum: transactionCategories })
  @ZodResponse({ type: [TotalsRowDto] })
  totals(@Query() query: TotalsQueryDto) {
    return this.records.totals(query);
  }

  @Get('products')
  @ApiOperation({
    summary: 'Purchased or sold products',
    description:
      'Aggregated by product. Same exclusions as the totals endpoint.',
  })
  @ApiQuery({ name: 'direction', required: true, enum: lineDirections })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Inclusive start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Inclusive end date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Keep only the N products with the largest totals (1-100)',
  })
  @ZodResponse({ type: [ProductRowDto] })
  products(@Query() query: ProductsQueryDto) {
    return this.records.products(query);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Correct a record; it is marked as confirmed',
    description:
      'When every record of a file in review is confirmed, the file becomes completed.',
  })
  @ApiNotFoundResponse({ description: 'Record not found' })
  @ZodResponse({ type: TransactionDto })
  update(@Param() { id }: IdParamDto, @Body() body: TransactionUpdateDto) {
    return this.records.update(id, body);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm a record as extracted' })
  @ApiNotFoundResponse({ description: 'Record not found' })
  @ZodResponse({ type: TransactionDto })
  confirm(@Param() { id }: IdParamDto) {
    return this.records.confirm(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a record' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Record not found' })
  async remove(@Param() { id }: IdParamDto): Promise<void> {
    await this.records.delete(id);
  }
}
