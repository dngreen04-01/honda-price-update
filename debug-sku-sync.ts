import { supabase } from './src/database/client.js';
import { shopifyClient } from './src/shopify/client.js';
import { canonicalizeUrl } from './src/utils/canonicalize.js';

async function debugSKUSync(sku: string) {
  console.log(`\n=== Debugging SKU: ${sku} ===\n`);

  // 1. Find the product in shopify_catalog_cache by SKU
  console.log('Step 1: Looking up product in shopify_catalog_cache...');
  const { data: cacheData, error: cacheError } = await supabase
    .from('shopify_catalog_cache')
    .select('*')
    .eq('variant_sku', sku)
    .single();

  if (cacheError) {
    console.error('❌ Error querying cache:', cacheError.message);
    return;
  }

  if (!cacheData) {
    console.error('❌ SKU not found in cache');
    return;
  }

  console.log('✅ Found in cache:', {
    sku: cacheData.variant_sku,
    title: cacheData.product_title,
    sourceUrl: cacheData.source_url_canonical,
    shopifyPrice: cacheData.shopify_price,
    shopifyCompareAt: cacheData.shopify_compare_at_price,
    scrapedSalePrice: cacheData.scraped_sale_price,
    scrapedOriginalPrice: cacheData.scraped_original_price,
  });

  const canonicalUrl = cacheData.source_url_canonical;

  // 2. Check product_pages for scraped price data
  console.log('\nStep 2: Checking product_pages for scraped data...');
  const { data: productPage, error: ppError } = await supabase
    .from('product_pages')
    .select('*')
    .eq('canonical_url', canonicalUrl)
    .single();

  if (ppError && ppError.code !== 'PGRST116') {
    console.error('❌ Error querying product_pages:', ppError.message);
  } else if (!productPage) {
    console.log('⚠️  No data in product_pages - product needs to be scraped first');
  } else {
    console.log('✅ Found in product_pages:', {
      canonicalUrl: productPage.canonical_url,
      latestSalePrice: productPage.latest_sale_price,
      latestOriginalPrice: productPage.latest_original_price,
      lastSeenAt: productPage.last_seen_at,
      confidence: productPage.confidence,
    });

    // 3. Check if sale price logic is correct
    console.log('\nStep 3: Analyzing sale price logic...');
    const hasActiveSale =
      productPage.latest_original_price !== null &&
      productPage.latest_original_price > productPage.latest_sale_price;

    console.log('Sale Analysis:', {
      hasActiveSale,
      salePrice: productPage.latest_sale_price,
      originalPrice: productPage.latest_original_price,
      shouldSetCompareAt: hasActiveSale ? productPage.latest_original_price : null,
    });
  }

  // 4. Try to fetch from Shopify directly
  console.log('\nStep 4: Fetching product from Shopify...');
  try {
    const shopifyProduct = await shopifyClient.getProductBySourceUrl(canonicalUrl);

    if (!shopifyProduct) {
      console.log('⚠️  Product not found in Shopify by source_url metafield');
      console.log('   Canonical URL being searched:', canonicalUrl);
    } else {
      console.log('✅ Found in Shopify:', {
        productId: shopifyProduct.id,
        title: shopifyProduct.title,
      });

      const variant = shopifyProduct.variants?.edges[0]?.node;
      if (variant) {
        console.log('   First variant:', {
          variantId: variant.id,
          sku: (variant as any).sku,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
        });
      }

      // Check metafields
      const sourceUrlMetafield = shopifyProduct.metafields?.edges.find(
        m => m.node.namespace === 'custom' && m.node.key === 'source_url'
      );

      if (sourceUrlMetafield) {
        const storedUrl = sourceUrlMetafield.node.value;
        const canonicalStoredUrl = canonicalizeUrl(storedUrl);
        console.log('   Metafield source_url:', {
          stored: storedUrl,
          canonical: canonicalStoredUrl,
          matchesSearch: canonicalStoredUrl === canonicalUrl,
        });
      } else {
        console.log('   ⚠️  No source_url metafield found!');
      }
    }
  } catch (error) {
    console.error('❌ Error fetching from Shopify:', error instanceof Error ? error.message : String(error));
  }

  console.log('\n=== Debug Complete ===\n');
}

// Run debug
const sku = process.argv[2] || '4AH-BATTERY-CHARGER-COMBO';
debugSKUSync(sku)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
