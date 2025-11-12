import dotenv from 'dotenv';
import { puppeteerClient } from './src/scraper/puppeteer-client.js';
import * as cheerio from 'cheerio';

dotenv.config();

async function testOriginalPriceSelector() {
  const testUrl = 'https://www.hondaoutdoors.co.nz/auger-10-250-x-800mm';

  const scrapeResult = await puppeteerClient.scrapeUrl(testUrl);

  if (!scrapeResult.success || !scrapeResult.html) {
    console.error('❌ Failed to scrape URL');
    process.exit(1);
  }

  const $ = cheerio.load(scrapeResult.html);

  console.log('🎯 Checking .product-info-price .old-price .price:');
  const productInfoOldPrice = $('.product-info-price .old-price .price');
  console.log('  Found:', productInfoOldPrice.length, 'elements');
  productInfoOldPrice.each((i, el) => {
    console.log(`  [${i}]`, $(el).text().trim());
  });
  console.log('');

  console.log('🎯 Checking .old-price .price (global):');
  const globalOldPrice = $('.old-price .price');
  console.log('  Found:', globalOldPrice.length, 'elements');
  globalOldPrice.each((i, el) => {
    const parent = $(el).closest('.product-item, .product-info-main').length;
    console.log(`  [${i}]`, $(el).text().trim(), parent > 0 ? '(in product context)' : '(possibly related product)');
  });
  console.log('');

  console.log('🎯 Checking .product-info-main .old-price:');
  const mainOldPrice = $('.product-info-main .old-price .price');
  console.log('  Found:', mainOldPrice.length, 'elements');
  mainOldPrice.each((i, el) => {
    console.log(`  [${i}]`, $(el).text().trim());
  });
  console.log('');

  console.log('✅ Recommendation: Use .product-info-main .old-price .price to avoid related products');
}

testOriginalPriceSelector().catch(console.error);
