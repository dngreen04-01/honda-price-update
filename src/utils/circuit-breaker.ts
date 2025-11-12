import { logger } from './logger.js';

/**
 * Circuit Breaker Pattern Implementation
 * Prevents wasting resources on systematic failures
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, reject requests immediately
 * - HALF_OPEN: Testing if service recovered, allow limited requests
 */
export class CircuitBreaker {
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly halfOpenSuccessThreshold: number;
  private readonly name: string;

  constructor(options: {
    name: string;
    failureThreshold?: number;
    resetTimeout?: number;
    halfOpenSuccessThreshold?: number;
  }) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 60000; // 1 minute
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 2;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition to HALF_OPEN
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);

      if (timeSinceLastFailure >= this.resetTimeout) {
        logger.info(`Circuit breaker ${this.name} transitioning to HALF_OPEN`, {
          timeSinceLastFailure,
          resetTimeout: this.resetTimeout,
        });
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error(
          `Circuit breaker ${this.name} is OPEN. Rejecting request. ` +
          `Retry in ${Math.ceil((this.resetTimeout - timeSinceLastFailure) / 1000)}s`
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;

      logger.debug(`Circuit breaker ${this.name} success in HALF_OPEN`, {
        successCount: this.successCount,
        threshold: this.halfOpenSuccessThreshold,
      });

      if (this.successCount >= this.halfOpenSuccessThreshold) {
        logger.info(`Circuit breaker ${this.name} transitioning to CLOSED`, {
          successCount: this.successCount,
        });
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    logger.warn(`Circuit breaker ${this.name} failure`, {
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
      state: this.state,
    });

    if (this.state === 'HALF_OPEN') {
      logger.warn(`Circuit breaker ${this.name} failed in HALF_OPEN, reopening`, {
        failureCount: this.failureCount,
      });
      this.state = 'OPEN';
      this.failureCount = 0;
    } else if (this.failureCount >= this.failureThreshold) {
      logger.error(`Circuit breaker ${this.name} opening due to failures`, {
        failureCount: this.failureCount,
        threshold: this.failureThreshold,
      });
      this.state = 'OPEN';
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state;
  }

  /**
   * Get current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    logger.info(`Circuit breaker ${this.name} manually reset`);
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }
}
