import { logger } from '../utils/logger.js';
import { extractPriceFromHtml } from './honda-selectors.js';

/**
 * Bright Data MCP Client
 *
 * Uses Bright Data MCP server for scraping with automatic:
 * - Bot protection bypass
 * - Residential IP rotation
 * - Proxy configuration
 * - CAPTCHA handling
 *
 * Cost: Based on bandwidth usage
 */
export class BrightDataMCPClient {
  private readonly maxRetries = 3;

  /**
   * Scrape a single URL using Bright Data MCP server
   *
   * NOTE: This is a TypeScript wrapper. The actual MCP call must be made
   * from the calling context that has access to MCP tools.
   *
   * For now, this uses direct HTTP requests to Bright Data API as a fallback.
   */
  async scrapeUrl(url: string): Promise<{ success: boolean; html?: string; error?: string }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.debug('Scraping URL with Bright Data', { url, attempt });

        // Use Bright Data's Web Unlocker API
        // This is the programmatic equivalent of the MCP server
        const response = await fetch('https://brd.superproxy.io:22225', {
          method: 'GET',
          headers: {
            'Host': new URL(url).hostname,
            'brd-customer-hl_145f098d-zone-unblocker': process.env.BRIGHT_DATA_PROXY_PASSWORD || '',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();

        logger.info('Successfully scraped URL with Bright Data', {
          url,
          htmlLength: html.length,
        });

        return { success: true, html };

      } catch (error) {
        lastError = error as Error;

        logger.warn('Failed to scrape URL with Bright Data', {
          url,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });

        // Exponential backoff
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
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
   * Scrape multiple URLs with concurrency control
   */
  async scrapeUrls(
    urls: string[],
    options: { concurrency?: number } = {}
  ): Promise<Array<{ url: string; success: boolean; html?: string; error?: string }>> {
    const concurrency = options.concurrency || 3;

    logger.info('Scraping URLs with Bright Data', {
      count: urls.length,
      concurrency,
    });

    const results: Array<{ url: string; success: boolean; html?: string; error?: string }> = [];

    // Process in batches
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

      // Delay between batches
      if (i + concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
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
      const result = extractPriceFromHtml(html, url);

      return {
        ...result,
        currency: 'NZD',
        source: 'brightdata_mcp',
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
        source: 'brightdata_mcp',
      };
    }
  }

  /**
   * Check if configured
   */
  isConfigured(): boolean {
    return !!(process.env.BRIGHT_DATA_USERNAME && process.env.BRIGHT_DATA_PROXY_PASSWORD);
  }
}

// Singleton instance
export const brightDataMCPClient = new BrightDataMCPClient();
