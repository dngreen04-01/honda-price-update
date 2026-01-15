/**
 * Offer Detector
 * Detects new offers from crawl results by comparing against existing offers in the database
 */

import { getExistingOfferUrls, upsertDiscoveredOffer, DiscoveredOfferInput } from '../database/queries.js';
import { logger } from '../utils/logger.js';

/**
 * Discovered offer with extracted details
 */
export interface DiscoveredOffer {
  url: string;
  urlCanonical: string;
  domain: string;
  title: string;
  summary?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Offer Detector
 * Identifies new offers not already in the database and saves them
 */
export class OfferDetector {
  private existingOfferUrls: Set<string> = new Set();

  /**
   * Load existing offer URLs from the database
   */
  async loadExistingOffers(): Promise<void> {
    this.existingOfferUrls = await getExistingOfferUrls();
    logger.info('Loaded existing offer URLs', {
      count: this.existingOfferUrls.size,
    });
  }

  /**
   * Detect which offers from the crawl are new (not in database)
   * @param discoveries - Array of discovered offers from the crawl
   * @returns Array of offers that are new
   */
  async detectNewOffers(discoveries: DiscoveredOffer[]): Promise<DiscoveredOffer[]> {
    await this.loadExistingOffers();

    const newOffers = discoveries.filter((offer) => {
      // Check both the URL and canonical URL
      const isNew = !this.existingOfferUrls.has(offer.url) &&
                    !this.existingOfferUrls.has(offer.urlCanonical);
      return isNew;
    });

    logger.info('Detected new offers', {
      total: discoveries.length,
      new: newOffers.length,
      existing: discoveries.length - newOffers.length,
    });

    return newOffers;
  }

  /**
   * Save discovered offers to the database
   * @param offers - Array of offers to save
   * @returns Number of offers saved
   */
  async saveOffers(offers: DiscoveredOffer[]): Promise<number> {
    let savedCount = 0;

    for (const offer of offers) {
      try {
        const offerInput: DiscoveredOfferInput = {
          url: offer.url,
          domain: offer.domain,
          title: offer.title,
          summary: offer.summary,
          startDate: offer.startDate,
          endDate: offer.endDate,
        };

        await upsertDiscoveredOffer(offerInput);
        savedCount++;
      } catch (error) {
        logger.error('Failed to save offer', {
          url: offer.url,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other offers even if one fails
      }
    }

    logger.info('Saved offers to database', {
      attempted: offers.length,
      saved: savedCount,
    });

    return savedCount;
  }

  /**
   * Detect new offers and save them to the database
   * @param discoveries - Array of discovered offers from the crawl
   * @returns Object with counts of new and saved offers
   */
  async processOffers(discoveries: DiscoveredOffer[]): Promise<{
    newCount: number;
    savedCount: number;
  }> {
    const newOffers = await this.detectNewOffers(discoveries);
    const savedCount = await this.saveOffers(newOffers);

    return {
      newCount: newOffers.length,
      savedCount,
    };
  }
}

/**
 * Singleton instance of the offer detector
 */
export const offerDetector = new OfferDetector();
