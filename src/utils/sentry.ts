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
