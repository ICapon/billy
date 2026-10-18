import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { configureApp, GLOBAL_PREFIX } from './app/configure-app';
import { buildOpenApiDocument } from './openapi/build-document';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup(
      `${GLOBAL_PREFIX}/docs`,
      app,
      buildOpenApiDocument(app),
      {
        jsonDocumentUrl: `${GLOBAL_PREFIX}/docs/json`,
      },
    );
  }

  app.enableShutdownHooks();
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${GLOBAL_PREFIX}`,
  );
}

bootstrap();
