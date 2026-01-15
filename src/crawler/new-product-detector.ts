/**
 * New Product Detector
 * Compares discovered URLs against existing products in the database
 * to identify genuinely new products not yet being tracked
 */

import { getShopifyProductUrls } from '../database/queries.js';
import { DiscoveredUrl } from './crawler-orchestrator.js';
import { logger } from '../utils/logger.js';

/**
 * Result of new product detection
 */
export interface DetectionResult {
  /** URLs that are new (not in existing catalog) */
  newProducts: DiscoveredUrl[];
  /** URLs that already exist in the catalog */
  existingProducts: DiscoveredUrl[];
  /** Offer pages discovered (tracked separately) */
  offers: DiscoveredUrl[];
  /** Total discoveries analyzed */
  totalAnalyzed: number;
}

/**
 * New Product Detector
 * Identifies which discovered URLs are new vs already tracked
 */
export class NewProductDetector {
  /** Cached set of existing canonical URLs from the database */
  private existingCanonicalUrls: Set<string> = new Set();
  /** Whether the cache has been loaded */
  private cacheLoaded: boolean = false;

  /**
   * Load existing canonical URLs from the database
   * This should be called before detecting new products for accurate results
   */
  async loadExistingUrls(): Promise<void> {
    try {
      logger.info('Loading existing product URLs from database');
      this.existingCanonicalUrls = await getShopifyProductUrls();
      this.cacheLoaded = true;

      logger.info('Loaded existing URLs', {
        count: this.existingCanonicalUrls.size,
      });
    } catch (error) {
      logger.error('Failed to load existing URLs', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Clear the URL cache (useful for testing or forcing a refresh)
   */
  clearCache(): void {
    this.existingCanonicalUrls.clear();
    this.cacheLoaded = false;
  }

  /**
   * Check if a URL cache has been loaded
   */
  isCacheLoaded(): boolean {
    return this.cacheLoaded;
  }

  /**
   * Get count of cached existing URLs
   */
  getExistingUrlCount(): number {
    return this.existingCanonicalUrls.size;
  }

  /**
   * Check if a single URL is already being tracked
   * @param urlCanonical - The canonicalized URL to check
   * @returns true if the URL is already in the database
   */
  isExistingProduct(urlCanonical: string): boolean {
    return this.existingCanonicalUrls.has(urlCanonical);
  }

  /**
   * Detect new products from a list of discovered URLs
   * Separates discoveries into new products, existing products, and offers
   *
   * @param discoveries - Array of discovered URLs from the crawler
   * @returns Detection result with categorized URLs
   */
  async detectNewProducts(discoveries: DiscoveredUrl[]): Promise<DetectionResult> {
    // Ensure cache is loaded
    if (!this.cacheLoaded) {
      await this.loadExistingUrls();
    }

    const newProducts: DiscoveredUrl[] = [];
    const existingProducts: DiscoveredUrl[] = [];
    const offers: DiscoveredUrl[] = [];

    for (const discovery of discoveries) {
      // Separate offers (tracked differently)
      if (discovery.isOffer) {
        offers.push(discovery);
        continue;
      }

      // Check if product already exists in catalog
      if (this.existingCanonicalUrls.has(discovery.urlCanonical)) {
        existingProducts.push(discovery);
      } else {
        newProducts.push(discovery);
      }
    }

    const result: DetectionResult = {
      newProducts,
      existingProducts,
      offers,
      totalAnalyzed: discoveries.length,
    };

    logger.info('New product detection complete', {
      totalAnalyzed: result.totalAnalyzed,
      newProductCount: newProducts.length,
      existingProductCount: existingProducts.length,
      offerCount: offers.length,
    });

    return result;
  }

  /**
   * Filter discoveries to only return new products (convenience method)
   * @param discoveries - Array of discovered URLs from the crawler
   * @returns Only the new product URLs (not offers, not existing)
   */
  async filterNewProducts(discoveries: DiscoveredUrl[]): Promise<DiscoveredUrl[]> {
    const result = await this.detectNewProducts(discoveries);
    return result.newProducts;
  }
}

/**
 * Singleton instance of the new product detector
 */
export const newProductDetector = new NewProductDetector();
