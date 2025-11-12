/**
 * Test Bright Data Scraping Browser Authentication
 *
 * This script helps verify if your Browser API credentials are correct.
 *
 * Run with: node test-browser-auth.js
 */

import puppeteer from 'puppeteer-core';
import 'dotenv/config';

async function testBrowserAuth() {
  console.log('\n=== Testing Bright Data Scraping Browser Authentication ===\n');

  // Get credentials from environment
  const browserAPI = process.env.BRIGHT_DATA_BROWSER_API;

  if (!browserAPI) {
    console.error('❌ BRIGHT_DATA_BROWSER_API not set in .env file');
    return;
  }

  // Parse the URL to show configuration (hide password)
  const match = browserAPI.match(/wss:\/\/([^:]+):([^@]+)@(.+)/);
  if (match) {
    console.log('Configuration:');
    console.log('  Username:', match[1]);
    console.log('  Password:', '*'.repeat(match[2].length));
    console.log('  Host:', match[3]);
  }

  console.log('\nAttempting connection...\n');

  let browser;
  try {
    // Try to connect
    browser = await puppeteer.connect({
      browserWSEndpoint: browserAPI,
      timeout: 30000
    });

    console.log('✅ Successfully connected to Bright Data Scraping Browser!\n');

    // Try to navigate to a test page
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('Testing navigation to Google...');
    await page.goto('https://www.google.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const title = await page.title();
    console.log('✅ Navigation successful! Page title:', title);

    await page.close();
    await browser.close();

    console.log('\n=== Authentication Test PASSED ===\n');
    console.log('Your credentials are working correctly.');
    console.log('The issue might be elsewhere (rate limits, blocked domain, etc.)');

  } catch (error) {
    console.error('\n❌ Authentication Test FAILED\n');

    if (error.message.includes('407')) {
      console.error('Error: 407 Proxy Authentication Required');
      console.error('\nThis means your credentials are incorrect or expired.');
      console.error('\nPlease check:');
      console.error('1. Go to Bright Data dashboard → Zones → honda_scrapper');
      console.error('2. Look for "Scraping Browser" section');
      console.error('3. Verify or regenerate the Browser API password');
      console.error('4. Update BRIGHT_DATA_BROWSER_API in your .env file');
      console.error('\nThe correct format is:');
      console.error('wss://brd-customer-hl_145f098d-zone-honda_scrapper:YOUR_PASSWORD@brd.superproxy.io:9222');
    } else {
      console.error('Error:', error.message);
    }

    if (browser) {
      await browser.close();
    }
  }
}

testBrowserAuth().catch(console.error);
