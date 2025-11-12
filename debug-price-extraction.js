import dotenv from 'dotenv';
import { puppeteerClient } from './src/scraper/puppeteer-client.js';
import * as cheerio from 'cheerio';

dotenv.config();

async function debugPriceExtraction() {
  const testUrl = 'https://www.hondaoutdoors.co.nz/auger-10-250-x-800mm';

  console.log('🔍 Testing price extraction for:', testUrl);
  console.log('');

  // Scrape the URL
  console.log('📥 Fetching HTML from Bright Data...');
  const scrapeResult = await puppeteerClient.scrapeUrl(testUrl);

  if (!scrapeResult.success || !scrapeResult.html) {
    console.error('❌ Failed to scrape URL:', scrapeResult.error);
    process.exit(1);
  }

  console.log('✅ HTML fetched successfully');
  console.log('📊 HTML length:', scrapeResult.html.length, 'bytes\n');

  // Parse HTML
  const $ = cheerio.load(scrapeResult.html);

  console.log('🎯 Checking meta itemprop="price":');
  const metaPrice = $('[itemprop="price"]');
  if (metaPrice.length > 0) {
    metaPrice.each((i, el) => {
      const content = $(el).attr('content');
      const text = $(el).text().trim();
      const tagName = $(el).prop('tagName');
      console.log(`  [${i}] <${tagName}> content="${content}" text="${text}"`);
    });
  } else {
    console.log('  ⚠️  Not found');
  }
  console.log('');

  console.log('🎯 Checking span.price elements:');
  const priceSpans = $('span.price');
  if (priceSpans.length > 0) {
    priceSpans.each((i, el) => {
      const text = $(el).text().trim();
      const parent = $(el).parent().prop('tagName');
      const parentClass = $(el).parent().attr('class');
      console.log(`  [${i}] <span class="price"> text="${text}" parent=<${parent} class="${parentClass}">`);
    });
  } else {
    console.log('  ⚠️  Not found');
  }
  console.log('');

  console.log('🎯 Checking ALL .price elements:');
  const allPrices = $('.price');
  if (allPrices.length > 0) {
    allPrices.each((i, el) => {
      const text = $(el).text().trim();
      const tagName = $(el).prop('tagName');
      const className = $(el).attr('class');
      const parent = $(el).parent().prop('tagName');
      const parentClass = $(el).parent().attr('class');
      console.log(`  [${i}] <${tagName} class="${className}"> text="${text}" parent=<${parent} class="${parentClass}">`);
    });
  } else {
    console.log('  ⚠️  Not found');
  }
  console.log('');

  console.log('🎯 Checking .product-info-price .price-final_price .price:');
  const finalPrice = $('.product-info-price .price-final_price .price');
  if (finalPrice.length > 0) {
    finalPrice.each((i, el) => {
      const text = $(el).text().trim();
      console.log(`  [${i}] text="${text}"`);
    });
  } else {
    console.log('  ⚠️  Not found');
  }
  console.log('');

  console.log('🎯 Using honda-selectors extraction:');
  const extractedPrice = puppeteerClient.extractPrice(testUrl, scrapeResult.html);
  console.log('  Sale Price:', extractedPrice.salePrice);
  console.log('  Original Price:', extractedPrice.originalPrice);
  console.log('  Confidence:', extractedPrice.confidence);
  console.log('  Source:', extractedPrice.source);
  console.log('');

  console.log('🎯 Expected: $432');
  console.log('🎯 Actual:', extractedPrice.salePrice ? `$${extractedPrice.salePrice}` : 'null');

  if (extractedPrice.salePrice !== 432) {
    console.log('❌ MISMATCH - Price extraction is incorrect!');
  } else {
    console.log('✅ CORRECT - Price extraction is working!');
  }
}

debugPriceExtraction().catch(console.error);
