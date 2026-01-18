/**
 * New Product Detector
 * Compares discovered URLs against existing products in the database
 * to identify genuinely new products not yet being tracked.
 *
 * Uses multi-level matching:
 * - Tier 1: Exact canonical URL match
 * - Tier 2: Product ID / SKU match (handles URL path variations)
 */

import {
  getShopifyProductUrls,
  getExistingProductSkus,
  getExistingProductIds,
  getDiscoveredProductIds,
} from '../database/queries.js';
import { DiscoveredUrl } from './crawler-orchestrator.js';
import { logger } from '../utils/logger.js';
import { extractProductId } from '../utils/extract-product-id.js';

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
  /** Cached set of existing variant SKUs (lowercase) from the database */
  private existingSkus: Set<string> = new Set();
  /** Cached set of product IDs extracted from existing canonical URLs (lowercase) */
  private existingProductIds: Set<string> = new Set();
  /** Cached set of product IDs from pending/reviewed discoveries (lowercase) */
  private discoveredProductIds: Set<string> = new Set();
  /** Whether the cache has been loaded */
  private cacheLoaded: boolean = false;

  /**
   * Load existing product data from the database for matching.
   * Loads canonical URLs, SKUs, and product IDs for multi-level matching.
   * This should be called before detecting new products for accurate results.
   */
  async loadExistingUrls(): Promise<void> {
    try {
      logger.info('Loading existing product data from database for matching');

      // Load all four sets in parallel for efficiency
      const [canonicalUrls, skus, productIds, discoveredIds] = await Promise.all([
        getShopifyProductUrls(),
        getExistingProductSkus(),
        getExistingProductIds(),
        getDiscoveredProductIds(),
      ]);

      this.existingCanonicalUrls = canonicalUrls;
      this.existingSkus = skus;
      this.existingProductIds = productIds;
      this.discoveredProductIds = discoveredIds;
      this.cacheLoaded = true;

      logger.info('Loaded existing product data for matching', {
        canonicalUrlCount: this.existingCanonicalUrls.size,
        skuCount: this.existingSkus.size,
        productIdCount: this.existingProductIds.size,
        discoveredProductIdCount: this.discoveredProductIds.size,
      });
    } catch (error) {
      logger.error('Failed to load existing product data', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Clear all caches (useful for testing or forcing a refresh)
   */
  clearCache(): void {
    this.existingCanonicalUrls.clear();
    this.existingSkus.clear();
    this.existingProductIds.clear();
    this.discoveredProductIds.clear();
    this.cacheLoaded = false;
  }

  /**
   * Check if the cache has been loaded
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
   * Get count of cached existing SKUs
   */
  getExistingSkuCount(): number {
    return this.existingSkus.size;
  }

  /**
   * Get count of cached existing product IDs
   */
  getExistingProductIdCount(): number {
    return this.existingProductIds.size;
  }

  /**
   * Get count of cached discovered product IDs
   */
  getDiscoveredProductIdCount(): number {
    return this.discoveredProductIds.size;
  }

  /**
   * Check if a product ID matches an existing SKU, product ID, or discovered product ID.
   * This is the Tier 2 matching for URL path variations.
   *
   * @param url - The URL to extract product ID from
   * @returns true if the product ID matches an existing SKU, product ID, or discovered product ID
   */
  private isExistingByProductId(url: string): boolean {
    const productId = extractProductId(url);
    if (!productId) {
      return false;
    }

    // Check against SKUs from Shopify
    if (this.existingSkus.has(productId)) {
      return true;
    }

    // Check against product IDs extracted from existing Shopify URLs
    if (this.existingProductIds.has(productId)) {
      return true;
    }

    // Check against product IDs from pending/reviewed discoveries
    if (this.discoveredProductIds.has(productId)) {
      return true;
    }

    return false;
  }

  /**
   * Check if a single URL is already being tracked using multi-level matching.
   *
   * @param urlCanonical - The canonicalized URL to check
   * @param originalUrl - The original URL (for product ID extraction)
   * @returns true if the product is already in the database
   */
  isExistingProduct(urlCanonical: string, originalUrl?: string): boolean {
    // Tier 1: Exact canonical URL match
    if (this.existingCanonicalUrls.has(urlCanonical)) {
      return true;
    }

    // Tier 2: Product ID / SKU match (if original URL provided)
    if (originalUrl && this.isExistingByProductId(originalUrl)) {
      return true;
    }

    return false;
  }

  /**
   * Detect new products from a list of discovered URLs.
   * Separates discoveries into new products, existing products, and offers.
   *
   * Uses multi-level matching:
   * - Tier 1: Exact canonical URL match
   * - Tier 2: Product ID / SKU match (handles URL path variations like
   *   /honda-genuine-accessories/08l78mkse00 vs /08l78mkse00)
   * - Tier 3: Within-batch deduplication (same product ID in batch)
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
    let matchedByProductId = 0;

    for (const discovery of discoveries) {
      // Separate offers (tracked differently)
      if (discovery.isOffer) {
        offers.push(discovery);
        continue;
      }

      // Tier 1: Exact canonical URL match
      if (this.existingCanonicalUrls.has(discovery.urlCanonical)) {
        existingProducts.push(discovery);
        continue;
      }

      // Tier 2: Product ID / SKU match (handles URL path variations)
      if (this.isExistingByProductId(discovery.url)) {
        existingProducts.push(discovery);
        matchedByProductId++;
        logger.debug('Matched existing product by product ID', {
          url: discovery.url,
          productId: extractProductId(discovery.url),
        });
        continue;
      }

      // Not found in any tier - genuinely new product
      newProducts.push(discovery);
    }

    // Tier 3: Within-batch deduplication by product ID
    // This handles cases where the same product appears at multiple URL paths
    // in the same crawl batch (e.g., /hrc-umbrella and /bike-merchandise/hrc-umbrella)
    const deduplicatedProducts = this.deduplicateByProductId(newProducts);

    const result: DetectionResult = {
      newProducts: deduplicatedProducts,
      existingProducts,
      offers,
      totalAnalyzed: discoveries.length,
    };

    const deduplicatedCount = newProducts.length - deduplicatedProducts.length;

    logger.info('New product detection complete', {
      totalAnalyzed: result.totalAnalyzed,
      newProductCount: deduplicatedProducts.length,
      existingProductCount: existingProducts.length,
      matchedByProductId,
      deduplicatedWithinBatch: deduplicatedCount,
      offerCount: offers.length,
    });

    return result;
  }

  /**
   * Deduplicate discovered products by product ID within a batch.
   * When multiple URLs map to the same product ID, keeps the one with the shortest URL.
   *
   * @param products - Array of discovered products to deduplicate
   * @returns Deduplicated array of products
   */
  private deduplicateByProductId(products: DiscoveredUrl[]): DiscoveredUrl[] {
    // Group products by their extracted product ID
    const productIdMap = new Map<string, DiscoveredUrl[]>();
    const productsWithoutId: DiscoveredUrl[] = [];

    for (const product of products) {
      const productId = extractProductId(product.url);
      if (productId) {
        const existing = productIdMap.get(productId) || [];
        existing.push(product);
        productIdMap.set(productId, existing);
      } else {
        // Products without extractable ID are kept as-is
        productsWithoutId.push(product);
      }
    }

    // For each product ID, keep the one with the shortest URL
    const deduplicated: DiscoveredUrl[] = [];

    for (const [productId, productGroup] of productIdMap) {
      if (productGroup.length > 1) {
        // Sort by URL length (ascending) to keep shortest/most canonical
        productGroup.sort((a, b) => a.url.length - b.url.length);

        logger.info('Deduplicated within batch', {
          productId,
          kept: productGroup[0].url,
          removed: productGroup.slice(1).map((p) => p.url),
        });
      }

      // Keep the first one (shortest URL)
      deduplicated.push(productGroup[0]);

      // Add the product ID to our cache so subsequent batches don't rediscover it
      this.discoveredProductIds.add(productId);
    }

    // Add products without extractable IDs
    deduplicated.push(...productsWithoutId);

    return deduplicated;
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
