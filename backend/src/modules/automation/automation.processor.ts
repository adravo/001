import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import { SearchRequest } from '../../database/entities/search-request.entity';
import { LandRecord } from '../../database/entities/land-record.entity';
import { Transaction } from '../../database/entities/transaction.entity';
import { AutomationLog } from '../../database/entities/automation-log.entity';
import { TnreginetScraper } from './scrapers/tnreginet.scraper';
import { PattaScraper } from './scrapers/patta.scraper';
import { AutomationService } from './automation.service';
import { AutomationGateway } from './automation.gateway';
import { RiskService } from '../risk/risk.service';
import { UploadService } from '../upload/upload.service';
import { ReportsService } from '../reports/reports.service';

export interface LandSearchJobData {
  searchRequestId: string;
  userId: string;
}

@Processor('automation')
export class AutomationProcessor {
  private readonly logger = new Logger(AutomationProcessor.name);

  constructor(
    @InjectRepository(SearchRequest) private searchRepo: Repository<SearchRequest>,
    @InjectRepository(LandRecord) private landRecordRepo: Repository<LandRecord>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(AutomationLog) private logRepo: Repository<AutomationLog>,
    private tnreginetScraper: TnreginetScraper,
    private pattaScraper: PattaScraper,
    private automationService: AutomationService,
    private gateway: AutomationGateway,
    private riskService: RiskService,
    private uploadService: UploadService,
    private reportsService: ReportsService,
  ) {}

  @Process('land-search')
  async processLandSearch(job: Job<LandSearchJobData>) {
    const { searchRequestId, userId } = job.data;
    const startTime = Date.now();

    this.logger.log(`Processing land-search job for ${searchRequestId}`);
    this.gateway.emitStatusUpdate(searchRequestId, 'running', 'Automation started');

    const search = await this.searchRepo.findOne({ where: { id: searchRequestId } });
    if (!search) {
      this.logger.error(`Search ${searchRequestId} not found`);
      return;
    }

    await this.searchRepo.update(searchRequestId, { status: 'running' });

    // Log job start
    await this.logEvent(searchRequestId, userId, 'job_started', 'Automation job started');

    try {
      const captchaResolver = this.automationService.requestCaptchaSolution.bind(
        this.automationService,
      );

      // ---- TNREGINET ----
      let tnResult: any = null;
      if (search.source === 'tnreginet' || search.source === 'both') {
        this.gateway.emitProgress(searchRequestId, 'Querying TNREGINET', 10);
        await this.logEvent(searchRequestId, userId, 'navigation', 'Starting TNREGINET query', 'tnreginet');

        tnResult = await this.tnreginetScraper.search(
          {
            surveyNumber: search.surveyNumber,
            documentNumber: search.documentNumber,
            district: search.district,
            sro: search.sro,
            village: search.village,
            taluk: search.taluk,
          },
          searchRequestId,
          captchaResolver,
          (step, pct) => {
            this.gateway.emitProgress(searchRequestId, step, Math.round(pct * 0.5));
          },
        );

        if (tnResult.screenshotBase64) {
          await this.logEvent(searchRequestId, userId, 'screenshot_taken', 'TNREGINET screenshot captured', 'tnreginet');
        }
        if (tnResult.error) {
          await this.logEvent(searchRequestId, userId, 'job_failed', tnResult.error, 'tnreginet', true);
        } else {
          await this.logEvent(searchRequestId, userId, 'data_extracted', `Extracted ${tnResult.ecRecords?.length || 0} EC records`, 'tnreginet');
        }
      }

      // ---- PATTA ----
      let pattaResult: any = null;
      if (search.source === 'patta' || search.source === 'both') {
        this.gateway.emitProgress(searchRequestId, 'Querying Patta/Chitta portal', 55);
        await this.logEvent(searchRequestId, userId, 'navigation', 'Starting Patta lookup', 'patta');

        pattaResult = await this.pattaScraper.search(
          {
            district: search.district,
            taluk: search.taluk,
            village: search.village,
            surveyNumber: search.surveyNumber,
          },
          searchRequestId,
          captchaResolver,
          (step, pct) => {
            this.gateway.emitProgress(searchRequestId, step, 55 + Math.round(pct * 0.3));
          },
        );

        if (!pattaResult.error) {
          await this.logEvent(searchRequestId, userId, 'data_extracted', 'Patta data extracted', 'patta');
        }
      }

      // ---- Persist LandRecord ----
      this.gateway.emitProgress(searchRequestId, 'Saving records', 88);
      const landRecord = await this.saveLandRecord(search, tnResult, pattaResult);

      // ---- Upload screenshot & raw HTML to S3 ----
      if (tnResult?.screenshotBase64) {
        try {
          const buf = Buffer.from(tnResult.screenshotBase64, 'base64');
          const key = await this.uploadService.uploadBuffer(
            buf, `screenshots/${searchRequestId}-tnreginet.jpg`, 'image/jpeg',
          );
          await this.landRecordRepo.update(landRecord.id, { screenshotUrl: key });
        } catch (e: any) {
          this.logger.warn('S3 screenshot upload failed: ' + e.message);
        }
      }

      // ---- Risk Analysis ----
      this.gateway.emitProgress(searchRequestId, 'Running risk analysis', 92);
      const riskReport = await this.riskService.analyze(search, landRecord);

      // ---- Generate PDF report ----
      this.gateway.emitProgress(searchRequestId, 'Generating PDF report', 96);
      const pdfKey = await this.reportsService.generatePdf(search, landRecord, riskReport);

      // ---- Finalize ----
      await this.searchRepo.update(searchRequestId, {
        status: 'completed',
        completedAt: new Date(),
        reportPdfUrl: pdfKey,
      });

      const duration = Date.now() - startTime;
      await this.logEvent(searchRequestId, userId, 'job_completed',
        `Completed in ${duration}ms`, undefined, false, { durationMs: duration });

      this.gateway.emitCompleted(searchRequestId, riskReport.id);
      this.logger.log(`Land search ${searchRequestId} completed in ${duration}ms`);
    } catch (err: any) {
      this.logger.error(`Land search ${searchRequestId} failed: ${err.message}`);

      let fallback = 'Please try again later.';
      if (err.message?.includes('CAPTCHA timeout')) {
        fallback = 'CAPTCHA was not solved in time. Please upload the EC manually.';
      } else if (err.message?.includes('timeout')) {
        fallback = 'Portal timed out. Try again during off-peak hours.';
      }

      await this.searchRepo.update(searchRequestId, {
        status: 'failed',
        errorMessage: err.message,
      });

      await this.logEvent(searchRequestId, userId, 'job_failed', err.message, undefined, true);
      this.gateway.emitFailed(searchRequestId, err.message, fallback);
    }
  }

  private async saveLandRecord(
    search: SearchRequest,
    tnResult: any,
    pattaResult: any,
  ): Promise<LandRecord> {
    const record = this.landRecordRepo.create({
      searchRequest: search,
      ownerName: pattaResult?.ownerName || tnResult?.ownerName,
      fatherName: pattaResult?.fatherName,
      ownerAddress: pattaResult?.address,
      surveyNumber: search.surveyNumber,
      district: search.district,
      taluk: search.taluk || pattaResult?.taluk,
      village: search.village || pattaResult?.village,
      pattaNumber: pattaResult?.pattaNumber,
      landClassification: pattaResult?.landClassification,
      extentHectares: pattaResult?.extentHectares ? parseFloat(pattaResult.extentHectares) : undefined,
      hasEncumbrance: (tnResult?.ecRecords?.length || 0) > 0,
      rawTnreginetData: tnResult ? { ...tnResult, screenshotBase64: undefined } : null,
      rawPattaData: pattaResult ? { ...pattaResult, screenshotBase64: undefined } : null,
      dataSource: 'automation',
      isVerified: false,
      ecDocumentNumber: tnResult?.documentNumber,
      lastRegistrationDate: tnResult?.registrationDate,
    });

    const saved = await this.landRecordRepo.save(record);

    // Persist transactions
    if (tnResult?.ecRecords?.length) {
      const txEntities = tnResult.ecRecords.map((ec: any) =>
        this.txRepo.create({
          landRecordId: saved.id,
          documentNumber: ec.documentNumber,
          documentType: ec.documentType,
          executionDate: ec.executionDate,
          registrationDate: ec.registrationDate,
          sellerName: ec.sellerName,
          buyerName: ec.buyerName,
          extent: ec.extent,
          considerationAmount: ec.amount ? parseFloat(ec.amount.replace(/,/g, '')) : null,
          rawData: ec,
        }),
      );
      await this.txRepo.save(txEntities);
    }

    return saved;
  }

  private async logEvent(
    searchRequestId: string,
    userId: string,
    event: any,
    message: string,
    portal?: string,
    isError = false,
    meta?: Record<string, any>,
  ) {
    const log = this.logRepo.create({
      searchRequestId, userId, event, message, portal, isError,
      metadata: meta,
    });
    await this.logRepo.save(log);
  }
}
