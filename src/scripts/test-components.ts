#!/usr/bin/env node

import { logger } from '../utils/logger.js';
import { canonicalizeUrl } from '../utils/canonicalize.js';
import { shopifyClient } from '../shopify/client.js';
import { sendgridClient } from '../email/sendgrid-client.js';
import { getActiveDomains } from '../database/queries.js';

/**
 * Test individual components
 */

async function testDatabase(): Promise<boolean> {
  try {
    logger.info('Testing database connection...');
    const domains = await getActiveDomains();
    logger.info(`✅ Database OK - Found ${domains.length} active domains`);
    domains.forEach((d: { root_url: string }) => logger.info(`  - ${d.root_url}`));
    return true;
  } catch (error) {
    logger.error('❌ Database test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function testShopify(): Promise<boolean> {
  try {
    logger.info('Testing Shopify connection...');
    const metafieldExists = await shopifyClient.verifySourceUrlMetafield();

    if (metafieldExists) {
      logger.info('✅ Shopify OK - source_url metafield verified');
    } else {
      logger.warn('⚠️  Shopify OK but source_url metafield not found');
      logger.info('   Create it in Shopify Admin → Settings → Custom data → Products');
    }

    // Test fetching products
    const products = await shopifyClient.getAllProductsWithSourceUrl();
    logger.info(`   Found ${products.size} products with source_url metafield`);

    return true;
  } catch (error) {
    logger.error('❌ Shopify test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function testEmail(): Promise<boolean> {
  try {
    logger.info('Testing SendGrid connection...');

    const testResult = await sendgridClient.sendAlertEmail(
      'Test Email from Honda Price Scraper',
      'This is a test email to verify SendGrid integration is working correctly.'
    );

    if (testResult) {
      logger.info('✅ SendGrid OK - Test email sent successfully');
      logger.info('   Check your inbox for the test email');
    } else {
      logger.error('❌ SendGrid test failed - Email not sent');
    }

    return testResult;
  } catch (error) {
    logger.error('❌ SendGrid test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function testUrlCanonicalization(): boolean {
  logger.info('Testing URL canonicalization...');

  const testCases = [
    {
      input: 'https://www.hondaoutdoors.co.nz/products/mower?utm_source=google',
      expected: 'https://hondaoutdoors.co.nz/products/mower',
    },
    {
      input: 'https://HondaMarine.co.nz/Products/Boat/',
      expected: 'https://hondamarine.co.nz/Products/Boat',
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    const result = canonicalizeUrl(test.input);
    if (result === test.expected) {
      logger.info(`  ✅ ${test.input} → ${result}`);
      passed++;
    } else {
      logger.error(`  ❌ ${test.input} → ${result} (expected: ${test.expected})`);
      failed++;
    }
  }

  if (failed === 0) {
    logger.info('✅ URL canonicalization OK');
    return true;
  } else {
    logger.error(`❌ URL canonicalization failed (${failed}/${testCases.length} tests)`);
    return false;
  }
}

async function runAllTests(): Promise<void> {
  logger.info('=== Component Testing ===\n');

  const results = {
    urlCanonical: testUrlCanonicalization(),
    database: await testDatabase(),
    shopify: await testShopify(),
    email: await testEmail(),
  };

  logger.info('\n=== Test Results ===');
  logger.info(`URL Canonicalization: ${results.urlCanonical ? '✅' : '❌'}`);
  logger.info(`Database: ${results.database ? '✅' : '❌'}`);
  logger.info(`Shopify: ${results.shopify ? '✅' : '❌'}`);
  logger.info(`SendGrid: ${results.email ? '✅' : '❌'}`);

  const allPassed = Object.values(results).every(r => r === true);

  if (allPassed) {
    logger.info('\n🎉 All tests passed! System is ready to run.');
    process.exit(0);
  } else {
    logger.error('\n⚠️  Some tests failed. Please fix configuration and try again.');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(error => {
    logger.error('Test suite failed', { error: error.message });
    process.exit(1);
  });
}

export { runAllTests };
