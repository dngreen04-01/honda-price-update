import { shopifyApi, LATEST_API_VERSION, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { ShopifyProduct, ShopifyPriceUpdate } from '../types/index.js';

/**
 * Shopify GraphQL client for price syncing
 */
export class ShopifyClient {
  private shopify: ReturnType<typeof shopifyApi>;
  private session: Session;

  constructor() {
    this.shopify = shopifyApi({
      apiKey: 'not-needed-for-custom-app',
      apiSecretKey: 'not-needed-for-custom-app',
      scopes: [],
      hostName: config.shopify.storeDomain,
      apiVersion: (config.shopify.apiVersion as typeof LATEST_API_VERSION) || LATEST_API_VERSION,
      isCustomStoreApp: true,
      isEmbeddedApp: false,
      adminApiAccessToken: config.shopify.accessToken,
    });

    // Create session for API calls
    this.session = this.shopify.session.customAppSession(config.shopify.storeDomain);
    this.session.accessToken = config.shopify.accessToken;
  }

  /**
   * Get products by source_url metafield
   */
  async getProductBySourceUrl(sourceUrl: string): Promise<ShopifyProduct | null> {
    const query = `
      query getProductBySourceUrl($metafield: String!) {
        products(first: 1, query: $metafield) {
          edges {
            node {
              id
              title
              variants(first: 10) {
                edges {
                  node {
                    id
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

    try {
      const client = new this.shopify.clients.Graphql({ session: this.session });

      const response = await client.query({
        data: {
          query,
          variables: {
            metafield: `metafields.custom.source_url:"${sourceUrl}"`,
          },
        },
      });

      const body = response.body as {
        data?: {
          products?: {
            edges: Array<{
              node: ShopifyProduct;
            }>;
          };
        };
      };

      const products = body.data?.products?.edges;

      if (!products || products.length === 0) {
        logger.debug('No Shopify product found for source URL', { sourceUrl });
        return null;
      }

      return products[0].node;
    } catch (error) {
      logger.error('Failed to fetch Shopify product by source URL', {
        sourceUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all products with source_url metafield
   */
  async getAllProductsWithSourceUrl(): Promise<Map<string, ShopifyProduct>> {
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

    const productMap = new Map<string, ShopifyProduct>();
    let hasNextPage = true;
    let cursor: string | null = null;

    try {
      const client = new this.shopify.clients.Graphql({ session: this.session });

      while (hasNextPage) {
        const response = await client.query({
          data: {
            query,
            variables: { cursor },
          },
        });

        const body = response.body as {
          data?: {
            products?: {
              pageInfo: {
                hasNextPage: boolean;
                endCursor: string;
              };
              edges: Array<{
                node: ShopifyProduct;
              }>;
            };
          };
        };

        const products = body.data?.products;

        if (!products) break;

        // Extract source_url from metafields
        for (const edge of products.edges) {
          const product = edge.node;
          const sourceUrlMetafield = product.metafields?.edges.find(
            m => m.node.namespace === 'custom' && m.node.key === 'source_url'
          );

          if (sourceUrlMetafield) {
            productMap.set(sourceUrlMetafield.node.value, product);
          }
        }

        hasNextPage = products.pageInfo.hasNextPage;
        cursor = products.pageInfo.endCursor;
      }

      logger.info('Fetched Shopify products with source_url', { count: productMap.size });
      return productMap;
    } catch (error) {
      logger.error('Failed to fetch all Shopify products', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update variant prices
   */
  async updateVariantPrices(updates: ShopifyPriceUpdate[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const mutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product {
            id
          }
          productVariants {
            id
            price
            compareAtPrice
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      const client = new this.shopify.clients.Graphql({ session: this.session });

      // Group updates by product
      const updatesByProduct = new Map<string, ShopifyPriceUpdate[]>();

      for (const update of updates) {
        // Extract product ID from variant ID (gid://shopify/ProductVariant/12345 -> gid://shopify/Product/12345)
        const productId = update.variantId.replace('/ProductVariant/', '/Product/').split('/').slice(0, -1).join('/');

        if (!updatesByProduct.has(productId)) {
          updatesByProduct.set(productId, []);
        }
        updatesByProduct.get(productId)!.push(update);
      }

      // Execute bulk updates per product
      for (const [productId, productUpdates] of updatesByProduct.entries()) {
        try {
          const variants = productUpdates.map(u => ({
            id: u.variantId,
            price: u.price,
            compareAtPrice: u.compareAtPrice,
          }));

          const response = await client.query({
            data: {
              query: mutation,
              variables: {
                productId,
                variants,
              },
            },
          });

          const body = response.body as {
            data?: {
              productVariantsBulkUpdate?: {
                userErrors: Array<{ field: string[]; message: string }>;
              };
            };
          };

          const userErrors = body.data?.productVariantsBulkUpdate?.userErrors;

          if (userErrors && userErrors.length > 0) {
            failed += productUpdates.length;
            errors.push(...userErrors.map(e => `${e.field.join('.')}: ${e.message}`));
            logger.warn('Shopify bulk update had errors', { productId, userErrors });
          } else {
            success += productUpdates.length;
            logger.debug('Shopify bulk update successful', { productId, count: productUpdates.length });
          }
        } catch (error) {
          failed += productUpdates.length;
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(errorMsg);
          logger.error('Shopify bulk update failed', { productId, error: errorMsg });
        }

        // Rate limiting - wait 500ms between product updates
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      logger.info('Shopify price sync completed', { success, failed, errorCount: errors.length });

      return { success, failed, errors };
    } catch (error) {
      logger.error('Shopify price sync failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Verify source_url metafield exists and is filterable
   */
  async verifySourceUrlMetafield(): Promise<boolean> {
    const query = `
      query {
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
              validations {
                name
                value
              }
            }
          }
        }
      }
    `;

    try {
      const client = new this.shopify.clients.Graphql({ session: this.session });

      const response = await client.query({
        data: { query },
      });

      const body = response.body as {
        data?: {
          metafieldDefinitions?: {
            edges: Array<{
              node: {
                id: string;
                name: string;
                namespace: string;
                key: string;
              };
            }>;
          };
        };
      };

      const definitions = body.data?.metafieldDefinitions?.edges;

      if (!definitions || definitions.length === 0) {
        logger.warn('source_url metafield not found - it may need to be created in Shopify admin');
        return false;
      }

      logger.info('source_url metafield verified', { definition: definitions[0].node });
      return true;
    } catch (error) {
      logger.error('Failed to verify source_url metafield', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

export const shopifyClient = new ShopifyClient();
