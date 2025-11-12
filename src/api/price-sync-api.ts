import { syncPricesToShopify } from '../shopify/price-sync.js';
import { logger } from '../utils/logger.js';

/**
 * API handler for manual price sync operations
 * This provides endpoints for the frontend dashboard to trigger price updates
 */

export interface PriceSyncRequest {
  urls: string[];
}

export interface PriceSyncResponse {
  success: boolean;
  synced: number;
  skipped: number;
  failed: number;
  message: string;
}

/**
 * Manually sync prices to Shopify for specified URLs
 * This is triggered by user action from the dashboard
 */
export async function handleManualPriceSync(
  request: PriceSyncRequest
): Promise<PriceSyncResponse> {
  logger.info('Manual price sync requested', {
    urlCount: request.urls.length,
    urls: request.urls,
  });

  try {
    // Validate request
    if (!request.urls || request.urls.length === 0) {
      return {
        success: false,
        synced: 0,
        skipped: 0,
        failed: 0,
        message: 'No URLs provided',
      };
    }

    // Execute sync
    const result = await syncPricesToShopify(request.urls);

    logger.info('Manual price sync completed', {
      synced: result.synced,
      skipped: result.skipped,
      failed: result.failed,
    });

    return {
      success: true,
      synced: result.synced,
      skipped: result.skipped,
      failed: result.failed,
      message: `Successfully synced ${result.synced} prices to Shopify`,
    };
  } catch (error) {
    logger.error('Manual price sync failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      synced: 0,
      skipped: 0,
      failed: request.urls.length,
      message: `Price sync failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
