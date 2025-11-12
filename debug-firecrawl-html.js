// Debug script to see exactly what HTML Firecrawl is returning
import { firecrawlClient } from './dist/scraper/firecrawl-client.js';
import { priceExtractor } from './dist/scraper/price-extractor.js';
import fs from 'fs';

const testUrl = 'https://www.hondaoutdoors.co.nz/eu20i-eu22i-generator-service-kit';

console.log(`Debugging Firecrawl HTML for: ${testUrl}\n`);

try {
  console.log('Step 1: Fetching HTML with Firecrawl scrape...');
  const scrapeResponse = await firecrawlClient.scrape(testUrl);

  if (scrapeResponse.success && scrapeResponse.html) {
    console.log(`✓ Firecrawl scrape successful`);
    console.log(`  HTML length: ${scrapeResponse.html.length} characters`);

    // Save full HTML to file for inspection
    fs.writeFileSync('firecrawl-html-output.html', scrapeResponse.html);
    console.log(`  ✓ Full HTML saved to: firecrawl-html-output.html\n`);

    // Show first 2000 characters
    console.log('--- First 2000 chars of HTML ---');
    console.log(scrapeResponse.html.substring(0, 2000));
    console.log('--- End of HTML sample ---\n');

    // Look for price patterns
    const priceMatches = scrapeResponse.html.match(/\$[\d,]+\.?\d*/g);
    console.log('--- Price patterns ($XX.XX) found in HTML ---');
    if (priceMatches && priceMatches.length > 0) {
      console.log(`Found ${priceMatches.length} price-like patterns:`);
      priceMatches.slice(0, 20).forEach((price, idx) => {
        console.log(`  ${idx + 1}. ${price}`);
      });
    } else {
      console.log('  ❌ No $ price patterns found');
    }
    console.log('');

    // Look for number patterns that could be prices
    const numberMatches = scrapeResponse.html.match(/\b\d{1,5}(\.\d{2})?\b/g);
    console.log('--- Number patterns (potential prices) found in HTML ---');
    if (numberMatches && numberMatches.length > 0) {
      const uniqueNumbers = [...new Set(numberMatches)]
        .filter(num => {
          const n = parseFloat(num);
          return n >= 10 && n <= 10000; // Reasonable price range
        })
        .slice(0, 30);
      console.log(`Found ${uniqueNumbers.length} potential price numbers:`);
      uniqueNumbers.forEach((num, idx) => {
        console.log(`  ${idx + 1}. ${num}`);
      });
    } else {
      console.log('  ❌ No number patterns found');
    }
    console.log('');

    // Try price extraction
    console.log('Step 2: Attempting price extraction with price-extractor...');
    const extractedData = await priceExtractor.extract(testUrl, scrapeResponse.html);

    console.log('--- Price extraction result ---');
    console.log(JSON.stringify(extractedData, null, 2));

    // Check if HTML contains key Magento elements
    console.log('\n--- Checking for Magento 2 elements ---');
    const magentoChecks = {
      'product-info-price': scrapeResponse.html.includes('product-info-price'),
      'price-final_price': scrapeResponse.html.includes('price-final_price'),
      'product-info-main': scrapeResponse.html.includes('product-info-main'),
      'price-box': scrapeResponse.html.includes('price-box'),
      'price-wrapper': scrapeResponse.html.includes('price-wrapper'),
      'special-price': scrapeResponse.html.includes('special-price'),
      'old-price': scrapeResponse.html.includes('old-price'),
    };

    Object.entries(magentoChecks).forEach(([element, found]) => {
      console.log(`  ${found ? '✓' : '❌'} ${element}`);
    });
  } else {
    console.log('❌ Firecrawl scrape failed or returned no HTML');
    console.log('Response:', JSON.stringify(scrapeResponse, null, 2));
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
}

process.exit(0);
