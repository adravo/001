import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToMany,
} from 'typeorm';
import { SearchRequest } from './search-request.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ default: 'user' })
  role: string; // 'user' | 'admin'

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  totalSearches: number;

  @Column({ type: 'int', default: 5 })
  dailyAutomationLimit: number;

  @OneToMany(() => SearchRequest, (s) => s.user)
  searchRequests: SearchRequest[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
