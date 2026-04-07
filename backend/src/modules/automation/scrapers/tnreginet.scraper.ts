import { Injectable, Logger } from '@nestjs/common';
import { BaseScraper } from './base.scraper';

export interface TnreginetSearchParams {
  surveyNumber?: string;
  documentNumber?: string;
  district: string;
  sro?: string;
  village?: string;
  taluk?: string;
}

export interface TnreginetResult {
  ownerName?: string;
  fatherName?: string;
  ownerAddress?: string;
  documentNumber?: string;
  documentType?: string;
  executionDate?: string;
  registrationDate?: string;
  sro?: string;
  surveyNumber?: string;
  extent?: string;
  considerationAmount?: string;
  marketValue?: string;
  sellerName?: string;
  buyerName?: string;
  ecRecords?: EcRecord[];
  rawHtml?: string;
  screenshotBase64?: string;
  error?: string;
  captchaDetected?: boolean;
}

export interface EcRecord {
  slNo: string;
  documentNumber: string;
  documentType: string;
  executionDate: string;
  registrationDate: string;
  sellerName: string;
  buyerName: string;
  extent: string;
  amount: string;
}

export type CaptchaResolver = (
  searchId: string,
  screenshotBase64: string,
  sessionToken: string,
) => Promise<string>;

@Injectable()
export class TnreginetScraper extends BaseScraper {
  // TNREGINET portal URLs
  private static readonly BASE_URL = 'https://tnreginet.gov.in/portal';
  private static readonly EC_URL = `${TnreginetScraper.BASE_URL}/webHP_EncumbranceCertificate/HP_ECSearch.aspx`;
  private static readonly DOC_SEARCH_URL = `${TnreginetScraper.BASE_URL}/webHP_DocumentSearch/HP_DocumentSearch.aspx`;

  constructor() {
    super(TnreginetScraper.name);
  }

  /**
   * Main entry point for TNREGINET search.
   * @param params Search inputs
   * @param searchRequestId For CAPTCHA callback
   * @param captchaResolver Callback to pause and ask user for CAPTCHA
   * @param onProgress Progress callback
   */
  async search(
    params: TnreginetSearchParams,
    searchRequestId: string,
    captchaResolver: CaptchaResolver,
    onProgress?: (step: string, pct: number) => void,
  ): Promise<TnreginetResult> {
    const result: TnreginetResult = {};

    try {
      onProgress?.('Launching browser', 5);
      await this.launch();

      onProgress?.('Navigating to TNREGINET EC search', 10);
      await this.withRetry(() => this.navigateTo(TnreginetScraper.EC_URL));

      // Check for CAPTCHA on landing page
      if (await this.isCaptchaPresent()) {
        this.logger.warn('CAPTCHA on landing page');
        const screenshot = await this.screenshot();
        const sessionToken = `cap_${searchRequestId}_${Date.now()}`;
        const solution = await captchaResolver(searchRequestId, screenshot, sessionToken);
        await this.submitCaptchaIfPresent(solution);
      }

      onProgress?.('Filling EC search form', 25);
      await this.fillEcForm(params);

      onProgress?.('Submitting search', 40);
      await this.submitEcSearch();

      // Check for CAPTCHA post-submit
      if (await this.isCaptchaPresent()) {
        const screenshot = await this.screenshot();
        const sessionToken = `cap_${searchRequestId}_post_${Date.now()}`;
        const solution = await captchaResolver(searchRequestId, screenshot, sessionToken);
        await this.submitCaptchaIfPresent(solution);
        // Re-submit
        await this.submitEcSearch();
      }

      onProgress?.('Waiting for results', 55);
      await this.page!.waitForLoadState('networkidle', { timeout: 30000 });

      onProgress?.('Extracting EC records', 70);
      const ecRecords = await this.extractEcRecords();
      result.ecRecords = ecRecords;

      // Extract primary owner from first record
      if (ecRecords.length > 0) {
        const latest = ecRecords[ecRecords.length - 1];
        result.ownerName = latest.buyerName;
        result.sellerName = latest.sellerName;
        result.documentNumber = latest.documentNumber;
        result.documentType = latest.documentType;
        result.registrationDate = latest.registrationDate;
        result.executionDate = latest.executionDate;
        result.extent = latest.extent;
      }

      onProgress?.('Capturing screenshot evidence', 85);
      result.screenshotBase64 = await this.screenshot();
      result.rawHtml = await this.page!.content();

      onProgress?.('Done', 100);
      return result;
    } catch (err: any) {
      this.logger.error('TNREGINET scraping error: ' + err.message);
      try {
        result.screenshotBase64 = await this.screenshot();
      } catch {}
      result.error = err.message;
      if (err.message?.toLowerCase().includes('captcha')) {
        result.captchaDetected = true;
      }
      return result;
    } finally {
      await this.close();
    }
  }

  private async fillEcForm(params: TnreginetSearchParams) {
    // Select zone/district
    const districtMap: Record<string, string> = {
      'Chennai': 'CH', 'Coimbatore': 'CB', 'Madurai': 'MD',
      'Trichy': 'TR', 'Salem': 'SA', 'Tirunelveli': 'TN',
      'Vellore': 'VE', 'Erode': 'ER', 'Thoothukudi': 'TU',
      'Dindigul': 'DI', 'Thanjavur': 'TJ', 'Kancheepuram': 'KA',
    };

    try {
      // Select district from dropdown if present
      const districtSel = await this.page!.$('select[id*="district"], select[name*="district"]');
      if (districtSel) {
        const code = districtMap[params.district] || params.district;
        await districtSel.selectOption({ label: params.district });
        await this.humanDelay(500, 1500);
      }

      // SRO selection
      if (params.sro) {
        const sroSel = await this.page!.$('select[id*="sro"], select[name*="sro"]');
        if (sroSel) {
          await sroSel.selectOption({ label: params.sro });
          await this.humanDelay(500, 1000);
        }
      }

      // Village selection
      if (params.village) {
        const vilSel = await this.page!.$('select[id*="village"], select[name*="village"]');
        if (vilSel) {
          await vilSel.selectOption({ label: params.village });
          await this.humanDelay(300, 800);
        }
      }

      // Survey number input
      if (params.surveyNumber) {
        const surveyInput = await this.page!.$(
          'input[id*="survey"], input[name*="survey"], input[placeholder*="survey" i]',
        );
        if (surveyInput) {
          await this.humanType(
            'input[id*="survey"], input[name*="survey"]',
            params.surveyNumber,
          );
        }
      }

      await this.humanDelay(800, 2000);
    } catch (err: any) {
      this.logger.warn('Form fill partial failure: ' + err.message);
    }
  }

  private async submitEcSearch() {
    // Click submit / search button
    const submitSelectors = [
      'input[type="submit"]',
      'button[type="submit"]',
      'button:has-text("Search")',
      'input[value*="Search" i]',
      '#btnSearch',
      '.btn-search',
    ];

    for (const sel of submitSelectors) {
      try {
        const btn = await this.page!.$(sel);
        if (btn) {
          await this.humanDelay(500, 1000);
          await btn.click();
          await this.page!.waitForLoadState('networkidle', { timeout: 30000 });
          return;
        }
      } catch {}
    }
    throw new Error('Could not find search submit button');
  }

  private async submitCaptchaIfPresent(solution: string) {
    // Try to type solution into CAPTCHA input
    const captchaInputSelectors = [
      'input[id*="captcha" i]',
      'input[name*="captcha" i]',
      'input[placeholder*="captcha" i]',
    ];
    for (const sel of captchaInputSelectors) {
      try {
        await this.humanType(sel, solution);
        break;
      } catch {}
    }
  }

  private async extractEcRecords(): Promise<EcRecord[]> {
    const records: EcRecord[] = [];

    try {
      // Look for EC results table — TNREGINET uses asp.net grid
      const rows = await this.page!.$$('table[id*="Grid"] tr, .ec-result-table tr, table.result tr');

      for (let i = 1; i < rows.length; i++) { // skip header
        const cells = await rows[i].$$('td');
        if (cells.length < 6) continue;

        const record: EcRecord = {
          slNo: await cells[0]?.textContent() || String(i),
          documentNumber: (await cells[1]?.textContent() || '').trim(),
          documentType: (await cells[2]?.textContent() || '').trim(),
          executionDate: (await cells[3]?.textContent() || '').trim(),
          registrationDate: (await cells[4]?.textContent() || '').trim(),
          sellerName: (await cells[5]?.textContent() || '').trim(),
          buyerName: cells.length > 6 ? (await cells[6]?.textContent() || '').trim() : '',
          extent: cells.length > 7 ? (await cells[7]?.textContent() || '').trim() : '',
          amount: cells.length > 8 ? (await cells[8]?.textContent() || '').trim() : '',
        };

        if (record.documentNumber) records.push(record);
      }
    } catch (err: any) {
      this.logger.warn('EC extraction warning: ' + err.message);
    }

    return records;
  }
}
