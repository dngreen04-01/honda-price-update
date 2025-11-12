import puppeteer from 'puppeteer-core';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';
import 'dotenv/config';

const browserAPI = process.env.BRIGHT_DATA_BROWSER_API;
const url = 'https://www.hondamarine.co.nz/analogue-gauge-set-mechanical';

const browser = await puppeteer.connect({ browserWSEndpoint: browserAPI });
const page = await browser.newPage();

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
const html = await page.content();

// Analyze with cheerio
const $ = cheerio.load(html);

// Find the main product info area
console.log('=== Main Product Info ===');
const productInfoMain = $('.product-info-main, .product-info-price').first();
console.log('Found product-info-main:', productInfoMain.length > 0);

// Find all price-box containers within product-info
console.log('\n=== Price boxes in product info ===');
productInfoMain.find('.price-box').each((i, el) => {
  const classes = $(el).attr('class');
  console.log(`\nBox ${i}: class='${classes}'`);

  // Find prices within this box
  $(el).find('.price').each((j, priceEl) => {
    const text = $(priceEl).text().trim();
    const parentClass = $(priceEl).parent().attr('class');
    console.log(`  Price ${j}: '${text}' (parent: ${parentClass})`);
  });
});

// Try to find special/old price indicators
console.log('\n=== Looking for special/old price classes ===');
console.log('.special-price:', productInfoMain.find('.special-price').length);
console.log('.old-price:', productInfoMain.find('.old-price').length);
console.log('.regular-price:', productInfoMain.find('.regular-price').length);

// Get all price wrapper contents
console.log('\n=== All price-wrapper in product-info ===');
productInfoMain.find('.price-wrapper').each((i, el) => {
  const parentClass = $(el).parent().attr('class');
  const text = $(el).find('.price').text().trim();
  console.log(`Wrapper ${i}: parent='${parentClass}', price='${text}'`);
});

await page.close();
await browser.close();
