import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  ActivityQueryDto,
  ActivitySummaryDto,
  AttentionItemsDto,
} from '../dto';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('activity')
  @ApiOperation({
    summary: 'File activity for a period',
    description:
      'Counts the files uploaded inside the period (inclusive UTC dates) by state, with the ' +
      'success rate (completed / finished), the average analysis time and a zero-filled series ' +
      'of uploads and finished analyses, bucketed by day (periods up to 31 days) or week.',
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
  @ZodResponse({ type: ActivitySummaryDto })
  activity(@Query() query: ActivityQueryDto) {
    return this.dashboard.activity(query);
  }

  @Get('attention')
  @ApiOperation({
    summary: "Items that need the owner's attention",
    description:
      'Not period based: files in review, failed or waiting for budget, pending duplicate ' +
      'pairs and the unconfirmed amount per currency (same exclusions as the totals).',
  })
  @ZodResponse({ type: AttentionItemsDto })
  attention() {
    return this.dashboard.attention();
  }
}
