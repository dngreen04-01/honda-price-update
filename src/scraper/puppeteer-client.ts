import puppeteer from 'puppeteer-core';
import { Browser, Page } from 'puppeteer';
import { logger } from '../utils/logger.js';
import { extractPriceFromHtml } from './honda-selectors.js';

/**
 * Puppeteer-based scraper client using Bright Data Scraping Browser
 *
 * Bright Data's Scraping Browser provides:
 * - Automatic unblocking of bot protection (Cloudflare, etc.)
 * - Residential IP rotation
 * - Browser fingerprint management
 * - CAPTCHA solving
 *
 * IMPORTANT: Scraping Browser allows only ONE navigation per session.
 * Each URL scrape creates a new browser connection.
 *
 * Cost: ~$2.50 per 1000 requests (much cheaper than Firecrawl)
 */
export class PuppeteerClient {
  private browser: Browser | null = null; // Only used for testConnection()
  private readonly maxRetries = 3;
  private readonly requestTimeout = 120000; // 2 minutes for Bright Data processing

  /**
   * Get Bright Data Scraping Browser WebSocket endpoint
   */
  private getBrowserWSEndpoint(): string {
    const browserAPI = process.env.BRIGHT_DATA_BROWSER_API;
    if (!browserAPI) {
      throw new Error('BRIGHT_DATA_BROWSER_API not configured in .env');
    }

    // Handle both formats: full URL or just auth credentials
    if (browserAPI.startsWith('wss://')) {
      return browserAPI;
    } else {
      return `wss://${browserAPI}@brd.superproxy.io:9222`;
    }
  }

  /**
   * Initialize browser connection to Bright Data Scraping Browser
   */
  async initialize(): Promise<void> {
    if (this.browser) {
      return; // Already initialized
    }

    // Check if credentials are configured
    if (!process.env.BRIGHT_DATA_BROWSER_API) {
      throw new Error(
        'Bright Data Scraping Browser not configured. Please set BRIGHT_DATA_BROWSER_API in .env'
      );
    }

    logger.info('Connecting to Bright Data Scraping Browser');

    try {
      const browserWSEndpoint = this.getBrowserWSEndpoint();

      // Connect to Bright Data's Scraping Browser via WebSocket
      this.browser = await puppeteer.connect({ browserWSEndpoint });

      logger.info('Successfully connected to Bright Data Scraping Browser');
    } catch (error) {
      logger.error('Failed to connect to Bright Data Scraping Browser', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create new page with optimizations
   */
  private async createPage(): Promise<Page> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();

    // Set realistic viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Note: Bright Data handles user agent, Accept-Language, and fingerprinting automatically
    // Don't override headers - it's forbidden by Scraping Browser

    return page;
  }

  /**
   * Scrape a single URL with retry logic
   *
   * IMPORTANT: Bright Data Scraping Browser allows only ONE navigation per session.
   * We must create a new browser connection for each URL.
   */
  async scrapeUrl(url: string): Promise<{ success: boolean; html?: string; error?: string }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      let browser: Browser | null = null;
      let page: Page | null = null;

      try {
        // Create a NEW browser session for each URL (Bright Data requirement)
        logger.debug('Creating new browser session for URL', { url, attempt });

        const browserWSEndpoint = this.getBrowserWSEndpoint();
        browser = await puppeteer.connect({ browserWSEndpoint });

        page = await browser.newPage();

        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });

        logger.debug('Scraping URL with Bright Data', { url, attempt, maxRetries: this.maxRetries });

        // Navigate with extended timeout (Bright Data needs time to process bot protection)
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: this.requestTimeout,
        });

        logger.debug('Page loaded, waiting for product content', { url });

        // Wait for product-specific elements to ensure page is fully loaded
        try {
          await page.waitForSelector(
            '.product-info-price, .product-info-main, [itemprop="price"], .price-box',
            { timeout: 30000 }
          );
          logger.debug('Product content detected', { url });
        } catch (waitError) {
          logger.warn('Product content selector timeout - continuing anyway', { url });
        }

        // Additional wait for JavaScript-rendered prices (especially for #total-price on hondaoutdoors.co.nz)
        // Some Magento sites use JavaScript to calculate and display final prices
        logger.debug('Waiting for JavaScript price rendering', { url });
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if we got a real product page or an error/blocking page
        const pageAnalysis = await page.evaluate(() => {
          const title = document.title;
          const bodyText = document.body.textContent || '';

          return {
            title,
            hasProductPrice: !!(
              document.querySelector('.product-info-price') ||
              document.querySelector('[itemprop="price"]') ||
              document.querySelector('.price-box')
            ),
            hasProductInfo: !!document.querySelector('.product-info-main'),
            hasErrorMessage: bodyText.includes('Forbidden') || bodyText.includes('403') || bodyText.includes('blocked'),
            bodyLength: bodyText.length,
          };
        });

        logger.debug('Page analysis', { url, ...pageAnalysis });

        // If we got an error page, throw to retry
        if (pageAnalysis.hasErrorMessage && !pageAnalysis.hasProductPrice) {
          throw new Error(`Got error page: ${pageAnalysis.title}`);
        }

        // If page looks empty or blocked, throw to retry
        if (pageAnalysis.bodyLength < 500) {
          throw new Error('Page content too short - possible blocking');
        }

        // Extract HTML
        const html = await page.content();

        // Close browser session (required for Bright Data)
        await page.close();
        await browser.close();

        logger.info('Successfully scraped URL with Bright Data', {
          url,
          htmlLength: html.length,
          hasProductPrice: pageAnalysis.hasProductPrice,
          hasProductInfo: pageAnalysis.hasProductInfo,
        });

        return { success: true, html };

      } catch (error) {
        lastError = error as Error;

        logger.warn('Failed to scrape URL with Bright Data', {
          url,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });

        // Clean up browser session
        if (page) {
          try {
            await page.close();
          } catch (e) {
            // Ignore close errors
          }
        }
        if (browser) {
          try {
            await browser.close();
          } catch (e) {
            // Ignore close errors
          }
        }

        // Exponential backoff: 2s, 4s, 8s
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.debug('Retrying after delay', { url, delay });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error('All retry attempts failed', {
      url,
      error: lastError?.message || 'Unknown error',
    });

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
    };
  }

  /**
   * Scrape multiple URLs (with concurrency limit)
   *
   * IMPORTANT: Each URL creates a NEW browser session (Bright Data requirement).
   * Scraping Browser allows only one navigation per session.
   */
  async scrapeUrls(
    urls: string[],
    options: { concurrency?: number } = {}
  ): Promise<Array<{ url: string; success: boolean; html?: string; error?: string }>> {
    const concurrency = options.concurrency || 3; // Each URL gets its own session

    logger.info('Scraping URLs with Bright Data Scraping Browser', {
      count: urls.length,
      concurrency,
      note: 'Each URL creates a new browser session',
    });

    const results: Array<{ url: string; success: boolean; html?: string; error?: string }> = [];

    // Process in batches to limit concurrency
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);

      const batchResults = await Promise.all(
        batch.map(async (url) => {
          const result = await this.scrapeUrl(url);
          return { url, ...result };
        })
      );

      results.push(...batchResults);

      logger.debug('Batch completed', {
        batch: Math.floor(i / concurrency) + 1,
        totalBatches: Math.ceil(urls.length / concurrency),
        successCount: batchResults.filter(r => r.success).length,
      });

      // Small delay between batches
      if (i + concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter(r => r.success).length;

    logger.info('Bright Data scraping completed', {
      total: urls.length,
      successful: successCount,
      failed: urls.length - successCount,
      successRate: `${((successCount / urls.length) * 100).toFixed(1)}%`,
    });

    return results;
  }

  /**
   * Extract price from HTML using Honda-specific selectors
   */
  extractPrice(url: string, html: string): {
    salePrice: number | null;
    originalPrice: number | null;
    currency: string;
    confidence: number;
    source: string;
  } {
    try {
      // Use honda-selectors extraction logic
      const result = extractPriceFromHtml(html, url);

      return {
        ...result,
        currency: 'NZD',
        source: 'bright_data',
      };

    } catch (error) {
      logger.error('Failed to extract price from HTML', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        salePrice: null,
        originalPrice: null,
        currency: 'NZD',
        confidence: 0,
        source: 'bright_data',
      };
    }
  }

  /**
   * Close browser connection
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Bright Data browser connection closed');
    }
  }

  /**
   * Get connection status
   */
  isConfigured(): boolean {
    return !!process.env.BRIGHT_DATA_BROWSER_API;
  }

  /**
   * Test connection to Bright Data
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.initialize();
      const page = await this.createPage();

      // Test with a simple page
      await page.goto('https://www.google.com', { timeout: 30000 });
      const title = await page.title();

      await page.close();
      await this.close();

      return {
        success: true,
        message: `Successfully connected to Bright Data. Test page title: ${title}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// Singleton instance
export const puppeteerClient = new PuppeteerClient();
