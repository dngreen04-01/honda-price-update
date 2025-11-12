import dotenv from 'dotenv';
import { puppeteerClient } from './src/scraper/puppeteer-client.js';
import * as cheerio from 'cheerio';

dotenv.config();

async function debugSelectorMatching() {
  const testUrl = 'https://www.hondaoutdoors.co.nz/auger-10-250-x-800mm';

  console.log('🔍 Testing selector matching for:', testUrl);
  console.log('');

  // Scrape the URL
  const scrapeResult = await puppeteerClient.scrapeUrl(testUrl);

  if (!scrapeResult.success || !scrapeResult.html) {
    console.error('❌ Failed to scrape URL:', scrapeResult.error);
    process.exit(1);
  }

  const $ = cheerio.load(scrapeResult.html);

  // Test the specific selectors from honda-selectors.ts
  const selectors = {
    price: '.product-info-price .price-final_price .price, .product-info-main .price-box .price',
    salePrice: '.product-info-price .special-price .price, .special-price .price',
    originalPrice: '.product-info-price .old-price .price, .old-price .price',
  };

  console.log('🎯 Testing price selector:', selectors.price);
  const priceElement = $(selectors.price).first();
  console.log('  Matched:', priceElement.length > 0 ? 'YES' : 'NO');
  if (priceElement.length > 0) {
    console.log('  Text:', priceElement.text().trim());
    console.log('  HTML:', priceElement.html());
  }
  console.log('');

  console.log('🎯 Testing salePrice selector:', selectors.salePrice);
  const salePriceElement = $(selectors.salePrice).first();
  console.log('  Matched:', salePriceElement.length > 0 ? 'YES' : 'NO');
  if (salePriceElement.length > 0) {
    console.log('  Text:', salePriceElement.text().trim());
  }
  console.log('');

  console.log('🎯 Testing originalPrice selector:', selectors.originalPrice);
  const originalPriceElement = $(selectors.originalPrice).first();
  console.log('  Matched:', originalPriceElement.length > 0 ? 'YES' : 'NO');
  if (originalPriceElement.length > 0) {
    console.log('  Text:', originalPriceElement.text().trim());
  }
  console.log('');

  // Test getText function logic from honda-selectors.ts
  const getText = (selector) => {
    const element = $(selector).first();
    const text = element.text().trim();
    return text.length > 0 ? text : null;
  };

  const parsePrice = (text) => {
    if (!text) return null;
    const match = text.replace(/[^0-9.]/g, '').match(/\d+\.?\d*/);
    return match ? parseFloat(match[0]) : null;
  };

  console.log('🎯 Simulating honda-selectors.ts logic:');
  const salePriceText = getText(selectors.salePrice) || getText(selectors.price);
  const originalPriceText = getText(selectors.originalPrice);

  console.log('  salePriceText:', salePriceText);
  console.log('  originalPriceText:', originalPriceText);
  console.log('  Parsed salePrice:', parsePrice(salePriceText));
  console.log('  Parsed originalPrice:', parsePrice(originalPriceText));
}

debugSelectorMatching().catch(console.error);
