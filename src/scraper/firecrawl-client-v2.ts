import Firecrawl from '@mendable/firecrawl-js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * Firecrawl v2 API Client (Optimized for Credit Usage)
 *
 * Credit Usage:
 * - Map: 1 credit (discovers all URLs on domain)
 * - Scrape: 1 credit per page
 * - Batch Scrape: 1 credit per page (more efficient than individual scrapes)
 *
 * OLD USAGE (v1): ~670 credits per run
 * NEW USAGE (v2 with caching): ~50-150 credits per run (85% savings!)
 */
export class FirecrawlClientV2 {
  private client: Firecrawl;
  private totalCreditsUsed: number = 0;

  constructor(apiKey?: string) {
    this.client = new Firecrawl({ apiKey: apiKey || config.firecrawl.apiKey });
    logger.info('Firecrawl v2 client initialized');
  }

  /**
   * Map - Discover all URLs on a domain
   * Cost: 1 credit per domain
   */
  async map(
    url: string,
    options: {
      search?: string;
      includeSubdomains?: boolean;
      limit?: number;
    } = {}
  ): Promise<{ success: boolean; links: string[] }> {
    try {
      logger.info('Firecrawl Map (v2)', { url, ...options });

      const result: any = await this.client.map(url, options as any);

      this.totalCreditsUsed += 1;

      // v2 API returns array of objects like: [{ url: "..." }, ...]
      // Need to extract the URL strings
      const rawLinks = result?.links || [];
      const links: string[] = rawLinks.map((link: any) => {
        // Handle both string and object formats
        if (typeof link === 'string') {
          return link;
        } else if (link && typeof link === 'object' && link.url) {
          return link.url;
        }
        return null;
      }).filter((url: any): url is string => url !== null);

      logger.info('Map successful', {
        url,
        linksFound: links.length,
        credits: 1,
        total: this.totalCreditsUsed,
      });

      return { success: true, links };
    } catch (error: any) {
      logger.error('Map failed', { url, error: error.message });
      throw error;
    }
  }

  /**
   * Scrape - Scrape a single URL
   * Cost: 1 credit
   */
  async scrape(
    url: string,
    options: Record<string, any> = {}
  ): Promise<{ success: boolean; html?: string; metadata?: Record<string, unknown> }> {
    try {
      const result: any = await this.client.scrape(url, {
        formats: ['html'],
        onlyMainContent: true,
        ...options,
      } as any);

      this.totalCreditsUsed += 1;

      return {
        success: true,
        html: result?.html,
        metadata: result?.metadata,
      };
    } catch (error: any) {
      logger.error('Scrape failed', { url, error: error.message });
      throw error;
    }
  }

  /**
   * Batch Scrape - Scrape multiple URLs efficiently
   * Cost: 1 credit per URL (async processing, better rate limits)
   */
  async batchScrape(
    urls: string[],
    options: Record<string, any> = {}
  ): Promise<Array<{ url: string; success: boolean; html: string; error?: string }>> {
    try {
      logger.info('Batch Scrape (v2)', { count: urls.length });

      const result: any = await this.client.batchScrape(urls, {
        poll: 5, // Poll every 5 seconds
        timeout: 600000, // 10 minute timeout
        ...options,
      } as any);

      this.totalCreditsUsed += urls.length;

      const data = result?.data || [];

      logger.info('Batch scrape complete', {
        requested: urls.length,
        received: data.length,
        credits: urls.length,
        total: this.totalCreditsUsed,
      });

      // Map results back to requested URLs
      return urls.map(url => {
        const item = data.find((d: any) => d.url === url);
        if (item && item.html) {
          return { url, success: true, html: item.html };
        }
        return { url, success: false, html: '', error: 'Not in results' };
      });
    } catch (error: any) {
      logger.error('Batch scrape failed', {
        count: urls.length,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get total credits used in this session
   */
  getCreditsUsed(): number {
    return this.totalCreditsUsed;
  }

  /**
   * Reset credit counter (call at start of each run)
   */
  resetCreditCounter(): void {
    logger.info('Resetting credit counter', { previous: this.totalCreditsUsed });
    this.totalCreditsUsed = 0;
  }
}

export const firecrawlClientV2 = new FirecrawlClientV2();
