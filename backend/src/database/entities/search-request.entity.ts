import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, OneToOne, JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { LandRecord } from './land-record.entity';
import { RiskReport } from './risk-report.entity';

export type SearchStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'captcha_required'
  | 'completed'
  | 'failed'
  | 'manual_required';

@Entity('search_requests')
export class SearchRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (u) => u.searchRequests)
  user: User;

  @Column()
  userId: string;

  // Search inputs
  @Column({ nullable: true })
  surveyNumber: string;

  @Column({ nullable: true })
  documentNumber: string;

  @Column()
  district: string;

  @Column({ nullable: true })
  sro: string; // Sub-Registrar Office

  @Column({ nullable: true })
  village: string;

  @Column({ nullable: true })
  taluk: string;

  @Column({ type: 'enum', enum: ['tnreginet', 'patta', 'both'], default: 'both' })
  source: string;

  // Status
  @Column({ type: 'varchar', default: 'pending' })
  status: SearchStatus;

  @Column({ nullable: true })
  jobId: string;

  @Column({ nullable: true })
  errorMessage: string;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  // Screenshot for CAPTCHA
  @Column({ nullable: true })
  captchaScreenshotUrl: string;

  @Column({ nullable: true })
  captchaSessionToken: string;

  // Relations
  @OneToOne(() => LandRecord, (l) => l.searchRequest, { nullable: true })
  @JoinColumn()
  landRecord: LandRecord;

  @OneToOne(() => RiskReport, (r) => r.searchRequest, { nullable: true })
  @JoinColumn()
  riskReport: RiskReport;

  // Report
  @Column({ nullable: true })
  reportPdfUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;
}
