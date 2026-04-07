import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { LandRecord } from './land-record.entity';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LandRecord, (l) => l.transactions)
  landRecord: LandRecord;

  @Column()
  landRecordId: string;

  @Column({ nullable: true })
  documentNumber: string;

  @Column({ nullable: true })
  documentType: string; // 'Sale', 'Gift', 'Mortgage', 'Release', etc.

  @Column({ nullable: true })
  executionDate: string;

  @Column({ nullable: true })
  registrationDate: string;

  @Column({ nullable: true })
  sro: string;

  @Column({ nullable: true })
  sellerName: string;

  @Column({ nullable: true })
  buyerName: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  considerationAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  marketValue: number;

  @Column({ nullable: true })
  surveyNumber: string;

  @Column({ nullable: true })
  extent: string;

  @Column({ type: 'jsonb', nullable: true })
  rawData: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
