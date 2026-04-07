import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { SearchRequest } from '../database/entities/search-request.entity';
import { LandRecord } from '../database/entities/land-record.entity';
import { Transaction } from '../database/entities/transaction.entity';
import { RiskReport } from '../database/entities/risk-report.entity';
import { AutomationLog } from '../database/entities/automation-log.entity';

export const databaseConfig = (
  config: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: config.get<string>('DATABASE_URL'),
  entities: [User, SearchRequest, LandRecord, Transaction, RiskReport, AutomationLog],
  migrations: ['dist/database/migrations/*.js'],
  synchronize: config.get<string>('NODE_ENV') !== 'production',
  logging: config.get<string>('NODE_ENV') === 'development',
  ssl:
    config.get<string>('NODE_ENV') === 'production'
      ? { rejectUnauthorized: false }
      : false,
});
