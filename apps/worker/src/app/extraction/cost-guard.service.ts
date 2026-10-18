import { Inject, Injectable } from '@nestjs/common';
import { CostLimitReachedError } from '@org/ai';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { RepositoriesService } from '../database/repositories.service';

/**
 * Enforces the optional monthly processing budget (research R6). The check happens before
 * each paid call and cannot know that call's cost, so the limit is soft by at most one call.
 */
@Injectable()
export class CostGuardService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly repos: RepositoriesService,
  ) {}

  async isLimitReached(): Promise<boolean> {
    const limit = this.config.costLimitMicroUsd;
    if (limit === null) return false;
    return (await this.repos.costs.monthToDate()) >= limit;
  }

  async assertCanSpend(): Promise<void> {
    if (await this.isLimitReached()) throw new CostLimitReachedError();
  }

  /**
   * Hands files waiting for budget back to the pipeline once the limit allows spending again
   * (the owner raised it, or a new month started). Returns how many files were released.
   */
  async releaseQueued(
    enqueue: (fileId: string) => Promise<void>,
  ): Promise<number> {
    if (await this.isLimitReached()) return 0;
    const waiting = await this.repos.files.listByStatus('queued_limit');
    for (const file of waiting) {
      await this.repos.files.update(file.id, {
        status: 'received',
        failureReason: null,
      });
      await enqueue(file.id);
    }
    return waiting.length;
  }
}
