import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { DuplicateCandidateDto, IdParamDto, ResolveDuplicateDto } from '../dto';
import { DuplicatesService } from './duplicates.service';

@ApiTags('duplicates')
@Controller('duplicates')
export class DuplicatesController {
  constructor(private readonly duplicates: DuplicatesService) {}

  @Get()
  @ApiOperation({
    summary: 'Pairs of records that look like the same transaction',
  })
  @ZodResponse({ type: [DuplicateCandidateDto] })
  list() {
    return this.duplicates.listPending();
  }

  @Post(':id/resolve')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Keep both records or merge them',
    description:
      'A merge keeps one record and excludes the other from totals. Nothing is merged without this call.',
  })
  @ApiNoContentResponse({ description: 'Resolved' })
  @ApiNotFoundResponse({ description: 'Pair not found' })
  @ApiConflictResponse({ description: 'Pair already resolved' })
  @ApiBadRequestResponse({
    description: 'keepTransactionId is not part of the pair',
  })
  async resolve(
    @Param() { id }: IdParamDto,
    @Body() body: ResolveDuplicateDto,
  ): Promise<void> {
    await this.duplicates.resolve(id, body);
  }
}
