#!/usr/bin/env npx ts-node
/**
 * Force sync prices that are mismatched between DB and Shopify
 * This bypasses the cache comparison and pushes scraped prices directly to Shopify
 */

import { shopifyClient } from '../shopify/client.js';
import { supabase } from '../database/client.js';
import { upsertShopifyCatalogCache } from '../database/queries.js';
import { ShopifyPriceUpdate } from '../types/index.js';

async function forceSync() {
  console.log('='.repeat(80));
  console.log('FORCE SYNC MISMATCHED PRICES');
  console.log('='.repeat(80));

  // Get all products from cache that have scraped prices
  const { data: cacheData, error: cacheError } = await supabase
    .from('shopify_catalog_cache')
    .select('*')
    .not('shopify_product_id', 'is', null)
    .not('shopify_variant_id', 'is', null)
    .not('scraped_sale_price', 'is', null)
    .order('variant_sku');

  if (cacheError) {
    console.error('Failed to fetch cache data:', cacheError);
    return;
  }

  console.log(`\nFound ${cacheData?.length || 0} products with scraped prices\n`);

  // Get actual prices from Shopify
  const shopifyProducts = await shopifyClient.getAllProductsWithSourceUrl();
  console.log(`Found ${shopifyProducts.size} products in Shopify\n`);

  const updates: ShopifyPriceUpdate[] = [];
  const updateDetails: Array<{
    sku: string;
    title: string;
    oldPrice: number;
    newPrice: number;
    productId: string;
    variantId: string;
    sourceUrl: string;
  }> = [];

  for (const cache of cacheData || []) {
    // Find matching Shopify product
    let shopifyVariant = null;

    for (const [url, product] of shopifyProducts.entries()) {
      if (url === cache.source_url_canonical) {
        shopifyVariant = product.variants?.edges[0]?.node;
        break;
      }
    }

    if (!shopifyVariant) continue;

    const shopifyPrice = parseFloat(shopifyVariant.price);
    const targetPrice = cache.scraped_sale_price;
    const targetCompareAt = cache.scraped_original_price;

    // Only update if prices don't match
    if (shopifyPrice !== targetPrice) {
      updates.push({
        productId: cache.shopify_product_id,
        variantId: cache.shopify_variant_id,
        price: targetPrice.toFixed(2),
        compareAtPrice: targetCompareAt && targetCompareAt > targetPrice
          ? targetCompareAt.toFixed(2)
          : null,
      });

      updateDetails.push({
        sku: cache.variant_sku || 'NO-SKU',
        title: cache.product_title || 'Unknown',
        oldPrice: shopifyPrice,
        newPrice: targetPrice,
        productId: cache.shopify_product_id,
        variantId: cache.shopify_variant_id,
        sourceUrl: cache.source_url_canonical,
      });
    }
  }

  if (updates.length === 0) {
    console.log('✅ All prices are already in sync!');
    return;
  }

  console.log('='.repeat(80));
  console.log(`FOUND ${updates.length} PRODUCTS TO UPDATE`);
  console.log('='.repeat(80));
  console.log();

  for (const detail of updateDetails) {
    console.log(`${detail.sku}: $${detail.oldPrice.toLocaleString()} → $${detail.newPrice.toLocaleString()}`);
  }
  console.log();

  // Confirm before proceeding
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question('Proceed with updates? (yes/no): ', resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'yes') {
    console.log('Aborted.');
    return;
  }

  console.log('\nPushing updates to Shopify...\n');

  // Execute the updates
  const result = await shopifyClient.updateVariantPrices(updates);

  console.log('='.repeat(80));
  console.log('RESULTS');
  console.log('='.repeat(80));
  console.log(`Success: ${result.success}`);
  console.log(`Failed:  ${result.failed}`);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
  }

  // Update cache only for successful updates
  if (result.success > 0) {
    console.log('\nUpdating cache with confirmed Shopify prices...');

    for (const detail of updateDetails.slice(0, result.success)) {
      const cache = cacheData?.find(c => c.shopify_variant_id === detail.variantId);
      if (cache) {
        await upsertShopifyCatalogCache(
          cache.shopify_product_id,
          cache.shopify_variant_id,
          cache.source_url_canonical,
          detail.newPrice,
          cache.scraped_original_price && cache.scraped_original_price > detail.newPrice
            ? cache.scraped_original_price
            : null,
          cache.product_title,
          cache.variant_title,
          cache.variant_sku
        );
      }
    }

    console.log('Cache updated.');
  }

  console.log('\n✅ Force sync complete!');
}

forceSync().catch(console.error);
