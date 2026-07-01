import { Logger } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { randomInt } from 'crypto';

/**
 * Base scraper with:
 * - Human-like typing simulation
 * - Random delays (1–5 sec)
 * - CAPTCHA detection
 * - Retry with exponential backoff
 * - Screenshot capture
 * - Rate-limit-aware navigation
 */
export abstract class BaseScraper {
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected readonly logger: Logger;

  // Rotate through realistic UA strings
  private static readonly USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  ];

  constructor(name: string) {
    this.logger = new Logger(name);
  }

  protected async launch() {
    const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
    this.browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
    });

    const ua = BaseScraper.USER_AGENTS[randomInt(BaseScraper.USER_AGENTS.length)];
    this.context = await this.browser.newContext({
      userAgent: ua,
      viewport: { width: 1280, height: 800 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      // Mask automation indicators
      extraHTTPHeaders: {
        'Accept-Language': 'en-IN,en;q=0.9,ta;q=0.8',
      },
    });

    // Remove webdriver flag
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(30000);
    this.page.setDefaultNavigationTimeout(45000);
  }

  protected async close() {
    try {
      await this.browser?.close();
    } catch (e) {
      this.logger.warn('Error closing browser: ' + e);
    } finally {
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  /** Human-like typing: random delay between each keystroke */
  protected async humanType(selector: string, text: string) {
    await this.page!.click(selector);
    await this.page!.fill(selector, ''); // clear
    for (const char of text) {
      await this.page!.type(selector, char, { delay: randomInt(60, 180) });
    }
    // Small pause after typing
    await this.humanDelay(300, 800);
  }

  /** Random delay to simulate human think time */
  protected async humanDelay(minMs = 1000, maxMs = 5000) {
    const ms = randomInt(minMs, maxMs);
    await new Promise((r) => setTimeout(r, ms));
  }

  /** Take screenshot and return base64 */
  protected async screenshot(): Promise<string> {
    const buf = await this.page!.screenshot({ fullPage: false, type: 'jpeg', quality: 80 });
    return buf.toString('base64');
  }

  /** Detect common CAPTCHA patterns */
  protected async isCaptchaPresent(): Promise<boolean> {
    const indicators = [
      'iframe[src*="recaptcha"]',
      'iframe[src*="captcha"]',
      '#captcha',
      '.captcha',
      '[class*="captcha"]',
      '[id*="captcha"]',
      'img[src*="captcha"]',
      'input[name*="captcha"]',
    ];

    for (const selector of indicators) {
      try {
        const el = await this.page!.$(selector);
        if (el) return true;
      } catch {}
    }

    // Check page text for CAPTCHA keywords
    const content = await this.page!.content();
    const lower = content.toLowerCase();
    return (
      lower.includes('captcha') ||
      lower.includes('verify you are human') ||
      lower.includes('are you a robot')
    );
  }

  /** Retry with exponential backoff */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    retries = 3,
    baseDelayMs = 3000,
  ): Promise<T> {
    let lastError: Error = new Error('Unknown error');
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        if (attempt < retries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          this.logger.warn(`Attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }

  /** Navigate and wait for network idle */
  protected async navigateTo(url: string) {
    await this.page!.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await this.humanDelay(1000, 2000);
  }

  /** Wait for selector with timeout */
  protected async waitFor(selector: string, timeoutMs = 15000) {
    await this.page!.waitForSelector(selector, { timeout: timeoutMs });
  }

  /** Safe text extraction */
  protected async getText(selector: string): Promise<string | null> {
    try {
      return await this.page!.textContent(selector);
    } catch {
      return null;
    }
  }

  /** Safe attribute extraction */
  protected async getAttribute(selector: string, attr: string): Promise<string | null> {
    try {
      return await this.page!.getAttribute(selector, attr);
    } catch {
      return null;
    }
  }
}
