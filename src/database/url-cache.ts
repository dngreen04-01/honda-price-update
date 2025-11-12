import { supabase } from './client.js';
import { logger } from '../utils/logger.js';

/**
 * URL Cache to avoid re-scraping unchanged products
 *
 * Strategy:
 * 1. Store discovered URLs with last_discovered_at timestamp
 * 2. Only re-scrape if:
 *    - URL is new (never seen before)
 *    - URL hasn't been scraped in last 24 hours
 *    - Price check indicates potential change
 */

export interface CachedUrl {
  canonical_url: string;
  domain_id: number;
  last_scraped_at: string;
  last_price: number | null;
  scrape_count: number;
}

export class UrlCache {
  /**
   * Get URLs that need scraping (new or stale)
   */
  async filterUrlsForScraping(
    domainId: number,
    urls: string[],
    maxAgeHours: number = 24
  ): Promise<{
    needsScraping: string[];
    cached: string[];
    stats: { total: number; cached: number; new: number; stale: number };
  }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - maxAgeHours);

      // Query product_pages for URLs from this domain
      const { data: existingProducts, error } = await supabase
        .from('product_pages')
        .select('canonical_url, last_seen_at, latest_sale_price')
        .eq('domain_id', domainId)
        .in('canonical_url', urls);

      if (error) {
        logger.warn('Failed to query URL cache, will scrape all URLs', { error: error.message });
        return {
          needsScraping: urls,
          cached: [],
          stats: { total: urls.length, cached: 0, new: urls.length, stale: 0 },
        };
      }

      const existingUrlMap = new Map(
        (existingProducts || []).map(p => [
          p.canonical_url,
          {
            lastSeen: new Date(p.last_seen_at),
            price: p.latest_sale_price,
          },
        ])
      );

      const needsScraping: string[] = [];
      const cached: string[] = [];
      let newCount = 0;
      let staleCount = 0;

      for (const url of urls) {
        const existing = existingUrlMap.get(url);

        if (!existing) {
          // New URL - needs scraping
          needsScraping.push(url);
          newCount++;
        } else if (existing.lastSeen < cutoffDate) {
          // Stale URL - needs re-scraping
          needsScraping.push(url);
          staleCount++;
        } else {
          // Fresh URL - skip scraping
          cached.push(url);
        }
      }

      logger.info('URL cache filter results', {
        domainId,
        total: urls.length,
        needsScraping: needsScraping.length,
        cached: cached.length,
        new: newCount,
        stale: staleCount,
        cacheHitRate: `${((cached.length / urls.length) * 100).toFixed(1)}%`,
        creditsSaved: cached.length,
      });

      return {
        needsScraping,
        cached,
        stats: {
          total: urls.length,
          cached: cached.length,
          new: newCount,
          stale: staleCount,
        },
      };
    } catch (error) {
      logger.error('URL cache filter failed', {
        domainId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fail safe - scrape everything
      return {
        needsScraping: urls,
        cached: [],
        stats: { total: urls.length, cached: 0, new: urls.length, stale: 0 },
      };
    }
  }

  /**
   * Mark URLs as seen (updates last_seen_at)
   */
  async markUrlsAsSeen(domainId: number, urls: string[]): Promise<void> {
    try {
      const now = new Date().toISOString();

      // Batch update last_seen_at for all URLs
      const { error } = await supabase
        .from('product_pages')
        .update({ last_seen_at: now })
        .eq('domain_id', domainId)
        .in('canonical_url', urls);

      if (error) {
        logger.warn('Failed to mark URLs as seen', { error: error.message });
      }
    } catch (error) {
      logger.error('Failed to mark URLs as seen', {
        domainId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get cache statistics for a domain
   */
  async getCacheStats(domainId: number): Promise<{
    totalUrls: number;
    freshUrls: number;
    staleUrls: number;
    averageAge: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('product_pages')
        .select('last_seen_at')
        .eq('domain_id', domainId);

      if (error || !data) {
        return { totalUrls: 0, freshUrls: 0, staleUrls: 0, averageAge: 0 };
      }

      const now = new Date();
      const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      let totalAge = 0;
      let freshUrls = 0;
      let staleUrls = 0;

      for (const row of data) {
        const lastSeen = new Date(row.last_seen_at);
        const ageHours = (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60);
        totalAge += ageHours;

        if (lastSeen >= cutoff24h) {
          freshUrls++;
        } else {
          staleUrls++;
        }
      }

      return {
        totalUrls: data.length,
        freshUrls,
        staleUrls,
        averageAge: data.length > 0 ? totalAge / data.length : 0,
      };
    } catch (error) {
      logger.error('Failed to get cache stats', {
        domainId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { totalUrls: 0, freshUrls: 0, staleUrls: 0, averageAge: 0 };
    }
  }
}

export const urlCache = new UrlCache();
