import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchRequest } from '../../database/entities/search-request.entity';
import { AutomationLog } from '../../database/entities/automation-log.entity';
import { AutomationGateway } from './automation.gateway';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);
  // In-memory map: sessionToken -> { page, browser, context }
  private captchaSessions = new Map<string, {
    resolve: (solution: string) => void;
    reject: (err: Error) => void;
  }>();

  constructor(
    @InjectRepository(SearchRequest) private searchRepo: Repository<SearchRequest>,
    @InjectRepository(AutomationLog) private logRepo: Repository<AutomationLog>,
    private gateway: AutomationGateway,
  ) {}

  async log(data: Partial<AutomationLog>) {
    const entry = this.logRepo.create(data);
    await this.logRepo.save(entry);
  }

  // Called by scraper when CAPTCHA is detected
  async requestCaptchaSolution(
    searchRequestId: string,
    screenshotBase64: string,
    sessionToken: string,
  ): Promise<string> {
    this.logger.warn(`CAPTCHA detected for search ${searchRequestId}`);

    // Update DB
    await this.searchRepo.update(searchRequestId, {
      status: 'captcha_required',
      captchaSessionToken: sessionToken,
    });

    // Push to frontend via WebSocket
    this.gateway.emitCaptchaRequired(searchRequestId, screenshotBase64, sessionToken);

    // Wait for user to solve (timeout 3 minutes)
    return new Promise((resolve, reject) => {
      this.captchaSessions.set(sessionToken, { resolve, reject });
      setTimeout(() => {
        if (this.captchaSessions.has(sessionToken)) {
          this.captchaSessions.delete(sessionToken);
          reject(new Error('CAPTCHA timeout — user did not respond in 3 minutes'));
        }
      }, 180000);
    });
  }

  // Called by frontend when user submits CAPTCHA answer
  async submitCaptchaResponse(
    searchRequestId: string,
    sessionToken: string,
    solution: string,
  ) {
    const search = await this.searchRepo.findOne({ where: { id: searchRequestId } });
    if (!search) throw new NotFoundException('Search not found');
    if (search.captchaSessionToken !== sessionToken)
      throw new BadRequestException('Invalid session token');

    const session = this.captchaSessions.get(sessionToken);
    if (!session) throw new BadRequestException('Session expired or not found');

    session.resolve(solution);
    this.captchaSessions.delete(sessionToken);

    await this.searchRepo.update(searchRequestId, { status: 'running' });
    this.gateway.emitStatusUpdate(searchRequestId, 'running', 'CAPTCHA resolved, resuming...');

    return { success: true };
  }

  async getAutomationLogs(searchRequestId: string) {
    return this.logRepo.find({
      where: { searchRequestId },
      order: { createdAt: 'ASC' },
    });
  }

  async updateSearchStatus(id: string, status: any, extra?: Partial<SearchRequest>) {
    await this.searchRepo.update(id, { status, ...extra });
  }
}
