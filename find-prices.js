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

console.log('=== Finding prices containing $995 or $930 ===\n');

// Find all elements containing these prices
$('*').each((i, el) => {
  const text = $(el).text();

  if (text.includes('$995') || text.includes('$930')) {
    const tagName = el.tagName;
    const classes = $(el).attr('class') || '';
    const id = $(el).attr('id') || '';

    // Only show if it's a small element (not a container)
    if (text.length < 100) {
      console.log(`Tag: <${tagName}>, Class: "${classes}", ID: "${id}"`);
      console.log(`Text: "${text.trim()}"`);

      // Show parent info
      const parent = $(el).parent();
      const parentClass = parent.attr('class') || '';
      const parentTag = parent[0]?.tagName;
      console.log(`Parent: <${parentTag}> class="${parentClass}"`);
      console.log('');
    }
  }
});

await page.close();
await browser.close();
