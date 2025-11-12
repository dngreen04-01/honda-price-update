import { config } from './src/utils/config.js';
import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';

async function checkShopifyActual() {
  const shopify = shopifyApi({
    apiKey: 'not-needed-for-custom-app',
    apiSecretKey: 'not-needed-for-custom-app',
    scopes: [],
    hostName: config.shopify.storeDomain,
    apiVersion: (config.shopify.apiVersion as typeof LATEST_API_VERSION) || LATEST_API_VERSION,
    isCustomStoreApp: true,
    isEmbeddedApp: false,
    adminApiAccessToken: config.shopify.accessToken,
  });

  const session = shopify.session.customAppSession(config.shopify.storeDomain);
  session.accessToken = config.shopify.accessToken;

  const query = `
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        variants(first: 1) {
          edges {
            node {
              id
              sku
              price
              compareAtPrice
            }
          }
        }
      }
    }
  `;

  const productId = 'gid://shopify/Product/8962441511161';

  console.log('\n=== Querying Shopify Directly ===');
  console.log('Product ID:', productId);

  try {
    const client = new shopify.clients.Graphql({ session });
    const response = await client.request(query, {
      variables: { id: productId },
    });

    const body = response.data as {
      product?: {
        id: string;
        title: string;
        variants: {
          edges: Array<{
            node: {
              id: string;
              sku: string;
              price: string;
              compareAtPrice: string | null;
            };
          }>;
        };
      };
    };

    if (body.product) {
      console.log('\n✅ Product Found:');
      console.log('  Title:', body.product.title);

      const variant = body.product.variants.edges[0]?.node;
      if (variant) {
        console.log('\n✅ Variant:');
        console.log('  ID:', variant.id);
        console.log('  SKU:', variant.sku);
        console.log('  Price:', variant.price);
        console.log('  Compare At Price:', variant.compareAtPrice);
      }
    } else {
      console.log('\n❌ Product not found');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

checkShopifyActual()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
