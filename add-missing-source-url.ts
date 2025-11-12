import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { config } from './src/utils/config.js';
import { canonicalizeUrl } from './src/utils/canonicalize.js';

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

const PRODUCT_ID = 'gid://shopify/Product/8962440921337';
const SOURCE_URL = 'https://www.hondaoutdoors.co.nz/umk450-bull-handle';

(async () => {
  try {
    console.log('Adding source_url metafield to product...\n');
    console.log('Product ID:', PRODUCT_ID);
    console.log('Source URL:', SOURCE_URL);
    console.log('Canonical URL:', canonicalizeUrl(SOURCE_URL));

    const mutation = `
      mutation addSourceUrlMetafield($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            metafields(first: 20, namespace: "custom") {
              edges {
                node {
                  namespace
                  key
                  value
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const client = new shopify.clients.Graphql({ session });

    const response = await client.request(mutation, {
      variables: {
        input: {
          id: PRODUCT_ID,
          metafields: [
            {
              namespace: 'custom',
              key: 'source_url',
              value: canonicalizeUrl(SOURCE_URL),
              type: 'url'
            }
          ]
        }
      }
    });

    const body = response.data as any;

    if (body.productUpdate.userErrors && body.productUpdate.userErrors.length > 0) {
      console.error('\n✗ Error updating product:');
      body.productUpdate.userErrors.forEach((error: any) => {
        console.error(`  - ${error.field}: ${error.message}`);
      });
    } else {
      console.log('\n✓ Successfully added source_url metafield!');
      console.log('\nProduct:', body.productUpdate.product.title);
      console.log('\nMetafields:');
      body.productUpdate.product.metafields.edges.forEach((edge: any) => {
        console.log(`  ${edge.node.namespace}.${edge.node.key}: ${edge.node.value}`);
      });
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
})();
