import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiskService } from './risk.service';
import { RiskReport } from '../../database/entities/risk-report.entity';
import { Transaction } from '../../database/entities/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RiskReport, Transaction])],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
