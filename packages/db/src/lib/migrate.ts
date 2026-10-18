import { createDb } from './client';

/** Applies pending migrations (`revert: true` undoes the last one). */
export async function runMigrations(
  options: { url?: string; revert?: boolean } = {},
): Promise<string[]> {
  const handle = await createDb(options.url);
  try {
    if (options.revert) {
      await handle.db.undoLastMigration();
      return ['reverted last migration'];
    }
    const applied = await handle.db.runMigrations();
    return applied.map((migration) => migration.name);
  } finally {
    await handle.close();
  }
}
