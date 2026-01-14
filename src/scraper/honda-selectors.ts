/**
 * Honda-specific CSS selectors for the 3 known domains
 * These selectors target price, SKU, and product name elements
 */

import { extractDomain } from '../utils/canonicalize.js';
import * as cheerio from 'cheerio';

export interface DomainSelectors {
  price: string;
  salePrice: string;
  originalPrice: string;
  sku: string;
  name: string;
  availability?: string;
}

/**
 * Selectors for each Honda domain
 * Updated based on actual HTML inspection from each domain
 */
export const hondaSelectors: Record<string, DomainSelectors> = {
  'hondaoutdoors.co.nz': {
    // Magento 2 specific selectors - updated based on actual HTML structure
    // .price-str contains the displayed price (e.g., "$699")
    // [data-price] attribute on hidden inputs contains numeric price
    // For grouped products, the first .price-str is typically the main product
    price: '#total-price, .product-info-price .price-str, .product-info-price .price-final_price .price, .product-info-main .price-box .price, [data-price]',
    salePrice: '.product-info-price .special-price .price, .product-info-main .special-price .price',
    originalPrice: '.product-info-price .old-price .price, .product-info-main .old-price .price',
    sku: '.product.attribute.sku .value, [itemprop="sku"]',
    name: '.page-title .base, h1.page-title, [itemprop="name"]',
    availability: '.stock.available, .stock span, [itemprop="availability"]',
  },
  'hondamarine.co.nz': {
    // Use .price-box to avoid matching related products
    // The 5th and 6th .price elements contain the correct prices
    price: '.price-box .price:nth-of-type(1), .product-info-main .price-box .price',
    salePrice: '.price-box .price:nth-of-type(2), .special-price .price',
    originalPrice: '.price-box .price:nth-of-type(1), .old-price .price',
    sku: '.product-sku, [data-sku], [itemprop="sku"]',
    name: '.product-name, h1.product-title, .page-title .base, [itemprop="name"]',
    availability: '.product-availability, [itemprop="availability"]',
  },
  'hondamotorbikes.co.nz': {
    price: '.bike-price-main, .price, [itemprop="price"]',
    salePrice: '.special-price, .sale-price',
    originalPrice: '.regular-price, .was-price',
    sku: '[data-sku], .bike-sku, [itemprop="sku"]',
    name: '.bike-title, h1.product-name, [itemprop="name"]',
    availability: '.bike-availability, [itemprop="availability"]',
  },
};

/**
 * Get selectors for a specific domain
 */
export function getSelectorsForDomain(url: string): DomainSelectors | null {
  const domain = extractDomain(url);
  return hondaSelectors[domain] || null;
}

/**
 * Extract price using Honda-specific selectors from HTML string
 * Uses cheerio for lightweight HTML parsing
 */
export function extractPriceWithSelectors(
  html: string,
  selectors: DomainSelectors
): {
  salePrice: number | null;
  originalPrice: number | null;
  sku: string | null;
  name: string | null;
  confidence: number;
} {
  const $ = cheerio.load(html);

  // Helper to extract text from selector
  const getText = (selector: string): string | null => {
    const element = $(selector).first();
    const text = element.text().trim();
    return text.length > 0 ? text : null;
  };

  // Helper to parse price from text
  const parsePrice = (text: string | null): number | null => {
    if (!text) return null;

    // Remove currency symbols, commas, and extract number
    const match = text.replace(/[^0-9.]/g, '').match(/\d+\.?\d*/);
    return match ? parseFloat(match[0]) : null;
  };

  // Helper to extract price from data-price attribute
  // For grouped products, the first data-price is typically the main product
  const extractDataPrice = (): number | null => {
    const dataPriceElements = $('[data-price]');
    if (dataPriceElements.length === 0) return null;

    // Get the first data-price (main product in grouped products)
    const firstElement = dataPriceElements.first();
    const priceStr = firstElement.attr('data-price');
    if (priceStr) {
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0) {
        return price;
      }
    }

    return null;
  };

  // Try multiple extraction strategies in order of preference
  let salePrice: number | null = null;
  let confidence = 0;

  // Strategy 1: Try text-based selectors (excluding [data-price] which needs special handling)
  const textSelectors = selectors.price.split(',')
    .map(s => s.trim())
    .filter(s => !s.includes('data-price'));

  for (const selector of textSelectors) {
    const text = getText(selector);
    const price = parsePrice(text);
    if (price !== null && price > 0) {
      salePrice = price;
      confidence = 0.8; // High confidence from text selector
      break;
    }
  }

  // Strategy 2: Fall back to data-price attribute (for grouped products)
  if (salePrice === null) {
    const dataPrice = extractDataPrice();
    if (dataPrice !== null) {
      salePrice = dataPrice;
      confidence = 0.7; // Slightly lower confidence from data attribute
    }
  }

  // Strategy 3: Try sale price selectors
  if (salePrice === null) {
    const salePriceText = getText(selectors.salePrice);
    salePrice = parsePrice(salePriceText);
    if (salePrice !== null) {
      confidence = 0.6;
    }
  }

  const originalPriceText = getText(selectors.originalPrice);

  // Extract SKU and name
  const sku = getText(selectors.sku);
  const name = getText(selectors.name);

  // Adjust confidence based on what we found
  if (salePrice !== null) {
    if (name) confidence += 0.1;
    if (sku) confidence += 0.1;
  }

  return {
    salePrice,
    originalPrice: parsePrice(originalPriceText),
    sku,
    name,
    confidence: Math.min(confidence, 1.0),
  };
}

/**
 * Extract price from HTML using domain-specific selectors
 */
export function extractPriceFromHtml(
  html: string,
  url: string
): {
  salePrice: number | null;
  originalPrice: number | null;
  sku: string | null;
  name: string | null;
  confidence: number;
} {
  const selectors = getSelectorsForDomain(url);

  if (!selectors) {
    return {
      salePrice: null,
      originalPrice: null,
      sku: null,
      name: null,
      confidence: 0,
    };
  }

  return extractPriceWithSelectors(html, selectors);
}
