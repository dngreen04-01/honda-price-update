import { EmailDigestData, PriceChange } from '../types/index.js';
import { getAllProductPages, getPriceHistory, getRecentOffers } from '../database/queries.js';
import { logger } from '../utils/logger.js';

/**
 * Generate CSV attachment content
 */
export function generateCsv(
  headers: string[],
  rows: string[][]
): string {
  const csvRows = [headers.join(',')];

  for (const row of rows) {
    csvRows.push(row.map(cell => `"${cell}"`).join(','));
  }

  return csvRows.join('\n');
}

/**
 * Generate price changes CSV
 */
export function generatePriceChangesCsv(priceChanges: PriceChange[]): string {
  const headers = [
    'Product URL',
    'Old Sale Price',
    'New Sale Price',
    'Old Original Price',
    'New Original Price',
    'Change %',
  ];

  const rows = priceChanges.map(pc => [
    pc.productUrl,
    pc.oldSalePrice?.toFixed(2) || 'N/A',
    pc.newSalePrice?.toFixed(2) || 'N/A',
    pc.oldOriginalPrice?.toFixed(2) || 'N/A',
    pc.newOriginalPrice?.toFixed(2) || 'N/A',
    pc.changePercent.toFixed(1) + '%',
  ]);

  return generateCsv(headers, rows);
}

/**
 * Generate missing products CSV
 */
export function generateMissingProductsCsv(
  supplierOnly: string[],
  shopifyOnly: string[]
): string {
  const headers = ['URL', 'Type'];

  const rows = [
    ...supplierOnly.map(url => [url, 'Supplier Only']),
    ...shopifyOnly.map(url => [url, 'Shopify Only']),
  ];

  return generateCsv(headers, rows);
}

/**
 * Detect price changes from history
 */
export async function detectPriceChanges(): Promise<PriceChange[]> {
  logger.info('Detecting price changes');

  const priceChanges: PriceChange[] = [];
  const products = await getAllProductPages();

  for (const product of products) {
    try {
      // Get last 2 price history entries
      const history = await getPriceHistory(product.id, 2);

      if (history.length < 2) {
        continue; // Not enough history to compare
      }

      const latest = history[0];
      const previous = history[1];

      // Check if prices changed
      const salePriceChanged =
        latest.sale_price !== previous.sale_price;
      const originalPriceChanged =
        latest.original_price !== previous.original_price;

      if (!salePriceChanged && !originalPriceChanged) {
        continue; // No changes
      }

      // Calculate change percentage
      const oldPrice = previous.sale_price || previous.original_price || 0;
      const newPrice = latest.sale_price || latest.original_price || 0;
      const changePercent = oldPrice > 0
        ? ((newPrice - oldPrice) / oldPrice) * 100
        : 0;

      priceChanges.push({
        productUrl: product.canonical_url,
        oldSalePrice: previous.sale_price,
        newSalePrice: latest.sale_price,
        oldOriginalPrice: previous.original_price,
        newOriginalPrice: latest.original_price,
        changePercent,
      });
    } catch (error) {
      logger.error('Failed to detect price change', {
        productId: product.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('Price change detection completed', { count: priceChanges.length });

  return priceChanges;
}

/**
 * Generate complete email digest data
 */
export async function generateDigestData(
  supplierOnlyProducts: string[],
  shopifyOnlyProducts: string[],
  stats: EmailDigestData['stats']
): Promise<EmailDigestData> {
  logger.info('Generating email digest data');

  // Detect price changes
  const priceChanges = await detectPriceChanges();

  // Get recent offers (last 7 days)
  const newOffers = await getRecentOffers(undefined, 7);

  const digestData: EmailDigestData = {
    priceChanges,
    newOffers,
    supplierOnlyProducts,
    shopifyOnlyProducts,
    stats,
  };

  logger.info('Email digest data generated', {
    priceChanges: priceChanges.length,
    newOffers: newOffers.length,
    supplierOnly: supplierOnlyProducts.length,
    shopifyOnly: shopifyOnlyProducts.length,
  });

  return digestData;
}

/**
 * Generate CSV attachments for email
 */
export function generateAttachments(digestData: EmailDigestData): Array<{
  content: string;
  filename: string;
  type: string;
}> {
  const attachments = [];

  // Price changes CSV
  if (digestData.priceChanges.length > 0) {
    const priceChangesCsv = generatePriceChangesCsv(digestData.priceChanges);
    attachments.push({
      content: Buffer.from(priceChangesCsv).toString('base64'),
      filename: `price-changes-${new Date().toISOString().split('T')[0]}.csv`,
      type: 'text/csv',
    });
  }

  // Missing products CSV
  if (
    digestData.supplierOnlyProducts.length > 0 ||
    digestData.shopifyOnlyProducts.length > 0
  ) {
    const missingProductsCsv = generateMissingProductsCsv(
      digestData.supplierOnlyProducts,
      digestData.shopifyOnlyProducts
    );
    attachments.push({
      content: Buffer.from(missingProductsCsv).toString('base64'),
      filename: `missing-products-${new Date().toISOString().split('T')[0]}.csv`,
      type: 'text/csv',
    });
  }

  return attachments;
}
