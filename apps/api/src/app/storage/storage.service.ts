import { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.module';

/** Keeps object keys safe and readable: `owner/yyyy/mm/<id>-<name>`. */
export function buildStorageKey(
  ownerId: string,
  id: string,
  originalName: string,
  now: Date = new Date(),
): string {
  const safeName =
    originalName
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^[._]+/, '')
      .slice(-100) || 'file';
  const owner = ownerId.replace(/[^A-Za-z0-9_-]+/g, '_');
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${owner}/${now.getUTCFullYear()}/${month}/${id}-${safeName}`;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.bucket = config.s3.bucket;
    // Only S3-compatible features: SeaweedFS is the local S3.
    this.client = new S3Client({
      endpoint: config.s3.endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.s3.accessKey,
        secretAccessKey: config.s3.secretKey,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`Created bucket ${this.bucket}`);
      } catch (error) {
        this.logger.error(
          `Bucket ${this.bucket} is not available: ${(error as Error).message}`,
        );
      }
    }
  }

  /** Starts a streaming (multipart when large) upload. Call `abort()` to cancel. */
  startUpload(key: string, body: Readable, contentType: string): Upload {
    return new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
    });
  }

  async getStream(key: string): Promise<Readable> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return result.Body as Readable;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
