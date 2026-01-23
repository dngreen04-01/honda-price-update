#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { handleManualPriceSync } from './api/price-sync-api.js';
import { handleRescrape, handleUpdateProductUrl } from './api/rescrape-api.js';
import { handleBulkScrape } from './api/bulk-scrape-api.js';
import { logger } from './utils/logger.js';
import { verifyAuth, requireSuperuser } from './middleware/auth.js';
import {
  getProfile,
  listUsers,
  inviteUser,
  listInvitations,
  revokeInvitation,
  updateUserRole,
  updateUserStatus,
} from './api/admin-api.js';
import {
  handleStartCrawl,
  handleGetCrawlStatus,
  handleGetCrawlResults,
  handleGetOffers,
  handleReviewProduct,
  handleGetCrawlRuns,
  handleGetCrawlStats,
  handleFindDuplicates,
  handleCleanupDuplicates,
} from './api/crawler-api.js';
import { handleScrapeBike } from './api/bike-scraper-api.js';
import { handlePushToShopify, handlePushUrlToShopify } from './api/shopify-push-api.js';
import { scheduleWeeklyCrawl, weeklyCrawlerJob } from './scheduler/weekly-crawler-job.js';
import { scheduleNightlyScrape, nightlyScraperJob } from './scheduler/nightly-scraper-job.js';
import {
  handleStartSupplierRescrape,
  handleGetSupplierRescrapeStatus,
} from './api/supplier-rescrape-api.js';
import {
  handlePushOffer,
  handleLinkProducts,
  handleUnlinkProducts,
  handleGetOfferProducts,
  handleUpdateEndDate,
  handleGetOfferWithProducts,
  handleGetShopifyCatalog,
  handleCheckExpirations,
  handleGetExpiringOffers,
  handleExpireOffer,
} from './api/offer-push-api.js';

const app = express();
// Cloud Run uses PORT env var, fallback to API_PORT for local dev
const PORT = process.env.PORT || process.env.API_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint (also at root for Cloud Run)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// Cloud Scheduler Trigger Endpoints
// ============================================

// Trigger nightly scrape (called by Cloud Scheduler)
app.post('/api/trigger-nightly-scrape', async (_req, res) => {
  try {
    logger.info('Cloud Scheduler triggered nightly scrape');
    const result = await nightlyScraperJob.runNow();
    res.json({ success: true, message: 'Nightly scrape completed', result });
  } catch (error) {
    logger.error('Failed to trigger nightly scrape', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, message: 'Failed to trigger nightly scrape' });
  }
});

// Trigger weekly crawl (called by Cloud Scheduler)
app.post('/api/trigger-weekly-crawl', async (_req, res) => {
  try {
    logger.info('Cloud Scheduler triggered weekly crawl');
    const result = await weeklyCrawlerJob.runNow();
    res.json({ success: true, message: 'Weekly crawl completed', result });
  } catch (error) {
    logger.error('Failed to trigger weekly crawl', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, message: 'Failed to trigger weekly crawl' });
  }
});

// Manual price sync endpoint
app.post('/api/price-sync', async (req, res) => {
  try {
    const result = await handleManualPriceSync(req.body);
    res.json(result);
  } catch (error) {
    logger.error('API error in /api/price-sync', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Re-scrape endpoint for individual products
app.post('/api/rescrape', async (req, res) => {
  try {
    const result = await handleRescrape(req.body);
    res.json(result);
  } catch (error) {
    logger.error('API error in /api/rescrape', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Update product URL endpoint (for handling redirects/discontinued products)
app.post('/api/update-product-url', async (req, res) => {
  try {
    const result = await handleUpdateProductUrl(req.body);
    res.json(result);
  } catch (error) {
    logger.error('API error in /api/update-product-url', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Bulk scrape endpoint for products without supplier prices
app.post('/api/bulk-scrape', async (req, res) => {
  try {
    const result = await handleBulkScrape(req.body);
    res.json(result);
  } catch (error) {
    logger.error('API error in /api/bulk-scrape', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// ============================================
// Auth & User Management Endpoints
// ============================================

// Get current user profile (requires authentication)
app.get('/api/auth/profile', verifyAuth, getProfile);

// Admin endpoints (requires superuser)
app.get('/api/admin/users', verifyAuth, requireSuperuser, listUsers);
app.post('/api/admin/invite', verifyAuth, requireSuperuser, inviteUser);
app.get('/api/admin/invitations', verifyAuth, requireSuperuser, listInvitations);
app.delete('/api/admin/invitations/:id', verifyAuth, requireSuperuser, revokeInvitation);
app.patch('/api/admin/users/:id/role', verifyAuth, requireSuperuser, updateUserRole);
app.patch('/api/admin/users/:id/status', verifyAuth, requireSuperuser, updateUserStatus);

// ============================================
// Crawler API Endpoints
// ============================================

// Start a new crawl
app.post('/api/crawl', handleStartCrawl);

// Get crawl status by run ID
app.get('/api/crawl/status/:runId', handleGetCrawlStatus);

// Get discovered products (with optional status filter)
app.get('/api/crawl/results', handleGetCrawlResults);

// Get discovered offers
app.get('/api/crawl/offers', handleGetOffers);

// Get recent crawl runs
app.get('/api/crawl/runs', handleGetCrawlRuns);

// Get crawl statistics
app.get('/api/crawl/stats', handleGetCrawlStats);

// Review a discovered product
app.post('/api/crawl/review/:productId', handleReviewProduct);

// Find duplicate discoveries
app.get('/api/crawl/duplicates', handleFindDuplicates);

// Cleanup duplicate discoveries (use ?dryRun=true to preview)
app.delete('/api/crawl/duplicates', handleCleanupDuplicates);

// ============================================
// Supplier Re-scrape Endpoints
// ============================================

// Start a batch re-scrape for all products from a specific supplier
app.post('/api/supplier-rescrape', handleStartSupplierRescrape);

// Get status of a supplier re-scrape job
app.get('/api/supplier-rescrape/:jobId', handleGetSupplierRescrapeStatus);

// ============================================
// Bike Product Scraper Endpoint
// ============================================

// Scrape bike product assets from hondamotorbikes.co.nz
app.post('/api/scrape-bike', handleScrapeBike);

// ============================================
// Shopify Push Endpoint
// ============================================

// Push discovered product to Shopify
app.post('/api/shopify/push-product', handlePushToShopify);

// Push product to Shopify directly from URL (manual entry)
app.post('/api/shopify/push-url', handlePushUrlToShopify);

// Get Shopify catalog (for product selection in offer UI)
app.get('/api/shopify/catalog', handleGetShopifyCatalog);

// ============================================
// Offer Push API Endpoints
// ============================================

// Push an offer to Shopify (creates page, links products, updates landing page)
app.post('/api/offers/push', handlePushOffer);

// Check and expire offers past their end date
app.post('/api/offers/check-expirations', handleCheckExpirations);

// Get offers expiring soon (for dashboard warnings)
// NOTE: Must be defined BEFORE /api/offers/:id to avoid matching "expiring" as an ID
app.get('/api/offers/expiring', handleGetExpiringOffers);

// Get offer with linked products and Shopify status
app.get('/api/offers/:id', handleGetOfferWithProducts);

// Get products linked to an offer
app.get('/api/offers/:id/products', handleGetOfferProducts);

// Link products to an offer
app.post('/api/offers/:id/link-products', handleLinkProducts);

// Unlink products from an offer
app.delete('/api/offers/:id/link-products', handleUnlinkProducts);

// Update an offer's end date
app.post('/api/offers/:id/update-end-date', handleUpdateEndDate);

// Manually expire a specific offer
app.post('/api/offers/:id/expire', handleExpireOffer);

// Start server
app.listen(PORT, () => {
  logger.info(`API server started`, { port: PORT });
  console.log(`API server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);

  // Start the weekly crawler scheduler
  if (process.env.DISABLE_WEEKLY_CRAWLER !== 'true') {
    scheduleWeeklyCrawl()
      .then(() => {
        const config = weeklyCrawlerJob.getScheduleConfig();
        console.log(`Weekly crawler scheduled: ${config.description}`);
      })
      .catch((error) => {
        logger.error('Failed to start weekly crawler scheduler', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  // Start the nightly price scraper scheduler
  if (process.env.DISABLE_NIGHTLY_SCRAPER !== 'true') {
    scheduleNightlyScrape()
      .then(() => {
        const config = nightlyScraperJob.getScheduleConfig();
        console.log(`Nightly scraper scheduled: ${config.description}`);
      })
      .catch((error) => {
        logger.error('Failed to start nightly scraper scheduler', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }
});
