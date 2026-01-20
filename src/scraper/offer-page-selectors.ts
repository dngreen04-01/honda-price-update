/**
 * CSS selectors for extracting offer page content from Honda NZ sites
 * These selectors target hero images, promotional content, terms, and product links
 *
 * Honda sites use Magento with PageBuilder - structure is consistent across:
 * - hondamotorbikes.co.nz
 * - hondamarine.co.nz
 * - hondaoutdoors.co.nz
 */

export interface OfferPageSelectors {
  // Hero/banner image selectors
  hero: {
    primary: string;
    pictureSource: string;
    bannerImg: string;
    fallbackImg: string;
  };
  // Title/heading selectors
  title: {
    h1: string;
    offerTitle: string;
    promoHeading: string;
    pageTitle: string;
  };
  // Body content selectors
  body: {
    offerContent: string;
    promoBody: string;
    mainContent: string;
    pageBuilderRow: string;
  };
  // Terms and conditions selectors
  terms: {
    termsSection: string;
    disclaimer: string;
    finePrint: string;
    conditions: string;
  };
  // Product link patterns
  productLinks: {
    productAnchors: string;
    ctaButtons: string;
  };
}

/**
 * Base selectors that work across all Honda NZ sites
 * Uses stable Magento PageBuilder classes where possible
 */
export const offerPageSelectors: OfferPageSelectors = {
  hero: {
    // Full-width banner image at top
    primary: '.pagebuilder-banner-wrapper picture source, .offer-hero picture source',
    // Picture element sources (prefer highest res)
    pictureSource: '.cms-content picture source, .pagebuilder-banner picture source',
    // Direct banner image
    bannerImg: '.pagebuilder-banner-wrapper img, .pagebuilder-poster img',
    // Fallback: any large image in the hero section
    fallbackImg: '.page-main img[width], .cms-content > img, .cms-content .pagebuilder-column img',
  },
  title: {
    // Primary h1 on the page
    h1: '.page-title-wrapper h1, .page-main h1',
    // Offer-specific title classes
    offerTitle: '.offer-title, .promo-title, .deal-title',
    // Promotional heading classes
    promoHeading: '.promo-heading, .promotion-heading, .pagebuilder-heading h1',
    // General page title
    pageTitle: '.cms-page-view h1, #maincontent h1',
  },
  body: {
    // Main offer content area
    offerContent: '.offer-content, .offer-body, .offer-description',
    // Promotional body content
    promoBody: '.promo-body, .promo-content, .promotion-content',
    // Main CMS content (Magento)
    mainContent: '.cms-content, .column.main, #maincontent .columns',
    // PageBuilder rows with content
    pageBuilderRow: '.pagebuilder-row, [data-content-type="row"]',
  },
  terms: {
    // Terms and conditions section
    termsSection: '.terms, .terms-conditions, .terms-and-conditions',
    // Disclaimer text
    disclaimer: '.disclaimer, .fine-print, .legal-text',
    // Fine print paragraphs
    finePrint: '.offer-terms, .promo-terms, .conditions',
    // General conditions text
    conditions: 'p:contains("Terms"), p:contains("conditions"), p:contains("valid until")',
  },
  productLinks: {
    // Product page links
    productAnchors: 'a[href*="/products/"], a[href*="/catalog/product/"]',
    // Call-to-action buttons that might link to products
    ctaButtons: '.pagebuilder-button-primary a, .action.primary',
  },
};

/**
 * Domain-specific selector overrides
 * Some Honda sites may have slight variations in their structure
 */
export const domainSelectors: Record<string, Partial<OfferPageSelectors>> = {
  'hondamotorbikes.co.nz': {
    // Bikes site often uses section classes
    hero: {
      primary: '.section__full-img-banner picture source, .pagebuilder-banner-wrapper picture source',
      pictureSource: '.section__full-img-banner picture source',
      bannerImg: '.section__full-img-banner img, .pagebuilder-poster img',
      fallbackImg: '.page-main img[width]',
    },
    body: {
      offerContent: '.section__content-block, .offer-content',
      promoBody: '.promo-body, .pagebuilder-column',
      mainContent: '.cms-content, .column.main',
      pageBuilderRow: '.pagebuilder-row',
    },
  },
  'hondamarine.co.nz': {
    // Marine site structure
    hero: {
      primary: '.cms-content picture source, .pagebuilder-banner picture source',
      pictureSource: '.cms-content picture source',
      bannerImg: '.pagebuilder-banner img, .cms-content img',
      fallbackImg: '.page-main img',
    },
  },
  'hondaoutdoors.co.nz': {
    // Outdoors site structure
    hero: {
      primary: '.cms-content picture source, .pagebuilder-banner picture source',
      pictureSource: '.cms-content picture source',
      bannerImg: '.pagebuilder-banner img',
      fallbackImg: '.page-main img',
    },
  },
};

/**
 * Get selectors for a specific domain, falling back to base selectors
 */
export function getSelectorsForDomain(domain: string): OfferPageSelectors {
  const overrides = domainSelectors[domain];
  if (!overrides) {
    return offerPageSelectors;
  }

  // Merge overrides with base selectors
  return {
    hero: { ...offerPageSelectors.hero, ...overrides.hero },
    title: { ...offerPageSelectors.title, ...overrides.title },
    body: { ...offerPageSelectors.body, ...overrides.body },
    terms: { ...offerPageSelectors.terms, ...overrides.terms },
    productLinks: { ...offerPageSelectors.productLinks, ...overrides.productLinks },
  };
}

/**
 * Parse srcset attribute to get the highest resolution image URL
 * Reused from bike-product-selectors.ts for consistency
 */
export function parseHighestResSrcset(srcset: string | undefined): string | null {
  if (!srcset) return null;

  const sources = srcset.split(',').map(s => s.trim());

  let bestUrl: string | null = null;
  let bestScore = 0;

  for (const source of sources) {
    const parts = source.split(/\s+/);
    if (parts.length === 0) continue;

    const url = parts[0];
    let score = 1;

    if (parts.length > 1) {
      const descriptor = parts[1];
      // Handle pixel density descriptors (1x, 2x, 3x)
      if (descriptor.endsWith('x')) {
        score = parseFloat(descriptor) || 1;
      }
      // Handle width descriptors (480w, 800w, 1200w)
      else if (descriptor.endsWith('w')) {
        score = (parseFloat(descriptor) || 0) / 100;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }

  return bestUrl;
}

/**
 * Common patterns for identifying product URLs in Honda sites
 */
export const productUrlPatterns = [
  /\/products\//i,
  /\/catalog\/product\//i,
  /\/p\/[A-Z0-9-]+$/i, // Short product URLs
  /\/[a-z-]+-[A-Z0-9]+\.html$/i, // Magento product URLs with SKU
];

/**
 * Check if a URL is likely a product page
 */
export function isProductUrl(url: string): boolean {
  return productUrlPatterns.some(pattern => pattern.test(url));
}

/**
 * Patterns for extracting dates from offer text
 */
export const datePatterns = {
  // "Valid until DD/MM/YYYY" or "Ends DD/MM/YYYY"
  endDate: /(?:valid until|ends?|expires?|offer ends?|available until)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  // "DD Month YYYY" format
  endDateNatural: /(?:valid until|ends?|expires?)\s*:?\s*(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4})/i,
  // "From DD/MM to DD/MM" range
  dateRange: /(?:from|starts?)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*(?:to|-|until)\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
};
