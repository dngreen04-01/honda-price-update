import * as cron from 'node-cron';
import { runNightlyJob } from '../index.js';
import { logger } from '../utils/logger.js';
import { schedulerState } from '../database/scheduler-state.js';

/**
 * Job scheduler for automated scraping
 *
 * Cron schedule format:
 * ┌────────────── second (optional, 0-59)
 * │ ┌──────────── minute (0-59)
 * │ │ ┌────────── hour (0-23)
 * │ │ │ ┌──────── day of month (1-31)
 * │ │ │ │ ┌────── month (1-12)
 * │ │ │ │ │ ┌──── day of week (0-7, 0 and 7 are Sunday)
 * │ │ │ │ │ │
 * * * * * * *
 */

export interface SchedulerConfig {
  /** Cron expression for schedule (default: '0 2 * * *' = 2 AM daily) */
  schedule?: string;
  /** Run immediately on startup */
  runOnStart?: boolean;
  /** Enable scheduler */
  enabled?: boolean;
  /** Check for missed runs on startup (default: true) */
  checkMissedRuns?: boolean;
  /** Schedule interval in hours for missed run detection (default: 24 = daily) */
  scheduleIntervalHours?: number;
}

export class JobScheduler {
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;
  private config: Required<SchedulerConfig>;

  constructor(config: SchedulerConfig = {}) {
    this.config = {
      schedule: config.schedule || '0 2 * * *', // Default: 2 AM daily
      runOnStart: config.runOnStart ?? false,
      enabled: config.enabled ?? true,
      checkMissedRuns: config.checkMissedRuns ?? true,
      scheduleIntervalHours: config.scheduleIntervalHours ?? 24, // Default: 24 hours = 1 day
    };
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Scheduler is disabled');
      return;
    }

    if (this.task) {
      logger.warn('Scheduler is already running');
      return;
    }

    logger.info('Starting job scheduler', {
      schedule: this.config.schedule,
      runOnStart: this.config.runOnStart,
      checkMissedRuns: this.config.checkMissedRuns,
      intervalHours: this.config.scheduleIntervalHours,
    });

    // Validate cron expression
    if (!cron.validate(this.config.schedule)) {
      throw new Error(`Invalid cron expression: ${this.config.schedule}`);
    }

    // Check for missed runs on startup
    if (this.config.checkMissedRuns) {
      const missedRun = await schedulerState.checkMissedRun(this.config.scheduleIntervalHours);
      if (missedRun) {
        logger.warn('Missed run detected - running catch-up job now');
        await this.runNow();
      }
    }

    // Create scheduled task
    this.task = cron.schedule(
      this.config.schedule,
      async () => {
        if (this.isRunning) {
          logger.warn('Previous job still running, skipping this execution');
          return;
        }

        await this.executeJob('scheduled');
      }
    );

    logger.info('Job scheduler started', {
      schedule: this.config.schedule,
      timezone: 'Europe/London',
      nextRun: this.getNextRun(),
      description: 'Daily scrape (every day at 2 AM)',
    });

    // Run immediately on startup if configured (but not if we just ran a missed job)
    if (this.config.runOnStart && !await schedulerState.checkMissedRun(this.config.scheduleIntervalHours)) {
      logger.info('Running job immediately on startup');
      await this.runNow();
    }
  }

  /**
   * Execute the job and update state
   */
  private async executeJob(trigger: 'scheduled' | 'manual' | 'missed'): Promise<void> {
    try {
      this.isRunning = true;
      logger.info(`Job execution triggered (${trigger})`);

      await runNightlyJob();

      // Update scheduler state
      const nextRun = this.getNextRun();
      await schedulerState.updateLastRun('success', nextRun || undefined);

      logger.info(`Job completed successfully (${trigger})`);
    } catch (error) {
      logger.error(`Job failed (${trigger})`, {
        error: error instanceof Error ? error.message : String(error),
      });

      // Update state even on failure
      const nextRun = this.getNextRun();
      await schedulerState.updateLastRun('failed', nextRun || undefined);

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      logger.info('Stopping job scheduler');
      this.task.stop();
      this.task = null;
    }
  }

  /**
   * Run the job immediately (outside of schedule)
   */
  async runNow(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Job is already running');
      return;
    }

    try {
      this.isRunning = true;
      logger.info('Manual job execution triggered');
      await runNightlyJob();
      logger.info('Manual job execution completed');
    } catch (error) {
      logger.error('Manual job execution failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get the next scheduled run time
   */
  getNextRun(): Date | null {
    // Parse cron expression to calculate next run
    // This is a simplified version - node-cron doesn't expose next run time directly
    const parts = this.config.schedule.split(' ');
    if (parts.length < 5) return null;

    const now = new Date();
    const [minute, hour] = parts.map(p => parseInt(p));

    const next = new Date();
    next.setHours(hour, minute, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.task !== null;
  }

  /**
   * Check if a job is currently executing
   */
  isJobRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get scheduler configuration
   */
  getConfig(): Required<SchedulerConfig> {
    return { ...this.config };
  }
}

// Export singleton instance
export const scheduler = new JobScheduler();
