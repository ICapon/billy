import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { ExtractionModule } from './extraction/extraction.module';
import { ExtractionProcessor } from './extraction.processor';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [ConfigModule, DatabaseModule, StorageModule, ExtractionModule],
  providers: [ExtractionProcessor],
})
export class AppModule {}
