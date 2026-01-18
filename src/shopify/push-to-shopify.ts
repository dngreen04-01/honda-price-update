import { shopifyClient } from './client.js';
import { formatSpecificationsHtml } from './specifications-formatter.js';
import { BikeProductScraper } from '../scraper/bike-product-scraper.js';
import { SimpleProductScraper } from '../scraper/simple-product-scraper.js';
import { getDiscoveredProductById, updateDiscoveredProductStatus, upsertShopifyCatalogCache } from '../database/queries.js';
import { canonicalizeUrl } from '../utils/canonicalize.js';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import {
  PushToShopifyResult,
  ProductTemplate,
  CreateProductInput,
  CreateMetafieldInput,
  BikeProductAssets,
} from '../types/index.js';

const HONDA_BASE_URL = 'https://www.hondamotorbikes.co.nz';

/**
 * Push a discovered motorbike product to Shopify
 */
export async function pushMotorbikeToShopify(
  discoveredProductId: number
): Promise<PushToShopifyResult> {
  const warnings: string[] = [];

  try {
    // Step 1: Fetch discovered product from DB
    logger.info('Fetching discovered product', { discoveredProductId });
    const discoveredProduct = await getDiscoveredProductById(discoveredProductId);

    if (!discoveredProduct) {
      return {
        success: false,
        error: `Discovered product with ID ${discoveredProductId} not found`,
      };
    }

    if (discoveredProduct.status === 'added') {
      return {
        success: false,
        error: 'Product has already been added to Shopify',
      };
    }

    // Step 2: Scrape the supplier website
    logger.info('Scraping product from supplier website', { url: discoveredProduct.url });
    const scraper = new BikeProductScraper();
    let productAssets: BikeProductAssets;

    try {
      productAssets = await scraper.scrape(discoveredProduct.url);
    } catch (scrapeError) {
      return {
        success: false,
        error: `Failed to scrape product: ${scrapeError instanceof Error ? scrapeError.message : String(scrapeError)}`,
      };
    }

    // Step 3: Upload images to Shopify File API
    logger.info('Uploading images to Shopify');
    const imageFileIds = await uploadProductImages(productAssets, warnings);

    // Step 4: Format specifications as HTML
    logger.info('Formatting specifications as HTML');
    const specificationsHtml = await formatSpecificationsHtml(productAssets.specifications);

    // Step 5: Build product creation input
    const productTitle = `Honda ${productAssets.content.title || extractSlugFromUrl(discoveredProduct.url)}`;
    const variantSku = extractSlugFromUrl(discoveredProduct.url);
    const price = discoveredProduct.detected_price?.toString() || '0.00';

    // Build metafields
    const metafields = buildMetafields(productAssets, imageFileIds, specificationsHtml, discoveredProduct.url);

    const productInput: CreateProductInput = {
      title: productTitle,
      descriptionHtml: productAssets.content.description || '',
      vendor: 'Honda',
      status: 'DRAFT',
      templateSuffix: 'motorbikes', // Use motorbikes theme template
      variants: [{
        sku: variantSku,
        price,
        inventoryPolicy: 'CONTINUE',
        imageSrc: productAssets.images.product ? resolveImageUrl(productAssets.images.product) : undefined,
      }],
      metafields,
    };

    // Step 6: Create product in Shopify
    logger.info('Creating product in Shopify', { title: productTitle });
    const createResult = await shopifyClient.createProduct(productInput);

    if (!createResult) {
      return {
        success: false,
        error: 'Failed to create product in Shopify',
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    // Step 7: Update discovered product status
    logger.info('Updating discovered product status to added');
    await updateDiscoveredProductStatus(discoveredProductId, 'added', 'system');

    // Step 8: Insert into shopify_catalog_cache for immediate availability
    try {
      await upsertShopifyCatalogCache(
        createResult.productId,           // shopifyProductId
        createResult.variantId,           // shopifyVariantId
        canonicalizeUrl(discoveredProduct.url), // sourceUrlCanonical
        parseFloat(price),                // shopifyPrice
        null,                             // shopifyCompareAtPrice
        productTitle,                     // productTitle
        undefined,                        // variantTitle (single variant products don't have variant titles)
        variantSku                        // variantSku
      );
      logger.info('Product added to catalog cache', {
        shopifyProductId: createResult.productId,
        variantSku,
      });
    } catch (cacheError) {
      logger.warn('Failed to update catalog cache (will sync on next refresh)', {
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
      warnings.push('Product created but catalog cache update failed - will sync automatically');
    }

    // Build Shopify admin URL
    const productNumericId = createResult.productId.replace('gid://shopify/Product/', '');
    const shopifyProductUrl = `https://${config.shopify.storeDomain}/admin/products/${productNumericId}`;

    logger.info('Product successfully pushed to Shopify', {
      discoveredProductId,
      shopifyProductId: createResult.productId,
      shopifyProductUrl,
    });

    return {
      success: true,
      shopifyProductId: createResult.productId,
      shopifyVariantId: createResult.variantId,
      shopifyProductUrl,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    logger.error('Failed to push product to Shopify', {
      discoveredProductId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

/**
 * Upload all product images to Shopify File API
 */
async function uploadProductImages(
  productAssets: BikeProductAssets,
  warnings: string[]
): Promise<{
  hero: string | null;
  feature1: string | null;
  feature2: string | null;
  feature3: string | null;
  feature4: string | null;
}> {
  const results = {
    hero: null as string | null,
    feature1: null as string | null,
    feature2: null as string | null,
    feature3: null as string | null,
    feature4: null as string | null,
  };

  // Upload hero image
  if (productAssets.images.hero) {
    const heroUrl = resolveImageUrl(productAssets.images.hero);
    const heroFileId = await shopifyClient.uploadFile(
      heroUrl,
      'hero-image.jpg',
      getContentType(heroUrl)
    );
    if (heroFileId) {
      results.hero = heroFileId;
    } else {
      warnings.push('Failed to upload hero image');
    }
  }

  // Upload feature images
  const featureImages = productAssets.images.features;

  // Feature 1 (from full-width banner)
  if (featureImages[0]) {
    const url = resolveImageUrl(featureImages[0]);
    const fileId = await shopifyClient.uploadFile(url, 'feature1-image.jpg', getContentType(url));
    if (fileId) {
      results.feature1 = fileId;
    } else {
      warnings.push('Failed to upload feature 1 image');
    }
  }

  // Feature 2 (carousel slide 1)
  if (featureImages[1]) {
    const url = resolveImageUrl(featureImages[1]);
    const fileId = await shopifyClient.uploadFile(url, 'feature2-image.jpg', getContentType(url));
    if (fileId) {
      results.feature2 = fileId;
    } else {
      warnings.push('Failed to upload feature 2 image');
    }
  }

  // Feature 3 (carousel slide 2)
  if (featureImages[2]) {
    const url = resolveImageUrl(featureImages[2]);
    const fileId = await shopifyClient.uploadFile(url, 'feature3-image.jpg', getContentType(url));
    if (fileId) {
      results.feature3 = fileId;
    } else {
      warnings.push('Failed to upload feature 3 image');
    }
  }

  // Feature 4 (carousel slide 3)
  if (featureImages[3]) {
    const url = resolveImageUrl(featureImages[3]);
    const fileId = await shopifyClient.uploadFile(url, 'feature4-image.jpg', getContentType(url));
    if (fileId) {
      results.feature4 = fileId;
    } else {
      warnings.push('Failed to upload feature 4 image');
    }
  }

  return results;
}

/**
 * Build metafields array for product creation
 */
function buildMetafields(
  productAssets: BikeProductAssets,
  imageFileIds: {
    hero: string | null;
    feature1: string | null;
    feature2: string | null;
    feature3: string | null;
    feature4: string | null;
  },
  specificationsHtml: string,
  sourceUrl: string
): CreateMetafieldInput[] {
  const metafields: CreateMetafieldInput[] = [];

  // Image metafields (file_reference type)
  if (imageFileIds.hero) {
    metafields.push({
      namespace: 'custom',
      key: 'hero_image',
      value: imageFileIds.hero,
      type: 'file_reference',
    });
  }

  // Note: Using the exact keys specified by user including typos
  if (imageFileIds.feature1) {
    metafields.push({
      namespace: 'custom',
      key: 'fearture1_image', // Intentional: matches existing Shopify theme config
      value: imageFileIds.feature1,
      type: 'file_reference',
    });
  }

  if (imageFileIds.feature2) {
    metafields.push({
      namespace: 'custom',
      key: 'feature2_image',
      value: imageFileIds.feature2,
      type: 'file_reference',
    });
  }

  if (imageFileIds.feature3) {
    metafields.push({
      namespace: 'custom',
      key: 'feature3_image',
      value: imageFileIds.feature3,
      type: 'file_reference',
    });
  }

  if (imageFileIds.feature4) {
    metafields.push({
      namespace: 'custom',
      key: 'feature4_image',
      value: imageFileIds.feature4,
      type: 'file_reference',
    });
  }

  // Text metafields - Feature 1
  const feature1 = productAssets.content.features[0];
  if (feature1?.title) {
    metafields.push({
      namespace: 'custom',
      key: 'feature1_name',
      value: feature1.title,
      type: 'single_line_text_field',
    });
  }
  if (feature1?.description) {
    metafields.push({
      namespace: 'custom',
      key: 'feature1_description',
      value: feature1.description,
      type: 'multi_line_text_field',
    });
  }

  // Text metafields - Feature 2 (carousel title/description)
  const feature2 = productAssets.content.features[1];
  if (feature2?.title) {
    metafields.push({
      namespace: 'custom',
      key: 'feature2',
      value: feature2.title,
      type: 'single_line_text_field',
    });
  }
  if (feature2?.description) {
    metafields.push({
      namespace: 'custom',
      key: 'feature2_description',
      value: feature2.description,
      type: 'multi_line_text_field',
    });
  }

  // Text metafields - Feature 3 (carousel title/description)
  const feature3 = productAssets.content.features[2];
  if (feature3?.title) {
    metafields.push({
      namespace: 'custom',
      key: 'feature3',
      value: feature3.title,
      type: 'single_line_text_field',
    });
  }
  if (feature3?.description) {
    metafields.push({
      namespace: 'custom',
      key: 'feature_3_decription', // Intentional: matches existing Shopify theme config
      value: feature3.description,
      type: 'multi_line_text_field',
    });
  }

  // Text metafields - Feature 4 (carousel title/description)
  const feature4 = productAssets.content.features[3];
  if (feature4?.title) {
    metafields.push({
      namespace: 'custom',
      key: 'feature4',
      value: feature4.title,
      type: 'single_line_text_field',
    });
  }
  if (feature4?.description) {
    metafields.push({
      namespace: 'custom',
      key: 'feature4_description',
      value: feature4.description,
      type: 'multi_line_text_field',
    });
  }

  // Specifications HTML
  if (specificationsHtml) {
    metafields.push({
      namespace: 'custom',
      key: 'specifications',
      value: specificationsHtml,
      type: 'multi_line_text_field',
    });
  }

  // Source URL
  metafields.push({
    namespace: 'custom',
    key: 'source_url',
    value: sourceUrl,
    type: 'url',
  });

  return metafields;
}

/**
 * Resolve relative image URLs to absolute URLs
 */
function resolveImageUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('/')) {
    return `${HONDA_BASE_URL}${url}`;
  }
  return `${HONDA_BASE_URL}/${url}`;
}

/**
 * Extract slug from URL for use as SKU
 * e.g., "https://www.hondamotorbikes.co.nz/cb1000-hornet" -> "cb1000-hornet"
 */
function extractSlugFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    return pathParts[pathParts.length - 1] || 'unknown-product';
  } catch {
    // If URL parsing fails, try simple extraction
    const parts = url.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'unknown-product';
  }
}

/**
 * Determine content type from URL
 */
function getContentType(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.png')) {
    return 'image/png';
  }
  if (lowerUrl.includes('.webp')) {
    return 'image/webp';
  }
  if (lowerUrl.includes('.gif')) {
    return 'image/gif';
  }
  // Default to JPEG
  return 'image/jpeg';
}

/**
 * Push a discovered product to Shopify using the default (simple) template
 * Creates a minimal product with just title, description, image, and SKU
 * No metafields except source_url for tracking
 */
export async function pushDefaultProductToShopify(
  discoveredProductId: number
): Promise<PushToShopifyResult> {
  const warnings: string[] = [];

  try {
    // Step 1: Fetch discovered product from DB
    logger.info('Fetching discovered product for default template', { discoveredProductId });
    const discoveredProduct = await getDiscoveredProductById(discoveredProductId);

    if (!discoveredProduct) {
      return {
        success: false,
        error: `Discovered product with ID ${discoveredProductId} not found`,
      };
    }

    if (discoveredProduct.status === 'added') {
      return {
        success: false,
        error: 'Product has already been added to Shopify',
      };
    }

    // Step 2: Scrape the supplier website using simple scraper
    logger.info('Scraping product from supplier website (simple)', { url: discoveredProduct.url });
    const scraper = new SimpleProductScraper();
    let productAssets;

    try {
      productAssets = await scraper.scrape(discoveredProduct.url);
    } catch (scrapeError) {
      return {
        success: false,
        error: `Failed to scrape product: ${scrapeError instanceof Error ? scrapeError.message : String(scrapeError)}`,
      };
    }

    // Step 3: Resolve image URL and determine base URL from discovered product
    const baseUrl = getBaseUrlFromProductUrl(discoveredProduct.url);
    const resolvedImageUrl = productAssets.imageUrl
      ? resolveImageUrlWithBase(productAssets.imageUrl, baseUrl)
      : undefined;

    // Step 4: Build product creation input (minimal - no custom metafields)
    const variantSku = extractSlugFromUrl(discoveredProduct.url);
    const productTitle = `Honda ${productAssets.title || variantSku}`;
    const price = discoveredProduct.detected_price?.toString() || '0.00';

    // Only source_url metafield for tracking/matching
    const metafields: CreateMetafieldInput[] = [
      {
        namespace: 'custom',
        key: 'source_url',
        value: discoveredProduct.url,
        type: 'url',
      },
    ];

    const productInput: CreateProductInput = {
      title: productTitle,
      descriptionHtml: productAssets.description || '',
      vendor: 'Honda',
      status: 'DRAFT',
      templateSuffix: 'default-product',
      // No category
      variants: [{
        sku: variantSku,
        price,
        inventoryPolicy: 'CONTINUE',
        imageSrc: resolvedImageUrl,
      }],
      metafields,
    };

    // Step 5: Create product in Shopify
    logger.info('Creating simple product in Shopify', { title: productTitle });
    const createResult = await shopifyClient.createProduct(productInput);

    if (!createResult) {
      return {
        success: false,
        error: 'Failed to create product in Shopify',
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    // Step 6: Update discovered product status
    logger.info('Updating discovered product status to added');
    await updateDiscoveredProductStatus(discoveredProductId, 'added', 'system');

    // Step 7: Insert into shopify_catalog_cache for immediate availability
    try {
      await upsertShopifyCatalogCache(
        createResult.productId,           // shopifyProductId
        createResult.variantId,           // shopifyVariantId
        canonicalizeUrl(discoveredProduct.url), // sourceUrlCanonical
        parseFloat(price),                // shopifyPrice
        null,                             // shopifyCompareAtPrice
        productTitle,                     // productTitle
        undefined,                        // variantTitle (single variant products don't have variant titles)
        variantSku                        // variantSku
      );
      logger.info('Product added to catalog cache', {
        shopifyProductId: createResult.productId,
        variantSku,
      });
    } catch (cacheError) {
      logger.warn('Failed to update catalog cache (will sync on next refresh)', {
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
      warnings.push('Product created but catalog cache update failed - will sync automatically');
    }

    // Build Shopify admin URL
    const productNumericId = createResult.productId.replace('gid://shopify/Product/', '');
    const shopifyProductUrl = `https://${config.shopify.storeDomain}/admin/products/${productNumericId}`;

    logger.info('Simple product successfully pushed to Shopify', {
      discoveredProductId,
      shopifyProductId: createResult.productId,
      shopifyProductUrl,
    });

    return {
      success: true,
      shopifyProductId: createResult.productId,
      shopifyVariantId: createResult.variantId,
      shopifyProductUrl,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    logger.error('Failed to push simple product to Shopify', {
      discoveredProductId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

/**
 * Extract base URL from a product URL (handles different Honda NZ sites)
 */
function getBaseUrlFromProductUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}`;
  } catch {
    // Default to motorbikes if parsing fails
    return HONDA_BASE_URL;
  }
}

/**
 * Resolve relative image URLs to absolute URLs using the appropriate base
 */
function resolveImageUrlWithBase(url: string, baseUrl: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('/')) {
    return `${baseUrl}${url}`;
  }
  return `${baseUrl}/${url}`;
}

/**
 * Main export for pushing products to Shopify based on template
 */
export async function pushToShopify(
  discoveredProductId: number,
  template: ProductTemplate
): Promise<PushToShopifyResult> {
  switch (template) {
    case 'motorbikes':
      return pushMotorbikeToShopify(discoveredProductId);

    case 'outboard-motors':
      // TODO: Implement outboard motors template
      return {
        success: false,
        error: 'Outboard motors template not yet implemented',
      };

    case 'default':
      return pushDefaultProductToShopify(discoveredProductId);

    default:
      return {
        success: false,
        error: `Unknown template: ${template}`,
      };
  }
}

/**
 * Push a product to Shopify directly from a URL (bypasses discovered_products table)
 * Used for manual URL entry where no discovery record exists
 */
export async function pushUrlToShopify(
  url: string,
  template: ProductTemplate,
  price?: number
): Promise<PushToShopifyResult> {
  switch (template) {
    case 'motorbikes':
      return pushMotorbikeUrlToShopify(url, price);

    case 'outboard-motors':
      // TODO: Implement outboard motors template
      return {
        success: false,
        error: 'Outboard motors template not yet implemented',
      };

    case 'default':
      return pushDefaultUrlToShopify(url, price);

    default:
      return {
        success: false,
        error: `Unknown template: ${template}`,
      };
  }
}

/**
 * Push a motorbike product to Shopify directly from URL
 */
async function pushMotorbikeUrlToShopify(
  url: string,
  price?: number
): Promise<PushToShopifyResult> {
  const warnings: string[] = [];

  try {
    // Step 1: Validate URL
    try {
      new URL(url);
    } catch {
      return {
        success: false,
        error: 'Invalid URL format',
      };
    }

    // Step 2: Scrape the supplier website
    logger.info('Scraping motorbike product from URL', { url });
    const scraper = new BikeProductScraper();
    let productAssets: BikeProductAssets;

    try {
      productAssets = await scraper.scrape(url);
    } catch (scrapeError) {
      return {
        success: false,
        error: `Failed to scrape product: ${scrapeError instanceof Error ? scrapeError.message : String(scrapeError)}`,
      };
    }

    // Step 3: Upload images to Shopify File API
    logger.info('Uploading images to Shopify');
    const imageFileIds = await uploadProductImages(productAssets, warnings);

    // Step 4: Format specifications as HTML
    logger.info('Formatting specifications as HTML');
    const specificationsHtml = await formatSpecificationsHtml(productAssets.specifications);

    // Step 5: Build product creation input
    const productTitle = `Honda ${productAssets.content.title || extractSlugFromUrl(url)}`;
    const variantSku = extractSlugFromUrl(url);
    const priceStr = price?.toString() || '0.00';

    // Build metafields
    const metafields = buildMetafields(productAssets, imageFileIds, specificationsHtml, url);

    const productInput: CreateProductInput = {
      title: productTitle,
      descriptionHtml: productAssets.content.description || '',
      vendor: 'Honda',
      status: 'DRAFT',
      templateSuffix: 'motorbikes',
      variants: [{
        sku: variantSku,
        price: priceStr,
        inventoryPolicy: 'CONTINUE',
        imageSrc: productAssets.images.product ? resolveImageUrl(productAssets.images.product) : undefined,
      }],
      metafields,
    };

    // Step 6: Create product in Shopify
    logger.info('Creating motorbike product in Shopify', { title: productTitle });
    const createResult = await shopifyClient.createProduct(productInput);

    if (!createResult) {
      return {
        success: false,
        error: 'Failed to create product in Shopify',
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    // Step 7: Insert into shopify_catalog_cache for tracking
    try {
      await upsertShopifyCatalogCache(
        createResult.productId,
        createResult.variantId,
        canonicalizeUrl(url),
        price || 0,
        null,
        productTitle,
        undefined,
        variantSku
      );
      logger.info('Product added to catalog cache', {
        shopifyProductId: createResult.productId,
        variantSku,
      });
    } catch (cacheError) {
      logger.warn('Failed to update catalog cache (will sync on next refresh)', {
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
      warnings.push('Product created but catalog cache update failed - will sync automatically');
    }

    // Build Shopify admin URL
    const productNumericId = createResult.productId.replace('gid://shopify/Product/', '');
    const shopifyProductUrl = `https://${config.shopify.storeDomain}/admin/products/${productNumericId}`;

    logger.info('Motorbike product successfully pushed to Shopify from URL', {
      url,
      shopifyProductId: createResult.productId,
      shopifyProductUrl,
    });

    return {
      success: true,
      shopifyProductId: createResult.productId,
      shopifyVariantId: createResult.variantId,
      shopifyProductUrl,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    logger.error('Failed to push motorbike product to Shopify from URL', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

/**
 * Push a default product to Shopify directly from URL
 */
async function pushDefaultUrlToShopify(
  url: string,
  price?: number
): Promise<PushToShopifyResult> {
  const warnings: string[] = [];

  try {
    // Step 1: Validate URL
    try {
      new URL(url);
    } catch {
      return {
        success: false,
        error: 'Invalid URL format',
      };
    }

    // Step 2: Scrape the supplier website using simple scraper
    logger.info('Scraping product from URL (simple)', { url });
    const scraper = new SimpleProductScraper();
    let productAssets;

    try {
      productAssets = await scraper.scrape(url);
    } catch (scrapeError) {
      return {
        success: false,
        error: `Failed to scrape product: ${scrapeError instanceof Error ? scrapeError.message : String(scrapeError)}`,
      };
    }

    // Step 3: Resolve image URL
    const baseUrl = getBaseUrlFromProductUrl(url);
    const resolvedImageUrl = productAssets.imageUrl
      ? resolveImageUrlWithBase(productAssets.imageUrl, baseUrl)
      : undefined;

    // Step 4: Build product creation input
    const variantSku = extractSlugFromUrl(url);
    const productTitle = `Honda ${productAssets.title || variantSku}`;
    const priceStr = price?.toString() || '0.00';

    // Only source_url metafield for tracking
    const metafields: CreateMetafieldInput[] = [
      {
        namespace: 'custom',
        key: 'source_url',
        value: url,
        type: 'url',
      },
    ];

    const productInput: CreateProductInput = {
      title: productTitle,
      descriptionHtml: productAssets.description || '',
      vendor: 'Honda',
      status: 'DRAFT',
      templateSuffix: 'default-product',
      variants: [{
        sku: variantSku,
        price: priceStr,
        inventoryPolicy: 'CONTINUE',
        imageSrc: resolvedImageUrl,
      }],
      metafields,
    };

    // Step 5: Create product in Shopify
    logger.info('Creating simple product in Shopify from URL', { title: productTitle });
    const createResult = await shopifyClient.createProduct(productInput);

    if (!createResult) {
      return {
        success: false,
        error: 'Failed to create product in Shopify',
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    // Step 6: Insert into shopify_catalog_cache for tracking
    try {
      await upsertShopifyCatalogCache(
        createResult.productId,
        createResult.variantId,
        canonicalizeUrl(url),
        price || 0,
        null,
        productTitle,
        undefined,
        variantSku
      );
      logger.info('Product added to catalog cache', {
        shopifyProductId: createResult.productId,
        variantSku,
      });
    } catch (cacheError) {
      logger.warn('Failed to update catalog cache (will sync on next refresh)', {
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
      warnings.push('Product created but catalog cache update failed - will sync automatically');
    }

    // Build Shopify admin URL
    const productNumericId = createResult.productId.replace('gid://shopify/Product/', '');
    const shopifyProductUrl = `https://${config.shopify.storeDomain}/admin/products/${productNumericId}`;

    logger.info('Simple product successfully pushed to Shopify from URL', {
      url,
      shopifyProductId: createResult.productId,
      shopifyProductUrl,
    });

    return {
      success: true,
      shopifyProductId: createResult.productId,
      shopifyVariantId: createResult.variantId,
      shopifyProductUrl,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    logger.error('Failed to push simple product to Shopify from URL', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}
