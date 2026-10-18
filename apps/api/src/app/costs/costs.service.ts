import { Inject, Injectable } from '@nestjs/common';
import { currentMonth } from '@org/db';
import { readingMethods, type CostSummary } from '@org/shared';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { RepositoriesService } from '../database/repositories.service';

@Injectable()
export class CostsService {
  constructor(
    private readonly repos: RepositoriesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async summary(month: string = currentMonth()): Promise<CostSummary> {
    const [total, byKind, filesWithCost, tiers] = await Promise.all([
      this.repos.costs.monthToDate(month),
      this.repos.costs.byKind(month),
      this.repos.costs.filesWithCost(month),
      this.repos.files.countByTier(),
    ]);
    const limit = this.config.costLimitMicroUsd;
    return {
      month,
      totalMicroUsd: total,
      limitMicroUsd: limit,
      limitReached: limit !== null && total >= limit,
      avgPerFileMicroUsd:
        filesWithCost > 0 ? Math.round(total / filesWithCost) : 0,
      byKind,
      byTier: Object.fromEntries(
        readingMethods.map((m) => [m, tiers[m] ?? 0]),
      ) as CostSummary['byTier'],
    };
  }
}
