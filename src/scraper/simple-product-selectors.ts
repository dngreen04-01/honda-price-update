/**
 * CSS selectors for extracting simple product assets from Honda NZ sites
 * These selectors target the standard Magento product page layout used for
 * accessories, parts, and other non-bike products.
 */

export interface SimpleProductSelectors {
  title: string;
  description: string;
  image: {
    // Primary: Fotorama gallery full-size image
    fotoramaImg: string;
    // Fallback: Fotorama stage frame (has data attributes)
    fotoramaFrame: string;
    // Secondary fallback: standard product image placeholder
    productImage: string;
  };
}

/**
 * Selectors for simple product pages (accessories, parts, etc.)
 * Uses stable class names from the Magento/Fotorama structure
 */
export const simpleProductSelectors: SimpleProductSelectors = {
  // Product title (h1)
  title: '#maincontent .product-info-main .page-title-wrapper.product h1',

  // Product description/overview
  description: '#maincontent .product-info-main .product.attribute.overview',

  // Image selectors with fallbacks
  image: {
    // Primary: The actual img element in the Fotorama stage
    fotoramaImg: '.fotorama__stage__shaft .fotorama__img',
    // Fallback: The frame element which may have data-full or data-img attributes
    fotoramaFrame: '.fotorama__stage__frame',
    // Secondary fallback: Standard gallery placeholder image
    productImage: '.product.media .gallery-placeholder__image',
  },
};

/**
 * Parse srcset attribute to get the highest resolution image URL
 * srcset format: "url1 1x, url2 2x" or "url1 480w, url2 800w"
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
