import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BusinessFileEntity, CostEntryEntity, type DbHandle } from '@org/db';
import { loadConfig } from '@org/shared';
import { AppModule } from '../app/app.module';
import { APP_CONFIG } from '../app/config/config.module';
import { configureApp } from '../app/configure-app';
import { DB } from '../app/database/db.token';
import { RepositoriesService } from '../app/database/repositories.service';
import { QueueService } from '../app/queue/queue.service';
import { infraAvailable } from './infra';

export interface TestApp {
  app: INestApplication;
  base: string;
  ownerId: string;
  repos: RepositoriesService;
  enqueueExtraction: jest.Mock;
  close(): Promise<void>;
}

/**
 * Boots the real application (real Postgres and S3, fake queue) for one unique owner.
 * Returns null when the local infrastructure is unreachable so suites can skip.
 */
export async function createTestApp(
  env: Record<string, string> = {},
): Promise<TestApp | null> {
  if (!(await infraAvailable())) {
    console.warn(
      'SKIPPED API integration tests: Postgres/S3 are not reachable. Run `pnpm infra:up` and `pnpm nx run db:migrate`.',
    );
    return null;
  }
  const ownerId = `test-${randomUUID()}`;
  const enqueueExtraction = jest.fn().mockResolvedValue(undefined);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(
      loadConfig({ ...process.env, BUSINESS_OWNER_ID: ownerId, ...env }),
    )
    .overrideProvider(QueueService)
    .useValue({ enqueueExtraction })
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.listen(0);

  return {
    app,
    base: await app.getUrl(),
    ownerId,
    repos: app.get(RepositoriesService),
    enqueueExtraction,
    async close() {
      const { db } = app.get<DbHandle>(DB);
      // Delete through the API so stored objects go too, then remove leftovers.
      const page = await app
        .get(RepositoriesService)
        .files.list({ limit: 100 });
      for (const file of page.items) {
        await fetch(`${await app.getUrl()}/api/files/${file.id}`, {
          method: 'DELETE',
        });
      }
      await db.getRepository(CostEntryEntity).delete({ ownerId });
      await db.getRepository(BusinessFileEntity).delete({ ownerId });
      await app.close();
    },
  };
}
