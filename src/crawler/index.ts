/**
 * Crawler Module
 * Exports all crawler-related functionality
 */

// Link extraction utilities
export {
  extractLinks,
  extractPageTitle,
  extractPrice,
  extractOfferTitle,
  extractOfferSummary,
  extractOfferDates,
} from './link-extractor.js';

// URL pattern matching and filtering
export {
  EXCLUSION_PATTERNS,
  matchesExclusionPattern,
  isLikelyProductPage,
  isOfferPage,
  isProductSkuUrl,
  isCategoryUrl,
  getPathDepth,
  isStaticAsset,
} from './url-patterns.js';

// Crawler orchestration
export {
  CrawlerOrchestrator,
  crawlerOrchestrator,
  HONDA_SITES,
  type CrawlOptions,
  type CrawlResult,
  type DiscoveredUrl,
} from './crawler-orchestrator.js';

// New product detection
export {
  NewProductDetector,
  newProductDetector,
  type DetectionResult,
} from './new-product-detector.js';

// Offer detection and storage
export {
  OfferDetector,
  offerDetector,
  type DiscoveredOffer,
} from './offer-detector.js';
