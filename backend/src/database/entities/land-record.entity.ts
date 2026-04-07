import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToOne, OneToMany,
} from 'typeorm';
import { SearchRequest } from './search-request.entity';
import { Transaction } from './transaction.entity';

@Entity('land_records')
export class LandRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => SearchRequest, (s) => s.landRecord)
  searchRequest: SearchRequest;

  // Owner info
  @Column({ nullable: true })
  ownerName: string;

  @Column({ nullable: true })
  ownerAddress: string;

  @Column({ nullable: true })
  fatherName: string;

  // Land details
  @Column({ nullable: true })
  surveyNumber: string;

  @Column({ nullable: true })
  subDivisionNumber: string;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  taluk: string;

  @Column({ nullable: true })
  village: string;

  @Column({ nullable: true })
  landClassification: string; // 'wet', 'dry', 'garden', 'waste'

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  extentHectares: number;

  @Column({ nullable: true })
  pattaNumber: string;

  @Column({ nullable: true })
  chittaNumber: string;

  // EC (Encumbrance Certificate) info
  @Column({ nullable: true })
  ecFromYear: string;

  @Column({ nullable: true })
  ecToYear: string;

  @Column({ nullable: true })
  ecDocumentNumber: string;

  @Column({ nullable: true })
  lastRegistrationDate: string;

  @Column({ nullable: true })
  lastRegistrationValue: string;

  @Column({ type: 'boolean', default: false })
  hasEncumbrance: boolean;

  // Raw data storage
  @Column({ type: 'jsonb', nullable: true })
  rawTnreginetData: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  rawPattaData: Record<string, any>;

  // S3 references
  @Column({ nullable: true })
  screenshotUrl: string;

  @Column({ nullable: true })
  rawHtmlS3Key: string;

  // Transactions
  @OneToMany(() => Transaction, (t) => t.landRecord)
  transactions: Transaction[];

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ nullable: true })
  dataSource: string; // 'automation' | 'manual_upload' | 'user_assisted'

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
