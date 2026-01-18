/**
 * CSS selectors for extracting bike product assets from hondamotorbikes.co.nz
 * These selectors target images, text content, and specifications
 */

export interface BikeProductSelectors {
  images: {
    hero: string;
    feature1: string;
    featureCarousel: string;
    product: string;
  };
  text: {
    title: string;
    description: string;
    feature1Title: string;
    feature1Desc: string;
    carouselTitle: string;
    carouselDesc: string;
  };
  specs: {
    container: string;
    panel: string;
    panelHeader: string;
    panelBody: string;
  };
}

/**
 * Selectors for hondamotorbikes.co.nz bike product pages
 * Uses stable class names, avoiding dynamic hashed classes from Magento PageBuilder
 */
export const bikeProductSelectors: BikeProductSelectors = {
  images: {
    // Main hero image at top of page
    hero: '.product-view-section-top picture source',
    // Feature 1 banner image (full-width section)
    feature1: '.section__full-img-banner picture source',
    // Swiper carousel images (features 2-4)
    featureCarousel: '.swiper-slide .swiper-slide__image',
    // Product image next to specifications
    product: '.section__2columns img',
  },
  text: {
    // Product title (h1)
    title: '.page-title-wrapper.product h1',
    // Product description/overview
    description: '.product.attribute.overview',
    // Feature 1 title (full-width banner section)
    feature1Title: '.section__full-img-banner .image-title',
    // Feature 1 description
    feature1Desc: '.section__full-img-banner .image-description',
    // Swiper carousel titles
    carouselTitle: '.swiper-slide__title',
    // Swiper carousel descriptions
    carouselDesc: '.swiper-slide__text',
  },
  specs: {
    // Accordion container
    container: '.mgz-block-content',
    // Individual accordion panels
    panel: '.mgz-panel',
    // Panel header (category name)
    panelHeader: '.mgz-panel-heading h4',
    // Spec rows within panel body
    panelBody: '.mgz-panel-body table tbody tr',
  },
};

/**
 * Parse srcset attribute to get the highest resolution image URL
 * srcset format: "url1 1x, url2 2x" or "url1 480w, url2 800w"
 */
export function parseHighestResSrcset(srcset: string | undefined): string | null {
  if (!srcset) return null;

  const sources = srcset.split(',').map(s => s.trim());

  // Try to find highest resolution (prefer 2x or largest width)
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
