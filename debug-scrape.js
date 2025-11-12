// Debug script to see what HTML Puppeteer is getting
import { puppeteerClient } from './dist/scraper/puppeteer-client.js';

const testUrl = 'https://www.hondaoutdoors.co.nz/eu20i-eu22i-generator-service-kit';

console.log(`Debugging scrape for: ${testUrl}\n`);

try {
  await puppeteerClient.initialize();

  const results = await puppeteerClient.scrapeUrls([testUrl], { concurrency: 1 });

  if (results.length > 0 && results[0].success) {
    const html = results[0].html;
    console.log('HTML length:', html.length);
    console.log('\n--- First 2000 chars of HTML ---');
    console.log(html.substring(0, 2000));

    // Try to extract price
    const priceResult = puppeteerClient.extractPrice(testUrl, html);
    console.log('\n--- Price extraction result ---');
    console.log(JSON.stringify(priceResult, null, 2));

    // Look for price in HTML
    const priceMatches = html.match(/\$[\d,]+\.?\d*/g);
    console.log('\n--- Price patterns found in HTML ---');
    console.log(priceMatches ? priceMatches.slice(0, 10) : 'None found');
  } else {
    console.log('Failed to scrape:', results[0]?.error);
  }

  await puppeteerClient.close();
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
}

process.exit(0);
