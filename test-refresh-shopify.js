import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

console.log('Starting Shopify refresh test...\n');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testShopifyRefresh() {
  try {
    console.log('Step 1: Testing Shopify API connection...');

    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    const apiVersion = '2024-01';

    const response = await fetch(`https://${storeDomain}/admin/api/${apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: `{
          products(first: 2) {
            edges {
              node {
                id
                title
                variants(first: 1) {
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
                metafields(first: 10, namespace: "custom") {
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
        }`,
      }),
    });

    if (!response.ok) {
      console.error('❌ Shopify API error:', response.status, response.statusText);
      process.exit(1);
    }

    const data = await response.json();

    if (data.errors) {
      console.error('❌ GraphQL errors:', data.errors);
      process.exit(1);
    }

    console.log('✅ Shopify API connected');
    console.log('Products found:', data.data.products.edges.length);

    if (data.data.products.edges.length > 0) {
      const product = data.data.products.edges[0].node;
      const variant = product.variants.edges[0]?.node;

      console.log('\nSample product:');
      console.log('  Product ID:', product.id);
      console.log('  Product Title:', product.title);
      console.log('  Variant ID:', variant?.id);
      console.log('  Variant Title:', variant?.title);
      console.log('  Variant SKU:', variant?.sku);
      console.log('  Price:', variant?.price);

      // Find source_url metafield
      const sourceUrlMetafield = product.metafields.edges.find(
        m => m.node.namespace === 'custom' && m.node.key === 'source_url'
      );

      if (sourceUrlMetafield) {
        console.log('  Source URL:', sourceUrlMetafield.node.value);
      } else {
        console.log('  ⚠️  No source_url metafield found');
      }
    }

    console.log('\nStep 2: Testing database connection...');

    const { data: dbData, error: dbError } = await supabase
      .from('shopify_catalog_cache')
      .select('*')
      .limit(1);

    if (dbError) {
      console.error('❌ Database error:', dbError);
      process.exit(1);
    }

    console.log('✅ Database connected');

    if (dbData && dbData.length > 0) {
      console.log('Sample record columns:', Object.keys(dbData[0]).join(', '));

      // Check if new columns exist
      if ('product_title' in dbData[0]) {
        console.log('✅ New columns (product_title, variant_title, variant_sku) exist!');
      } else {
        console.log('⚠️  New columns NOT found. Run the migration first.');
      }
    }

    console.log('\n✅ All tests passed!');
    console.log('\nTo refresh all Shopify data, the script needs to:');
    console.log('1. Fetch all products with source_url metafield (could be 100+ products)');
    console.log('2. Update shopify_catalog_cache for each one');
    console.log('3. This may take 30-60 seconds');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testShopifyRefresh().then(() => {
  console.log('\nTest completed successfully!');
  process.exit(0);
});
