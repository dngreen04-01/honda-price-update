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
} from './api/crawler-api.js';
import { scheduleWeeklyCrawl, weeklyCrawlerJob } from './scheduler/weekly-crawler-job.js';

const app = express();
const PORT = process.env.API_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

// Start server
app.listen(PORT, () => {
  logger.info(`API server started`, { port: PORT });
  console.log(`API server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);

  // Start the weekly crawler scheduler
  if (process.env.DISABLE_WEEKLY_CRAWLER !== 'true') {
    scheduleWeeklyCrawl();
    const config = weeklyCrawlerJob.getScheduleConfig();
    console.log(`Weekly crawler scheduled: ${config.description}`);
  }
});
