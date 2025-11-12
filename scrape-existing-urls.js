#!/usr/bin/env node

/**
 * Scrape prices for existing URLs in database
 * This bypasses URL discovery (which requires Firecrawl credits)
 * and directly scrapes known product URLs using Puppeteer + Bright Data proxy
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PuppeteerClient } from './dist/scraper/puppeteer-client.js';
import { logger } from './dist/utils/logger.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function scrapeExistingUrls() {
  console.log('=== Scraping Existing URLs ===\n');

  // 1. Get all product URLs from database
  console.log('1. Fetching URLs from database...');
  const { data: products, error } = await supabase
    .from('product_pages')
    .select('canonical_url, last_seen_at')
    .order('last_seen_at', { ascending: true, nullsFirst: true });

  if (error) {
    console.error('Error fetching URLs:', error);
    process.exit(1);
  }

  console.log(`   Found ${products.length} products in database\n`);

  const urls = products.map(p => p.canonical_url);

  // 2. Initialize Puppeteer with proxy
  console.log('2. Initializing Puppeteer with Bright Data proxy...');
  const puppeteer = new PuppeteerClient();
  await puppeteer.initialize();
  console.log('   ✅ Puppeteer initialized\n');

  // 3. Scrape URLs in batches
  console.log('3. Scraping products...');
  const batchSize = 50;
  let totalScraped = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(urls.length / batchSize);

    console.log(`   Batch ${batchNum}/${totalBatches} (${batch.length} products)...`);

    const results = await puppeteer.scrapeUrls(batch, { concurrency: 3 });

    // 4. Store results in database
    for (const result of results) {
      totalScraped++;

      if (result.success && result.html) {
        const priceData = puppeteer.extractPrice(result.url, result.html);

        if (priceData.salePrice) {
          // Update database with scraped price
          const { error: updateError } = await supabase
            .from('product_pages')
            .update({
              latest_sale_price: priceData.salePrice,
              latest_original_price: priceData.originalPrice,
              html_snippet: result.html.substring(0, 5000),
              last_seen_at: new Date().toISOString(),
            })
            .eq('canonical_url', result.url);

          if (updateError) {
            console.error(`      ❌ Failed to update ${result.url}:`, updateError.message);
            totalFailed++;
          } else {
            totalSuccess++;
            process.stdout.write('.');
          }
        } else {
          // No price found
          const { error: updateError } = await supabase
            .from('product_pages')
            .update({
              latest_sale_price: null,
              latest_original_price: null,
              html_snippet: result.html.substring(0, 5000),
              last_seen_at: new Date().toISOString(),
            })
            .eq('canonical_url', result.url);

          if (!updateError) {
            process.stdout.write('○');
          }
          totalFailed++;
        }
      } else {
        totalFailed++;
        process.stdout.write('×');
      }

      // Progress update every 50 products
      if (totalScraped % 50 === 0) {
        console.log(` [${totalScraped}/${urls.length}]`);
      }
    }

    console.log(`   Batch ${batchNum} complete: ${totalSuccess} success, ${totalFailed} failed`);
  }

  await puppeteer.close();

  // 5. Summary
  console.log('\n=== Scraping Complete ===');
  console.log(`Total products: ${urls.length}`);
  console.log(`Successful: ${totalSuccess} (${((totalSuccess/urls.length)*100).toFixed(1)}%)`);
  console.log(`Failed: ${totalFailed} (${((totalFailed/urls.length)*100).toFixed(1)}%)`);
  console.log(`\nCheck dashboard: http://localhost:5173/dashboard/price-comparison`);
}

scrapeExistingUrls().catch(console.error);
