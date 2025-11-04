import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { FirecrawlMapResult, FirecrawlCrawlResult } from '../types/index.js';

const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v1';

export class FirecrawlClient {
  private client: AxiosInstance;

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: FIRECRAWL_BASE_URL,
      headers: {
        Authorization: `Bearer ${apiKey || config.firecrawl.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60 seconds
    });
  }

  /**
   * Map endpoint - discovers URLs on a website
   */
  async map(
    url: string,
    options: {
      search?: string;
      ignoreSitemap?: boolean;
      includeSubdomains?: boolean;
      limit?: number;
    } = {}
  ): Promise<FirecrawlMapResult> {
    try {
      logger.info('Firecrawl Map request', { url, options });

      const response = await this.client.post('/map', {
        url,
        search: options.search,
        ignoreSitemap: options.ignoreSitemap ?? false,
        includeSubdomains: options.includeSubdomains ?? false,
        limit: options.limit ?? 5000,
      });

      if (response.data.success) {
        logger.info('Firecrawl Map successful', {
          url,
          linksFound: response.data.links?.length || 0,
        });
      }

      return {
        success: response.data.success,
        links: response.data.links || [],
      };
    } catch (error) {
      logger.error('Firecrawl Map failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Crawl endpoint - crawls URLs and extracts content
   */
  async crawl(
    url: string,
    options: {
      includePaths?: string[];
      excludePaths?: string[];
      maxDepth?: number;
      limit?: number;
      allowBackwardLinks?: boolean;
      allowExternalLinks?: boolean;
      webhook?: string;
    } = {}
  ): Promise<FirecrawlCrawlResult> {
    try {
      logger.info('Firecrawl Crawl request', { url, options });

      const response = await this.client.post('/crawl', {
        url,
        includePaths: options.includePaths,
        excludePaths: options.excludePaths,
        maxDepth: options.maxDepth ?? 3,
        limit: options.limit ?? 100,
        allowBackwardLinks: options.allowBackwardLinks ?? false,
        allowExternalLinks: options.allowExternalLinks ?? false,
        webhook: options.webhook,
        scrapeOptions: {
          formats: ['html', 'markdown'],
          onlyMainContent: true,
        },
      });

      if (response.data.success) {
        logger.info('Firecrawl Crawl successful', {
          url,
          pagesScraped: response.data.data?.length || 0,
        });
      }

      return {
        success: response.data.success,
        data: response.data.data || [],
      };
    } catch (error) {
      logger.error('Firecrawl Crawl failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Scrape endpoint - scrapes a single URL
   */
  async scrape(
    url: string,
    options: {
      formats?: string[];
      onlyMainContent?: boolean;
      includeTags?: string[];
      excludeTags?: string[];
    } = {}
  ): Promise<{ success: boolean; html: string; metadata?: Record<string, unknown> }> {
    try {
      logger.debug('Firecrawl Scrape request', { url });

      const response = await this.client.post('/scrape', {
        url,
        formats: options.formats || ['html'],
        onlyMainContent: options.onlyMainContent ?? true,
        includeTags: options.includeTags,
        excludeTags: options.excludeTags,
      });

      return {
        success: response.data.success,
        html: response.data.data?.html || '',
        metadata: response.data.data?.metadata,
      };
    } catch (error) {
      logger.error('Firecrawl Scrape failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Extract endpoint - uses LLM to extract structured data
   */
  async extract<T = unknown>(
    url: string,
    schema: Record<string, unknown>,
    options: {
      prompt?: string;
      allowExternalLinks?: boolean;
    } = {}
  ): Promise<{ success: boolean; data: T }> {
    try {
      logger.info('Firecrawl Extract request', { url });

      const response = await this.client.post('/extract', {
        url,
        schema,
        prompt: options.prompt,
        allowExternalLinks: options.allowExternalLinks ?? false,
      });

      return {
        success: response.data.success,
        data: response.data.data as T,
      };
    } catch (error) {
      logger.error('Firecrawl Extract failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Batch scrape - scrapes multiple URLs
   */
  async batchScrape(
    urls: string[],
    options: {
      formats?: string[];
      onlyMainContent?: boolean;
    } = {}
  ): Promise<Array<{ url: string; success: boolean; html: string; error?: string }>> {
    const results = [];

    for (const url of urls) {
      try {
        const result = await this.scrape(url, options);
        results.push({
          url,
          success: result.success,
          html: result.html,
        });
      } catch (error) {
        results.push({
          url,
          success: false,
          html: '',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Rate limiting - wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }
}

export const firecrawlClient = new FirecrawlClient();
