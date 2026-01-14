import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';

interface ScrapeResponse {
  success: boolean;
  data: {
    html: string;
    status: number;
    headers: Record<string, string>;
  };
}

export interface ScrapeOptions {
  renderJs?: boolean;
  proxyUrl?: string;
  timeoutMs?: number;
}

export interface ScrapeResult {
  success: boolean;
  html: string;
  error?: string;
}

export class ScraplingClient {
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;
  private maxRetries: number;
  private defaultTimeout: number;
  private defaultRenderJs: boolean;
  private defaultProxyUrl?: string;

  constructor(serviceUrl?: string) {
    this.maxRetries = config.scrapling.maxRetries ?? 3;
    this.defaultTimeout = config.scrapling.timeoutMs ?? 60000;
    this.defaultRenderJs = config.scrapling.renderJs ?? true;
    this.defaultProxyUrl = config.scrapling.proxyUrl;

    this.client = axios.create({
      baseURL: serviceUrl || config.scrapling.serviceUrl,
      timeout: this.defaultTimeout,
    });

    this.circuitBreaker = new CircuitBreaker({
      name: 'scrapling',
      failureThreshold: 5,
      resetTimeout: 60000,
    });
  }

  /**
   * Scrapes a single URL using the Python Scrapling service
   * with circuit breaker protection and automatic retries
   */
  async scrape(url: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    try {
      return await this.circuitBreaker.execute(() =>
        this.scrapeWithRetry(url, options)
      );
    } catch (error) {
      // Circuit breaker rejection or final failure
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      logger.error('Scrapling scrape failed', {
        url,
        error: errorMessage,
        circuitBreakerState: this.circuitBreaker.getState(),
      });

      return {
        success: false,
        html: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Scrape with retry logic and exponential backoff
   */
  private async scrapeWithRetry(
    url: string,
    options?: ScrapeOptions
  ): Promise<ScrapeResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.doScrape(url, options);
      } catch (error) {
        lastError = this.toError(error);

        if (this.shouldRetry(error, attempt)) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn('Scrapling request failed, retrying', {
            url,
            attempt,
            maxRetries: this.maxRetries,
            delayMs: delay,
            error: lastError.message,
          });
          await this.sleep(delay);
        } else {
          // Don't retry - rethrow immediately
          throw lastError;
        }
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /**
   * Determine if an error is retryable
   */
  private shouldRetry(error: unknown, attempt: number): boolean {
    // Don't retry if we've exhausted attempts
    if (attempt >= this.maxRetries) {
      return false;
    }

    if (axios.isAxiosError(error)) {
      // Retry on network errors (no response received)
      if (!error.response) {
        return true;
      }

      // Retry on 5xx server errors
      if (error.response.status >= 500) {
        return true;
      }

      // Don't retry on 4xx client errors
      if (error.response.status >= 400 && error.response.status < 500) {
        return false;
      }
    }

    // Retry unknown errors (could be transient)
    return true;
  }

  /**
   * Perform the actual HTTP scrape request
   */
  private async doScrape(
    url: string,
    options?: ScrapeOptions
  ): Promise<ScrapeResult> {
    const renderJs = options?.renderJs ?? this.defaultRenderJs;
    const proxyUrl = options?.proxyUrl ?? this.defaultProxyUrl;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeout;

    logger.debug('Scrapling scrape request', {
      url,
      renderJs,
      hasProxy: !!proxyUrl,
      timeoutMs,
    });

    const response = await this.client.post<ScrapeResponse>(
      '/scrape',
      {
        url,
        render_js: renderJs,
        proxy_url: proxyUrl,
      },
      {
        timeout: timeoutMs,
      }
    );

    if (response.data.success) {
      logger.info('Scrapling scrape successful', {
        url,
        status: response.data.data.status,
        htmlLength: response.data.data.html.length,
      });

      return {
        success: true,
        html: response.data.data.html,
      };
    }

    // Service returned success: false
    throw new Error('Scrapling service returned unsuccessful response');
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Convert an unknown error to an Error instance
   */
  private toError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    if (axios.isAxiosError(error)) {
      return new Error(error.message || 'Axios error');
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return new Error(String((error as { message: unknown }).message));
    }
    return new Error(String(error));
  }

  /**
   * Scrape multiple URLs with concurrency control
   * Returns array of results in same order as input URLs
   */
  async scrapeUrls(
    urls: string[],
    options?: ScrapeOptions & { concurrency?: number }
  ): Promise<Array<{ url: string; success: boolean; html?: string; error?: string }>> {
    const concurrency = options?.concurrency ?? 3;
    const results: Array<{ url: string; success: boolean; html?: string; error?: string }> = [];

    logger.info('Scrapling batch scrape starting', {
      urlCount: urls.length,
      concurrency,
    });

    // Process URLs in batches
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchNumber = Math.floor(i / concurrency) + 1;
      const totalBatches = Math.ceil(urls.length / concurrency);

      logger.debug('Processing batch', {
        batchNumber,
        totalBatches,
        batchSize: batch.length,
      });

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (url) => {
          const result = await this.scrape(url, options);
          return {
            url,
            success: result.success,
            html: result.success ? result.html : undefined,
            error: result.error,
          };
        })
      );

      results.push(...batchResults);

      // Add delay between batches to avoid overwhelming the service
      if (i + concurrency < urls.length) {
        await this.sleep(1000);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.info('Scrapling batch scrape completed', {
      totalUrls: urls.length,
      successCount,
      failCount,
      successRate: `${((successCount / urls.length) * 100).toFixed(1)}%`,
    });

    return results;
  }

  /**
   * Get the current circuit breaker state (for monitoring/testing)
   */
  getCircuitBreakerState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset the circuit breaker (for testing)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }
}

export const scraplingClient = new ScraplingClient();
