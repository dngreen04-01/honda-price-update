import { shopifyApi, LATEST_API_VERSION, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { ShopifyProduct, ShopifyPriceUpdate, CreateProductInput, CreateMetafieldInput } from '../types/index.js';
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

  /**
   * Upload a file to Shopify via staged uploads
   * @param sourceUrl - URL of the file to upload
   * @param filename - Name for the file in Shopify
   * @param contentType - MIME type (e.g., 'image/jpeg')
   * @returns Shopify file GID for use in metafields
   */
  async uploadFile(sourceUrl: string, filename: string, contentType: string): Promise<string | null> {
    const stagedUploadMutation = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const fileCreateMutation = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            alt
            ... on MediaImage {
              id
              image {
                url
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

    try {
      const client = new this.shopify.clients.Graphql({ session: this.session });

      // Step 1: Create staged upload target
      const stagedResponse = await client.request(stagedUploadMutation, {
        variables: {
          input: [{
            filename,
            mimeType: contentType,
            resource: 'FILE',
            httpMethod: 'POST',
          }],
        },
      });

      const stagedBody = stagedResponse.data as {
        stagedUploadsCreate?: {
          stagedTargets: Array<{
            url: string;
            resourceUrl: string;
            parameters: Array<{ name: string; value: string }>;
          }>;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      };

      const stagedErrors = stagedBody.stagedUploadsCreate?.userErrors;
      if (stagedErrors && stagedErrors.length > 0) {
        logger.error('Staged upload creation failed', { errors: stagedErrors });
        return null;
      }

      const target = stagedBody.stagedUploadsCreate?.stagedTargets?.[0];
      if (!target) {
        logger.error('No staged upload target returned');
        return null;
      }

      // Step 2: Fetch the image from source URL
      const imageResponse = await fetch(sourceUrl);
      if (!imageResponse.ok) {
        logger.error('Failed to fetch image from source', { sourceUrl, status: imageResponse.status });
        return null;
      }
      const imageBuffer = await imageResponse.arrayBuffer();

      // Step 3: Upload to Shopify's staged target
      const formData = new FormData();
      for (const param of target.parameters) {
        formData.append(param.name, param.value);
      }
      formData.append('file', new Blob([imageBuffer], { type: contentType }), filename);

      const uploadResponse = await fetch(target.url, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        logger.error('Failed to upload to staged target', { status: uploadResponse.status });
        return null;
      }

      // Step 4: Create file from staged upload
      const fileResponse = await client.request(fileCreateMutation, {
        variables: {
          files: [{
            alt: filename,
            contentType: 'IMAGE',
            originalSource: target.resourceUrl,
          }],
        },
      });

      const fileBody = fileResponse.data as {
        fileCreate?: {
          files: Array<{ id: string }>;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      };

      const fileErrors = fileBody.fileCreate?.userErrors;
      if (fileErrors && fileErrors.length > 0) {
        logger.error('File creation failed', { errors: fileErrors });
        return null;
      }

      const fileId = fileBody.fileCreate?.files?.[0]?.id;
      if (!fileId) {
        logger.error('No file ID returned');
        return null;
      }

      logger.info('File uploaded to Shopify', { filename, fileId });
      return fileId;
    } catch (error) {
      logger.error('Failed to upload file to Shopify', {
        sourceUrl,
        filename,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Create a new product in Shopify
   * Uses the new productCreate API with ProductCreateInput (not deprecated ProductInput)
   * A default variant is created automatically, then we update it with price/SKU
   */
  async createProduct(input: CreateProductInput): Promise<{
    productId: string;
    variantId: string;
  } | null> {
    // Step 1: Create product with ProductCreateInput (default variant created automatically)
    const createMutation = `
      mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
        productCreate(product: $product, media: $media) {
          product {
            id
            title
            handle
            variants(first: 1) {
              nodes {
                id
                inventoryItem {
                  id
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

    // Step 2: Update the default variant with price and inventoryPolicy
    const updateVariantMutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            sku
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Step 3: Update inventory item to set SKU
    const updateInventoryItemMutation = `
      mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) {
          inventoryItem {
            id
            sku
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

      // Build metafields array for GraphQL
      const metafields = input.metafields.map((mf: CreateMetafieldInput) => ({
        namespace: mf.namespace,
        key: mf.key,
        value: mf.value,
        type: mf.type,
      }));

      // Get variant data for later update
      const variant = input.variants[0];

      // Build media array if variant has image
      const media = variant?.imageSrc ? [{
        originalSource: variant.imageSrc,
        mediaContentType: 'IMAGE',
      }] : [];

      // Step 1: Create the product (default variant created automatically)
      const createResponse = await client.request(createMutation, {
        variables: {
          product: {
            title: input.title,
            descriptionHtml: input.descriptionHtml,
            vendor: input.vendor,
            status: input.status,
            category: 'gid://shopify/TaxonomyCategory/vp-2-2-3', // Motorbikes category
            templateSuffix: input.templateSuffix || 'motorbikes', // Theme template
            metafields,
          },
          media: media.length > 0 ? media : undefined,
        },
      });

      const createBody = createResponse.data as {
        productCreate?: {
          product?: {
            id: string;
            title: string;
            handle: string;
            variants: {
              nodes: Array<{
                id: string;
                inventoryItem: {
                  id: string;
                };
              }>;
            };
          };
          userErrors: Array<{ field: string[]; message: string }>;
        };
      };

      const createErrors = createBody.productCreate?.userErrors;
      if (createErrors && createErrors.length > 0) {
        logger.error('Product creation failed', { errors: createErrors });
        return null;
      }

      const product = createBody.productCreate?.product;
      if (!product) {
        logger.error('No product returned from creation');
        return null;
      }

      const variantNode = product.variants.nodes[0];
      const variantId = variantNode?.id;
      const inventoryItemId = variantNode?.inventoryItem?.id;

      if (!variantId) {
        logger.error('No variant ID returned from creation');
        return null;
      }

      logger.info('Product created in Shopify, updating variant...', {
        productId: product.id,
        variantId,
        inventoryItemId,
        title: product.title,
      });

      // Step 2: Update the default variant with price and inventoryPolicy
      if (variant) {
        const updateResponse = await client.request(updateVariantMutation, {
          variables: {
            productId: product.id,
            variants: [{
              id: variantId,
              price: variant.price,
              inventoryPolicy: variant.inventoryPolicy,
            }],
          },
        });

        const updateBody = updateResponse.data as {
          productVariantsBulkUpdate?: {
            productVariants: Array<{ id: string; sku: string; price: string }>;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        };

        const updateErrors = updateBody.productVariantsBulkUpdate?.userErrors;
        if (updateErrors && updateErrors.length > 0) {
          logger.warn('Variant update had errors (product was still created)', { errors: updateErrors });
        } else {
          logger.info('Variant price/policy updated successfully', {
            price: variant.price,
          });
        }

        // Step 3: Update inventory item to set SKU
        if (inventoryItemId && variant.sku) {
          const skuResponse = await client.request(updateInventoryItemMutation, {
            variables: {
              id: inventoryItemId,
              input: {
                sku: variant.sku,
              },
            },
          });

          const skuBody = skuResponse.data as {
            inventoryItemUpdate?: {
              inventoryItem?: { id: string; sku: string };
              userErrors: Array<{ field: string[]; message: string }>;
            };
          };

          const skuErrors = skuBody.inventoryItemUpdate?.userErrors;
          if (skuErrors && skuErrors.length > 0) {
            logger.warn('SKU update had errors', { errors: skuErrors });
          } else {
            logger.info('SKU updated successfully', {
              sku: variant.sku,
              inventoryItemId,
            });
          }
        }
      }

      logger.info('Product created in Shopify', {
        productId: product.id,
        variantId,
        title: product.title,
        handle: product.handle,
      });

      return {
        productId: product.id,
        variantId,
      };
    } catch (error) {
      logger.error('Failed to create product in Shopify', {
        title: input.title,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // ==========================================================================
  // Page Management Methods (for Offer Pages)
  // ==========================================================================

  /**
   * Create a new page in Shopify
   * @param input - Page creation parameters
   * @returns The created page ID and handle, or null on failure
   */
  async createPage(input: {
    title: string;
    bodyHtml: string;
    handle?: string;
    templateSuffix?: string;
    isPublished?: boolean;
  }): Promise<{ pageId: string; handle: string } | null> {
    const mutation = `
      mutation pageCreate($page: PageCreateInput!) {
        pageCreate(page: $page) {
          page {
            id
            title
            handle
            body
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
          page: {
            title: input.title,
            body: input.bodyHtml,
            handle: input.handle,
            templateSuffix: input.templateSuffix,
            isPublished: input.isPublished ?? true,
          },
        },
      });

      const body = response.data as {
        pageCreate?: {
          page?: {
            id: string;
            title: string;
            handle: string;
          };
          userErrors: Array<{ field: string[]; message: string }>;
        };
      };

      const userErrors = body.pageCreate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        logger.error('Page creation failed', { errors: userErrors, title: input.title });
        return null;
      }

      const page = body.pageCreate?.page;
      if (!page) {
        logger.error('No page returned from creation', { title: input.title });
        return null;
      }

      logger.info('Page created in Shopify', {
        pageId: page.id,
        handle: page.handle,
        title: page.title,
      });

      return {
        pageId: page.id,
        handle: page.handle,
      };
    } catch (error) {
      logger.error('Failed to create page in Shopify', {
        title: input.title,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update an existing page in Shopify
   * @param id - The page GID (e.g., "gid://shopify/Page/123")
   * @param input - Fields to update
   * @returns Whether the update was successful
   */
  async updatePage(
    id: string,
    input: {
      title?: string;
      bodyHtml?: string;
      handle?: string;
      isPublished?: boolean;
    }
  ): Promise<boolean> {
    const mutation = `
      mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page {
            id
            title
            handle
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

      // Build the update input, only including fields that are provided
      const pageInput: Record<string, unknown> = {};
      if (input.title !== undefined) pageInput.title = input.title;
      if (input.bodyHtml !== undefined) pageInput.body = input.bodyHtml;
      if (input.handle !== undefined) pageInput.handle = input.handle;
      if (input.isPublished !== undefined) pageInput.isPublished = input.isPublished;

      const response = await client.request(mutation, {
        variables: {
          id,
          page: pageInput,
        },
      });

      const body = response.data as {
        pageUpdate?: {
          page?: {
            id: string;
            title: string;
            handle: string;
          };
          userErrors: Array<{ field: string[]; message: string }>;
        };
      };

      const userErrors = body.pageUpdate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        logger.error('Page update failed', { errors: userErrors, pageId: id });
        return false;
      }

      logger.info('Page updated in Shopify', {
        pageId: id,
        updated: Object.keys(pageInput),
      });

      return true;
    } catch (error) {
      logger.error('Failed to update page in Shopify', {
        pageId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Delete a page from Shopify
   * @param id - The page GID
   * @returns Whether the deletion was successful
   */
  async deletePage(id: string): Promise<boolean> {
    const mutation = `
      mutation pageDelete($id: ID!) {
        pageDelete(id: $id) {
          deletedPageId
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
        variables: { id },
      });

      const body = response.data as {
        pageDelete?: {
          deletedPageId?: string;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      };

      const userErrors = body.pageDelete?.userErrors;
      if (userErrors && userErrors.length > 0) {
        logger.error('Page deletion failed', { errors: userErrors, pageId: id });
        return false;
      }

      logger.info('Page deleted from Shopify', { pageId: id });
      return true;
    } catch (error) {
      logger.error('Failed to delete page from Shopify', {
        pageId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get a page by its handle
   * @param handle - The URL handle (slug)
   * @returns The page or null if not found
   */
  async getPageByHandle(handle: string): Promise<{
    id: string;
    title: string;
    handle: string;
    bodyHtml: string;
    isPublished: boolean;
  } | null> {
    // Use pages query with handle filter since pageByHandle doesn't exist in Shopify's GraphQL API
    const query = `
      query getPageByHandle($query: String!) {
        pages(first: 1, query: $query) {
          edges {
            node {
              id
              title
              handle
              body
              isPublished
            }
          }
        }
      }
    `;

    try {
      const client = new this.shopify.clients.Graphql({ session: this.session });

      const response = await client.request(query, {
        variables: { query: `handle:${handle}` },
      });

      const body = response.data as {
        pages?: {
          edges: Array<{
            node: {
              id: string;
              title: string;
              handle: string;
              body: string;
              isPublished: boolean;
            };
          }>;
        };
      };

      const pages = body.pages?.edges || [];
      if (pages.length === 0) {
        logger.debug('No page found with handle', { handle });
        return null;
      }

      const page = pages[0].node;
      return {
        id: page.id,
        title: page.title,
        handle: page.handle,
        bodyHtml: page.body,
        isPublished: page.isPublished,
      };
    } catch (error) {
      logger.error('Failed to fetch page by handle', {
        handle,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Search for pages by title
   * @param title - The title to search for
   * @returns Array of matching pages or empty array
   */
  async searchPagesByTitle(title: string): Promise<Array<{
    id: string;
    title: string;
    handle: string;
  }>> {
    const query = `
      query searchPages($query: String!) {
        pages(first: 10, query: $query) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    `;

    try {
      const client = new this.shopify.clients.Graphql({ session: this.session });

      const response = await client.request(query, {
        variables: { query: `title:${title}` },
      });

      const body = response.data as {
        pages?: {
          edges: Array<{
            node: {
              id: string;
              title: string;
              handle: string;
            };
          }>;
        };
      };

      const pages = body.pages?.edges || [];
      return pages.map(edge => ({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
      }));
    } catch (error) {
      logger.error('Failed to search pages by title', {
        title,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get the featured image URL for a Shopify product
   * @param productId - The product GID (e.g., "gid://shopify/Product/123")
   * @returns The featured image URL or null if not found
   */
  async getProductImage(productId: string): Promise<string | null> {
    const details = await this.getProductDetails(productId);
    return details?.imageUrl || null;
  }

  /**
   * Get product details including image URL and handle for linking
   * @param productId - The product GID (e.g., "gid://shopify/Product/123")
   * @returns Object with imageUrl and handle, or null if not found
   */
  async getProductDetails(productId: string): Promise<{ imageUrl: string | null; handle: string | null } | null> {
    const query = `
      query getProductDetails($id: ID!) {
        product(id: $id) {
          id
          handle
          featuredImage {
            url
            altText
          }
        }
      }
    `;

    try {
      const client = new this.shopify.clients.Graphql({ session: this.session });

      const response = await client.request(query, {
        variables: { id: productId },
      });

      const body = response.data as {
        product?: {
          id: string;
          handle: string;
          featuredImage?: {
            url: string;
            altText: string | null;
          };
        };
      };

      if (!body.product) {
        logger.debug('No product found', { productId });
        return null;
      }

      return {
        imageUrl: body.product.featuredImage?.url || null,
        handle: body.product.handle || null,
      };
    } catch (error) {
      logger.error('Failed to fetch product details', {
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get file URL after upload (polls until file is ready)
   * @param fileId - The Shopify file GID
   * @param maxAttempts - Maximum polling attempts (default: 10)
   * @returns The file URL or null if not available
   */
  async getFileUrl(fileId: string, maxAttempts: number = 10): Promise<string | null> {
    const query = `
      query getFile($id: ID!) {
        node(id: $id) {
          ... on MediaImage {
            id
            image {
              url
            }
            fileStatus
          }
          ... on GenericFile {
            id
            url
            fileStatus
          }
        }
      }
    `;

    try {
      const client = new this.shopify.clients.Graphql({ session: this.session });

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const response = await client.request(query, {
          variables: { id: fileId },
        });

        const body = response.data as {
          node?: {
            image?: { url: string };
            url?: string;
            fileStatus: string;
          };
        };

        const fileStatus = body.node?.fileStatus;
        const url = body.node?.image?.url || body.node?.url;

        if (fileStatus === 'READY' && url) {
          logger.debug('File URL retrieved', { fileId, url });
          return url;
        }

        if (fileStatus === 'FAILED') {
          logger.error('File processing failed', { fileId });
          return null;
        }

        // Wait before next poll (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }

      logger.warn('File URL retrieval timed out', { fileId, maxAttempts });
      return null;
    } catch (error) {
      logger.error('Failed to get file URL', {
        fileId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

export const shopifyClient = new ShopifyClient();
