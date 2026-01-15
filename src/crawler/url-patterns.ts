/**
 * URL Pattern Filtering
 * Defines exclusion patterns for non-product pages and detection heuristics
 * for identifying product and offer pages on Honda NZ websites
 */

/**
 * Exclusion patterns - URL path segments to skip during crawl
 * These are informational or utility pages, not products
 */
export const EXCLUSION_PATTERNS: string[] = [
  // About and company info
  'about',
  'about-us',
  'about-honda',
  'why-honda',
  'history',
  'our-story',

  // Contact and support
  'contact',
  'contact-us',
  'find-a-dealer',
  'find-dealer',
  'dealers',
  'find-a-store',
  'stores',
  'locations',

  // Finance and services
  'finance',
  'financing',
  'finance-options',
  'insurance',
  'service',
  'servicing',
  'warranty',
  'warranties',
  'parts',
  'accessories',

  // Legal and policies
  'privacy',
  'privacy-policy',
  'terms',
  'terms-and-conditions',
  'terms-of-use',
  'cookie-policy',
  'disclaimer',

  // Career and company
  'careers',
  'jobs',
  'employment',

  // Content and media
  'news',
  'blog',
  'articles',
  'press',
  'media',
  'events',
  'videos',

  // Help and FAQ
  'faq',
  'faqs',
  'help',
  'support',
  'how-to',
  'guides',

  // Navigation and categories
  'category',
  'categories',
  'collection',
  'collections',
  'range',
  'ranges',
  'all-products',
  'browse',

  // Honda-specific category pages (descriptive hyphenated names)
  'outboards',
  'motorcycles',
  'scooters',
  'generators',
  'lawn-mowers',
  'pumps',
  'tillers',
  'atvs',
  'side-by-side',
  'power-equipment',
  'high-power-outboards',
  'mid-range-outboards',
  'portable-outboards',
  'sport-bikes',
  'adventure-bikes',
  'cruiser-bikes',
  'commuter-bikes',
  'off-road-bikes',

  // User account and cart
  'search',
  'cart',
  'checkout',
  'login',
  'register',
  'account',
  'my-account',
  'wishlist',

  // Technical pages
  'sitemap',
  '404',
  'error',
  'not-found',
  'robots.txt',
  'favicon.ico',
];

/**
 * Checks if a URL matches any exclusion pattern
 * @param url - Full URL to check
 * @returns true if the URL should be excluded from product consideration
 */
export function matchesExclusionPattern(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();

    return EXCLUSION_PATTERNS.some((pattern) => {
      // Check if pattern appears as a path segment
      // This handles: /about, /about-us, /page/about, etc.
      return path.includes(`/${pattern}`) || path === `/${pattern}`;
    });
  } catch {
    // If URL parsing fails, don't exclude (let it be checked)
    return false;
  }
}

/**
 * Checks if a URL path looks like a Honda product SKU
 * Honda products have alphanumeric codes like: bf225, eu22i, nc750x, trx520fm6
 * Category pages have descriptive hyphenated names like: high-power-outboards
 *
 * @param url - Full URL to check
 * @returns true if the URL path looks like a product SKU
 */
export function isProductSkuUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const segments = path.split('/').filter((s) => s.length > 0);

    // Must be a single path segment (e.g., /bf225)
    if (segments.length !== 1) {
      return false;
    }

    const segment = segments[0];

    // Skip if it's the homepage or empty
    if (segment.length === 0) {
      return false;
    }

    // Product SKU patterns:
    // - Contains at least one number (bf225, eu22i, nc750x)
    // - Relatively short (typically under 15 chars for SKUs)
    // - Few or no hyphens (categories use hyphens like "high-power-outboards")
    const hasNumber = /\d/.test(segment);
    const hyphenCount = (segment.match(/-/g) || []).length;
    const isShort = segment.length <= 15;

    // Strong indicator: has numbers and few hyphens
    if (hasNumber && hyphenCount <= 1 && isShort) {
      return true;
    }

    // Known Honda product prefixes (model families)
    const productPrefixes = [
      'bf', // Marine outboards (BF2, BF225, etc.)
      'eu', // Generators (EU22i, EU70is, etc.)
      'em', // Generators (EM series)
      'ep', // Generators
      'eg', // Generators
      'eb', // Generators
      'nc', // Motorcycles (NC750X)
      'cb', // Motorcycles (CB650R, CB500)
      'cbr', // Sport bikes (CBR500R, CBR650R)
      'crf', // Off-road bikes (CRF450, CRF250)
      'trx', // ATVs (TRX520, TRX250)
      'hrv', // Lawn equipment
      'hru', // Lawn mowers
      'hrx', // Lawn mowers
      'hrc', // Lawn mowers
      'wb', // Pumps
      'wh', // Pumps
      'wt', // Pumps
      'gx', // Engines
      'gcv', // Engines
      'pioneer', // Side-by-side (Pioneer 520, 700, 1000)
      'talon', // Side-by-side
      'africa', // Africa Twin (when followed by number)
      'transalp',
      'rebel',
      'forza',
      'pcx',
      'sh',
    ];

    // Check if it starts with a known product prefix
    const startsWithProductPrefix = productPrefixes.some(
      (prefix) => segment.startsWith(prefix) && segment.length > prefix.length
    );

    if (startsWithProductPrefix) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Checks if a URL path looks like a category page
 * Category pages have descriptive hyphenated names like: high-power-outboards
 *
 * @param url - Full URL to check
 * @returns true if the URL path looks like a category page
 */
export function isCategoryUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const segments = path.split('/').filter((s) => s.length > 0);

    // Check first segment
    if (segments.length === 0) {
      return true; // Homepage is a category/landing page
    }

    const segment = segments[0];

    // Category indicators:
    // - Multiple hyphens (descriptive names)
    // - No numbers
    // - Plural words (outboards, motorcycles, generators)
    const hyphenCount = (segment.match(/-/g) || []).length;
    const hasNumber = /\d/.test(segment);
    const endsWithPlural = /s$/.test(segment) && segment.length > 3;

    // Multiple hyphens without numbers = likely category
    if (hyphenCount >= 2 && !hasNumber) {
      return true;
    }

    // Plural ending without numbers and with at least one hyphen = likely category
    if (endsWithPlural && !hasNumber && hyphenCount >= 1) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Heuristics for detecting if a page is likely a product page
 * Combines URL-based detection with HTML content analysis
 *
 * @param url - Full URL of the page
 * @param html - HTML content of the page
 * @returns true if the page appears to be a product page
 */
export function isLikelyProductPage(url: string, html: string): boolean {
  // First, check URL-based exclusions
  if (isCategoryUrl(url)) {
    return false;
  }

  // Check for JSON-LD Product schema (most reliable indicator)
  const hasProductSchema = /"@type"\s*:\s*"Product"/i.test(html);
  if (hasProductSchema) {
    return true;
  }

  // Check for product-specific meta tags
  const hasProductMeta =
    /<meta[^>]*property="og:type"[^>]*content="product"/i.test(html) ||
    /<meta[^>]*content="product"[^>]*property="og:type"/i.test(html);

  if (hasProductMeta) {
    return true;
  }

  // URL looks like a product SKU - use HTML to confirm
  const urlLooksLikeProduct = isProductSkuUrl(url);

  if (urlLooksLikeProduct) {
    // Confirm with HTML indicators
    const hasPriceElement =
      /class="[^"]*(?:price|rrp|cost)[^"]*"/i.test(html) ||
      /id="[^"]*(?:price|rrp)[^"]*"/i.test(html);

    const hasAddToCart = /add.?to.?cart|addtocart|buy.?now|purchase/i.test(html);

    const hasSpecifications =
      /specifications?|features?|specs/i.test(html) &&
      /<table|<dl|class="[^"]*spec/i.test(html);

    // Product if URL looks like SKU AND has product-page content
    if (hasPriceElement || hasAddToCart || hasSpecifications) {
      return true;
    }
  }

  // Don't flag pages without strong product indicators
  return false;
}

/**
 * Checks if a URL appears to be an offers/promotions page
 * @param url - Full URL to check
 * @returns true if the URL matches offer patterns
 */
export function isOfferPage(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();

    // Match various offer-related URL patterns
    return /\/(offers?|promotions?|specials?|deals?|sale|discount|clearance)\//i.test(path);
  } catch {
    return false;
  }
}

/**
 * Extracts the path depth (number of segments) from a URL
 * Useful for prioritizing shallow pages in crawl queue
 * @param url - Full URL
 * @returns Number of path segments
 */
export function getPathDepth(url: string): number {
  try {
    const path = new URL(url).pathname;
    // Count non-empty path segments
    return path.split('/').filter((segment) => segment.length > 0).length;
  } catch {
    return 0;
  }
}

/**
 * Checks if a URL is likely a static asset (not worth crawling)
 * @param url - Full URL to check
 * @returns true if the URL appears to be a static asset
 */
export function isStaticAsset(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();

    // Common static asset extensions
    return /\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot|pdf|zip|mp4|mp3|webm)$/i.test(
      path
    );
  } catch {
    return false;
  }
}
