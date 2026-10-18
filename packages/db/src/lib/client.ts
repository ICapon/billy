import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { entities } from './entities';
import { migrations } from './migrations';

export type Database = DataSource;

export interface DbHandle {
  db: DataSource;
  close(): Promise<void>;
}

/** An uninitialized DataSource; `synchronize` is never used, the schema comes from migrations. */
export function createDataSource(
  url: string | undefined = process.env['DATABASE_URL'],
): DataSource {
  if (!url) throw new Error('DATABASE_URL is not set');
  return new DataSource({
    type: 'postgres',
    url,
    entities,
    migrations,
    synchronize: false,
    // gen_random_uuid() (built in since Postgres 13) instead of the uuid-ossp extension
    uuidExtension: 'pgcrypto',
  });
}

export async function createDb(url?: string): Promise<DbHandle> {
  const db = createDataSource(url);
  await db.initialize();
  return { db, close: () => db.destroy() };
}
