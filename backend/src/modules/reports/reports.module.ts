import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SearchRequest } from '../../database/entities/search-request.entity';
import { LandRecord } from '../../database/entities/land-record.entity';
import { RiskReport } from '../../database/entities/risk-report.entity';
import { Transaction } from '../../database/entities/transaction.entity';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SearchRequest, LandRecord, RiskReport, Transaction]),
    UploadModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
