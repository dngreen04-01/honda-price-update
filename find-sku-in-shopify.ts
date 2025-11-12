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
    console.log('Searching for SKU: UMK450TU3UT in all Shopify products...\n');

    const query = `
      query searchBySKU($cursor: String) {
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
      }
    `;

    const client = new shopify.clients.Graphql({ session });
    let hasNextPage = true;
    let cursor: string | null = null;
    let totalProducts = 0;
    let totalVariants = 0;
    let found = false;

    while (hasNextPage && !found) {
      const response = await client.request(query, {
        variables: { cursor },
      });

      const body = response.data as any;
      const products = body.products;

      if (!products) break;

      for (const edge of products.edges) {
        const product = edge.node;
        totalProducts++;

        for (const variantEdge of product.variants.edges) {
          totalVariants++;
          const variant = variantEdge.node;

          if (variant.sku === 'UMK450TU3UT') {
            console.log('✓ FOUND IN SHOPIFY!\n');
            console.log('Product ID:', product.id);
            console.log('Product Title:', product.title);
            console.log('Product Handle:', product.handle);
            console.log('\nVariant ID:', variant.id);
            console.log('Variant Title:', variant.title);
            console.log('SKU:', variant.sku);
            console.log('Price:', variant.price);
            console.log('Compare At Price:', variant.compareAtPrice);

            // Check for source_url metafield
            const sourceUrlMetafield = product.metafields?.edges.find(
              (m: any) => m.node.namespace === 'custom' && m.node.key === 'source_url'
            );

            if (sourceUrlMetafield) {
              console.log('\nsource_url metafield:', sourceUrlMetafield.node.value);
            } else {
              console.log('\n⚠️  WARNING: Product does NOT have a source_url metafield!');
              console.log('This is why it\'s not in the database.');
            }

            found = true;
            break;
          }
        }

        if (found) break;
      }

      hasNextPage = products.pageInfo.hasNextPage;
      cursor = products.pageInfo.endCursor;

      if (!found) {
        console.log(`Searched ${totalProducts} products, ${totalVariants} variants...`);
      }
    }

    if (!found) {
      console.log('\n✗ SKU NOT FOUND in Shopify');
      console.log(`Searched ${totalProducts} products with ${totalVariants} total variants`);
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
})();
