#!/usr/bin/env node

import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * Verify Shopify configuration
 */
async function verifyShopify(): Promise<void> {
  logger.info('=== Shopify Configuration Verification ===\n');

  // Check environment variables
  logger.info('1. Checking environment variables...');

  const shopifyConfig = {
    SHOPIFY_STORE_DOMAIN: process.env.SHOPIFY_STORE_DOMAIN,
    SHOPIFY_ADMIN_ACCESS_TOKEN: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ? '***' + process.env.SHOPIFY_ADMIN_ACCESS_TOKEN.slice(-4) : 'NOT SET',
    SHOPIFY_API_VERSION: process.env.SHOPIFY_API_VERSION || '2024-01',
  };

  logger.info('Environment variables:', shopifyConfig);

  if (!process.env.SHOPIFY_STORE_DOMAIN) {
    logger.error('❌ SHOPIFY_STORE_DOMAIN is not set');
    process.exit(1);
  }

  if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    logger.error('❌ SHOPIFY_ADMIN_ACCESS_TOKEN is not set');
    process.exit(1);
  }

  // Validate store domain format
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!storeDomain.includes('.myshopify.com')) {
    logger.warn('⚠️  Store domain should be in format: your-store.myshopify.com');
    logger.info(`   Current value: ${storeDomain}`);
  }

  // Validate access token format
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token.startsWith('shpat_')) {
    logger.warn('⚠️  Access token should start with "shpat_"');
    logger.info('   Make sure you copied the Admin API access token, not the API key');
  }

  logger.info('\n2. Testing Shopify API connection...');

  try {
    // Try a simple GraphQL query to test connection
    const response = await fetch(`https://${storeDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: `{
          shop {
            name
            email
            currencyCode
          }
        }`,
      }),
    });

    if (!response.ok) {
      logger.error(`❌ Shopify API returned ${response.status}: ${response.statusText}`);

      if (response.status === 401) {
        logger.error('\n🔑 Authentication Error:');
        logger.error('   Your access token is invalid or expired.');
        logger.error('\n   Steps to fix:');
        logger.error('   1. Go to Shopify Admin → Settings → Apps and sales channels');
        logger.error('   2. Click "Develop apps"');
        logger.error('   3. Select your app or create a new one');
        logger.error('   4. Configure Admin API scopes:');
        logger.error('      - read_products');
        logger.error('      - write_products');
        logger.error('      - read_product_listings');
        logger.error('   5. Install the app');
        logger.error('   6. Copy the "Admin API access token" (starts with shpat_)');
        logger.error('   7. Update SHOPIFY_ADMIN_ACCESS_TOKEN in .env');
      } else if (response.status === 403) {
        logger.error('\n🚫 Permission Error:');
        logger.error('   Your app does not have the required API scopes.');
        logger.error('   Required scopes: read_products, write_products');
      } else if (response.status === 404) {
        logger.error('\n🔍 Store Not Found:');
        logger.error('   Check that SHOPIFY_STORE_DOMAIN is correct.');
        logger.error(`   Current: ${storeDomain}`);
      }

      process.exit(1);
    }

    const data = await response.json();

    if (data.errors) {
      logger.error('❌ GraphQL errors:', data.errors);
      process.exit(1);
    }

    if (data.data?.shop) {
      logger.info('✅ Shopify API connection successful!');
      logger.info(`   Store: ${data.data.shop.name}`);
      logger.info(`   Email: ${data.data.shop.email}`);
      logger.info(`   Currency: ${data.data.shop.currencyCode}`);
    }

    logger.info('\n3. Testing product query...');

    // Test querying products
    const productsResponse = await fetch(`https://${storeDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: `{
          products(first: 1) {
            edges {
              node {
                id
                title
              }
            }
          }
        }`,
      }),
    });

    const productsData = await productsResponse.json();

    if (productsData.errors) {
      logger.error('❌ Products query failed:', productsData.errors);
      process.exit(1);
    }

    const productCount = productsData.data?.products?.edges?.length || 0;
    logger.info(`✅ Products query successful! Found ${productCount > 0 ? 'products' : 'no products (store may be empty)'}`);

    logger.info('\n4. Checking for source_url metafield...');

    const metafieldResponse = await fetch(`https://${storeDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: `{
          metafieldDefinitions(first: 10, ownerType: PRODUCT, namespace: "custom", key: "source_url") {
            edges {
              node {
                id
                name
                namespace
                key
                type {
                  name
                }
              }
            }
          }
        }`,
      }),
    });

    const metafieldData = await metafieldResponse.json();

    if (metafieldData.data?.metafieldDefinitions?.edges?.length > 0) {
      logger.info('✅ source_url metafield found!');
      const metafield = metafieldData.data.metafieldDefinitions.edges[0].node;
      logger.info(`   Name: ${metafield.name}`);
      logger.info(`   Type: ${metafield.type.name}`);
    } else {
      logger.warn('⚠️  source_url metafield NOT found');
      logger.info('\n   To create it:');
      logger.info('   1. Shopify Admin → Settings → Custom data → Products');
      logger.info('   2. Add definition:');
      logger.info('      - Namespace: custom');
      logger.info('      - Key: source_url');
      logger.info('      - Type: Single line text');
      logger.info('      - Filterable: ✅ Enable');
    }

    logger.info('\n✅ All checks passed!');
    logger.info('\nYour Shopify configuration is correct.');
    logger.info('Next steps:');
    logger.info('  1. Create source_url metafield (if not found)');
    logger.info('  2. Link products with supplier URLs');
    logger.info('  3. Run: npm run test:components');

  } catch (error) {
    logger.error('❌ Connection test failed:', {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof TypeError && error.message.includes('fetch')) {
      logger.error('\n🌐 Network Error:');
      logger.error('   Could not connect to Shopify API.');
      logger.error('   Check your internet connection and firewall settings.');
    }

    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyShopify().catch(error => {
    logger.error('Verification failed', { error: error.message });
    process.exit(1);
  });
}

export { verifyShopify };
