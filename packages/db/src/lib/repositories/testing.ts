import { randomUUID } from 'node:crypto';
import { createDb, type DbHandle } from '../client';
import {
  BusinessFileEntity,
  ChatConversationEntity,
  CostEntryEntity,
} from '../entities';
import { filesRepository } from './files';

const url = process.env['DATABASE_URL'] ?? '';

/** True when the local Postgres from `pnpm infra:up` is reachable and migrated. */
export async function dbAvailable(): Promise<boolean> {
  if (!url) return false;
  let handle: DbHandle | undefined;
  try {
    handle = await createDb(url);
    await handle.db.query('select 1 from business_files limit 1');
    return true;
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

export interface DbTestContext {
  handle: DbHandle;
  ownerId: string;
  newFile(overrides?: Partial<BusinessFileEntity>): Promise<BusinessFileEntity>;
}

/**
 * Runs the suite against the local Postgres with a unique owner per suite and removes
 * its rows afterwards. If the database is unreachable the suite is skipped with a warning.
 */
export type DbIt = (
  name: string,
  fn: () => Promise<void> | void,
  timeout?: number,
) => void;

export function describeDb(
  name: string,
  body: (ctx: () => DbTestContext, dbIt: DbIt) => void,
): void {
  describe(name, () => {
    let context: DbTestContext | undefined;
    let available = false;

    beforeAll(async () => {
      available = await dbAvailable();
      if (!available) {
        console.warn(
          `SKIPPED "${name}": Postgres is not reachable (is DATABASE_URL set? run \`pnpm infra:up\` and \`pnpm db:migrate\`).`,
        );
        return;
      }
      const handle = await createDb(url);
      const ownerId = `test-${randomUUID()}`;
      const files = filesRepository(handle.db, ownerId);
      context = {
        handle,
        ownerId,
        newFile: (overrides = {}) =>
          files.insert({
            originalName: 'file.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 10,
            sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
            storageKey: `${ownerId}/file.pdf`,
            ...overrides,
          }),
      };
    });

    afterAll(async () => {
      if (!context) return;
      const { db } = context.handle;
      await db
        .getRepository(CostEntryEntity)
        .delete({ ownerId: context.ownerId });
      await db
        .getRepository(ChatConversationEntity)
        .delete({ ownerId: context.ownerId });
      await db
        .getRepository(BusinessFileEntity)
        .delete({ ownerId: context.ownerId });
      await context.handle.close();
    });

    const ctx = () => {
      if (!context) throw new Error('DB context not available');
      return context;
    };
    const dbIt: DbIt = (testName, fn, timeout) =>
      it(
        testName,
        async () => {
          if (available) await fn();
        },
        timeout,
      );
    body(ctx, dbIt);
  });
}
