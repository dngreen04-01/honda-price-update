/**
 * Offer Page Builder
 * Transforms scraped offer content into Shopify page HTML
 * Uses Gemini AI for content enhancement with fallback to simple formatting
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import type { ScrapedOfferContent, ShopifyCatalogCache } from '../types/index.js';
import { ShopifyClient } from './client.js';

/**
 * Product with image data for offer page rendering
 */
interface ProductWithImage {
  id: number;
  shopifyProductId: string;
  title: string;
  sku: string | null;
  price: number;
  imageUrl: string | null;
  productHandle?: string;
}

/**
 * Build the complete HTML for an offer page
 * Uses Gemini AI to enhance the promotional copy, with fallback to simple formatting
 *
 * @param content - Scraped offer content from supplier page
 * @param products - Products linked to this offer (from shopify_catalog_cache)
 * @param shopifyClient - Shopify client for fetching product images
 * @returns HTML string for the Shopify page body
 */
export async function buildOfferPageHtml(
  content: ScrapedOfferContent,
  products: ShopifyCatalogCache[],
  shopifyClient: ShopifyClient
): Promise<string> {
  // Fetch product images from Shopify
  const productsWithImages = await fetchProductImages(products, shopifyClient);

  // Try Gemini enhancement first
  let enhancedBodyHtml = content.bodyHtml;
  if (config.gemini.apiKey) {
    try {
      const enhanced = await enhanceWithGemini(content);
      if (enhanced) {
        enhancedBodyHtml = enhanced;
        logger.info('Offer content enhanced with Gemini AI');
      }
    } catch (error) {
      logger.warn('Gemini enhancement failed, using original content', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Build the complete page HTML
  const sections: string[] = [];

  // Hero section
  if (content.heroImageUrl) {
    sections.push(buildHeroSection(content.heroImageUrl, content.title));
  }

  // Main content section
  sections.push(buildContentSection(content.title, enhancedBodyHtml));

  // Products section (if products are linked)
  if (productsWithImages.length > 0) {
    sections.push(buildProductsSection(productsWithImages));
  }

  // Terms section
  if (content.termsText || content.endDate) {
    sections.push(buildTermsSection(content.termsText, content.endDate));
  }

  return `<div class="offer-page">\n${sections.join('\n\n')}\n</div>`;
}

/**
 * Build a clean title for the offer page
 * @param scraped - Scraped offer content
 * @returns Clean title string
 */
export function buildOfferPageTitle(scraped: ScrapedOfferContent): string {
  let title = scraped.title.trim();

  // Remove common suffixes
  title = title
    .replace(/\s*\|.*$/, '')
    .replace(/\s*-\s*Honda.*$/i, '')
    .replace(/\s*-\s*Offers?$/i, '')
    .trim();

  // Add Honda prefix if not present
  if (!title.toLowerCase().includes('honda')) {
    title = `Honda ${title}`;
  }

  // Ensure reasonable length
  if (title.length > 100) {
    title = title.substring(0, 97) + '...';
  }

  return title;
}

/**
 * Generate a URL-safe handle from the offer title
 * @param title - Offer title
 * @returns URL handle (slug)
 */
export function generateOfferHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50); // Limit length
}

/**
 * Fetch Shopify product images and handles for linked products
 */
async function fetchProductImages(
  products: ShopifyCatalogCache[],
  shopifyClient: ShopifyClient
): Promise<ProductWithImage[]> {
  const productsWithImages: ProductWithImage[] = [];

  for (const product of products) {
    let imageUrl: string | null = null;
    let productHandle: string | null = null;

    // Fetch product details (image and handle) from Shopify if we have a product ID
    if (product.shopify_product_id) {
      try {
        const details = await shopifyClient.getProductDetails(product.shopify_product_id);
        if (details) {
          imageUrl = details.imageUrl;
          productHandle = details.handle;
        }
      } catch (error) {
        logger.warn('Failed to fetch product details', {
          productId: product.shopify_product_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    productsWithImages.push({
      id: product.id,
      shopifyProductId: product.shopify_product_id,
      title: product.product_title || 'Product',
      sku: product.variant_sku || null,
      price: product.shopify_price,
      imageUrl,
      productHandle: productHandle || undefined,
    });
  }

  return productsWithImages;
}

/**
 * Use Gemini AI to enhance the promotional content
 */
async function enhanceWithGemini(content: ScrapedOfferContent): Promise<string | null> {
  const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  const model = genAI.getGenerativeModel({ model: config.gemini.textModel });

  const prompt = `You are a marketing copywriter for a Honda dealership. Enhance the following promotional offer content to be more engaging and persuasive while maintaining accuracy.

IMPORTANT RULES:
1. Return ONLY the HTML content, no markdown code blocks
2. Keep the core offer details accurate
3. Use clear, professional language
4. Structure with appropriate HTML tags (p, h2, h3, ul, li)
5. Highlight key benefits and urgency
6. Keep it concise - no more than 3-4 paragraphs

Original title: ${content.title}

Original content:
${content.bodyHtml}

${content.endDate ? `Offer ends: ${content.endDate.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}

Enhanced HTML:`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  if (!text) {
    return null;
  }

  // Clean up any markdown code blocks if present
  let html = text.trim();
  if (html.startsWith('```html')) {
    html = html.slice(7);
  } else if (html.startsWith('```')) {
    html = html.slice(3);
  }
  if (html.endsWith('```')) {
    html = html.slice(0, -3);
  }

  return html.trim();
}

/**
 * Build the hero image section HTML
 */
function buildHeroSection(heroImageUrl: string, altText: string): string {
  return `  <!-- Hero Section -->
  <div class="offer-hero">
    <img src="${escapeHtml(heroImageUrl)}" alt="${escapeHtml(altText)}" class="offer-hero-image" loading="eager" />
  </div>`;
}

/**
 * Build the main content section HTML
 */
function buildContentSection(title: string, bodyHtml: string): string {
  return `  <!-- Content Section -->
  <div class="offer-content">
    <h1 class="offer-title">${escapeHtml(title)}</h1>
    <div class="offer-body">
      ${bodyHtml}
    </div>
  </div>`;
}

/**
 * Build the products section HTML with Shopify product images
 */
function buildProductsSection(products: ProductWithImage[]): string {
  const productCards = products.map(product => {
    const imageHtml = product.imageUrl
      ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" class="product-card-image" loading="lazy" />`
      : `<div class="product-card-placeholder">No Image</div>`;

    const priceHtml = product.price
      ? `<span class="product-card-price">$${product.price.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span>`
      : '';

    // Link to Shopify product if we have a handle
    const linkOpen = product.productHandle
      ? `<a href="/products/${product.productHandle}" class="product-card-link">`
      : '';
    const linkClose = product.productHandle ? '</a>' : '';

    return `      <div class="product-card">
        ${linkOpen}
        ${imageHtml}
        <div class="product-card-content">
          <h3 class="product-card-title">${escapeHtml(product.title)}</h3>
          ${priceHtml}
        </div>
        ${linkClose}
      </div>`;
  }).join('\n');

  return `  <!-- Products on Deal Section -->
  <div class="offer-products">
    <h2 class="offer-products-heading">Products Included in This Offer</h2>
    <div class="product-grid">
${productCards}
    </div>
  </div>`;
}

/**
 * Build the terms and conditions section HTML
 */
function buildTermsSection(termsText: string | null, endDate: Date | null): string {
  const parts: string[] = [];

  if (termsText) {
    parts.push(`    <p class="offer-terms-text">${escapeHtml(termsText)}</p>`);
  }

  if (endDate) {
    const formattedDate = endDate.toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    parts.push(`    <p class="offer-end-date"><strong>Offer ends:</strong> ${formattedDate}</p>`);
  }

  // Add standard disclaimer if no terms provided
  if (!termsText) {
    parts.push(`    <p class="offer-disclaimer">Terms and conditions apply. While stocks last. See dealer for details.</p>`);
  }

  return `  <!-- Terms Section -->
  <div class="offer-terms">
${parts.join('\n')}
  </div>`;
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
