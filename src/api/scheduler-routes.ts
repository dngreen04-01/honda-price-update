/**
 * Scheduler Routes
 * Dispatcher endpoints called by Cloud Scheduler to create Cloud Tasks
 *
 * Architecture:
 * Cloud Scheduler → POST /api/schedule/* → Creates Cloud Task → POST /api/worker/* → Job executes
 *
 * This indirection provides:
 * - Automatic retries with exponential backoff
 * - Task deduplication via date-based task IDs
 * - Better timeout handling (tasks can run longer than HTTP request timeout)
 * - Task queue visibility and management
 */

import { Router, Request, Response } from 'express';
import { cloudTasksClient } from '../services/cloud-tasks-client.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /api/schedule/nightly-scrape
 * Called by Cloud Scheduler to create a Cloud Task for nightly scrape
 *
 * This endpoint:
 * 1. Receives trigger from Cloud Scheduler (with OIDC auth)
 * 2. Creates a Cloud Task with date-based ID for deduplication
 * 3. Returns immediately (actual job runs async via worker endpoint)
 */
router.post('/nightly-scrape', async (_req: Request, res: Response) => {
  logger.info('Scheduler: Creating nightly scrape task');

  // Check if Cloud Tasks is configured
  if (!cloudTasksClient.isConfigured()) {
    logger.warn('Scheduler: Cloud Tasks not configured, cannot create task');
    res.status(503).json({
      success: false,
      message: 'Cloud Tasks not configured',
    });
    return;
  }

  try {
    const result = await cloudTasksClient.createNightlyScrapeTask();

    if (result.success) {
      logger.info('Scheduler: Nightly scrape task created', {
        taskName: result.taskName,
      });

      res.json({
        success: true,
        message: 'Nightly scrape task created',
        taskName: result.taskName,
      });
    } else {
      logger.error('Scheduler: Failed to create nightly scrape task', {
        error: result.error,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to create task',
        error: result.error,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Scheduler: Exception creating nightly scrape task', {
      error: errorMessage,
    });

    res.status(500).json({
      success: false,
      message: 'Exception creating task',
      error: errorMessage,
    });
  }
});

/**
 * POST /api/schedule/weekly-crawl
 * Called by Cloud Scheduler to create a Cloud Task for weekly crawl
 *
 * This endpoint:
 * 1. Receives trigger from Cloud Scheduler (with OIDC auth)
 * 2. Creates a Cloud Task with date-based ID for deduplication
 * 3. Returns immediately (actual job runs async via worker endpoint)
 */
router.post('/weekly-crawl', async (_req: Request, res: Response) => {
  logger.info('Scheduler: Creating weekly crawl task');

  // Check if Cloud Tasks is configured
  if (!cloudTasksClient.isConfigured()) {
    logger.warn('Scheduler: Cloud Tasks not configured, cannot create task');
    res.status(503).json({
      success: false,
      message: 'Cloud Tasks not configured',
    });
    return;
  }

  try {
    const result = await cloudTasksClient.createWeeklyCrawlTask();

    if (result.success) {
      logger.info('Scheduler: Weekly crawl task created', {
        taskName: result.taskName,
      });

      res.json({
        success: true,
        message: 'Weekly crawl task created',
        taskName: result.taskName,
      });
    } else {
      logger.error('Scheduler: Failed to create weekly crawl task', {
        error: result.error,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to create task',
        error: result.error,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Scheduler: Exception creating weekly crawl task', {
      error: errorMessage,
    });

    res.status(500).json({
      success: false,
      message: 'Exception creating task',
      error: errorMessage,
    });
  }
});

/**
 * POST /api/schedule/nightly-offers
 * Called by Cloud Scheduler to create a Cloud Task for nightly offers crawl
 *
 * This endpoint:
 * 1. Receives trigger from Cloud Scheduler (with OIDC auth)
 * 2. Creates a Cloud Task with date-based ID for deduplication
 * 3. Returns immediately (actual job runs async via worker endpoint)
 */
router.post('/nightly-offers', async (_req: Request, res: Response) => {
  logger.info('Scheduler: Creating nightly offers crawl task');

  // Check if Cloud Tasks is configured
  if (!cloudTasksClient.isConfigured()) {
    logger.warn('Scheduler: Cloud Tasks not configured, cannot create task');
    res.status(503).json({
      success: false,
      message: 'Cloud Tasks not configured',
    });
    return;
  }

  try {
    const result = await cloudTasksClient.createNightlyOffersCrawlTask();

    if (result.success) {
      logger.info('Scheduler: Nightly offers crawl task created', {
        taskName: result.taskName,
      });

      res.json({
        success: true,
        message: 'Nightly offers crawl task created',
        taskName: result.taskName,
      });
    } else {
      logger.error('Scheduler: Failed to create nightly offers crawl task', {
        error: result.error,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to create task',
        error: result.error,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Scheduler: Exception creating nightly offers crawl task', {
      error: errorMessage,
    });

    res.status(500).json({
      success: false,
      message: 'Exception creating task',
      error: errorMessage,
    });
  }
});

/**
 * GET /api/schedule/status
 * Check scheduler configuration and Cloud Tasks status
 */
router.get('/status', (_req: Request, res: Response) => {
  const isConfigured = cloudTasksClient.isConfigured();

  res.json({
    success: true,
    cloudTasks: {
      configured: isConfigured,
      queuePath: isConfigured ? cloudTasksClient.getQueuePath() : null,
    },
    endpoints: {
      nightlyScrape: '/api/schedule/nightly-scrape',
      weeklyCrawl: '/api/schedule/weekly-crawl',
      nightlyOffers: '/api/schedule/nightly-offers',
    },
    workerEndpoints: {
      nightlyScrape: '/api/worker/nightly-scrape',
      weeklyCrawl: '/api/worker/weekly-crawl',
      nightlyOffers: '/api/worker/nightly-offers',
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
