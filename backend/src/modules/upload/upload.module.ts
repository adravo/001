import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { SearchRequest } from '../../database/entities/search-request.entity';
import { LandRecord } from '../../database/entities/land-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SearchRequest, LandRecord])],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
