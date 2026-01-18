/**
 * Bike Product Asset Scraper
 * Extracts images, text content, and specifications from hondamotorbikes.co.nz bike pages
 */

import * as cheerio from 'cheerio';
import { scraplingClient } from './scrapling-client.js';
import { bikeProductSelectors, parseHighestResSrcset } from './bike-product-selectors.js';
import { logger } from '../utils/logger.js';
import type {
  BikeProductAssets,
  BikeFeature,
  BikeSpecificationCategory,
} from '../types/index.js';

export class BikeProductScraper {
  /**
   * Scrape a bike product page and extract all assets
   */
  async scrape(url: string): Promise<BikeProductAssets> {
    logger.info('Starting bike product scrape', { url });

    // Fetch HTML using Scrapling
    const result = await scraplingClient.scrape(url);

    if (!result.success) {
      logger.error('Failed to fetch bike product page', { url, error: result.error });
      throw new Error(`Failed to fetch page: ${result.error}`);
    }

    // Parse HTML with cheerio
    const $ = cheerio.load(result.html);

    // Extract all assets
    const assets: BikeProductAssets = {
      url,
      scrapedAt: new Date().toISOString(),
      images: this.extractImages($),
      content: this.extractContent($),
      specifications: this.extractSpecifications($),
    };

    logger.info('Bike product scrape completed', {
      url,
      imagesFound: {
        hero: !!assets.images.hero,
        product: !!assets.images.product,
        features: assets.images.features.filter(Boolean).length,
      },
      featuresFound: assets.content.features.length,
      specCategoriesFound: assets.specifications.length,
    });

    return assets;
  }

  /**
   * Extract all images from the page
   */
  private extractImages($: cheerio.CheerioAPI): BikeProductAssets['images'] {
    const selectors = bikeProductSelectors.images;

    // Hero image (from picture > source srcset)
    const heroSrcset = $(selectors.hero).first().attr('srcset');
    const hero = parseHighestResSrcset(heroSrcset);

    // Feature 1 image (from full-width banner)
    const feature1Srcset = $(selectors.feature1).first().attr('srcset');
    const feature1Image = parseHighestResSrcset(feature1Srcset);

    // Carousel images (features 2-4)
    const carouselImages: (string | null)[] = [];
    $(selectors.featureCarousel).each((i, el) => {
      if (i < 3) {
        const src = $(el).attr('src') || $(el).attr('data-src');
        carouselImages.push(src || null);
      }
    });

    // Pad carousel images to always have 3 slots
    while (carouselImages.length < 3) {
      carouselImages.push(null);
    }

    // Product image (next to specs)
    const productSrc = $(selectors.product).first().attr('src');
    const product = productSrc || null;

    return {
      hero,
      product,
      features: [feature1Image, ...carouselImages],
    };
  }

  /**
   * Extract text content (title, description, features)
   */
  private extractContent($: cheerio.CheerioAPI): BikeProductAssets['content'] {
    const selectors = bikeProductSelectors.text;

    // Product title
    const title = $(selectors.title).first().text().trim() || null;

    // Product description (preserve HTML for formatting)
    const descriptionEl = $(selectors.description).first();
    const description = descriptionEl.length > 0
      ? descriptionEl.html()?.trim() || null
      : null;

    // Feature 1 (from full-width banner)
    const feature1: BikeFeature = {
      title: $(selectors.feature1Title).first().text().trim() || null,
      description: $(selectors.feature1Desc).first().text().trim() || null,
      image: null, // Image extracted separately
    };

    // Features 2-4 (from swiper carousel)
    const carouselFeatures: BikeFeature[] = [];
    const slides = $('.swiper-slide');

    slides.each((i, slide) => {
      if (i < 3) {
        const $slide = $(slide);
        carouselFeatures.push({
          title: $slide.find(selectors.carouselTitle).text().trim() || null,
          description: $slide.find(selectors.carouselDesc).text().trim() || null,
          image: $slide.find('.swiper-slide__image').attr('src') || null,
        });
      }
    });

    // Combine all features
    const features: BikeFeature[] = [feature1, ...carouselFeatures];

    return {
      title,
      description,
      features,
    };
  }

  /**
   * Extract specifications from accordion panels
   */
  private extractSpecifications($: cheerio.CheerioAPI): BikeSpecificationCategory[] {
    const selectors = bikeProductSelectors.specs;
    const categories: BikeSpecificationCategory[] = [];

    // Find all accordion panels
    $(selectors.panel).each((_, panel) => {
      const $panel = $(panel);

      // Get category name from panel header
      const category = $panel.find(selectors.panelHeader).text().trim();

      if (!category) return;

      // Get all spec rows from the table inside panel body
      const specs: { label: string; value: string }[] = [];

      $panel.find(selectors.panelBody).each((_, row) => {
        const $row = $(row);
        const label = $row.find('td:nth-child(1)').text().trim();
        const value = $row.find('td:nth-child(2)').text().trim();

        if (label && value) {
          specs.push({ label, value });
        }
      });

      if (specs.length > 0) {
        categories.push({ category, specs });
      }
    });

    return categories;
  }
}

// Export singleton instance
export const bikeProductScraper = new BikeProductScraper();
