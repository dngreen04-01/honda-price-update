// Test script to verify Bright Data Scraping Browser configuration
import { puppeteerClient } from './dist/scraper/puppeteer-client.js';

console.log('Testing Bright Data Scraping Browser Configuration\n');
console.log('='.repeat(60));

async function testBrightData() {
  console.log('\n1. Checking configuration...');
  if (!puppeteerClient.isConfigured()) {
    console.error('   ❌ Bright Data not configured properly');
    console.error('   Please check BRIGHT_DATA_USERNAME and BRIGHT_DATA_PROXY_PASSWORD in .env');
    process.exit(1);
  }
  console.log('   ✓ Credentials found in .env');

  console.log('\n2. Testing connection to Bright Data...');
  const connectionTest = await puppeteerClient.testConnection();

  if (connectionTest.success) {
    console.log('   ✓ ' + connectionTest.message);
  } else {
    console.error('   ❌ Connection failed: ' + connectionTest.message);
    console.error('\n   Possible causes:');
    console.error('   - Incorrect username or password');
    console.error('   - No active Bright Data subscription');
    console.error('   - Network connectivity issues');
    process.exit(1);
  }

  console.log('\n3. Testing Honda product page scraping...');
  const testUrl = 'https://www.hondaoutdoors.co.nz/eu20i-eu22i-generator-service-kit';
  console.log('   Target: ' + testUrl);

  const result = await puppeteerClient.scrapeUrl(testUrl);

  if (result.success && result.html) {
    console.log('   ✓ Successfully scraped page!');
    console.log('   HTML length: ' + result.html.length + ' characters');

    // Check for product content
    const hasProductPrice = result.html.includes('product-info-price') ||
                           result.html.includes('price-box');
    const hasProductInfo = result.html.includes('product-info-main');
    const hasError403 = result.html.includes('403') || result.html.includes('Forbidden');

    console.log('\n   Content Analysis:');
    console.log('   ' + (hasProductPrice ? '✓' : '❌') + ' Product price elements found');
    console.log('   ' + (hasProductInfo ? '✓' : '❌') + ' Product info elements found');
    console.log('   ' + (!hasError403 ? '✓' : '❌') + ' No 403 Forbidden error');

    // Try to extract price
    console.log('\n4. Testing price extraction...');
    const priceResult = puppeteerClient.extractPrice(testUrl, result.html);

    if (priceResult.salePrice) {
      console.log('   ✓ Price extracted successfully: $' + priceResult.salePrice);
      console.log('   Confidence: ' + priceResult.confidence);
      console.log('   Source: ' + priceResult.source);
    } else {
      console.log('   ⚠️  No price extracted');
      console.log('   This might mean:');
      console.log('   - Page is still being blocked');
      console.log('   - Price selectors need adjustment');
      console.log('   - HTML structure is different than expected');
    }

    // Save HTML for inspection
    const fs = await import('fs');
    fs.writeFileSync('bright-data-output.html', result.html);
    console.log('\n   HTML saved to: bright-data-output.html');

  } else {
    console.error('   ❌ Failed to scrape page: ' + result.error);
    console.error('\n   This might mean:');
    console.error('   - Bright Data subscription expired or out of credits');
    console.error('   - Website has additional blocking measures');
    console.error('   - Network timeout or connectivity issue');
  }

  await puppeteerClient.close();

  console.log('\n' + '='.repeat(60));
  console.log('\nTest complete!\n');
}

testBrightData().catch(error => {
  console.error('\n❌ Test failed with error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
