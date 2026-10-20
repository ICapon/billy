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
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { reanalyzeScopes } from '@org/shared';
import type { Request, Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { RepositoriesService } from '../database/repositories.service';
import {
  BusinessFileDetailDto,
  DownloadQueryDto,
  FilesPageDto,
  FilesQueryDto,
  IdParamDto,
  ReanalyzeEstimateDto,
  ReanalyzeResultDto,
  ReanalyzeScopeDto,
  SetFileTypeDto,
  UploadResponseDto,
} from '../dto';
import { toFileDocument } from '../documents/documents.mapper';
import { toTransaction } from '../records/records.mapper';
import { StorageService } from '../storage/storage.service';
import { toBusinessFile } from './files.mapper';
import { FilesService } from './files.service';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly repos: RepositoriesService,
    private readonly storage: StorageService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Upload one or more files (multipart)',
    description:
      'Respects MAX_FILE_SIZE_MB per file and MAX_FILES_PER_BATCH files. Valid files are ' +
      'accepted even if others fail. Duplicates are reported per file as outcome=duplicate ' +
      'inside the 207 response unless onDuplicate=keep.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        onDuplicate: {
          type: 'string',
          enum: ['skip', 'keep'],
          default: 'skip',
          description:
            'What to do with files already uploaded (same content hash)',
        },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
      required: ['files'],
    },
  })
  @HttpCode(207)
  @ZodResponse({
    status: 207,
    description: 'Per-file outcomes',
    type: UploadResponseDto,
  })
  async upload(@Req() req: Request) {
    return { results: await this.files.upload(req) };
  }

  @Get()
  @ApiOperation({ summary: 'List files, newest first' })
  @ZodResponse({ type: FilesPageDto })
  list(@Query() query: FilesQueryDto) {
    return this.files.list(query);
  }

  // Static routes first, so they are not read as `:id`.
  @Get('reanalyze/estimate')
  @ApiOperation({
    summary: 'Estimate a bulk re-analysis',
    description:
      "Number of files without a document type and a rough cost (this month's average per " +
      'file, or a default), with the limit and the budget left.',
  })
  @ApiQuery({ name: 'scope', required: true, enum: reanalyzeScopes })
  @ZodResponse({ type: ReanalyzeEstimateDto })
  reanalyzeEstimate(@Query() _query: ReanalyzeScopeDto) {
    return this.files.reanalyzeEstimate();
  }

  @Post('reanalyze')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Re-analyze all files of a scope',
    description:
      'Files go through the normal queue, so the monthly cost limit applies: files over the ' +
      'limit wait as "queued_limit".',
  })
  @ZodResponse({ status: 202, type: ReanalyzeResultDto })
  async reanalyzeAll(@Body() _body: ReanalyzeScopeDto) {
    return { queued: await this.files.reanalyzeUnclassified() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'File detail with its extracted records' })
  @ApiNotFoundResponse({ description: 'File not found' })
  @ZodResponse({ type: BusinessFileDetailDto })
  async get(@Param() { id }: IdParamDto) {
    const row = await this.files.get(id);
    const [records, documents] = await Promise.all([
      this.repos.records.listByFile(id),
      this.repos.documents.listByFile(id),
    ]);
    const lines = await this.repos.documents.payrollLinesFor(
      documents.map((d) => d.id),
    );
    return {
      ...toBusinessFile(row),
      records: records.map(toTransaction),
      documents: documents.map((document) =>
        toFileDocument(
          document,
          lines.filter((line) => line.documentId === document.id),
        ),
      ),
    };
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Stream the original file',
    description:
      'Add ?inline=1 to display it in the browser instead of downloading it.',
  })
  @ApiOkResponse({ description: 'File bytes' })
  @ApiNotFoundResponse({ description: 'File not found' })
  async download(
    @Param() { id }: IdParamDto,
    @Query() { inline }: DownloadQueryDto,
    @Res() res: Response,
  ) {
    const row = await this.files.get(id);
    const stream = await this.storage.getStream(row.storageKey);
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Content-Length', String(row.sizeBytes));
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
    );
    stream.pipe(res);
  }

  @Patch(':id/type')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Correct the document type of a file',
    description:
      'Marks the type as chosen by the owner and reads the file again as that type. ' +
      'Confirmed records are kept.',
  })
  @ApiAcceptedResponse({ description: 'The file was queued again' })
  @ApiNotFoundResponse({ description: 'File not found' })
  @ApiConflictResponse({ description: 'The file is being processed right now' })
  async setType(
    @Param() { id }: IdParamDto,
    @Body() body: SetFileTypeDto,
  ): Promise<void> {
    await this.files.setType(id, body.documentType);
  }

  @Post(':id/reanalyze')
  @HttpCode(202)
  @ApiOperation({ summary: 'Re-analyze one finished file' })
  @ApiAcceptedResponse({ description: 'The file was queued again' })
  @ApiNotFoundResponse({ description: 'File not found' })
  @ApiConflictResponse({
    description: 'The file is already waiting or being processed',
  })
  async reanalyze(@Param() { id }: IdParamDto): Promise<void> {
    await this.files.reanalyze(id);
  }

  @Post(':id/retry')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Re-queue a failed or needs-review file for processing',
    description: 'Records the owner already confirmed are kept.',
  })
  @ApiAcceptedResponse({ description: 'The file was queued again' })
  @ApiNotFoundResponse({ description: 'File not found' })
  @ApiConflictResponse({ description: 'The file is not in a retryable state' })
  async retry(@Param() { id }: IdParamDto): Promise<void> {
    await this.files.retry(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Permanently delete a file, its content and derived records',
  })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'File not found' })
  async remove(@Param() { id }: IdParamDto): Promise<void> {
    await this.files.delete(id);
  }
}
