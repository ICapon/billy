import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();

  // Placeholder: keeps the process alive until the BullMQ consumer (Phase 2) does it.
  setInterval(() => undefined, 60_000);

  Logger.log('Worker started (no HTTP server)');
}

bootstrap();
