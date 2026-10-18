import { randomUUID } from 'node:crypto';
import {
  BusinessFileEntity,
  CostEntryEntity,
  createDb,
  type DbHandle,
} from '@org/db';
import { loadConfig, type AppConfig } from '@org/shared';
import { RepositoriesService } from '../app/database/repositories.service';

export interface WorkerTestContext {
  handle: DbHandle;
  config: AppConfig;
  repos: RepositoriesService;
  cleanup(): Promise<void>;
}

/** A test context on the local Postgres with a unique owner, or null when it is unreachable. */
export async function createTestContext(
  env: Record<string, string> = {},
): Promise<WorkerTestContext | null> {
  const ownerId = `test-${randomUUID()}`;
  let config: AppConfig;
  let handle: DbHandle;
  try {
    config = loadConfig({ ...process.env, BUSINESS_OWNER_ID: ownerId, ...env });
    handle = await createDb(config.databaseUrl);
    await handle.db.query('select 1 from business_files limit 1');
  } catch {
    return null;
  }
  return {
    handle,
    config,
    repos: new RepositoriesService(handle, config),
    async cleanup() {
      await handle.db.getRepository(CostEntryEntity).delete({ ownerId });
      await handle.db.getRepository(BusinessFileEntity).delete({ ownerId });
      await handle.close();
    },
  };
}
