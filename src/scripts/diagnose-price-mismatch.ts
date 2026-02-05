#!/usr/bin/env npx ts-node
/**
 * Diagnose price mismatches between database cache and actual Shopify prices
 * This script fetches current prices from Shopify and compares with cache
 */

import { shopifyClient } from '../shopify/client.js';
import { supabase } from '../database/client.js';

interface PriceMismatch {
  sku: string;
  title: string;
  sourceUrl: string;
  cachePrice: number | null;
  shopifyPrice: number | null;
  scrapedPrice: number | null;
  difference: number;
  productId: string;
  variantId: string;
}

async function diagnose() {
  console.log('='.repeat(80));
  console.log('PRICE MISMATCH DIAGNOSTIC');
  console.log('='.repeat(80));

  // Get all products from cache
  const { data: cacheData, error: cacheError } = await supabase
    .from('shopify_catalog_cache')
    .select('*')
    .not('shopify_product_id', 'is', null)
    .order('variant_sku');

  if (cacheError) {
    console.error('Failed to fetch cache data:', cacheError);
    return;
  }

  console.log(`\nFound ${cacheData?.length || 0} products in cache\n`);

  // Get actual prices from Shopify
  const shopifyProducts = await shopifyClient.getAllProductsWithSourceUrl();
  console.log(`Found ${shopifyProducts.size} products in Shopify\n`);

  const mismatches: PriceMismatch[] = [];
  let matched = 0;
  let noShopifyData = 0;

  for (const cache of cacheData || []) {
    // Find matching Shopify product
    let shopifyVariant = null;

    for (const [url, product] of shopifyProducts.entries()) {
      if (url === cache.source_url_canonical) {
        shopifyVariant = product.variants?.edges[0]?.node;
        break;
      }
    }

    if (!shopifyVariant) {
      noShopifyData++;
      continue;
    }

    const shopifyPrice = parseFloat(shopifyVariant.price);
    const cachePrice = cache.shopify_price;
    const scrapedPrice = cache.scraped_sale_price;

    // Check if there's a mismatch
    if (shopifyPrice !== cachePrice || (scrapedPrice !== null && shopifyPrice !== scrapedPrice)) {
      mismatches.push({
        sku: cache.variant_sku || 'NO-SKU',
        title: cache.product_title || 'Unknown',
        sourceUrl: cache.source_url_canonical,
        cachePrice,
        shopifyPrice,
        scrapedPrice,
        difference: scrapedPrice !== null ? shopifyPrice - scrapedPrice : shopifyPrice - (cachePrice || 0),
        productId: cache.shopify_product_id,
        variantId: cache.shopify_variant_id,
      });
    } else {
      matched++;
    }
  }

  // Report results
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Prices matched:     ${matched}`);
  console.log(`Price mismatches:   ${mismatches.length}`);
  console.log(`No Shopify data:    ${noShopifyData}`);
  console.log();

  if (mismatches.length > 0) {
    console.log('='.repeat(80));
    console.log('MISMATCHED PRODUCTS');
    console.log('='.repeat(80));
    console.log();

    // Sort by absolute difference
    mismatches.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

    for (const m of mismatches) {
      console.log(`SKU: ${m.sku}`);
      console.log(`Title: ${m.title}`);
      console.log(`  Shopify Price (actual):  $${m.shopifyPrice?.toLocaleString()}`);
      console.log(`  Cache Price:             $${m.cachePrice?.toLocaleString() || 'null'}`);
      console.log(`  Scraped Price (target):  $${m.scrapedPrice?.toLocaleString() || 'null'}`);
      console.log(`  Difference:              $${m.difference?.toLocaleString()}`);
      console.log(`  Product ID: ${m.productId}`);
      console.log(`  Variant ID: ${m.variantId}`);
      console.log();
    }

    // Generate fix commands
    console.log('='.repeat(80));
    console.log('TO FIX THESE MISMATCHES, run:');
    console.log('='.repeat(80));
    console.log('\nnpx ts-node src/scripts/force-sync-mismatches.ts\n');
  }

  return mismatches;
}

diagnose().catch(console.error);
