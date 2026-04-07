import {
  Injectable, BadRequestException, NotFoundException,
  TooManyRequestsException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { SearchRequest } from '../../database/entities/search-request.entity';
import { LandRecord } from '../../database/entities/land-record.entity';
import { User } from '../../database/entities/user.entity';
import { CreateSearchDto } from './dto/create-search.dto';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(SearchRequest) private searchRepo: Repository<SearchRequest>,
    @InjectRepository(LandRecord) private landRecordRepo: Repository<LandRecord>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectQueue('automation') private automationQueue: Queue,
  ) {}

  async createSearch(userId: string, dto: CreateSearchDto): Promise<SearchRequest> {
    if (!dto.surveyNumber && !dto.documentNumber) {
      throw new BadRequestException('Provide at least a survey number or document number');
    }

    // Check daily rate limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = await this.searchRepo.count({
      where: { userId, createdAt: todayStart as any },
    });

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (todayCount >= (user?.dailyAutomationLimit || 5)) {
      throw new TooManyRequestsException(
        'Daily automation limit reached. Upgrade your plan for more searches.',
      );
    }

    const search = this.searchRepo.create({
      userId,
      ...dto,
      source: dto.source || 'both',
      status: 'queued',
    });
    await this.searchRepo.save(search);

    // Enqueue automation job
    const job = await this.automationQueue.add(
      'land-search',
      { searchRequestId: search.id, userId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: false,
        removeOnFail: false,
        timeout: 120000,
      },
    );

    search.jobId = String(job.id);
    await this.searchRepo.save(search);

    return search;
  }

  async getSearch(id: string, userId: string): Promise<SearchRequest> {
    const search = await this.searchRepo.findOne({
      where: { id, userId },
      relations: ['landRecord', 'riskReport'],
    });
    if (!search) throw new NotFoundException('Search request not found');
    return search;
  }

  async listSearches(userId: string, page = 1, limit = 10) {
    const [data, total] = await this.searchRepo.findAndCount({
      where: { userId },
      relations: ['riskReport'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async getReport(searchId: string, userId: string) {
    const search = await this.searchRepo.findOne({
      where: { id: searchId, userId },
      relations: ['landRecord', 'landRecord.transactions', 'riskReport'],
    });
    if (!search) throw new NotFoundException('Report not found');
    if (search.status !== 'completed')
      throw new BadRequestException(`Report not ready. Status: ${search.status}`);
    return search;
  }
}
