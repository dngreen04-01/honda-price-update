/**
 * Link Extractor
 * Extracts and normalizes links from HTML content for crawling
 */

/**
 * Extracts all same-domain links from HTML content
 * @param html - Raw HTML content
 * @param baseUrl - Base URL for resolving relative links
 * @returns Array of unique absolute URLs from the same domain
 */
export function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const baseUrlObj = new URL(baseUrl);

  // Match href attributes - handles both single and double quotes
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const href = match[1];

      // Skip anchors, javascript, mailto, tel links
      if (
        href.startsWith('#') ||
        href.startsWith('javascript:') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('data:')
      ) {
        continue;
      }

      // Resolve relative URLs to absolute
      const absoluteUrl = new URL(href, baseUrl);

      // Only include same-domain links (HTTP/HTTPS)
      if (
        absoluteUrl.hostname === baseUrlObj.hostname &&
        (absoluteUrl.protocol === 'http:' || absoluteUrl.protocol === 'https:')
      ) {
        // Clean up the URL - remove hash fragments for crawling purposes
        absoluteUrl.hash = '';
        links.push(absoluteUrl.href);
      }
    } catch {
      // Invalid URL, skip silently
    }
  }

  // Deduplicate and return
  return [...new Set(links)];
}

/**
 * Extracts the page title from HTML content
 * @param html - Raw HTML content
 * @returns Page title or undefined if not found
 */
export function extractPageTitle(html: string): string | undefined {
  // Match <title> tag content
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    // Clean up whitespace and decode basic HTML entities
    return titleMatch[1]
      .trim()
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  return undefined;
}

/**
 * Extracts a price from HTML content (basic extraction)
 * @param html - Raw HTML content
 * @returns Detected price or undefined
 */
export function extractPrice(html: string): number | undefined {
  // Look for common price patterns in NZ format
  // Matches: $1,234.56 or $1234 or $1,234
  const pricePatterns = [
    // Price with class attribute nearby
    /class="[^"]*price[^"]*"[^>]*>\s*\$?([\d,]+(?:\.\d{2})?)/i,
    // JSON-LD price
    /"price":\s*"?([\d,]+(?:\.\d{2})?)"/i,
    // RRP or price label
    /(?:RRP|Price|From)\s*:?\s*\$?([\d,]+(?:\.\d{2})?)/i,
  ];

  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const priceStr = match[1].replace(/,/g, '');
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0 && price < 1000000) {
        return price;
      }
    }
  }

  return undefined;
}

/**
 * Extracts an offer title from HTML content
 * @param html - Raw HTML content
 * @returns Offer title or undefined if not found
 */
export function extractOfferTitle(html: string): string | undefined {
  // Try to get title from various sources in order of preference

  // 1. Check for offer-specific heading patterns
  const offerHeadingPatterns = [
    // h1 with offer/promo/special in class
    /<h1[^>]*class="[^"]*(?:offer|promo|special|deal)[^"]*"[^>]*>([^<]+)<\/h1>/i,
    // h1 inside an offer container
    /<(?:div|section)[^>]*class="[^"]*(?:offer|promo|special)[^"]*"[^>]*>[\s\S]*?<h1[^>]*>([^<]+)<\/h1>/i,
    // Standard h1 tag
    /<h1[^>]*>([^<]+)<\/h1>/i,
  ];

  for (const pattern of offerHeadingPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const title = match[1].trim();
      if (title.length > 0 && title.length < 200) {
        return decodeHtmlEntities(title);
      }
    }
  }

  // 2. Fallback to page title
  return extractPageTitle(html);
}

/**
 * Extracts an offer summary/description from HTML content
 * @param html - Raw HTML content
 * @returns Offer summary or undefined if not found
 */
export function extractOfferSummary(html: string): string | undefined {
  const summaryPatterns = [
    // Meta description
    /<meta[^>]*name="description"[^>]*content="([^"]+)"/i,
    /<meta[^>]*content="([^"]+)"[^>]*name="description"/i,
    // Offer description in a class
    /<(?:div|p)[^>]*class="[^"]*(?:offer|promo|special|deal)[^"]*(?:description|summary|details|content)[^"]*"[^>]*>([^<]+)/i,
    // Paragraph following an offer heading
    /<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>\s*<p[^>]*>([^<]+)<\/p>/i,
    // og:description
    /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i,
  ];

  for (const pattern of summaryPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const summary = match[1].trim();
      // Ensure it's a reasonable length for a summary
      if (summary.length > 20 && summary.length < 500) {
        return decodeHtmlEntities(summary);
      }
    }
  }

  return undefined;
}

/**
 * Extracts offer dates from HTML content
 * @param html - Raw HTML content
 * @returns Object with start and end dates, or undefined values
 */
export function extractOfferDates(html: string): {
  startDate?: Date;
  endDate?: Date;
} {
  const result: { startDate?: Date; endDate?: Date } = {};

  // Common date patterns in offers
  const datePatterns = [
    // "Valid until DD/MM/YYYY" or "Ends DD/MM/YYYY"
    /(?:valid until|ends?|expires?|offer ends)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    // "From DD/MM/YYYY to DD/MM/YYYY"
    /(?:from|starts?)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*(?:to|-|until)\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    // "DD Month YYYY"
    /(?:valid until|ends?|expires?)\s*:?\s*(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = html.match(pattern);
    if (match) {
      // Try to parse the end date (most common)
      if (match[2]) {
        // Has both start and end date
        result.startDate = parseFlexibleDate(match[1]);
        result.endDate = parseFlexibleDate(match[2]);
      } else if (match[1]) {
        // Only end date found
        result.endDate = parseFlexibleDate(match[1]);
      }

      if (result.endDate) {
        break;
      }
    }
  }

  return result;
}

/**
 * Parse a date string in various formats
 */
function parseFlexibleDate(dateStr: string): Date | undefined {
  try {
    // Try DD/MM/YYYY format (NZ standard)
    const ddmmyyyy = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (ddmmyyyy) {
      const day = parseInt(ddmmyyyy[1], 10);
      const month = parseInt(ddmmyyyy[2], 10) - 1; // 0-indexed
      let year = parseInt(ddmmyyyy[3], 10);
      if (year < 100) {
        year += 2000;
      }
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Try natural language date "DD Month YYYY"
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch {
    // Ignore parsing errors
  }
  return undefined;
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}
