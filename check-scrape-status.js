/**
 * Check scrape status - shows which products have prices and which don't
 */

import { getShopifyCatalogCache } from './dist/database/queries.js';

const catalog = await getShopifyCatalogCache();

console.log('=== Scrape Status Summary ===\n');

// Overall stats
const withUrls = catalog.filter(p => p.source_url_canonical);
const withScrapedPrices = catalog.filter(p => p.scraped_sale_price);
const withoutPrices = withUrls.filter(p => !p.scraped_sale_price);

console.log(`Total products: ${catalog.length}`);
console.log(`Products with URLs: ${withUrls.length}`);
console.log(`Products with scraped prices: ${withScrapedPrices.length}`);
console.log(`Products needing scrape: ${withoutPrices.length}`);
console.log('');

// Show some examples of products without prices
console.log('=== Sample Products Without Prices (first 10) ===\n');
withoutPrices.slice(0, 10).forEach((p, i) => {
  console.log(`${i + 1}. ${p.product_title}`);
  console.log(`   URL: ${p.source_url_canonical}`);
  console.log(`   SKU: ${p.variant_sku}`);
  console.log('');
});

// Check the specific product mentioned
const targetProduct = catalog.find(p =>
  p.source_url_canonical === 'https://hondaoutdoors.co.nz/umk450-bull-handle'
);

if (targetProduct) {
  console.log('=== Status of UMK450 Bull Handle ===\n');
  console.log('Title:', targetProduct.product_title);
  console.log('URL:', targetProduct.source_url_canonical);
  console.log('Shopify Price:', targetProduct.shopify_price);
  console.log('Scraped Sale Price:', targetProduct.scraped_sale_price);
  console.log('Scraped Original Price:', targetProduct.scraped_original_price);
  console.log('Last Scraped:', targetProduct.last_scraped_at || 'Never');
  console.log('Confidence:', targetProduct.scrape_confidence);
}
