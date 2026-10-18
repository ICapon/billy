import { Inject, Injectable } from '@nestjs/common';
import {
  chunksRepository,
  costsRepository,
  dashboardRepository,
  duplicatesRepository,
  filesRepository,
  recordsRepository,
  runsRepository,
  type DbHandle,
} from '@org/db';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { DB } from './db.token';

/** Owner-scoped repositories: every query is filtered by the configured business owner. */
@Injectable()
export class RepositoriesService {
  readonly files;
  readonly records;
  readonly runs;
  readonly duplicates;
  readonly chunks;
  readonly costs;
  readonly dashboard;

  constructor(
    @Inject(DB) handle: DbHandle,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.files = filesRepository(handle.db, config.ownerId);
    this.records = recordsRepository(handle.db, config.ownerId);
    this.runs = runsRepository(handle.db, config.ownerId);
    this.duplicates = duplicatesRepository(handle.db, config.ownerId);
    this.chunks = chunksRepository(handle.db, config.ownerId);
    this.costs = costsRepository(handle.db, config.ownerId);
    this.dashboard = dashboardRepository(handle.db, config.ownerId);
  }
}
