import { JSDOM } from 'jsdom';
import { ExtractedPrice } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { firecrawlClient } from './firecrawl-client.js';
import { extractPriceFromHtml } from './honda-selectors.js';

/**
 * Price extraction from HTML using multiple strategies
 */
export class PriceExtractor {
  /**
   * Main extraction method - tries deterministic first, falls back to LLM
   */
  async extract(url: string, html: string): Promise<ExtractedPrice> {
    // Try deterministic extraction first (now with URL for Honda-specific selectors)
    const deterministicResult = this.extractDeterministic(html, url);

    if (deterministicResult.salePrice !== null && deterministicResult.confidence === 'high') {
      logger.debug('Deterministic extraction successful', { url });
      return {
        ...deterministicResult,
        source: 'deterministic',
      };
    }

    // Fall back to LLM extraction
    logger.info('Falling back to LLM extraction', { url });
    try {
      const llmResult = await this.extractWithLLM(url);

      // Validate LLM result for anomalies
      const validated = this.validatePrice(llmResult.salePrice, url);
      if (!validated.isValid) {
        logger.warn('LLM price appears anomalous, using deterministic result', {
          url,
          llmPrice: llmResult.salePrice,
          reason: validated.reason,
        });
        return {
          ...deterministicResult,
          source: 'deterministic',
        };
      }

      return {
        ...llmResult,
        source: 'llm',
      };
    } catch (error) {
      logger.warn('LLM extraction failed, using deterministic result', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        ...deterministicResult,
        source: 'deterministic',
      };
    }
  }

  /**
   * Deterministic extraction using structured data and DOM parsing
   */
  private extractDeterministic(html: string, url?: string): Omit<ExtractedPrice, 'source'> {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Strategy 1: Honda-specific selectors (highest priority for Honda domains)
    if (url) {
      const hondaResult = this.extractFromHondaSelectors(html, url);
      if (hondaResult.salePrice !== null && hondaResult.confidence === 'high') {
        return hondaResult;
      }
    }

    // Strategy 2: JSON-LD structured data
    const jsonLdResult = this.extractFromJsonLd(document);
    if (jsonLdResult.salePrice !== null) {
      return jsonLdResult;
    }

    // Strategy 3: Microdata and meta tags
    const microdataResult = this.extractFromMicrodata(document);
    if (microdataResult.salePrice !== null) {
      return microdataResult;
    }

    // Strategy 4: Common CSS selectors
    const domResult = this.extractFromDOM(document);
    return domResult;
  }

  /**
   * Extract from JSON-LD structured data
   */
  private extractFromJsonLd(document: Document): Omit<ExtractedPrice, 'source'> {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    for (const script of Array.from(scripts)) {
      try {
        const data = JSON.parse(script.textContent || '');
        const product = this.findProductInJsonLd(data);

        if (product?.offers) {
          const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;

          const price = parseFloat(offer.price || offer.lowPrice);
          const currency = offer.priceCurrency || 'NZD';

          if (!isNaN(price)) {
            return {
              salePrice: price,
              originalPrice: null,
              currency,
              confidence: 'high',
              htmlSnippet: script.textContent?.substring(0, 500),
            };
          }
        }
      } catch (error) {
        // Continue to next script
      }
    }

    return this.emptyResult();
  }

  /**
   * Recursively find Product schema in JSON-LD
   */
  private findProductInJsonLd(data: unknown): Record<string, unknown> | null {
    if (!data || typeof data !== 'object') return null;

    const obj = data as Record<string, unknown>;

    if (obj['@type'] === 'Product' || obj['@type'] === 'ProductModel') {
      return obj;
    }

    if (Array.isArray(data)) {
      for (const item of data) {
        const result = this.findProductInJsonLd(item);
        if (result) return result;
      }
    }

    for (const value of Object.values(obj)) {
      const result = this.findProductInJsonLd(value);
      if (result) return result;
    }

    return null;
  }

  /**
   * Extract from Microdata and meta tags
   */
  private extractFromMicrodata(document: Document): Omit<ExtractedPrice, 'source'> {
    // Check itemprop="price"
    const priceElement = document.querySelector('[itemprop="price"]');
    if (priceElement) {
      const priceContent = priceElement.getAttribute('content') || priceElement.textContent;
      const price = this.parsePrice(priceContent);

      if (price !== null) {
        const currencyElement = document.querySelector('[itemprop="priceCurrency"]');
        const currency = currencyElement?.getAttribute('content') || 'NZD';

        return {
          salePrice: price,
          originalPrice: null,
          currency,
          confidence: 'high',
          htmlSnippet: priceElement.outerHTML.substring(0, 500),
        };
      }
    }

    // Check meta tags
    const ogPrice = document.querySelector('meta[property="product:price:amount"]');
    if (ogPrice) {
      const price = this.parsePrice(ogPrice.getAttribute('content'));
      if (price !== null) {
        const ogCurrency = document.querySelector('meta[property="product:price:currency"]');
        return {
          salePrice: price,
          originalPrice: null,
          currency: ogCurrency?.getAttribute('content') || 'NZD',
          confidence: 'high',
          htmlSnippet: ogPrice.outerHTML,
        };
      }
    }

    return this.emptyResult();
  }

  /**
   * Extract from common DOM selectors
   */
  private extractFromDOM(document: Document): Omit<ExtractedPrice, 'source'> {
    const selectors = [
      '.price',
      '.product-price',
      '.sale-price',
      '[data-price]',
      '.price-current',
      '.price-now',
      '.selling-price',
      '.final-price',
      '.special-price',
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);

      for (const element of Array.from(elements)) {
        const priceText = element.getAttribute('data-price') || element.textContent;
        const price = this.parsePrice(priceText);

        if (price !== null) {
          // Look for compare-at/original price
          const compareSelectors = [
            '.compare-at-price',
            '.was-price',
            '.original-price',
            '.rrp',
            '.regular-price',
          ];

          let originalPrice: number | null = null;
          for (const compareSelector of compareSelectors) {
            const compareElement = element.parentElement?.querySelector(compareSelector);
            if (compareElement) {
              originalPrice = this.parsePrice(compareElement.textContent);
              break;
            }
          }

          return {
            salePrice: price,
            originalPrice,
            currency: 'NZD',
            confidence: 'low',
            htmlSnippet: element.outerHTML.substring(0, 500),
          };
        }
      }
    }

    return this.emptyResult();
  }

  /**
   * Extract using LLM via Firecrawl
   */
  private async extractWithLLM(url: string): Promise<Omit<ExtractedPrice, 'source'>> {
    const schema = {
      type: 'object',
      properties: {
        salePrice: {
          type: 'number',
          description: 'Current sale price or regular price if no sale',
        },
        originalPrice: {
          type: 'number',
          description: 'Original price before discount (if on sale)',
          nullable: true,
        },
        currency: {
          type: 'string',
          description: 'Currency code (e.g., NZD, USD)',
          default: 'NZD',
        },
      },
      required: ['salePrice'],
    };

    const result = await firecrawlClient.extract<{
      salePrice: number;
      originalPrice?: number | null;
      currency?: string;
    }>(url, schema, {
      prompt: 'Extract product pricing information from this page.',
    });

    if (!result.success || !result.data.salePrice) {
      throw new Error('LLM extraction returned no price');
    }

    return {
      salePrice: result.data.salePrice,
      originalPrice: result.data.originalPrice || null,
      currency: result.data.currency || 'NZD',
      confidence: 'low',
      htmlSnippet: undefined,
    };
  }

  /**
   * Parse price from text
   */
  private parsePrice(text: string | null | undefined): number | null {
    if (!text) return null;

    // Remove currency symbols and whitespace
    const cleaned = text
      .replace(/[^\d.,\s]/g, '')
      .trim()
      .replace(/\s+/g, '');

    if (!cleaned) return null;

    // Determine format based on comma/period positions
    let normalized: string;

    if (cleaned.includes(',') && cleaned.includes('.')) {
      // Both comma and period present
      const commaIndex = cleaned.indexOf(',');
      const periodIndex = cleaned.indexOf('.');

      if (commaIndex < periodIndex) {
        // Format: 1,234.56 (US format - comma as thousands separator)
        normalized = cleaned.replace(/,/g, '');
      } else {
        // Format: 1.234,56 (European format - period as thousands separator)
        normalized = cleaned.replace(/\./g, '').replace(',', '.');
      }
    } else if (cleaned.includes(',')) {
      // Only comma present
      const parts = cleaned.split(',');

      if (parts.length === 2 && parts[1].length === 2) {
        // Format: 2,99 or 1234,56 (European decimal format)
        normalized = cleaned.replace(',', '.');
      } else if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
        // Format: 2,399 (likely thousands separator but ambiguous)
        // For NZ context, assume thousands separator
        normalized = cleaned.replace(/,/g, '');
      } else {
        // Format: 1,234,567 (US thousands separator)
        normalized = cleaned.replace(/,/g, '');
      }
    } else {
      // Only period or no separators
      normalized = cleaned;
    }

    const price = parseFloat(normalized);
    return isNaN(price) ? null : price;
  }

  /**
   * Extract using Honda-specific selectors
   */
  private extractFromHondaSelectors(html: string, url: string): Omit<ExtractedPrice, 'source'> {
    try {
      const result = extractPriceFromHtml(html, url);

      if (result.salePrice !== null) {
        // Get HTML snippet for debugging
        const dom = new JSDOM(html);
        const document = dom.window.document;
        const priceElements = document.querySelectorAll('.price, .product-price, [itemprop="price"]');
        let snippet = '';

        for (const el of Array.from(priceElements)) {
          const text = el.textContent?.trim();
          if (text && text.includes(result.salePrice.toString())) {
            snippet = el.outerHTML.substring(0, 500);
            break;
          }
        }

        return {
          salePrice: result.salePrice,
          originalPrice: result.originalPrice,
          currency: 'NZD',
          confidence: result.confidence >= 0.7 ? 'high' : 'low',
          htmlSnippet: snippet || undefined,
        };
      }
    } catch (error) {
      logger.debug('Honda selector extraction failed', {
        url,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return this.emptyResult();
  }

  /**
   * Validate price for anomalies
   */
  private validatePrice(
    price: number | null,
    url: string
  ): { isValid: boolean; reason?: string } {
    if (price === null) {
      return { isValid: false, reason: 'Price is null' };
    }

    // Check for unrealistic prices
    if (price < 1) {
      return { isValid: false, reason: 'Price too low (< $1)' };
    }

    if (price > 50000) {
      return { isValid: false, reason: 'Price too high (> $50,000)' };
    }

    // Check for suspiciously round numbers that might be meta content
    // e.g., $1000, $1049 when actual price is $44
    const priceStr = price.toString();
    if (price > 100 && priceStr.endsWith('00') && !priceStr.endsWith('.00')) {
      logger.warn('Suspicious round price detected', { url, price });
      // Don't reject, but flag for review
    }

    return { isValid: true };
  }

  /**
   * Empty result helper
   */
  private emptyResult(): Omit<ExtractedPrice, 'source'> {
    return {
      salePrice: null,
      originalPrice: null,
      currency: 'NZD',
      confidence: 'low',
      htmlSnippet: undefined,
    };
  }
}

export const priceExtractor = new PriceExtractor();
