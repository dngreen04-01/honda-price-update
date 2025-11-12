import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { canonicalizeUrl } from './dist/utils/canonicalize.js';
import { PuppeteerClient } from './dist/scraper/puppeteer-client.js';

dotenv.config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function investigate() {
  console.log('=== Investigating Missing Products ===\n');

  const testUrl = 'https://www.hondamotorbikes.co.nz/08l71mjpg50';
  const canonicalUrl = canonicalizeUrl(testUrl);

  console.log(`Test URL: ${testUrl}`);
  console.log(`Canonical URL: ${canonicalUrl}\n`);

  // 1. Check if product exists in database
  console.log('1. Checking database for this product...');
  const { data: productData, error: productError } = await supabase
    .from('product_pages')
    .select('*')
    .eq('canonical_url', canonicalUrl)
    .maybeSingle();

  if (productError) {
    console.error('Error querying database:', productError);
  } else if (productData) {
    console.log('✅ Product FOUND in database:');
    console.log(`   - URL: ${productData.canonical_url}`);
    console.log(`   - Latest Price: $${productData.latest_sale_price}`);
    console.log(`   - Last Scraped: ${productData.last_scraped_at}`);
    console.log(`   - Status: ${productData.status}`);
  } else {
    console.log('❌ Product NOT FOUND in database');
  }

  // 2. Check all products with "Not In Supplier" status
  console.log('\n2. Checking all "Not In Supplier" products...');
  const { data: notInSupplier, error: notInSupplierError } = await supabase
    .from('product_pages')
    .select('canonical_url, status, last_scraped_at')
    .is('latest_sale_price', null)
    .order('last_scraped_at', { ascending: false });

  if (notInSupplierError) {
    console.error('Error:', notInSupplierError);
  } else {
    console.log(`Found ${notInSupplier.length} products with no price`);
    console.log('Sample URLs:');
    notInSupplier.slice(0, 10).forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.canonical_url} (last scraped: ${p.last_scraped_at})`);
    });
  }

  // 3. Test Puppeteer scraping on the example URL
  console.log('\n3. Testing Puppeteer scraping on example URL...');
  const puppeteer = new PuppeteerClient();

  try {
    await puppeteer.initialize();
    console.log('✅ Puppeteer initialized');

    const results = await puppeteer.scrapeUrls([testUrl], { concurrency: 1 });
    const result = results[0];

    if (result.success && result.html) {
      console.log('✅ Scraping successful');
      console.log(`   - HTML length: ${result.html.length} characters`);

      const priceData = puppeteer.extractPrice(result.url, result.html);
      console.log(`   - Sale Price: ${priceData.salePrice ? '$' + priceData.salePrice : 'NOT FOUND'}`);
      console.log(`   - Original Price: ${priceData.originalPrice ? '$' + priceData.originalPrice : 'NOT FOUND'}`);
      console.log(`   - Confidence: ${(priceData.confidence * 100).toFixed(0)}%`);
      console.log(`   - Matched Selector: ${priceData.matchedSelectors?.[0] || 'NONE'}`);
    } else {
      console.log('❌ Scraping failed');
      console.log(`   - Error: ${result.error}`);
    }

    await puppeteer.close();
  } catch (error) {
    console.error('Error during Puppeteer test:', error.message);
    await puppeteer.close();
  }

  // 4. Check if URL patterns are being discovered
  console.log('\n4. Checking URL patterns in database...');
  const domains = [
    'hondamotorbikes.co.nz',
    'hondaoutdoors.co.nz',
    'hondapowerequipment.co.nz'
  ];

  for (const domain of domains) {
    const { count, error } = await supabase
      .from('product_pages')
      .select('*', { count: 'exact', head: true })
      .ilike('canonical_url', `%${domain}%`);

    if (!error) {
      console.log(`   - ${domain}: ${count} products`);
    }
  }

  console.log('\n=== Investigation Complete ===');
}

investigate().catch(console.error);
