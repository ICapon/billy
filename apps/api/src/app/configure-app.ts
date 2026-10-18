import type { INestApplication } from '@nestjs/common';

export const GLOBAL_PREFIX = 'api';

/** Shared by main.ts and the OpenAPI generator so both describe the same routes. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX);
}
