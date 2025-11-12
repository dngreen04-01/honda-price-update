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

console.log('=== Finding $930 price ===\n');

// Find all .price elements
$('.price').each((i, el) => {
  const text = $(el).text().trim();

  if (text === '$930') {
    console.log(`Found $930 in .price element #${i + 1}`);

    // Get full ancestry
    let current = $(el);
    let level = 0;
    while (current.length > 0 && level < 5) {
      const tag = current[0].tagName;
      const classes = current.attr('class') || '';
      const id = current.attr('id') || '';

      console.log(`  ${' '.repeat(level * 2)}Level ${level}: <${tag}> class="${classes}" id="${id}"`);

      current = current.parent();
      level++;
    }
    console.log('');
  }
});

await page.close();
await browser.close();
