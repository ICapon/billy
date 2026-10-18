import { Module } from '@nestjs/common';
import { DuplicatesController } from './duplicates.controller';
import { DuplicatesService } from './duplicates.service';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';

@Module({
  controllers: [RecordsController, DuplicatesController],
  providers: [RecordsService, DuplicatesService],
})
export class RecordsModule {}
