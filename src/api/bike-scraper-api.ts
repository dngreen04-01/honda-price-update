/**
 * Bike Product Scraper API
 * Endpoint for scraping bike product assets from hondamotorbikes.co.nz
 */

import { Request, Response } from 'express';
import { bikeProductScraper } from '../scraper/bike-product-scraper.js';
import { logger } from '../utils/logger.js';

/**
 * POST /api/scrape-bike
 * Scrape a bike product page and return structured assets
 *
 * Request body: { url: string }
 * Response: BikeProductAssets
 */
export async function handleScrapeBike(req: Request, res: Response): Promise<void> {
  const { url } = req.body;

  // Validate request
  if (!url || typeof url !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Missing required field: url',
    });
    return;
  }

  // Validate URL format
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    res.status(400).json({
      success: false,
      message: 'Invalid URL format. URL must start with http:// or https://',
    });
    return;
  }

  // Validate domain (only hondamotorbikes.co.nz supported)
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');

    if (hostname !== 'hondamotorbikes.co.nz') {
      res.status(400).json({
        success: false,
        message: `Unsupported domain: ${hostname}. Only hondamotorbikes.co.nz is supported.`,
      });
      return;
    }
  } catch {
    res.status(400).json({
      success: false,
      message: 'Invalid URL format',
    });
    return;
  }

  try {
    logger.info('Bike scrape API called', { url });

    const assets = await bikeProductScraper.scrape(url);

    res.json({
      success: true,
      data: assets,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Bike scrape API error', {
      url,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      success: false,
      message: `Scrape failed: ${errorMessage}`,
    });
  }
}
