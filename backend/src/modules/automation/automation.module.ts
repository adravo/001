import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AutomationProcessor } from './automation.processor';
import { AutomationGateway } from './automation.gateway';
import { TnreginetScraper } from './scrapers/tnreginet.scraper';
import { PattaScraper } from './scrapers/patta.scraper';
import { SearchRequest } from '../../database/entities/search-request.entity';
import { LandRecord } from '../../database/entities/land-record.entity';
import { Transaction } from '../../database/entities/transaction.entity';
import { AutomationLog } from '../../database/entities/automation-log.entity';
import { RiskModule } from '../risk/risk.module';
import { UploadModule } from '../upload/upload.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SearchRequest, LandRecord, Transaction, AutomationLog,
    ]),
    BullModule.registerQueue({ name: 'automation' }),
    RiskModule,
    UploadModule,
    ReportsModule,
  ],
  controllers: [AutomationController],
  providers: [
    AutomationService,
    AutomationProcessor,
    AutomationGateway,
    TnreginetScraper,
    PattaScraper,
  ],
  exports: [AutomationService],
})
export class AutomationModule {}
