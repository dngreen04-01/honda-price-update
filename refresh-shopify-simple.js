import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// URL Canonicalization function (imported from src/utils/canonicalize.ts logic)
function canonicalizeUrl(url) {
  try {
    const urlObj = new URL(url);

    // Lowercase and remove www
    let host = urlObj.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.substring(4);
    }

    // Lowercase pathname and remove trailing slash (unless it's just '/')
    let pathname = urlObj.pathname.toLowerCase();
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    // Filter out tracking parameters
    const TRACKING_PARAMS = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'gclid', 'fbclid', 'msclkid', '_ga', 'mc_cid', 'mc_eid'
    ];

    const searchParams = new URLSearchParams(urlObj.search);
    const filteredParams = new URLSearchParams();

    for (const [key, value] of searchParams.entries()) {
      if (!TRACKING_PARAMS.includes(key.toLowerCase())) {
        filteredParams.append(key, value);
      }
    }

    // Sort parameters for consistency
    filteredParams.sort();

    // Reconstruct URL
    const canonicalUrl = new URL(pathname, `${urlObj.protocol}//${host}`);
    canonicalUrl.search = filteredParams.toString();

    // Add hash if present
    if (urlObj.hash) {
      canonicalUrl.hash = urlObj.hash;
    }

    return canonicalUrl.toString();
  } catch (error) {
    console.warn(`Failed to canonicalize URL: ${url}`, error);
    return url;
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const apiVersion = '2024-01';

async function fetchShopifyProducts() {
  console.log('Fetching products from Shopify...\n');

  const query = `
    query getAllProductsWithSourceUrl($cursor: String) {
      products(first: 250, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                }
              }
            }
            metafields(first: 50, namespace: "custom") {
              edges {
                node {
                  namespace
                  key
                  value
                }
              }
            }
          }
        }
      }
    }
  `;

  const productMap = new Map();
  let hasNextPage = true;
  let cursor = null;
  let totalFetched = 0;

  while (hasNextPage) {
    const response = await fetch(`https://${storeDomain}/admin/api/${apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables: { cursor } }),
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    const products = data.data?.products;
    if (!products) break;

    for (const edge of products.edges) {
      const product = edge.node;
      const sourceUrlMetafield = product.metafields?.edges.find(
        m => m.node.namespace === 'custom' && m.node.key === 'source_url'
      );

      if (sourceUrlMetafield) {
        // CRITICAL: Canonicalize URL to match scraped URLs format
        const originalUrl = sourceUrlMetafield.node.value;
        const canonicalUrl = canonicalizeUrl(originalUrl);
        productMap.set(canonicalUrl, product);

        if (originalUrl !== canonicalUrl) {
          console.log(`  Canonicalized: ${originalUrl} → ${canonicalUrl}`);
        }
      }
    }

    totalFetched += products.edges.length;
    console.log(`Fetched ${totalFetched} products...`);

    hasNextPage = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;
  }

  console.log(`\n✅ Found ${productMap.size} products with source_url metafield\n`);
  return productMap;
}

async function updateDatabase(productMap) {
  console.log('Updating database...\n');

  let cached = 0;
  let errors = 0;

  for (const [canonicalUrl, product] of productMap.entries()) {
    try {
      const variant = product.variants?.edges[0]?.node;

      if (!variant) {
        console.warn(`⚠️  No variant for product ${product.id}`);
        continue;
      }

      const price = parseFloat(variant.price);
      const compareAtPrice = variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null;

      // Store with canonical URL for consistent matching
      const { error } = await supabase
        .from('shopify_catalog_cache')
        .upsert(
          {
            shopify_product_id: product.id,
            shopify_variant_id: variant.id,
            source_url_canonical: canonicalUrl,  // Already canonicalized
            shopify_price: price,
            shopify_compare_at_price: compareAtPrice,
            product_title: product.title,
            variant_title: variant.title || product.title,
            variant_sku: variant.sku,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'shopify_variant_id' }
        );

      if (error) {
        console.error(`❌ Error updating ${canonicalUrl}:`, error.message);
        errors++;
      } else {
        cached++;
        if (cached % 50 === 0) {
          console.log(`Updated ${cached} products...`);
        }
      }
    } catch (error) {
      console.error(`❌ Error processing ${canonicalUrl}:`, error.message);
      errors++;
    }
  }

  console.log(`\n✅ Successfully updated ${cached} products`);
  if (errors > 0) {
    console.log(`❌ Failed to update ${errors} products`);
  }

  return { cached, errors };
}

async function main() {
  console.log('=== Refreshing Shopify Catalog Cache ===\n');

  try {
    const productMap = await fetchShopifyProducts();
    const result = await updateDatabase(productMap);

    console.log('\n=== Refresh Complete ===');
    console.log(`Total products updated: ${result.cached}`);
    console.log(`Failed updates: ${result.errors}`);
    console.log('\nYou can now view the updated data in the Price Comparison table!');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Refresh failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
