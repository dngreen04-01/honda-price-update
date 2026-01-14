import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import axios from 'axios';
import { ScraplingClient } from './scrapling-client.js';

// Mock dependencies
vi.mock('axios', async () => {
  return {
    default: {
      create: vi.fn(),
      isAxiosError: vi.fn(),
    },
  };
});

vi.mock('../utils/config.js', () => ({
  config: {
    scrapling: {
      serviceUrl: 'http://localhost:8002',
      timeoutMs: 60000,
      maxRetries: 3,
      renderJs: true,
      proxyUrl: undefined,
    },
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../utils/circuit-breaker.js', () => ({
  CircuitBreaker: vi.fn().mockImplementation(() => ({
    execute: vi.fn((fn) => fn()),
    getState: vi.fn(() => 'CLOSED'),
    reset: vi.fn(),
  })),
}));

describe('ScraplingClient', () => {
  let client: ScraplingClient;
  let mockPost: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup axios mock
    mockPost = vi.fn();
    (axios.create as Mock).mockReturnValue({ post: mockPost });
    (axios.isAxiosError as unknown as Mock).mockImplementation(
      (error: unknown) => !!(error as { isAxiosError?: boolean })?.isAxiosError
    );

    client = new ScraplingClient('http://localhost:test');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(client).toBeDefined();
    });

    it('should create axios client with provided URL', () => {
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:test',
        timeout: 60000,
      });
    });
  });

  describe('scrape - success cases', () => {
    it('should scrape a URL successfully', async () => {
      const mockHtml = '<html><body>Test</body></html>';
      mockPost.mockResolvedValue({
        data: {
          success: true,
          data: {
            html: mockHtml,
            status: 200,
            headers: {},
          },
        },
      });

      const result = await client.scrape('https://example.com');

      expect(result.success).toBe(true);
      expect(result.html).toBe(mockHtml);
      expect(mockPost).toHaveBeenCalledWith(
        '/scrape',
        {
          url: 'https://example.com',
          render_js: true,
          proxy_url: undefined,
        },
        { timeout: 60000 }
      );
    });

    it('should pass scrape options to the service', async () => {
      mockPost.mockResolvedValue({
        data: {
          success: true,
          data: { html: '<html></html>', status: 200, headers: {} },
        },
      });

      await client.scrape('https://example.com', {
        renderJs: false,
        proxyUrl: 'http://proxy:8080',
        timeoutMs: 30000,
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/scrape',
        {
          url: 'https://example.com',
          render_js: false,
          proxy_url: 'http://proxy:8080',
        },
        { timeout: 30000 }
      );
    });
  });

  describe('scrape - error handling', () => {
    it('should handle service errors gracefully after retries', async () => {
      const errorMessage = 'Service Unavailable';
      mockPost.mockRejectedValue(new Error(errorMessage));

      const scrapePromise = client.scrape('https://example.com');

      // Advance timers for retry delays (unknown errors are retried)
      await vi.advanceTimersByTimeAsync(2000); // First retry delay
      await vi.advanceTimersByTimeAsync(4000); // Second retry delay

      const result = await scrapePromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
    });

    it('should handle axios 400 errors without retry', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 400, data: { detail: 'Scraping failed inside python' } },
        message: 'Request failed',
      };
      mockPost.mockRejectedValue(axiosError);

      // No timer advancement needed - 400 errors don't retry
      const result = await client.scrape('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Request failed');
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('should handle unsuccessful response from service after retries', async () => {
      mockPost.mockResolvedValue({
        data: {
          success: false,
          detail: { message: 'Failed to scrape' },
        },
      });

      const scrapePromise = client.scrape('https://example.com');

      // Advance timers for retry delays (unsuccessful responses are retried as they throw)
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      const result = await scrapePromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('unsuccessful response');
    });
  });

  describe('retry behavior', () => {
    it('should retry on network errors', async () => {
      const networkError = new Error('ECONNREFUSED');
      mockPost
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          data: {
            success: true,
            data: { html: '<html></html>', status: 200, headers: {} },
          },
        });

      const scrapePromise = client.scrape('https://example.com');

      // Advance timers for retries (2s, 4s delays)
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      const result = await scrapePromise;

      expect(result.success).toBe(true);
      expect(mockPost).toHaveBeenCalledTimes(3);
    });

    it('should retry on 500 server errors', async () => {
      const serverError = {
        isAxiosError: true,
        response: { status: 500, data: { detail: 'Internal error' } },
        message: 'Internal Server Error',
      };

      mockPost
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({
          data: {
            success: true,
            data: { html: '<html></html>', status: 200, headers: {} },
          },
        });

      const scrapePromise = client.scrape('https://example.com');

      // Advance timer for first retry (2s)
      await vi.advanceTimersByTimeAsync(2000);

      const result = await scrapePromise;

      expect(result.success).toBe(true);
      expect(mockPost).toHaveBeenCalledTimes(2);
    });

    it('should NOT retry on 400 client errors', async () => {
      const clientError = {
        isAxiosError: true,
        response: { status: 400, data: { detail: 'Bad request' } },
        message: 'Bad Request',
      };

      mockPost.mockRejectedValue(clientError);

      const result = await client.scrape('https://example.com');

      expect(result.success).toBe(false);
      expect(mockPost).toHaveBeenCalledTimes(1); // No retries
    });

    it('should NOT retry on 404 errors', async () => {
      const notFoundError = {
        isAxiosError: true,
        response: { status: 404, data: { detail: 'Not found' } },
        message: 'Not Found',
      };

      mockPost.mockRejectedValue(notFoundError);

      const result = await client.scrape('https://example.com');

      expect(result.success).toBe(false);
      expect(mockPost).toHaveBeenCalledTimes(1); // No retries
    });

    it('should fail after exhausting all retries', async () => {
      const networkError = new Error('ECONNREFUSED');
      mockPost.mockRejectedValue(networkError);

      const scrapePromise = client.scrape('https://example.com');

      // Advance timers for all retry delays
      await vi.advanceTimersByTimeAsync(2000); // First retry
      await vi.advanceTimersByTimeAsync(4000); // Second retry

      const result = await scrapePromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('ECONNREFUSED');
      expect(mockPost).toHaveBeenCalledTimes(3);
    });
  });

  describe('circuit breaker integration', () => {
    it('should expose circuit breaker state', () => {
      const state = client.getCircuitBreakerState();
      expect(state).toBe('CLOSED');
    });

    it('should allow resetting circuit breaker', () => {
      expect(() => client.resetCircuitBreaker()).not.toThrow();
    });
  });

  describe('timeout handling', () => {
    it('should use default timeout from config', async () => {
      mockPost.mockResolvedValue({
        data: {
          success: true,
          data: { html: '<html></html>', status: 200, headers: {} },
        },
      });

      await client.scrape('https://example.com');

      expect(mockPost).toHaveBeenCalledWith(
        '/scrape',
        expect.any(Object),
        { timeout: 60000 }
      );
    });

    it('should use custom timeout when provided', async () => {
      mockPost.mockResolvedValue({
        data: {
          success: true,
          data: { html: '<html></html>', status: 200, headers: {} },
        },
      });

      await client.scrape('https://example.com', { timeoutMs: 15000 });

      expect(mockPost).toHaveBeenCalledWith(
        '/scrape',
        expect.any(Object),
        { timeout: 15000 }
      );
    });
  });
});
