// Applies (or with --revert undoes) migrations on DATABASE_URL.
// TypeScript sources are loaded through @swc-node/register (decorators enabled by the tsconfig).
process.env.SWC_NODE_PROJECT ??= require('node:path').join(
  __dirname,
  '..',
  'tsconfig.lib.json',
);
require('@swc-node/register');
const { runMigrations } = require('../src/lib/migrate.ts');

runMigrations({ revert: process.argv.includes('--revert') })
  .then((names) => {
    console.log(
      names.length ? `Applied: ${names.join(', ')}` : 'No pending migrations',
    );
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
