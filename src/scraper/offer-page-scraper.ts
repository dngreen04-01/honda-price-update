/**
 * Offer Page Scraper
 * Extracts detailed content from supplier offer pages including:
 * - Hero images
 * - Promotional body content
 * - Terms and conditions
 * - End dates
 * - Linked product URLs
 */

import * as cheerio from 'cheerio';
import { scraplingClient } from './scrapling-client.js';
import {
  getSelectorsForDomain,
  parseHighestResSrcset,
  isProductUrl,
  datePatterns,
  type OfferPageSelectors,
} from './offer-page-selectors.js';
import { extractOfferDates } from '../crawler/link-extractor.js';
import { logger } from '../utils/logger.js';
import type { ScrapedOfferContent } from '../types/index.js';

export class OfferPageScraper {
  /**
   * Scrape an offer page and extract all relevant content
   */
  async scrapeOfferPage(url: string): Promise<ScrapedOfferContent> {
    logger.info('Starting offer page scrape', { url });

    // Fetch HTML using Scrapling
    const result = await scraplingClient.scrape(url);

    if (!result.success) {
      logger.error('Failed to fetch offer page', { url, error: result.error });
      throw new Error(`Failed to fetch page: ${result.error}`);
    }

    // Parse HTML with cheerio
    const $ = cheerio.load(result.html);

    // Determine domain for selector selection
    const domain = this.extractDomain(url);
    const selectors = getSelectorsForDomain(domain);

    // Extract all content
    const content: ScrapedOfferContent = {
      sourceUrl: url,
      heroImageUrl: this.extractHeroImage($, selectors),
      title: this.extractTitle($, selectors),
      bodyHtml: this.extractBodyHtml($, selectors),
      termsText: this.extractTerms($, selectors),
      endDate: null,
      startDate: null,
      productUrls: this.extractProductUrls($, selectors, url),
    };

    // Extract dates from the HTML content
    const dates = this.extractDates(result.html);
    content.startDate = dates.startDate || null;
    content.endDate = dates.endDate || null;

    logger.info('Offer page scrape completed', {
      url,
      hasHeroImage: !!content.heroImageUrl,
      hasTitle: !!content.title,
      bodyLength: content.bodyHtml.length,
      hasTerms: !!content.termsText,
      hasEndDate: !!content.endDate,
      productUrlsFound: content.productUrls.length,
    });

    return content;
  }

  /**
   * Extract domain from URL for selector selection
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  /**
   * Extract hero image URL using multiple strategies
   */
  private extractHeroImage($: cheerio.CheerioAPI, selectors: OfferPageSelectors): string | null {
    // Strategy 1: Primary hero selector with srcset
    const primarySources = $(selectors.hero.primary);
    for (let i = 0; i < primarySources.length; i++) {
      const srcset = $(primarySources[i]).attr('srcset');
      const url = parseHighestResSrcset(srcset);
      if (url) {
        logger.debug('Found hero image via primary selector srcset', { url });
        return this.resolveImageUrl(url);
      }
    }

    // Strategy 2: Picture source elements
    const pictureSources = $(selectors.hero.pictureSource);
    for (let i = 0; i < pictureSources.length; i++) {
      const srcset = $(pictureSources[i]).attr('srcset');
      const url = parseHighestResSrcset(srcset);
      if (url) {
        logger.debug('Found hero image via picture source', { url });
        return this.resolveImageUrl(url);
      }
    }

    // Strategy 3: Banner image direct src
    const bannerImg = $(selectors.hero.bannerImg).first();
    if (bannerImg.length) {
      const url = bannerImg.attr('data-full') ||
                  bannerImg.attr('data-src') ||
                  bannerImg.attr('src');
      if (url) {
        logger.debug('Found hero image via banner img', { url });
        return this.resolveImageUrl(url);
      }
    }

    // Strategy 4: Fallback to any large image
    const fallbackImg = $(selectors.hero.fallbackImg).first();
    if (fallbackImg.length) {
      const width = parseInt(fallbackImg.attr('width') || '0', 10);
      // Only use if it's a reasonably large image (likely hero)
      if (width >= 600 || !fallbackImg.attr('width')) {
        const url = fallbackImg.attr('data-full') ||
                    fallbackImg.attr('data-src') ||
                    fallbackImg.attr('src');
        if (url) {
          logger.debug('Found hero image via fallback selector', { url });
          return this.resolveImageUrl(url);
        }
      }
    }

    // Strategy 5: Look for og:image meta tag
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      logger.debug('Found hero image via og:image', { url: ogImage });
      return this.resolveImageUrl(ogImage);
    }

    logger.warn('No hero image found for offer page');
    return null;
  }

  /**
   * Resolve relative image URLs to absolute
   */
  private resolveImageUrl(url: string): string {
    // Already absolute
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // Protocol-relative
    if (url.startsWith('//')) {
      return `https:${url}`;
    }
    // Relative URLs would need the base URL, but we'll return as-is
    // since Scrapling should return the final URL context
    return url;
  }

  /**
   * Extract offer title using multiple strategies
   */
  private extractTitle($: cheerio.CheerioAPI, selectors: OfferPageSelectors): string {
    // Strategy 1: Primary h1
    let title = $(selectors.title.h1).first().text().trim();
    if (title && title.length > 0 && title.length < 200) {
      return title;
    }

    // Strategy 2: Offer-specific title
    title = $(selectors.title.offerTitle).first().text().trim();
    if (title && title.length > 0 && title.length < 200) {
      return title;
    }

    // Strategy 3: Promo heading
    title = $(selectors.title.promoHeading).first().text().trim();
    if (title && title.length > 0 && title.length < 200) {
      return title;
    }

    // Strategy 4: Page title
    title = $(selectors.title.pageTitle).first().text().trim();
    if (title && title.length > 0 && title.length < 200) {
      return title;
    }

    // Strategy 5: Meta og:title
    title = $('meta[property="og:title"]').attr('content')?.trim() || '';
    if (title && title.length > 0 && title.length < 200) {
      return title;
    }

    // Strategy 6: HTML title tag
    title = $('title').text().trim();
    if (title) {
      // Clean up common suffixes like " | Honda NZ"
      title = title.replace(/\s*\|.*$/, '').replace(/\s*-\s*Honda.*$/i, '').trim();
      if (title.length > 0) {
        return title;
      }
    }

    // Fallback
    return 'Untitled Offer';
  }

  /**
   * Extract body HTML content, preserving structure
   */
  private extractBodyHtml($: cheerio.CheerioAPI, selectors: OfferPageSelectors): string {
    // Try specific offer content first
    let content = $(selectors.body.offerContent).first();
    if (content.length && this.hasSubstantialContent(content, $)) {
      return this.cleanHtml(content.html() || '');
    }

    // Try promo body
    content = $(selectors.body.promoBody).first();
    if (content.length && this.hasSubstantialContent(content, $)) {
      return this.cleanHtml(content.html() || '');
    }

    // Try main CMS content
    content = $(selectors.body.mainContent).first();
    if (content.length) {
      // For main content, we need to be more selective
      // Extract paragraphs and relevant blocks, excluding navigation/footer
      const extracted = this.extractRelevantContent(content, $);
      if (extracted.length > 50) {
        return extracted;
      }
    }

    // Try PageBuilder rows
    const rows = $(selectors.body.pageBuilderRow);
    if (rows.length > 0) {
      const rowsHtml: string[] = [];
      rows.each((_, row) => {
        const rowContent = $(row).html() || '';
        if (rowContent.trim().length > 0) {
          rowsHtml.push(rowContent);
        }
      });
      if (rowsHtml.length > 0) {
        return this.cleanHtml(rowsHtml.join('\n'));
      }
    }

    // Fallback: get all paragraphs from main content
    const paragraphs: string[] = [];
    $('main p, #maincontent p, .cms-content p').each((_, p) => {
      const text = $(p).text().trim();
      if (text.length > 20) {
        paragraphs.push($(p).html() || text);
      }
    });

    if (paragraphs.length > 0) {
      return this.cleanHtml(paragraphs.join('\n'));
    }

    // Last resort: meta description
    const metaDesc = $('meta[name="description"]').attr('content') ||
                     $('meta[property="og:description"]').attr('content') || '';

    return metaDesc ? `<p>${metaDesc}</p>` : '<p>No content available</p>';
  }

  /**
   * Check if an element has substantial text content
   */
  private hasSubstantialContent(el: ReturnType<cheerio.CheerioAPI>, _$: cheerio.CheerioAPI): boolean {
    const text = el.text().trim();
    return text.length > 50;
  }

  /**
   * Extract relevant content from a container, filtering out navigation/footer
   */
  private extractRelevantContent(container: ReturnType<cheerio.CheerioAPI>, $: cheerio.CheerioAPI): string {
    const parts: string[] = [];

    // Get paragraphs, headings, and lists
    container.find('p, h2, h3, h4, ul, ol').each((_, el) => {
      const $el = $(el);
      // Skip if inside navigation or footer
      if ($el.closest('nav, footer, .navigation, .footer').length > 0) {
        return;
      }

      const html = $el.html() || '';
      if (html.trim().length > 10) {
        const tagName = el.tagName.toLowerCase();
        parts.push(`<${tagName}>${html}</${tagName}>`);
      }
    });

    return this.cleanHtml(parts.join('\n'));
  }

  /**
   * Clean up HTML content
   */
  private cleanHtml(html: string): string {
    return html
      // Remove script and style tags
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      // Remove inline event handlers
      .replace(/\s+on\w+="[^"]*"/gi, '')
      // Remove data attributes (except data-src which might be useful)
      .replace(/\s+data-(?!src)[a-z-]+="[^"]*"/gi, '')
      // Clean up excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove empty tags
      .replace(/<(\w+)[^>]*>\s*<\/\1>/gi, '')
      .trim();
  }

  /**
   * Extract terms and conditions text
   */
  private extractTerms($: cheerio.CheerioAPI, selectors: OfferPageSelectors): string | null {
    // Strategy 1: Dedicated terms section
    let terms = $(selectors.terms.termsSection).first().text().trim();
    if (terms && terms.length > 10) {
      return terms;
    }

    // Strategy 2: Disclaimer
    terms = $(selectors.terms.disclaimer).first().text().trim();
    if (terms && terms.length > 10) {
      return terms;
    }

    // Strategy 3: Fine print
    terms = $(selectors.terms.finePrint).first().text().trim();
    if (terms && terms.length > 10) {
      return terms;
    }

    // Strategy 4: Look for paragraphs containing terms-related keywords
    const termsPatterns = [
      'terms and conditions',
      'terms & conditions',
      'conditions apply',
      'offer valid',
      'while stocks last',
      'subject to',
      'excludes',
      'not valid',
    ];

    let foundTerms: string | null = null;
    $('p, .disclaimer, .fine-print, small').each((_, el) => {
      if (foundTerms) return;
      const text = $(el).text().trim().toLowerCase();
      if (termsPatterns.some(pattern => text.includes(pattern))) {
        foundTerms = $(el).text().trim();
      }
    });

    return foundTerms;
  }

  /**
   * Extract dates from HTML content
   */
  private extractDates(html: string): { startDate?: Date; endDate?: Date } {
    // Use the existing extractOfferDates function from link-extractor
    const dates = extractOfferDates(html);

    // Also try our additional patterns if no dates found
    if (!dates.endDate) {
      // Try natural date format
      const naturalMatch = html.match(datePatterns.endDateNatural);
      if (naturalMatch && naturalMatch[1]) {
        const parsed = new Date(naturalMatch[1]);
        if (!isNaN(parsed.getTime())) {
          dates.endDate = parsed;
        }
      }
    }

    return dates;
  }

  /**
   * Extract product URLs from the page
   */
  private extractProductUrls(
    $: cheerio.CheerioAPI,
    selectors: OfferPageSelectors,
    baseUrl: string
  ): string[] {
    const productUrls = new Set<string>();
    const baseUrlObj = new URL(baseUrl);

    // Strategy 1: Direct product links
    $(selectors.productLinks.productAnchors).each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, baseUrl);
          // Only include same-domain links that look like products
          if (absoluteUrl.hostname === baseUrlObj.hostname && isProductUrl(absoluteUrl.href)) {
            productUrls.add(absoluteUrl.href);
          }
        } catch {
          // Invalid URL, skip
        }
      }
    });

    // Strategy 2: CTA buttons
    $(selectors.productLinks.ctaButtons).each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, baseUrl);
          if (absoluteUrl.hostname === baseUrlObj.hostname && isProductUrl(absoluteUrl.href)) {
            productUrls.add(absoluteUrl.href);
          }
        } catch {
          // Invalid URL, skip
        }
      }
    });

    // Strategy 3: Look for any links containing product-like patterns
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && isProductUrl(href)) {
        try {
          const absoluteUrl = new URL(href, baseUrl);
          if (absoluteUrl.hostname === baseUrlObj.hostname) {
            productUrls.add(absoluteUrl.href);
          }
        } catch {
          // Invalid URL, skip
        }
      }
    });

    return Array.from(productUrls);
  }
}

// Export singleton instance
export const offerPageScraper = new OfferPageScraper();
