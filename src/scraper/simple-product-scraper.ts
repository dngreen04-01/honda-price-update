/**
 * Simple Product Scraper
 * Extracts basic product information (title, description, image) from Honda NZ sites
 * Used for accessories, parts, and other non-bike products
 */

import * as cheerio from 'cheerio';
import { scraplingClient } from './scrapling-client.js';
import {
  simpleProductSelectors,
  parseHighestResSrcset,
} from './simple-product-selectors.js';
import { logger } from '../utils/logger.js';

/**
 * Simple product assets - minimal data for basic product creation
 */
export interface SimpleProductAssets {
  url: string;
  scrapedAt: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}

export class SimpleProductScraper {
  /**
   * Scrape a simple product page and extract basic assets
   */
  async scrape(url: string): Promise<SimpleProductAssets> {
    logger.info('Starting simple product scrape', { url });

    // Fetch HTML using Scrapling
    const result = await scraplingClient.scrape(url);

    if (!result.success) {
      logger.error('Failed to fetch simple product page', { url, error: result.error });
      throw new Error(`Failed to fetch page: ${result.error}`);
    }

    // Parse HTML with cheerio
    const $ = cheerio.load(result.html);

    // Extract basic assets
    const assets: SimpleProductAssets = {
      url,
      scrapedAt: new Date().toISOString(),
      title: this.extractTitle($),
      description: this.extractDescription($),
      imageUrl: this.extractImage($),
    };

    logger.info('Simple product scrape completed', {
      url,
      hasTitle: !!assets.title,
      hasDescription: !!assets.description,
      hasImage: !!assets.imageUrl,
    });

    return assets;
  }

  /**
   * Extract product title from page
   */
  private extractTitle($: cheerio.CheerioAPI): string | null {
    const title = $(simpleProductSelectors.title).first().text().trim();
    return title || null;
  }

  /**
   * Extract product description (preserve HTML for formatting)
   */
  private extractDescription($: cheerio.CheerioAPI): string | null {
    const descriptionEl = $(simpleProductSelectors.description).first();
    if (descriptionEl.length === 0) {
      return null;
    }

    // Get HTML content, preserving formatting
    const html = descriptionEl.html()?.trim();
    return html || null;
  }

  /**
   * Extract the highest resolution product image
   * Tries multiple strategies to find the best image
   */
  private extractImage($: cheerio.CheerioAPI): string | null {
    const selectors = simpleProductSelectors.image;

    // Strategy 1: Fotorama stage image (most common)
    const fotoramaImg = $(selectors.fotoramaImg).first();
    if (fotoramaImg.length) {
      // Try data-full first (full resolution), then data-img, then src
      const url = fotoramaImg.attr('data-full') ||
                  fotoramaImg.attr('data-img') ||
                  fotoramaImg.attr('src');
      if (url) {
        logger.debug('Found image via fotorama img element', { url });
        return url;
      }

      // Try srcset if available
      const srcset = fotoramaImg.attr('srcset');
      const srcsetUrl = parseHighestResSrcset(srcset);
      if (srcsetUrl) {
        logger.debug('Found image via fotorama srcset', { url: srcsetUrl });
        return srcsetUrl;
      }
    }

    // Strategy 2: Fotorama frame element (may have data attributes)
    const fotoramaFrame = $(selectors.fotoramaFrame).first();
    if (fotoramaFrame.length) {
      // Try data attributes first, then look for nested img
      const frameUrl = fotoramaFrame.attr('data-full') ||
                       fotoramaFrame.attr('data-img') ||
                       fotoramaFrame.attr('src');
      if (frameUrl) {
        logger.debug('Found image via fotorama frame element', { url: frameUrl });
        return frameUrl;
      }
      // Check for nested img element
      const nestedImg = fotoramaFrame.find('img').first();
      if (nestedImg.length) {
        const nestedUrl = nestedImg.attr('data-full') ||
                          nestedImg.attr('data-img') ||
                          nestedImg.attr('src');
        if (nestedUrl) {
          logger.debug('Found image via nested img in frame', { url: nestedUrl });
          return nestedUrl;
        }
      }
    }

    // Strategy 3: Standard product image placeholder
    const productImg = $(selectors.productImage).first();
    if (productImg.length) {
      const url = productImg.attr('data-full') ||
                  productImg.attr('data-img') ||
                  productImg.attr('src');
      if (url) {
        logger.debug('Found image via product placeholder', { url });
        return url;
      }

      // Try srcset
      const srcset = productImg.attr('srcset');
      const srcsetUrl = parseHighestResSrcset(srcset);
      if (srcsetUrl) {
        logger.debug('Found image via product placeholder srcset', { url: srcsetUrl });
        return srcsetUrl;
      }
    }

    // Strategy 4: Any img inside the gallery placeholder
    const galleryImg = $('.gallery-placeholder img').first();
    if (galleryImg.length) {
      const url = galleryImg.attr('data-full') ||
                  galleryImg.attr('data-img') ||
                  galleryImg.attr('src');
      if (url) {
        logger.debug('Found image via gallery placeholder fallback', { url });
        return url;
      }
    }

    // Strategy 5: Look for any fotorama__img in the document
    const anyFotoramaImg = $('.fotorama__img').first();
    if (anyFotoramaImg.length) {
      const url = anyFotoramaImg.attr('data-full') ||
                  anyFotoramaImg.attr('data-img') ||
                  anyFotoramaImg.attr('src');
      if (url) {
        logger.debug('Found image via any fotorama__img fallback', { url });
        return url;
      }
    }

    logger.warn('No product image found', { url: 'unknown' });
    return null;
  }
}

// Export singleton instance
export const simpleProductScraper = new SimpleProductScraper();
