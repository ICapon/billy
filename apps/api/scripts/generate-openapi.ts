/**
 * Writes apps/api/openapi/openapi.{json,yaml} from the controller decorators.
 * `--check` compares instead of writing and exits 1 when the committed files are stale.
 *
 * The Nest module graph is built in `preview` mode: providers are not instantiated, so no
 * Postgres, Redis or S3 connection is needed.
 */
import 'reflect-metadata';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { stringify } from 'yaml';
import { AppModule } from '../src/app/app.module';
import { configureApp } from '../src/app/configure-app';
import { buildOpenApiDocument } from '../src/openapi/build-document';

const outDir = join(__dirname, '..', 'openapi');

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
    abortOnError: false,
  });
  configureApp(app);
  const document = buildOpenApiDocument(app);
  await app.close();

  const files: Record<string, string> = {
    'openapi.json': `${JSON.stringify(document, null, 2)}\n`,
    'openapi.yaml': stringify(document, { lineWidth: 0 }),
  };

  if (check) {
    const stale = Object.entries(files).filter(([name, content]) => {
      const path = join(outDir, name);
      return !existsSync(path) || readFileSync(path, 'utf8') !== content;
    });
    if (stale.length > 0) {
      console.error(
        `OpenAPI files are out of date (${stale.map(([n]) => n).join(', ')}). Run \`pnpm openapi\`.`,
      );
      process.exit(1);
    }
    console.log('OpenAPI files are up to date');
    return;
  }

  mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(outDir, name), content);
  }
  console.log(`OpenAPI written to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
