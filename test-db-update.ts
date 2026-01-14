import dotenv from 'dotenv';
import { scraperOrchestrator } from './src/scraper/scraper-orchestrator.js';
import { getShopifyCatalogCache } from './src/database/queries.js';
import { supabase } from './src/database/client.js';

dotenv.config();

async function testDbUpdate() {
  console.log('🔍 Diagnosing database update issue...\n');

  // 1. Get a few products from the database
  const allProducts = await getShopifyCatalogCache();
  const productsWithUrls = allProducts.filter(p => p.source_url_canonical);

  console.log(`📊 Products in shopify_catalog_cache: ${allProducts.length}`);
  console.log(`📊 Products with source_url_canonical: ${productsWithUrls.length}\n`);

  if (productsWithUrls.length === 0) {
    console.error('❌ No products with source URLs found!');
    process.exit(1);
  }

  // 2. Show first 3 source_url_canonical values from DB
  console.log('📋 First 3 source_url_canonical values in database:');
  for (let i = 0; i < Math.min(3, productsWithUrls.length); i++) {
    const p = productsWithUrls[i];
    console.log(`   ${i + 1}. "${p.source_url_canonical}"`);
    console.log(`      last_scraped_at: ${p.last_scraped_at || 'NULL'}`);
  }
  console.log('');

  // 3. Scrape just 2 URLs
  const testUrls = productsWithUrls.slice(0, 2).map(p => {
    const url = p.source_url_canonical;
    // Restore www. subdomain for scraping
    try {
      const urlObj = new URL(url);
      if (!urlObj.hostname.startsWith('www.')) {
        urlObj.hostname = `www.${urlObj.hostname}`;
        return urlObj.toString();
      }
      return url;
    } catch {
      return url;
    }
  });

  console.log('🎯 Scraping these URLs (with www. restored):');
  testUrls.forEach((url, i) => console.log(`   ${i + 1}. "${url}"`));
  console.log('');

  console.log('🚀 Running scrape...\n');

  const results = await scraperOrchestrator.scrapeProducts(testUrls, { concurrency: 1 });

  console.log('\n📝 Scrape results:');
  results.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.success ? '✅' : '❌'} ${r.url}`);
    if (r.success) {
      console.log(`      salePrice: ${r.salePrice}`);
    }
  });
  console.log('');

  console.log('💾 Storing to database...\n');
  const storeResult = await scraperOrchestrator.storeProducts(results);

  console.log('\n📊 Storage Results:');
  console.log(`   Attempted: ${storeResult.attempted}`);
  console.log(`   DB Updated: ${storeResult.dbUpdated}`);
  console.log(`   Not Found: ${storeResult.notFound}`);
  console.log(`   Errors: ${storeResult.errors}`);
  console.log('');

  if (storeResult.notFound > 0) {
    console.log('⚠️  Some URLs were not found in the database!');
    console.log('   This means the canonical URL we\'re searching for');
    console.log('   doesn\'t match source_url_canonical in the database.\n');

    // Try a direct query to debug
    console.log('🔍 Debugging URL matching...');
    const firstUrl = testUrls[0];
    // Canonicalize like the store function does
    const urlObj = new URL(firstUrl);
    let host = urlObj.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.substring(4);
    }
    const canonicalUrl = `${urlObj.protocol}//${host}${urlObj.pathname}`;

    console.log(`   Searching for: "${canonicalUrl}"`);

    const { data, error } = await supabase
      .from('shopify_catalog_cache')
      .select('source_url_canonical, last_scraped_at')
      .ilike('source_url_canonical', `%${host}%`)
      .limit(3);

    if (data && data.length > 0) {
      console.log(`   Found ${data.length} similar URLs:`);
      data.forEach((d, i) => console.log(`      ${i + 1}. "${d.source_url_canonical}"`));
    } else {
      console.log('   No similar URLs found!');
    }
  } else if (storeResult.dbUpdated > 0) {
    console.log('✅ Database updates successful!');

    // Verify the update
    const { data } = await supabase
      .from('shopify_catalog_cache')
      .select('source_url_canonical, scraped_sale_price, last_scraped_at')
      .not('last_scraped_at', 'is', null)
      .order('last_scraped_at', { ascending: false })
      .limit(3);

    if (data) {
      console.log('\n📋 Most recently updated products:');
      data.forEach((d, i) => {
        console.log(`   ${i + 1}. ${d.source_url_canonical}`);
        console.log(`      scraped_sale_price: ${d.scraped_sale_price}`);
        console.log(`      last_scraped_at: ${d.last_scraped_at}`);
      });
    }
  }

  process.exit(0);
}

testDbUpdate().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
