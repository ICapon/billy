import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { CostsModule } from './costs/costs.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database/database.module';
import { FilesModule } from './files/files.module';
import { QueueModule } from './queue/queue.module';
import { RecordsModule } from './records/records.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    StorageModule,
    QueueModule,
    FilesModule,
    RecordsModule,
    CostsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class AppModule {}
