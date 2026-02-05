/**
 * Worker Routes
 * Endpoints called by Cloud Tasks to execute scheduled jobs
 *
 * These endpoints are designed to:
 * - Be called by Cloud Tasks with OIDC authentication
 * - Return 200 on success (task completed)
 * - Return 500 on retryable errors (Cloud Tasks will retry with backoff)
 * - Return 4xx on non-retryable errors (task will not be retried)
 */

import { Router, Response } from 'express';
import { nightlyScraperJob } from '../scheduler/nightly-scraper-job.js';
import { weeklyCrawlerJob } from '../scheduler/weekly-crawler-job.js';
import { nightlyOffersCrawlerJob } from '../scheduler/nightly-offers-crawler-job.js';
import { logger } from '../utils/logger.js';
import {
  verifyCloudTasksAuth,
  CloudTasksRequest,
} from '../middleware/cloud-tasks-auth.js';
import {
  CRON_MONITORS,
  startCronCheckIn,
  completeCronCheckIn,
  failCronCheckIn,
  captureError,
} from '../utils/sentry.js';

const router = Router();

// Apply Cloud Tasks auth middleware to all worker routes
router.use(verifyCloudTasksAuth);

/**
 * POST /api/worker/nightly-scrape
 * Execute the nightly price scrape job
 *
 * Called by Cloud Tasks after being scheduled by /api/schedule/nightly-scrape
 */
router.post('/nightly-scrape', async (req: CloudTasksRequest, res: Response) => {
  const taskName = req.cloudTasks?.taskName || 'manual';
  const retryCount = req.cloudTasks?.retryCount || 0;
  const monitorConfig = CRON_MONITORS.nightlyScrape;

  logger.info('Worker: Starting nightly scrape execution', {
    taskName,
    retryCount,
    isFromCloudTasks: req.cloudTasks?.isFromCloudTasks,
  });

  // Start Sentry cron check-in
  const checkInId = startCronCheckIn(monitorConfig);

  try {
    // Check if a scrape is already running
    if (nightlyScraperJob.isScrapeRunning()) {
      logger.warn('Worker: Nightly scrape already in progress', { taskName });
      // Complete check-in as success (skipping is expected behavior)
      completeCronCheckIn(checkInId, monitorConfig.monitorSlug);
      // Return 200 to prevent Cloud Tasks from retrying
      res.json({
        success: true,
        message: 'Scrape already in progress, skipping',
        taskName,
      });
      return;
    }

    // Execute the scrape
    const result = await nightlyScraperJob.runNow();

    if (result.success) {
      logger.info('Worker: Nightly scrape completed successfully', {
        taskName,
        totalProducts: result.totalProducts,
        successfulExtractions: result.successfulExtractions,
        durationMs: result.durationMs,
      });

      // Complete check-in as success
      completeCronCheckIn(checkInId, monitorConfig.monitorSlug);

      res.json({
        success: true,
        message: 'Nightly scrape completed',
        taskName,
        result: {
          totalProducts: result.totalProducts,
          successfulExtractions: result.successfulExtractions,
          failedExtractions: result.failedExtractions,
          emailSent: result.emailSent,
          durationMs: result.durationMs,
        },
      });
    } else {
      // Job completed but with errors - mark as failed in Sentry
      logger.error('Worker: Nightly scrape failed', {
        taskName,
        retryCount,
        error: result.error,
      });

      // Complete check-in as error
      failCronCheckIn(checkInId, monitorConfig.monitorSlug);
      captureError(new Error(result.error || 'Nightly scrape failed'), {
        taskName,
        retryCount,
        monitor: monitorConfig.monitorSlug,
      });

      // Return 500 to trigger Cloud Tasks retry
      res.status(500).json({
        success: false,
        message: 'Nightly scrape failed',
        taskName,
        retryCount,
        error: result.error,
      });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error('Worker: Nightly scrape threw exception', {
      taskName,
      retryCount,
      error: err.message,
    });

    // Complete check-in as error
    failCronCheckIn(checkInId, monitorConfig.monitorSlug);
    captureError(err, {
      taskName,
      retryCount,
      monitor: monitorConfig.monitorSlug,
    });

    // Return 500 to trigger Cloud Tasks retry
    res.status(500).json({
      success: false,
      message: 'Nightly scrape exception',
      taskName,
      retryCount,
      error: err.message,
    });
  }
});

/**
 * POST /api/worker/weekly-crawl
 * Execute the weekly website crawl job
 *
 * Called by Cloud Tasks after being scheduled by /api/schedule/weekly-crawl
 */
router.post('/weekly-crawl', async (req: CloudTasksRequest, res: Response) => {
  const taskName = req.cloudTasks?.taskName || 'manual';
  const retryCount = req.cloudTasks?.retryCount || 0;
  const monitorConfig = CRON_MONITORS.weeklyCrawl;

  logger.info('Worker: Starting weekly crawl execution', {
    taskName,
    retryCount,
    isFromCloudTasks: req.cloudTasks?.isFromCloudTasks,
  });

  // Start Sentry cron check-in
  const checkInId = startCronCheckIn(monitorConfig);

  try {
    // Check if a crawl is already running
    if (weeklyCrawlerJob.isCrawlRunning()) {
      logger.warn('Worker: Weekly crawl already in progress', { taskName });
      // Complete check-in as success (skipping is expected behavior)
      completeCronCheckIn(checkInId, monitorConfig.monitorSlug);
      // Return 200 to prevent Cloud Tasks from retrying
      res.json({
        success: true,
        message: 'Crawl already in progress, skipping',
        taskName,
      });
      return;
    }

    // Execute the crawl
    const result = await weeklyCrawlerJob.runNow();

    if (result.success) {
      logger.info('Worker: Weekly crawl completed successfully', {
        taskName,
        runId: result.runId,
        urlsDiscovered: result.urlsDiscovered,
        newProductsFound: result.newProductsFound,
        newOffersFound: result.newOffersFound,
        durationMs: result.durationMs,
      });

      // Complete check-in as success
      completeCronCheckIn(checkInId, monitorConfig.monitorSlug);

      res.json({
        success: true,
        message: 'Weekly crawl completed',
        taskName,
        result: {
          runId: result.runId,
          urlsDiscovered: result.urlsDiscovered,
          newProductsFound: result.newProductsFound,
          newOffersFound: result.newOffersFound,
          durationMs: result.durationMs,
        },
      });
    } else {
      // Job completed but with errors - mark as failed in Sentry
      logger.error('Worker: Weekly crawl failed', {
        taskName,
        retryCount,
        runId: result.runId,
        error: result.error,
      });

      // Complete check-in as error
      failCronCheckIn(checkInId, monitorConfig.monitorSlug);
      captureError(new Error(result.error || 'Weekly crawl failed'), {
        taskName,
        retryCount,
        runId: result.runId,
        monitor: monitorConfig.monitorSlug,
      });

      // Return 500 to trigger Cloud Tasks retry
      res.status(500).json({
        success: false,
        message: 'Weekly crawl failed',
        taskName,
        retryCount,
        runId: result.runId,
        error: result.error,
      });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error('Worker: Weekly crawl threw exception', {
      taskName,
      retryCount,
      error: err.message,
    });

    // Complete check-in as error
    failCronCheckIn(checkInId, monitorConfig.monitorSlug);
    captureError(err, {
      taskName,
      retryCount,
      monitor: monitorConfig.monitorSlug,
    });

    // Return 500 to trigger Cloud Tasks retry
    res.status(500).json({
      success: false,
      message: 'Weekly crawl exception',
      taskName,
      retryCount,
      error: err.message,
    });
  }
});

/**
 * POST /api/worker/nightly-offers
 * Execute the nightly offers crawl job
 *
 * Called by Cloud Tasks after being scheduled by /api/schedule/nightly-offers
 */
router.post('/nightly-offers', async (req: CloudTasksRequest, res: Response) => {
  const taskName = req.cloudTasks?.taskName || 'manual';
  const retryCount = req.cloudTasks?.retryCount || 0;
  const monitorConfig = CRON_MONITORS.nightlyOffers;

  logger.info('Worker: Starting nightly offers crawl execution', {
    taskName,
    retryCount,
    isFromCloudTasks: req.cloudTasks?.isFromCloudTasks,
  });

  // Start Sentry cron check-in
  const checkInId = startCronCheckIn(monitorConfig);

  try {
    // Check if a crawl is already running
    if (nightlyOffersCrawlerJob.isCrawlRunning()) {
      logger.warn('Worker: Nightly offers crawl already in progress', { taskName });
      // Complete check-in as success (skipping is expected behavior)
      completeCronCheckIn(checkInId, monitorConfig.monitorSlug);
      // Return 200 to prevent Cloud Tasks from retrying
      res.json({
        success: true,
        message: 'Offers crawl already in progress, skipping',
        taskName,
      });
      return;
    }

    // Execute the offers crawl
    const result = await nightlyOffersCrawlerJob.runNow();

    if (result.success) {
      logger.info('Worker: Nightly offers crawl completed successfully', {
        taskName,
        runId: result.runId,
        urlsDiscovered: result.urlsDiscovered,
        newOffersFound: result.newOffersFound,
        savedOffersCount: result.savedOffersCount,
        durationMs: result.durationMs,
      });

      // Complete check-in as success
      completeCronCheckIn(checkInId, monitorConfig.monitorSlug);

      res.json({
        success: true,
        message: 'Nightly offers crawl completed',
        taskName,
        result: {
          runId: result.runId,
          urlsDiscovered: result.urlsDiscovered,
          newOffersFound: result.newOffersFound,
          savedOffersCount: result.savedOffersCount,
          durationMs: result.durationMs,
        },
      });
    } else {
      // Job completed but with errors - mark as failed in Sentry
      logger.error('Worker: Nightly offers crawl failed', {
        taskName,
        retryCount,
        runId: result.runId,
        error: result.error,
      });

      // Complete check-in as error
      failCronCheckIn(checkInId, monitorConfig.monitorSlug);
      captureError(new Error(result.error || 'Nightly offers crawl failed'), {
        taskName,
        retryCount,
        runId: result.runId,
        monitor: monitorConfig.monitorSlug,
      });

      // Return 500 to trigger Cloud Tasks retry
      res.status(500).json({
        success: false,
        message: 'Nightly offers crawl failed',
        taskName,
        retryCount,
        runId: result.runId,
        error: result.error,
      });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error('Worker: Nightly offers crawl threw exception', {
      taskName,
      retryCount,
      error: err.message,
    });

    // Complete check-in as error
    failCronCheckIn(checkInId, monitorConfig.monitorSlug);
    captureError(err, {
      taskName,
      retryCount,
      monitor: monitorConfig.monitorSlug,
    });

    // Return 500 to trigger Cloud Tasks retry
    res.status(500).json({
      success: false,
      message: 'Nightly offers crawl exception',
      taskName,
      retryCount,
      error: err.message,
    });
  }
});

/**
 * GET /api/worker/health
 * Health check for worker endpoints (no auth required)
 */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'worker',
    timestamp: new Date().toISOString(),
    jobs: {
      nightlyScrape: {
        isRunning: nightlyScraperJob.isScrapeRunning(),
        isScheduled: nightlyScraperJob.isScheduled(),
      },
      weeklyCrawl: {
        isRunning: weeklyCrawlerJob.isCrawlRunning(),
        isScheduled: weeklyCrawlerJob.isScheduled(),
      },
      nightlyOffersCrawl: {
        isRunning: nightlyOffersCrawlerJob.isCrawlRunning(),
        isScheduled: nightlyOffersCrawlerJob.isScheduled(),
      },
    },
  });
});

export default router;
