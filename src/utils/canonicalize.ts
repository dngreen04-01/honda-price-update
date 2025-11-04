/**
 * URL Canonicalization Utility
 * Normalizes URLs for consistent comparison and deduplication
 */

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  '_ga',
  'mc_cid',
  'mc_eid',
];

/**
 * Canonicalizes a URL by:
 * 1. Converting to lowercase host
 * 2. Removing 'www.' prefix
 * 3. Normalizing trailing slashes
 * 4. Removing tracking parameters
 * 5. Sorting remaining query parameters
 */
export function canonicalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // Lowercase and remove www
    let host = urlObj.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.substring(4);
    }

    // Remove trailing slash from pathname (unless it's just '/')
    let pathname = urlObj.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    // Filter out tracking parameters
    const searchParams = new URLSearchParams(urlObj.search);
    const filteredParams = new URLSearchParams();

    for (const [key, value] of searchParams.entries()) {
      if (!TRACKING_PARAMS.includes(key.toLowerCase())) {
        filteredParams.append(key, value);
      }
    }

    // Sort parameters for consistency
    filteredParams.sort();

    // Reconstruct URL
    const canonicalUrl = new URL(pathname, `${urlObj.protocol}//${host}`);
    canonicalUrl.search = filteredParams.toString();

    // Add hash if present
    if (urlObj.hash) {
      canonicalUrl.hash = urlObj.hash;
    }

    return canonicalUrl.toString();
  } catch (error) {
    // If URL parsing fails, return original
    console.warn(`Failed to canonicalize URL: ${url}`, error);
    return url;
  }
}

/**
 * Extracts domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    let host = urlObj.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.substring(4);
    }
    return host;
  } catch (error) {
    console.warn(`Failed to extract domain from URL: ${url}`, error);
    return '';
  }
}

/**
 * Checks if URL belongs to a specific domain
 * @param url - URL to check
 * @param domain - Domain to match against (can be URL or domain name)
 */
export function isDomainMatch(url: string, domain: string): boolean {
  const urlDomain = extractDomain(url);
  const targetDomain = extractDomain(domain);
  return urlDomain === targetDomain;
}
