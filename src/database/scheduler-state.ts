import { supabase } from './client.js';
import { logger } from '../utils/logger.js';

/**
 * Scheduler state management
 * Tracks last run time to detect missed runs
 */

export interface SchedulerState {
  id: number;
  last_run_at: string;
  last_run_status: 'success' | 'failed';
  next_scheduled_run: string | null;
  created_at: string;
  updated_at: string;
}

export class SchedulerStateManager {
  private readonly TABLE_NAME = 'scheduler_state';

  /**
   * Get the last run timestamp
   */
  async getLastRunTime(): Promise<Date | null> {
    try {
      const { data, error } = await supabase
        .from(this.TABLE_NAME)
        .select('last_run_at')
        .order('last_run_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found - first run
          logger.info('No previous runs found');
          return null;
        }
        throw error;
      }

      return data ? new Date(data.last_run_at) : null;
    } catch (error) {
      logger.error('Failed to get last run time', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update last run timestamp
   */
  async updateLastRun(status: 'success' | 'failed', nextScheduledRun?: Date): Promise<void> {
    try {
      const now = new Date().toISOString();

      const { error } = await supabase
        .from(this.TABLE_NAME)
        .upsert({
          id: 1, // Single row
          last_run_at: now,
          last_run_status: status,
          next_scheduled_run: nextScheduledRun ? nextScheduledRun.toISOString() : null,
          updated_at: now,
        }, {
          onConflict: 'id',
        });

      if (error) {
        throw error;
      }

      logger.info('Updated scheduler state', {
        status,
        nextRun: nextScheduledRun?.toISOString(),
      });
    } catch (error) {
      logger.error('Failed to update scheduler state', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if a run was missed based on schedule
   * @param scheduleIntervalHours - Expected interval between runs (e.g., 168 for weekly)
   * @returns true if a run was missed
   */
  async checkMissedRun(scheduleIntervalHours: number): Promise<boolean> {
    try {
      const lastRun = await this.getLastRunTime();

      if (!lastRun) {
        // No previous run - not considered "missed", just first run
        logger.info('No previous run detected - first run');
        return false;
      }

      const now = new Date();
      const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);

      // Consider run missed if we're 1 hour past the scheduled time
      const missedThreshold = scheduleIntervalHours + 1;

      if (hoursSinceLastRun >= missedThreshold) {
        logger.warn('Missed scheduled run detected', {
          lastRun: lastRun.toISOString(),
          hoursSinceLastRun: hoursSinceLastRun.toFixed(2),
          scheduleIntervalHours,
          missedBy: (hoursSinceLastRun - scheduleIntervalHours).toFixed(2) + ' hours',
        });
        return true;
      }

      logger.info('No missed run', {
        lastRun: lastRun.toISOString(),
        hoursSinceLastRun: hoursSinceLastRun.toFixed(2),
        nextRunDue: (scheduleIntervalHours - hoursSinceLastRun).toFixed(2) + ' hours',
      });

      return false;
    } catch (error) {
      logger.error('Failed to check for missed run', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get scheduler statistics
   */
  async getStats(): Promise<{
    lastRun: Date | null;
    lastStatus: string;
    nextScheduledRun: Date | null;
  }> {
    try {
      const { data, error } = await supabase
        .from(this.TABLE_NAME)
        .select('*')
        .order('last_run_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return {
        lastRun: data ? new Date(data.last_run_at) : null,
        lastStatus: data?.last_run_status || 'never run',
        nextScheduledRun: data?.next_scheduled_run ? new Date(data.next_scheduled_run) : null,
      };
    } catch (error) {
      logger.error('Failed to get scheduler stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        lastRun: null,
        lastStatus: 'unknown',
        nextScheduledRun: null,
      };
    }
  }
}

export const schedulerState = new SchedulerStateManager();
