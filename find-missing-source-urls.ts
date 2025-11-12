import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { config } from './src/utils/config.js';

const shopify = shopifyApi({
  apiKey: 'not-needed-for-custom-app',
  apiSecretKey: 'not-needed-for-custom-app',
  scopes: [],
  hostName: config.shopify.storeDomain,
  apiVersion: config.shopify.apiVersion as typeof LATEST_API_VERSION || LATEST_API_VERSION,
  isCustomStoreApp: true,
  isEmbeddedApp: false,
  adminApiAccessToken: config.shopify.accessToken,
});

const session = shopify.session.customAppSession(config.shopify.storeDomain);
session.accessToken = config.shopify.accessToken;

(async () => {
  try {
    console.log('Scanning all Shopify products for missing source_url metafields...\n');

    const query = `
      query getAllProducts($cursor: String) {
        products(first: 250, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              handle
              variants(first: 50) {
                edges {
                  node {
                    id
                    title
                    sku
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
      }
    `;

    const client = new shopify.clients.Graphql({ session });
    let hasNextPage = true;
    let cursor: string | null = null;
    let totalProducts = 0;
    let totalVariants = 0;
    let productsWithSourceUrl = 0;
    let productsMissingSourceUrl = 0;
    const missingProducts: Array<{
      id: string;
      title: string;
      handle: string;
      variantCount: number;
      hasMetafields: boolean;
    }> = [];

    while (hasNextPage) {
      const response = await client.request(query, {
        variables: { cursor },
      });

      const body = response.data as any;
      const products = body.products;

      if (!products) break;

      for (const edge of products.edges) {
        const product = edge.node;
        totalProducts++;
        totalVariants += product.variants.edges.length;

        // Check for source_url metafield
        const sourceUrlMetafield = product.metafields?.edges.find(
          (m: any) => m.node.namespace === 'custom' && m.node.key === 'source_url'
        );

        if (sourceUrlMetafield) {
          productsWithSourceUrl++;
        } else {
          productsMissingSourceUrl++;
          missingProducts.push({
            id: product.id,
            title: product.title,
            handle: product.handle,
            variantCount: product.variants.edges.length,
            hasMetafields: product.metafields?.edges.length > 0,
          });
        }
      }

      hasNextPage = products.pageInfo.hasNextPage;
      cursor = products.pageInfo.endCursor;

      process.stdout.write(`\rScanned ${totalProducts} products...`);
    }

    console.log('\n');
    console.log('=== SCAN RESULTS ===');
    console.log('Total products in Shopify:', totalProducts);
    console.log('Total variants:', totalVariants);
    console.log('Products WITH source_url:', productsWithSourceUrl);
    console.log('Products MISSING source_url:', productsMissingSourceUrl);
    console.log('');

    if (missingProducts.length > 0) {
      console.log('⚠️  Products missing source_url metafield:');
      console.log('');

      // Show first 20
      const toShow = missingProducts.slice(0, 20);
      toShow.forEach((p, i) => {
        console.log(`${i + 1}. ${p.title}`);
        console.log(`   Handle: ${p.handle}`);
        console.log(`   ID: ${p.id}`);
        console.log(`   Variants: ${p.variantCount}`);
        console.log('');
      });

      if (missingProducts.length > 20) {
        console.log(`... and ${missingProducts.length - 20} more`);
        console.log('');
      }

      console.log('💡 These products will NOT appear in the Price Comparison dashboard');
      console.log('   because they lack the source_url metafield.');
      console.log('');
      console.log('To fix: You need to manually add source_url metafields to these products');
      console.log('        in the Shopify admin, or modify them via the API.');
    } else {
      console.log('✅ All products have source_url metafields!');
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
})();
