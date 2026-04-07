import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export type AutomationEvent =
  | 'job_started'
  | 'navigation'
  | 'form_fill'
  | 'captcha_detected'
  | 'captcha_resolved'
  | 'data_extracted'
  | 'screenshot_taken'
  | 'retry'
  | 'job_completed'
  | 'job_failed'
  | 'rate_limit'
  | 'timeout';

@Entity('automation_logs')
export class AutomationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  searchRequestId: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ type: 'varchar' })
  event: AutomationEvent;

  @Column({ nullable: true })
  portal: string; // 'tnreginet' | 'patta'

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ type: 'int', nullable: true })
  durationMs: number;

  @Column({ default: false })
  isError: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
