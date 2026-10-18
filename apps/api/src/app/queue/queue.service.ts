import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { FILE_EXTRACTION_QUEUE, type FileExtractionJob } from '@org/shared';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config.module';

@Injectable()
export class QueueService implements OnApplicationShutdown {
  private readonly connection: Redis;
  private readonly queue: Queue<FileExtractionJob>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.connection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<FileExtractionJob>(FILE_EXTRACTION_QUEUE, {
      connection: this.connection,
    });
  }

  /**
   * Enqueues extraction for a file. The job id is the file id, so a finished or failed job
   * that still exists is removed first to allow a retry.
   */
  async enqueueExtraction(fileId: string): Promise<void> {
    const existing = await this.queue.getJob(fileId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active' || state === 'waiting' || state === 'delayed')
        return;
      await existing.remove();
    }
    await this.queue.add(
      'extract',
      { fileId },
      {
        jobId: fileId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
