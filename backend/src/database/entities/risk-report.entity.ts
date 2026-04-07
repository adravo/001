import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToOne,
} from 'typeorm';
import { SearchRequest } from './search-request.entity';

export type RiskCategory = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export interface RiskFactor {
  code: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  weight: number;
  details?: string;
}

@Entity('risk_reports')
export class RiskReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => SearchRequest, (s) => s.riskReport)
  searchRequest: SearchRequest;

  @Column({ type: 'int' })
  riskScore: number; // 0–100

  @Column({ type: 'varchar' })
  riskCategory: RiskCategory;

  @Column({ type: 'jsonb' })
  riskFactors: RiskFactor[];

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ type: 'text', nullable: true })
  recommendation: string;

  // Individual risk checks
  @Column({ type: 'boolean', default: false })
  frequentOwnershipChanges: boolean;

  @Column({ type: 'boolean', default: false })
  missingEcYears: boolean;

  @Column({ type: 'boolean', default: false })
  ownerMismatch: boolean;

  @Column({ type: 'boolean', default: false })
  encumbranceFound: boolean;

  @Column({ type: 'boolean', default: false })
  mortgageFound: boolean;

  @Column({ type: 'boolean', default: false })
  legalDisputeIndicator: boolean;

  @Column({ type: 'boolean', default: false })
  dataIncomplete: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
