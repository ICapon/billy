import { createDb } from '@org/db';
import { loadConfig } from '@org/shared';

/** True when the local Postgres and S3 from `pnpm infra:up` are reachable (and migrated). */
export async function infraAvailable(): Promise<boolean> {
  try {
    const config = loadConfig();
    const handle = await createDb(config.databaseUrl);
    try {
      await handle.db.query('select 1 from business_files limit 1');
    } finally {
      await handle.close();
    }
    // Any HTTP answer (even 403) means the S3 endpoint is up.
    await fetch(config.s3.endpoint, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}
