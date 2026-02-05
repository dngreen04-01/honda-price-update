import * as Sentry from '@sentry/node';

// Check if Sentry should be enabled (only when DSN is provided - i.e., on Cloud Run)
const sentryDsn = process.env.SENTRY_DSN || '';
const sentryEnabled = !!sentryDsn;

if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.SENTRY_ENVIRONMENT || (process.env.K_SERVICE ? 'production' : 'development'),

    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring
    // Adjust in production based on volume
    tracesSampleRate: 1.0,

    // Capture 100% of error events
    sampleRate: 1.0,

    // Add release version if available
    release: process.env.K_REVISION || undefined,

    // Additional context
    serverName: process.env.K_SERVICE || 'honda-price-scraper-local',

    // Integrations are automatically added in v8+
    // Enable profiling for better performance insights
    profilesSampleRate: 0.1,

    // Before sending, add extra context
    beforeSend(event) {
      // Add any custom filtering or modification here
      return event;
    },
  });

  console.log('Sentry initialized for error tracking');
}

export { Sentry, sentryEnabled };

// Manual error capture helper
export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (!sentryEnabled) return;

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

// Capture message helper (for non-error notifications)
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, unknown>): void {
  if (!sentryEnabled) return;

  Sentry.withScope((scope) => {
    scope.setLevel(level);
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureMessage(message);
  });
}

// Set user context (useful for tracking issues per user)
export function setUserContext(user: { id?: string; email?: string; username?: string }): void {
  if (!sentryEnabled) return;
  Sentry.setUser(user);
}

// Add breadcrumb for debugging
export function addBreadcrumb(breadcrumb: {
  category?: string;
  message: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}): void {
  if (!sentryEnabled) return;
  Sentry.addBreadcrumb(breadcrumb);
}

// ============================================
// Cron Monitoring (Sentry Crons)
// ============================================

/**
 * Monitor configuration for scheduled jobs
 * Used to track job execution and alert on missed/failed runs
 */
export interface CronMonitorConfig {
  /** Unique identifier for this monitor (slug format) */
  monitorSlug: string;
  /** Cron schedule expression (e.g., '0 2 * * *') */
  schedule: string;
  /** Timezone for the schedule */
  timezone: string;
  /** Maximum expected runtime in minutes */
  maxRuntimeMinutes?: number;
  /** Grace period in minutes before alerting on missed check-in */
  checkinMarginMinutes?: number;
}

/**
 * Predefined monitor configurations for scheduled jobs
 */
export const CRON_MONITORS = {
  nightlyScrape: {
    monitorSlug: 'nightly-price-scraper',
    schedule: '0 2 * * *',
    timezone: 'Pacific/Auckland',
    maxRuntimeMinutes: 60,
    checkinMarginMinutes: 5,
  },
  weeklyCrawl: {
    monitorSlug: 'weekly-website-crawler',
    schedule: '0 2 * * 0',
    timezone: 'Pacific/Auckland',
    maxRuntimeMinutes: 120,
    checkinMarginMinutes: 10,
  },
  nightlyOffers: {
    monitorSlug: 'nightly-offers-crawler',
    schedule: '0 1 * * *',
    timezone: 'Pacific/Auckland',
    maxRuntimeMinutes: 30,
    checkinMarginMinutes: 5,
  },
} as const;

/**
 * Start a cron check-in (marks job as in_progress)
 * Call this at the beginning of a scheduled job
 *
 * @returns Check-in ID to use when completing the check-in, or null if Sentry disabled
 */
export function startCronCheckIn(config: CronMonitorConfig): string | null {
  if (!sentryEnabled) return null;

  const checkInId = Sentry.captureCheckIn(
    {
      monitorSlug: config.monitorSlug,
      status: 'in_progress',
    },
    {
      schedule: {
        type: 'crontab',
        value: config.schedule,
      },
      timezone: config.timezone,
      checkinMargin: config.checkinMarginMinutes,
      maxRuntime: config.maxRuntimeMinutes,
    }
  );

  return checkInId;
}

/**
 * Complete a cron check-in with success status
 * Call this when a scheduled job completes successfully
 */
export function completeCronCheckIn(
  checkInId: string | null,
  monitorSlug: string
): void {
  if (!sentryEnabled || !checkInId) return;

  Sentry.captureCheckIn({
    checkInId,
    monitorSlug,
    status: 'ok',
  });
}

/**
 * Complete a cron check-in with error status
 * Call this when a scheduled job fails
 */
export function failCronCheckIn(
  checkInId: string | null,
  monitorSlug: string
): void {
  if (!sentryEnabled || !checkInId) return;

  Sentry.captureCheckIn({
    checkInId,
    monitorSlug,
    status: 'error',
  });
}

/**
 * Wrapper to execute a job with automatic cron monitoring
 * Handles check-in/check-out and error capture automatically
 *
 * @example
 * const result = await withCronMonitoring(CRON_MONITORS.nightlyScrape, async () => {
 *   return await nightlyScraperJob.runNow();
 * });
 */
export async function withCronMonitoring<T>(
  config: CronMonitorConfig,
  jobFn: () => Promise<T>
): Promise<T> {
  const checkInId = startCronCheckIn(config);

  try {
    const result = await jobFn();
    completeCronCheckIn(checkInId, config.monitorSlug);
    return result;
  } catch (error) {
    failCronCheckIn(checkInId, config.monitorSlug);
    // Also capture the error for detailed stack trace
    if (error instanceof Error) {
      captureError(error, { monitorSlug: config.monitorSlug });
    }
    throw error;
  }
}
