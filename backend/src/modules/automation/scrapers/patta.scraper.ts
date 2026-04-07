import { Injectable } from '@nestjs/common';
import { BaseScraper } from './base.scraper';
import { CaptchaResolver } from './tnreginet.scraper';

export interface PattaSearchParams {
  district: string;
  taluk?: string;
  village?: string;
  surveyNumber?: string;
  pattaNumber?: string;
}

export interface PattaResult {
  pattaNumber?: string;
  ownerName?: string;
  fatherName?: string;
  address?: string;
  surveyNumber?: string;
  subDivision?: string;
  landClassification?: string; // wet/dry/garden
  extentHectares?: string;
  extentAcres?: string;
  waterSource?: string;
  taxAssessment?: string;
  rawData?: Record<string, any>;
  screenshotBase64?: string;
  rawHtml?: string;
  error?: string;
  captchaDetected?: boolean;
}

@Injectable()
export class PattaScraper extends BaseScraper {
  private static readonly PATTA_URL =
    'https://eservices.tn.gov.in/eservicesnew/land/patta.html';

  constructor() {
    super(PattaScraper.name);
  }

  async search(
    params: PattaSearchParams,
    searchRequestId: string,
    captchaResolver: CaptchaResolver,
    onProgress?: (step: string, pct: number) => void,
  ): Promise<PattaResult> {
    const result: PattaResult = {};

    try {
      onProgress?.('Launching browser for Patta lookup', 5);
      await this.launch();

      onProgress?.('Navigating to Patta/Chitta portal', 15);
      await this.withRetry(() => this.navigateTo(PattaScraper.PATTA_URL));

      if (await this.isCaptchaPresent()) {
        const screenshot = await this.screenshot();
        const sessionToken = `patta_cap_${searchRequestId}_${Date.now()}`;
        const solution = await captchaResolver(searchRequestId, screenshot, sessionToken);
        await this.submitCaptchaInput(solution);
      }

      onProgress?.('Selecting district and taluk', 30);
      await this.fillPattaForm(params);

      onProgress?.('Submitting Patta search', 50);
      await this.submitForm();

      if (await this.isCaptchaPresent()) {
        const screenshot = await this.screenshot();
        const sessionToken = `patta_cap2_${searchRequestId}_${Date.now()}`;
        const solution = await captchaResolver(searchRequestId, screenshot, sessionToken);
        await this.submitCaptchaInput(solution);
        await this.submitForm();
      }

      onProgress?.('Extracting Patta/Chitta data', 70);
      const pattaData = await this.extractPattaData();
      Object.assign(result, pattaData);

      onProgress?.('Capturing screenshot', 90);
      result.screenshotBase64 = await this.screenshot();
      result.rawHtml = await this.page!.content();

      onProgress?.('Patta lookup complete', 100);
      return result;
    } catch (err: any) {
      this.logger.error('Patta scraping error: ' + err.message);
      try { result.screenshotBase64 = await this.screenshot(); } catch {}
      result.error = err.message;
      if (err.message?.toLowerCase().includes('captcha')) result.captchaDetected = true;
      return result;
    } finally {
      await this.close();
    }
  }

  private async fillPattaForm(params: PattaSearchParams) {
    try {
      // District
      const districtSel = await this.page!.$('select[id*="district" i], select[name*="district" i]');
      if (districtSel && params.district) {
        await districtSel.selectOption({ label: params.district });
        await this.humanDelay(600, 1200);
      }

      // Taluk — may be dynamic (loaded after district select)
      if (params.taluk) {
        await this.page!.waitForTimeout(1500); // wait for dynamic load
        const talukSel = await this.page!.$('select[id*="taluk" i], select[name*="taluk" i]');
        if (talukSel) {
          await talukSel.selectOption({ label: params.taluk });
          await this.humanDelay(600, 1200);
        }
      }

      // Village
      if (params.village) {
        await this.page!.waitForTimeout(1500);
        const vilSel = await this.page!.$('select[id*="village" i], select[name*="village" i]');
        if (vilSel) {
          await vilSel.selectOption({ label: params.village });
          await this.humanDelay(400, 900);
        }
      }

      // Survey number
      if (params.surveyNumber) {
        const survInput = await this.page!.$(
          'input[id*="survey" i], input[name*="survey" i], input[placeholder*="survey" i]',
        );
        if (survInput) {
          await this.humanType(
            'input[id*="survey" i]',
            params.surveyNumber,
          );
        }
      }

      // Patta number
      if (params.pattaNumber) {
        const pInput = await this.page!.$(
          'input[id*="patta" i], input[name*="patta" i]',
        );
        if (pInput) {
          await this.humanType('input[id*="patta" i]', params.pattaNumber);
        }
      }

      await this.humanDelay(800, 1500);
    } catch (err: any) {
      this.logger.warn('Patta form fill partial: ' + err.message);
    }
  }

  private async submitForm() {
    const selectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Search")',
      'button:has-text("Submit")',
      '.btn-primary',
    ];
    for (const sel of selectors) {
      try {
        const btn = await this.page!.$(sel);
        if (btn) {
          await this.humanDelay(400, 800);
          await btn.click();
          await this.page!.waitForLoadState('networkidle', { timeout: 30000 });
          return;
        }
      } catch {}
    }
    throw new Error('Submit button not found on Patta portal');
  }

  private async submitCaptchaInput(solution: string) {
    const selectors = ['input[id*="captcha" i]', 'input[name*="captcha" i]'];
    for (const sel of selectors) {
      try { await this.humanType(sel, solution); break; } catch {}
    }
  }

  private async extractPattaData(): Promise<Partial<PattaResult>> {
    const data: Partial<PattaResult> = {};

    try {
      // Look for result table
      const rows = await this.page!.$$('.result-table tr, table tr, .patta-result tr');

      const labelMap: Record<string, keyof PattaResult> = {
        'patta no': 'pattaNumber',
        'owner name': 'ownerName',
        "father's name": 'fatherName',
        'address': 'address',
        'survey no': 'surveyNumber',
        'sub division': 'subDivision',
        'land classification': 'landClassification',
        'extent (ha)': 'extentHectares',
        'extent (acres)': 'extentAcres',
        'water source': 'waterSource',
        'tax': 'taxAssessment',
      };

      for (const row of rows) {
        const cells = await row.$$('td, th');
        if (cells.length >= 2) {
          const label = ((await cells[0]?.textContent()) || '').toLowerCase().trim();
          const value = ((await cells[1]?.textContent()) || '').trim();

          for (const [key, field] of Object.entries(labelMap)) {
            if (label.includes(key)) {
              (data as any)[field] = value;
            }
          }
        }
      }

      data.rawData = { extractedAt: new Date().toISOString() };
    } catch (err: any) {
      this.logger.warn('Patta extraction warning: ' + err.message);
    }

    return data;
  }
}
