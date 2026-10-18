import { Inject, Injectable } from '@nestjs/common';
import {
  bucketFor,
  fillSeries,
  type ActivityQuery,
  type ActivitySummary,
  type AttentionItems,
} from '@org/shared';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { RepositoriesService } from '../database/repositories.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly repos: RepositoriesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Activity of the files uploaded in the period; same week start as the analysis screen. */
  async activity(query: ActivityQuery): Promise<ActivitySummary> {
    const period = { from: query.from, to: query.to };
    const bucket = bucketFor(period);
    const rows = await this.repos.dashboard.activity(
      period,
      bucket,
      this.config.weekStart,
    );

    const { counts } = rows;
    const finished = counts.completed + counts.needsReview + counts.failed;
    const total =
      finished + counts.received + counts.processing + counts.queuedLimit;

    return {
      from: period.from,
      to: period.to,
      bucket,
      counts,
      total,
      finished,
      successRate: finished > 0 ? counts.completed / finished : null,
      avgAnalysisSeconds: rows.avgAnalysisSeconds,
      series: fillSeries(
        period,
        bucket,
        this.config.weekStart,
        rows.uploaded,
        rows.finished,
      ),
      byMethod: rows.byMethod,
    };
  }

  /** Pending work and unconfirmed money: "now", not tied to the dashboard period. */
  attention(): Promise<AttentionItems> {
    return this.repos.dashboard.attention();
  }
}
