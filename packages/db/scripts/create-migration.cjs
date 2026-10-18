// Creates an empty timestamped migration: node scripts/create-migration.cjs add-something
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: create-migration.cjs <kebab-case-name>');
  process.exit(1);
}
const timestamp = Date.now();
const className =
  slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') + timestamp;
const file = join(
  __dirname,
  '..',
  'src',
  'lib',
  'migrations',
  timestamp + '-' + slug + '.ts',
);
const body = [
  "import type { MigrationInterface, QueryRunner } from 'typeorm';",
  '',
  'export class ' + className + ' implements MigrationInterface {',
  "  name = '" + className + "';",
  '',
  '  async up(queryRunner: QueryRunner): Promise<void> {',
  "    await queryRunner.query('-- TODO');",
  '  }',
  '',
  '  async down(queryRunner: QueryRunner): Promise<void> {',
  "    await queryRunner.query('-- TODO');",
  '  }',
  '}',
  '',
].join('\n');
writeFileSync(file, body);
console.log('Created ' + file + '. Register it in src/lib/migrations/index.ts');
