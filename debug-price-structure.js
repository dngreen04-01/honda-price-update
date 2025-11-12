import puppeteer from 'puppeteer-core';
import * as cheerio from 'cheerio';
import 'dotenv/config';

const browserAPI = process.env.BRIGHT_DATA_BROWSER_API;
const url = 'https://www.hondamarine.co.nz/analogue-gauge-set-mechanical';

(async () => {
  let browser;
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: browserAPI });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const html = await page.content();

    const $ = cheerio.load(html);

    console.log('=== All .price elements ===\n');
    $('.price').each((i, el) => {
      const text = $(el).text().trim();
      const parent = $(el).parent().attr('class');
      console.log(`Price element ${i + 1}:`);
      console.log('  Text:', text);
      console.log('  Parent class:', parent);
      console.log('');
    });

    console.log('\n=== .price-box content ===\n');
    const priceBox = $('.price-box').first();
    console.log('Text:', priceBox.text().trim().replace(/\s+/g, ' '));

    console.log('\n=== Looking for specific price elements ===\n');
    console.log('.special-price .price:', $('.special-price .price').first().text().trim());
    console.log('.old-price .price:', $('.old-price .price').first().text().trim());
    console.log('.price-box .special-price .price:', $('.price-box .special-price .price').first().text().trim());
    console.log('.price-box .old-price .price:', $('.price-box .old-price .price').first().text().trim());

    // Try Magento 2 specific selectors
    console.log('\n=== Magento 2 selectors ===\n');
    console.log('.product-info-price .price:', $('.product-info-price .price').first().text().trim());
    console.log('.product-info-main .price-box .price:', $('.product-info-main .price-box .price').first().text().trim());
    console.log('.product-info-price .special-price .price:', $('.product-info-price .special-price .price').first().text().trim());
    console.log('.product-info-price .old-price .price:', $('.product-info-price .old-price .price').first().text().trim());

    await page.close();
    await browser.close();

  } catch (error) {
    console.error('Error:', error);
    if (browser) await browser.close();
  }
})();
