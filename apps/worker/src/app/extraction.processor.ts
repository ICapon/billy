import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { FILE_EXTRACTION_QUEUE, jobPayloadSchema } from '@org/shared';
import { type Job, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from './config/config.module';
import { CostGuardService } from './extraction/cost-guard.service';
import { ExtractionService } from './extraction/extraction.service';

const REQUEUE_JOB = 'requeue-limited';
const REQUEUE_SCHEDULER = 'requeue-limited-scheduler';
const REQUEUE_EVERY_MS = 60_000;

@Injectable()
export class ExtractionProcessor
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(ExtractionProcessor.name);
  private connection?: Redis;
  private worker?: Worker;
  private queue?: Queue;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly extraction: ExtractionService,
    private readonly guard: CostGuardService,
  ) {}

  onModuleInit(): void {
    this.connection = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(FILE_EXTRACTION_QUEUE, {
      connection: this.connection,
    });
    // One shared schedule (BullMQ keeps a single copy even with several workers).
    void this.queue.upsertJobScheduler(
      REQUEUE_SCHEDULER,
      { every: REQUEUE_EVERY_MS },
      { name: REQUEUE_JOB },
    );
    this.worker = new Worker(
      FILE_EXTRACTION_QUEUE,
      (job) => this.process(job),
      {
        connection: this.connection,
        concurrency: 2,
      },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.error(`Job ${job?.id} failed: ${error.message}`),
    );
    this.logger.log(`Consuming queue "${FILE_EXTRACTION_QUEUE}"`);
  }

  async process(job: Job): Promise<void> {
    if (job.name === REQUEUE_JOB) {
      const released = await this.guard.releaseQueued((id) => this.enqueue(id));
      if (released > 0)
        this.logger.log(`Released ${released} file(s) waiting for budget`);
      return;
    }
    const { fileId } = jobPayloadSchema.parse(job.data);
    this.logger.log(`Received extraction job for file ${fileId}`);
    await this.extraction.process(fileId);
  }

  private async enqueue(fileId: string): Promise<void> {
    const queue = this.queue;
    if (!queue) return;
    const existing = await queue.getJob(fileId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active' || state === 'waiting' || state === 'delayed')
        return;
      await existing.remove();
    }
    await queue.add(
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
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
