/**
 * Product ID Extraction Utility
 *
 * Extracts product identifiers from Honda product URLs.
 * The product ID is typically the last path segment, which corresponds
 * to the variant SKU in Shopify.
 *
 * This handles cases where the same product appears at different URL paths:
 * - /08l78mkse00
 * - /honda-genuine-accessories/08l78mkse00
 *
 * Both should extract "08l78mkse00" as the product ID.
 */

/**
 * Extracts the product identifier from a Honda product URL.
 *
 * @param url - The full URL or pathname to extract from
 * @returns The product ID (lowercase) or null if not extractable
 *
 * @example
 * extractProductId('https://hondamotorbikes.co.nz/08l78mkse00')
 * // => '08l78mkse00'
 *
 * @example
 * extractProductId('https://hondamotorbikes.co.nz/honda-genuine-accessories/08l78mkse00')
 * // => '08l78mkse00'
 *
 * @example
 * extractProductId('https://hondamarine.co.nz/outboards/high-power/bf225')
 * // => 'bf225'
 */
export function extractProductId(url: string): string | null {
  try {
    // Handle both full URLs and pathnames
    const urlObj = url.startsWith('http') ? new URL(url) : new URL(url, 'https://example.com');
    const segments = urlObj.pathname.split('/').filter(Boolean);

    if (segments.length === 0) {
      return null;
    }

    const lastSegment = segments[segments.length - 1].toLowerCase();

    // Filter out segments that are too short to be valid product IDs
    if (lastSegment.length < 3) {
      return null;
    }

    // Filter out common non-product segments that might appear last
    const nonProductSegments = [
      'index',
      'home',
      'page',
      'list',
      'all',
      'view',
    ];

    if (nonProductSegments.includes(lastSegment)) {
      return null;
    }

    return lastSegment;
  } catch {
    // If URL parsing fails, return null
    return null;
  }
}

/**
 * Extracts product IDs from multiple URLs and returns a deduplicated set.
 *
 * @param urls - Array of URLs to extract product IDs from
 * @returns Set of unique product IDs (lowercase)
 */
export function extractProductIdsFromUrls(urls: string[]): Set<string> {
  const productIds = new Set<string>();

  for (const url of urls) {
    const productId = extractProductId(url);
    if (productId) {
      productIds.add(productId);
    }
  }

  return productIds;
}
