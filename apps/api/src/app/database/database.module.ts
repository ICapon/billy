import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createDb, type DbHandle } from '@org/db';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { DB } from './db.token';
import { RepositoriesService } from './repositories.service';

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Promise<DbHandle> =>
        createDb(config.databaseUrl),
    },
    RepositoriesService,
  ],
  exports: [DB, RepositoriesService],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close();
  }
}
