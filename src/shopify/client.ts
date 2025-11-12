import { shopifyApi, LATEST_API_VERSION, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { ShopifyProduct, ShopifyPriceUpdate } from '../types/index.js';
import { canonicalizeUrl } from '../utils/canonicalize.js';

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
   * @param sourceUrl - The source URL to search for (will be canonicalized)
   */
  async getProductBySourceUrl(sourceUrl: string): Promise<ShopifyProduct | null> {
    // CRITICAL: Canonicalize URL to match stored format
    const canonicalUrl = canonicalizeUrl(sourceUrl);

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

    try {
      const client = new this.shopify.clients.Graphql({ session: this.session });

      // Try to find product by canonical URL
      const response = await client.request(query, {
        variables: {
          metafield: `metafields.custom.source_url:"${canonicalUrl}"`,
        },
      });

      const body = response.data as {
        products?: {
          edges: Array<{
            node: ShopifyProduct;
          }>;
        };
      };

      const products = body.products?.edges;

      if (!products || products.length === 0) {
        logger.debug('No Shopify product found for source URL', {
          original: sourceUrl,
          canonical: canonicalUrl
        });
        return null;
      }

      logger.debug('Found Shopify product by source URL', {
        original: sourceUrl,
        canonical: canonicalUrl,
        productId: products[0].node.id
      });

      return products[0].node;
    } catch (error) {
      logger.error('Failed to fetch Shopify product by source URL', {
        sourceUrl,
        canonicalUrl,
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

    const productMap = new Map<string, ShopifyProduct>();
    let hasNextPage = true;
    let cursor: string | null = null;

    try {
      const client = new this.shopify.clients.Graphql({ session: this.session });

      while (hasNextPage) {
        const response = await client.request(query, {
          variables: { cursor },
        });

        const body = response.data as {
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

        const products = body.products;

        if (!products) break;

        // Extract source_url from metafields
        for (const edge of products.edges) {
          const product = edge.node;
          const sourceUrlMetafield = product.metafields?.edges.find(
            m => m.node.namespace === 'custom' && m.node.key === 'source_url'
          );

          if (sourceUrlMetafield) {
            // CRITICAL: Canonicalize URL to match scraped URLs format
            const canonicalUrl = canonicalizeUrl(sourceUrlMetafield.node.value);
            productMap.set(canonicalUrl, product);
            logger.debug('Shopify product cached with canonical URL', {
              original: sourceUrlMetafield.node.value,
              canonical: canonicalUrl,
              title: product.title
            });
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
        // Use the productId directly from the update object
        const productId = update.productId;

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

          const response = await client.request(mutation, {
            variables: {
              productId,
              variants,
            },
          });

          const body = response.data as {
            productVariantsBulkUpdate?: {
              userErrors: Array<{ field: string[]; message: string }>;
            };
          };

          const userErrors = body.productVariantsBulkUpdate?.userErrors;

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

      const response = await client.request(query);

      const body = response.data as {
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

      const definitions = body.metafieldDefinitions?.edges;

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

  /**
   * Update product status (ACTIVE or ARCHIVED)
   */
  async updateProductStatus(
    productId: string,
    status: 'ACTIVE' | 'ARCHIVED'
  ): Promise<{ success: boolean; errors: string[] }> {
    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const client = new this.shopify.clients.Graphql({ session: this.session });

      const response = await client.request(mutation, {
        variables: {
          input: {
            id: productId,
            status: status,
          },
        },
      });

      const body = response.data as {
        productUpdate?: {
          product?: {
            id: string;
            status: string;
          };
          userErrors: Array<{ field: string[]; message: string }>;
        };
      };

      const userErrors = body.productUpdate?.userErrors;

      if (userErrors && userErrors.length > 0) {
        const errors = userErrors.map(e => `${e.field.join('.')}: ${e.message}`);
        logger.warn('Shopify product status update had errors', { productId, errors });
        return { success: false, errors };
      }

      logger.info('Shopify product status updated', {
        productId,
        status,
        newStatus: body.productUpdate?.product?.status,
      });

      return { success: true, errors: [] };
    } catch (error) {
      logger.error('Failed to update Shopify product status', {
        productId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export const shopifyClient = new ShopifyClient();
