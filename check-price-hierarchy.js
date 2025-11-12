import puppeteer from 'puppeteer-core';
import * as cheerio from 'cheerio';
import 'dotenv/config';

const browserAPI = process.env.BRIGHT_DATA_BROWSER_API;
const url = 'https://www.hondamarine.co.nz/analogue-gauge-set-mechanical';

const browser = await puppeteer.connect({ browserWSEndpoint: browserAPI });
const page = await browser.newPage();

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
const html = await page.content();

const $ = cheerio.load(html);

console.log('=== Checking price hierarchy ===\n');

// Find the first occurrence of each price
const configured = $('.price-configured_price .price').first();
const final = $('.price-final_price .price').first();

console.log('price-configured_price .price:', configured.text().trim());
console.log('price-final_price .price:', final.text().trim());

// Check if there's an offer-price container
console.log('\n=== Checking offer-price structure ===');
const offerPrice = $('.offer-price').first();
console.log('Found .offer-price:', offerPrice.length > 0);

if (offerPrice.length > 0) {
  const prices = offerPrice.find('.price');
  console.log('Number of .price elements in .offer-price:', prices.length);

  prices.each((i, el) => {
    const text = $(el).text().trim();
    const parentClass = $(el).parent().parent().attr('class');
    console.log(`  Price ${i + 1}: ${text} (grandparent: ${parentClass})`);
  });
}

// Try Magento-specific selectors
console.log('\n=== Testing Magento selectors ===');
console.log('.price-final_price .price (first):', $('.price-final_price .price').first().text().trim());
console.log('.price-configured_price .price (first):', $('.price-configured_price .price').first().text().trim());

await page.close();
await browser.close();
