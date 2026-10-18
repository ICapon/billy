import { createHash, randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Upload } from '@aws-sdk/lib-storage';
import type { BusinessFileRow } from '@org/db';
import {
  duplicateModeSchema,
  type DuplicateMode,
  type FilesPage,
  type FilesQuery,
  type UploadResult,
} from '@org/shared';
import busboy from 'busboy';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { RepositoriesService } from '../database/repositories.service';
import { QueueService } from '../queue/queue.service';
import { buildStorageKey, StorageService } from '../storage/storage.service';
import { toBusinessFile } from './files.mapper';
import {
  fitsInBatch,
  rejectBatchLimit,
  rejectEmpty,
  rejectTooLarge,
  rejectUnsupportedType,
  resolveMimeType,
  type UploadRejection,
} from './upload-validation';

/** Hard cap on multipart parts, to bound work on abusive requests. */
const MAX_PARTS = 200;

interface IncomingFile {
  name: string;
  rejection: UploadRejection | null;
  id: string;
  key: string;
  mime: string;
  size: number;
  hash: string;
  truncated: boolean;
  upload: Promise<void> | null;
  failed: boolean;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly repos: RepositoriesService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
  ) {}

  /**
   * Streams every file of a multipart request to storage while hashing it, then registers
   * the valid ones. Invalid files are rejected individually and never block the others.
   */
  async upload(req: Request): Promise<UploadResult[]> {
    const { files, mode } = await this.receive(req);
    const results: UploadResult[] = [];

    let registered = 0;
    for (const incoming of files) {
      const result = await this.register(incoming, mode, registered);
      if (result.outcome === 'accepted') registered += 1;
      results.push(result);
    }
    return results;
  }

  private receive(
    req: Request,
  ): Promise<{ files: IncomingFile[]; mode: DuplicateMode }> {
    return new Promise((resolve, reject) => {
      let parser: busboy.Busboy;
      try {
        parser = busboy({
          headers: req.headers,
          limits: {
            files: MAX_PARTS,
            fields: 10,
            fieldSize: 1024,
            parts: MAX_PARTS + 10,
            fileSize: this.config.maxFileSizeBytes,
          },
        });
      } catch {
        reject(new NotFoundException('Expected a multipart/form-data request'));
        return;
      }

      const files: IncomingFile[] = [];
      let mode: DuplicateMode = 'skip';
      let accepted = 0;

      parser.on('field', (name, value) => {
        if (name === 'onDuplicate') {
          const parsed = duplicateModeSchema.safeParse(value);
          if (parsed.success) mode = parsed.data;
        }
      });

      parser.on('file', (_field, stream, info) => {
        const name = info.filename || 'file';
        const id = randomUUID();
        const incoming: IncomingFile = {
          name,
          rejection: null,
          id,
          key: buildStorageKey(this.config.ownerId, id, name),
          mime: '',
          size: 0,
          hash: '',
          truncated: false,
          upload: null,
          failed: false,
        };
        files.push(incoming);

        const mime = resolveMimeType(name, info.mimeType);
        if (!mime) {
          incoming.rejection = rejectUnsupportedType(name);
          stream.resume();
          return;
        }
        // Slack of 2x: oversize or empty files are only known after streaming and must not
        // use up a slot. The real limit is enforced in register().
        if (!fitsInBatch(accepted, this.config.maxFilesPerBatch * 2)) {
          incoming.rejection = rejectBatchLimit(this.config.maxFilesPerBatch);
          stream.resume();
          return;
        }
        accepted += 1;
        incoming.mime = mime;

        const digest = createHash('sha256');
        const body = new PassThrough();
        stream.on('data', (chunk: Buffer) => {
          digest.update(chunk);
          incoming.size += chunk.length;
        });
        stream.on('limit', () => {
          incoming.truncated = true;
        });
        stream.on('end', () => {
          incoming.hash = digest.digest('hex');
        });
        stream.pipe(body);

        const upload: Upload = this.storage.startUpload(
          incoming.key,
          body,
          mime,
        );
        incoming.upload = upload.done().then(
          () => undefined,
          (error: Error) => {
            incoming.failed = true;
            // file names can be sensitive (e.g. payroll): log the id only
            this.logger.error(`Upload of file ${id} failed: ${error.message}`);
          },
        );
      });

      parser.on('error', reject);
      parser.on('close', () => {
        Promise.all(files.map((f) => f.upload))
          .then(() => resolve({ files, mode }))
          .catch(reject);
      });
      req.on('error', reject);
      req.pipe(parser);
    });
  }

  private async register(
    incoming: IncomingFile,
    mode: DuplicateMode,
    registeredSoFar: number,
  ): Promise<UploadResult> {
    const rejected = (rejection: UploadRejection): UploadResult => ({
      name: incoming.name,
      outcome: 'rejected',
      reason: rejection.message,
      file: null,
      existingFileId: null,
    });

    if (incoming.rejection) return rejected(incoming.rejection);

    if (incoming.truncated) {
      await this.discard(incoming.key);
      return rejected(rejectTooLarge(this.config.maxFileSizeBytes));
    }
    if (incoming.failed) {
      await this.discard(incoming.key);
      return rejected({
        reason: 'empty',
        message: 'The file could not be stored, please try again',
      });
    }
    if (incoming.size === 0) {
      await this.discard(incoming.key);
      return rejected(rejectEmpty());
    }

    if (!fitsInBatch(registeredSoFar, this.config.maxFilesPerBatch)) {
      await this.discard(incoming.key);
      return rejected(rejectBatchLimit(this.config.maxFilesPerBatch));
    }

    const existing = await this.repos.files.findBySha256(incoming.hash);
    if (existing && mode === 'skip') {
      await this.discard(incoming.key);
      return {
        name: incoming.name,
        outcome: 'duplicate',
        reason: 'This file was already uploaded',
        file: null,
        existingFileId: existing.id,
      };
    }

    const row = await this.repos.files.insert({
      id: incoming.id,
      originalName: incoming.name.slice(0, 255),
      mimeType: incoming.mime,
      sizeBytes: incoming.size,
      sha256: incoming.hash,
      storageKey: incoming.key,
      duplicateOf: existing?.id ?? null,
    });

    try {
      await this.queue.enqueueExtraction(row.id);
    } catch (error) {
      // The file stays "received"; a retry re-enqueues it.
      this.logger.error(
        `Could not enqueue file ${row.id}: ${(error as Error).message}`,
      );
    }

    return {
      name: incoming.name,
      outcome: 'accepted',
      reason: null,
      file: toBusinessFile(row),
      existingFileId: null,
    };
  }

  private async discard(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn(`Could not remove ${key}: ${(error as Error).message}`);
    }
  }

  async list(query: FilesQuery): Promise<FilesPage> {
    const page = await this.repos.files.list(query);
    return {
      items: page.items.map(toBusinessFile),
      nextCursor: page.nextCursor,
    };
  }

  async get(id: string): Promise<BusinessFileRow> {
    const row = await this.repos.files.findById(id);
    if (!row) throw new NotFoundException('File not found');
    return row;
  }

  /** Re-queues a failed or needs-review file. Confirmed records survive the re-run. */
  async retry(id: string): Promise<void> {
    const row = await this.get(id);
    if (row.status !== 'failed' && row.status !== 'needs_review') {
      throw new ConflictException(
        `Only failed or needs-review files can be retried (current status: ${row.status})`,
      );
    }
    await this.repos.files.update(id, {
      status: 'received',
      failureReason: null,
    });
    await this.queue.enqueueExtraction(id);
  }

  async delete(id: string): Promise<void> {
    const row = await this.repos.files.delete(id);
    if (!row) throw new NotFoundException('File not found');
    await this.discard(row.storageKey);
  }
}
