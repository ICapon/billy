import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { CostsQueryDto, CostSummaryDto } from '../dto';
import { CostsService } from './costs.service';

@ApiTags('costs')
@Controller('costs')
export class CostsController {
  constructor(private readonly costs: CostsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Processing cost for a month and the limit status',
    description:
      'Amounts are in micro-USD (1,000,000 = 1 USD). byTier counts files per reading method, ' +
      'so the share read with the cheapest methods is visible.',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    description: 'YYYY-MM, defaults to the current month',
  })
  @ZodResponse({ type: CostSummaryDto })
  summary(@Query() { month }: CostsQueryDto) {
    return this.costs.summary(month);
  }
}
