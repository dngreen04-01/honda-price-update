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
 * TODO: Update these selectors by inspecting actual HTML from each domain
 */
export const hondaSelectors: Record<string, DomainSelectors> = {
  'hondaoutdoors.co.nz': {
    // Magento 2 specific selectors - prioritize most specific selectors first
    // Use .product-info-price/.product-info-main to avoid matching related products/upsells
    // #total-price is JavaScript-rendered and contains the final calculated price
    price: '#total-price, .product-info-price .price-final_price .price, .product-info-main .price-box .price',
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

  // Extract prices - prioritize specific price selector over sale price
  // This avoids matching related products' sale prices
  const salePriceText = getText(selectors.price) || getText(selectors.salePrice);
  const originalPriceText = getText(selectors.originalPrice);

  // Extract SKU and name
  const sku = getText(selectors.sku);
  const name = getText(selectors.name);

  // Calculate confidence based on what we found
  let confidence = 0;
  if (salePriceText) confidence += 0.5;
  if (name) confidence += 0.3;
  if (sku) confidence += 0.2;

  return {
    salePrice: parsePrice(salePriceText),
    originalPrice: parsePrice(originalPriceText),
    sku,
    name,
    confidence,
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
