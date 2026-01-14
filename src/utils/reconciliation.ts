import { v4 as uuidv4 } from 'uuid';
import { getAllProductPages, getShopifyCatalogCache, insertReconcileResult } from '../database/queries.js';
import { logger } from './logger.js';

/**
 * Reconciliation engine to detect missing products
 * A \ B = supplier-only (products on supplier but not in Shopify)
 * B \ A = shopify-only (products in Shopify but not on supplier)
 */
export class ReconciliationEngine {
  /**
   * Run reconciliation and return results
   */
  async reconcile(): Promise<{
    runId: string;
    supplierOnly: string[];
    shopifyOnly: string[];
  }> {
    logger.info('Starting reconciliation');

    const runId = uuidv4();

    // Get all product URLs from supplier scrape (set A)
    const supplierProducts = await getAllProductPages();
    const supplierUrls = new Set<string>(
      supplierProducts.map((p: { canonical_url: string }) => p.canonical_url)
    );

    // Get all product URLs from Shopify cache (set B)
    const shopifyProducts = await getShopifyCatalogCache();
    const shopifyUrls = new Set<string>(
      shopifyProducts.map((p: { source_url_canonical: string }) => p.source_url_canonical)
    );

    logger.info('Reconciliation sets loaded', {
      supplierCount: supplierUrls.size,
      shopifyCount: shopifyUrls.size,
    });

    // Compute A \ B (supplier-only)
    const supplierOnly: string[] = [];
    for (const url of supplierUrls) {
      if (!shopifyUrls.has(url)) {
        supplierOnly.push(url);
      }
    }

    // Compute B \ A (shopify-only)
    const shopifyOnly: string[] = [];
    for (const url of shopifyUrls) {
      if (!supplierUrls.has(url)) {
        shopifyOnly.push(url);
      }
    }

    logger.info('Reconciliation completed', {
      runId,
      supplierOnly: supplierOnly.length,
      shopifyOnly: shopifyOnly.length,
    });

    // Store results
    await this.storeResults(runId, supplierOnly, shopifyOnly);

    return {
      runId,
      supplierOnly,
      shopifyOnly,
    };
  }

  /**
   * Store reconciliation results in database
   */
  private async storeResults(
    runId: string,
    supplierOnly: string[],
    shopifyOnly: string[]
  ): Promise<void> {
    logger.info('Storing reconciliation results', { runId });

    // Store supplier-only products
    for (const url of supplierOnly) {
      try {
        await insertReconcileResult(runId, 'supplier_only', url, 'pending');
      } catch (error) {
        logger.error('Failed to store supplier-only result', {
          runId,
          url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Store shopify-only products
    for (const url of shopifyOnly) {
      try {
        await insertReconcileResult(runId, 'shopify_only', url, 'pending');
      } catch (error) {
        logger.error('Failed to store shopify-only result', {
          runId,
          url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Reconciliation results stored', {
      runId,
      supplierOnlyStored: supplierOnly.length,
      shopifyOnlyStored: shopifyOnly.length,
    });
  }

  /**
   * Check URL status (active, redirect, 404)
   * This can be used for future enhancement to validate missing products
   */
  async checkUrlStatus(url: string): Promise<'active' | 'redirect' | '404' | 'error'> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
      });

      if (response.status === 200) {
        return 'active';
      } else if (response.status >= 300 && response.status < 400) {
        return 'redirect';
      } else if (response.status === 404) {
        return '404';
      } else {
        return 'error';
      }
    } catch (error) {
      logger.error('Failed to check URL status', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  }

  /**
   * Batch check URL statuses
   */
  async batchCheckUrlStatuses(urls: string[]): Promise<Map<string, 'active' | 'redirect' | '404' | 'error'>> {
    const results = new Map<string, 'active' | 'redirect' | '404' | 'error'>();

    for (const url of urls) {
      const status = await this.checkUrlStatus(url);
      results.set(url, status);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }
}

export const reconciliationEngine = new ReconciliationEngine();
