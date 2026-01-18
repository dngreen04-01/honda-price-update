---
title: productCreate - GraphQL Admin
description: >-
  Creates a
  [product](https://shopify.dev/docs/api/admin-graphql/latest/objects/Product)

  with attributes such as title, description, vendor, and media.


  The `productCreate` mutation helps you create many products at once, avoiding
  the tedious or time-consuming

  process of adding them one by one in the Shopify admin. Common examples
  include creating products for a

  new collection, launching a new product line, or adding seasonal products.


  You can define product

  [options](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductOption)
  and

  [values](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductOptionValue),

  allowing you to create products with different variations like sizes or
  colors. You can also associate media

  files to your products, including images and videos.


  The `productCreate` mutation only supports creating a product with its initial

  [product
  variant](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductVariant).

  To create multiple product variants for a single product and manage prices,
  use the

  [`productVariantsBulkCreate`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productVariantsBulkCreate)

  mutation.


  > Note:

  > The `productCreate` mutation has a
  [throttle](https://shopify.dev/docs/api/usage/rate-limits#resource-based-rate-limits)

  > that takes effect when a store has 50,000 product variants. After this
  threshold is reached, no more than

  > 1,000 new product variants can be created per day.


  After you create a product, you can make subsequent edits to the product using
  one of the following mutations:


  -
  [`publishablePublish`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/publishablePublish):

  Used to publish the product and make it available to customers. The
  `productCreate` mutation creates products

  in an unpublished state by default, so you must perform a separate operation
  to publish the product.

  -
  [`productUpdate`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productUpdate):

  Used to update a single product, such as changing the product's title,
  description, vendor, or associated media.

  -
  [`productSet`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet):

  Used to perform multiple operations on products, such as creating or modifying
  product options and variants.


  Learn more about the [product
  model](https://shopify.dev/docs/apps/build/graphql/migrate/new-product-model)

  and [adding product
  data](https://shopify.dev/docs/apps/build/graphql/migrate/new-product-model/add-data).
api_version: 2026-01
api_name: admin
type: mutation
api_type: graphql
source_url:
  html: 'https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate'
  md: 'https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate.md'
---

# product​Create

mutation

Requires `write_products` access scope. Also: The user must have a permission to create products.

Creates a [product](https://shopify.dev/docs/api/admin-graphql/latest/objects/Product) with attributes such as title, description, vendor, and media.

The `productCreate` mutation helps you create many products at once, avoiding the tedious or time-consuming process of adding them one by one in the Shopify admin. Common examples include creating products for a new collection, launching a new product line, or adding seasonal products.

You can define product [options](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductOption) and [values](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductOptionValue), allowing you to create products with different variations like sizes or colors. You can also associate media files to your products, including images and videos.

The `productCreate` mutation only supports creating a product with its initial [product variant](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductVariant). To create multiple product variants for a single product and manage prices, use the [`productVariantsBulkCreate`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productVariantsBulkCreate) mutation.

***

Note

The `productCreate` mutation has a [throttle](https://shopify.dev/docs/api/usage/rate-limits#resource-based-rate-limits) that takes effect when a store has 50,000 product variants. After this threshold is reached, no more than 1,000 new product variants can be created per day.

***

After you create a product, you can make subsequent edits to the product using one of the following mutations:

* [`publishablePublish`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/publishablePublish): Used to publish the product and make it available to customers. The `productCreate` mutation creates products in an unpublished state by default, so you must perform a separate operation to publish the product.
* [`productUpdate`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productUpdate): Used to update a single product, such as changing the product's title, description, vendor, or associated media.
* [`productSet`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet): Used to perform multiple operations on products, such as creating or modifying product options and variants.

Learn more about the [product model](https://shopify.dev/docs/apps/build/graphql/migrate/new-product-model) and [adding product data](https://shopify.dev/docs/apps/build/graphql/migrate/new-product-model/add-data).

## Arguments

* media

  [\[Create​Media​Input!\]](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/CreateMediaInput)

  The media to add to the product.

* product

  [Product​Create​Input](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/ProductCreateInput)

  The attributes of the new product.

* input

  [Product​Input](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/ProductInput)

  Deprecated

***

## Product​Create​Payload returns

* product

  [Product](https://shopify.dev/docs/api/admin-graphql/latest/objects/Product)

  The product object.

* shop

  [Shop!](https://shopify.dev/docs/api/admin-graphql/latest/objects/Shop)

  non-null

  The shop associated with the product.

* user​Errors

  [\[User​Error!\]!](https://shopify.dev/docs/api/admin-graphql/latest/objects/UserError)

  non-null

  The list of errors that occurred from executing the mutation.

***

## Examples

* ### Create a product

  #### Description

  Create a new product with the title "Cool socks" and two product options that have two values each: A "Color" option, with the values "Red" and "Blue", and a "Size" option, with the values "Small" and "Large". This example returns the product's ID, title, and options. Learn more about \[adding product data]\(https://shopify.dev/docs/apps/build/graphql/migrate/new-product-model/add-data).

  #### Query

  ```graphql
  mutation {
    productCreate(product: {title: "Cool socks", productOptions: [{name: "Color", values: [{name: "Red"}, {name: "Blue"}]}, {name: "Size", values: [{name: "Small"}, {name: "Large"}]}]}) {
      product {
        id
        title
        options {
          id
          name
          position
          optionValues {
            id
            name
            hasVariants
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
  ```

  #### cURL

  ```bash
  curl -X POST \
  https://your-development-store.myshopify.com/admin/api/2026-01/graphql.json \
  -H 'Content-Type: application/json' \
  -H 'X-Shopify-Access-Token: {access_token}' \
  -d '{
  "query": "mutation { productCreate(product: {title: \"Cool socks\", productOptions: [{name: \"Color\", values: [{name: \"Red\"}, {name: \"Blue\"}]}, {name: \"Size\", values: [{name: \"Small\"}, {name: \"Large\"}]}]}) { product { id title options { id name position optionValues { id name hasVariants } } } userErrors { field message } } }"
  }'
  ```

  #### React Router

  ```javascript
  import { authenticate } from "../shopify.server";

  export const loader = async ({request}) => {
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(
      `#graphql
    mutation {
      productCreate(product: {title: "Cool socks", productOptions: [{name: "Color", values: [{name: "Red"}, {name: "Blue"}]}, {name: "Size", values: [{name: "Small"}, {name: "Large"}]}]}) {
        product {
          id
          title
          options {
            id
            name
            position
            optionValues {
              id
              name
              hasVariants
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    );
    const json = await response.json();
    return json.data;
  }
  ```

  #### Ruby

  ```ruby
  session = ShopifyAPI::Auth::Session.new(
    shop: "your-development-store.myshopify.com",
    access_token: access_token
  )
  client = ShopifyAPI::Clients::Graphql::Admin.new(
    session: session
  )

  query = <<~QUERY
    mutation {
      productCreate(product: {title: "Cool socks", productOptions: [{name: "Color", values: [{name: "Red"}, {name: "Blue"}]}, {name: "Size", values: [{name: "Small"}, {name: "Large"}]}]}) {
        product {
          id
          title
          options {
            id
            name
            position
            optionValues {
              id
              name
              hasVariants
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  QUERY

  response = client.query(query: query)
  ```

  #### Node.js

  ```javascript
  const client = new shopify.clients.Graphql({session});
  const data = await client.query({
    data: `mutation {
      productCreate(product: {title: "Cool socks", productOptions: [{name: "Color", values: [{name: "Red"}, {name: "Blue"}]}, {name: "Size", values: [{name: "Small"}, {name: "Large"}]}]}) {
        product {
          id
          title
          options {
            id
            name
            position
            optionValues {
              id
              name
              hasVariants
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
  });
  ```

  #### Response

  ```json
  {
    "productCreate": {
      "product": {
        "id": "gid://shopify/Product/1072482054",
        "title": "Cool socks",
        "options": [
          {
            "id": "gid://shopify/ProductOption/1064577875",
            "name": "Color",
            "position": 1,
            "optionValues": [
              {
                "id": "gid://shopify/ProductOptionValue/1054674807",
                "name": "Red",
                "hasVariants": true
              },
              {
                "id": "gid://shopify/ProductOptionValue/1054674808",
                "name": "Blue",
                "hasVariants": false
              }
            ]
          },
          {
            "id": "gid://shopify/ProductOption/1064577876",
            "name": "Size",
            "position": 2,
            "optionValues": [
              {
                "id": "gid://shopify/ProductOptionValue/1054674809",
                "name": "Small",
                "hasVariants": true
              },
              {
                "id": "gid://shopify/ProductOptionValue/1054674810",
                "name": "Large",
                "hasVariants": false
              }
            ]
          }
        ]
      },
      "userErrors": []
    }
  }
  ```

* ### Create a product and associate metafields

  #### Description

  Create a new product with \[metafields]\(https://shopify.dev/docs/apps/build/custom-data) to store additional details about the product. In this example, a new product titled "Hiking Boots" is created with an associated metafield categorized under the namespace "my\_fields." The metafield, of type \["single\_line\_text\_field"]\(https://shopify.dev/docs/apps/build/custom-data/metafields/list-of-data-types#supported-types), is used to store the liner material information. This example returns the product's ID, title, and metafield.

  #### Query

  ```graphql
  mutation {
    productCreate(product: {title: "Hiking Boots", metafields: [{namespace: "my_fields", key: "liner_material", type: "single_line_text_field", value: "Synthetic Leather"}]}) {
      product {
        id
        title
        metafields(first: 1) {
          nodes {
            id
            namespace
            key
            value
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
  ```

  #### cURL

  ```bash
  curl -X POST \
  https://your-development-store.myshopify.com/admin/api/2026-01/graphql.json \
  -H 'Content-Type: application/json' \
  -H 'X-Shopify-Access-Token: {access_token}' \
  -d '{
  "query": "mutation { productCreate(product: {title: \"Hiking Boots\", metafields: [{namespace: \"my_fields\", key: \"liner_material\", type: \"single_line_text_field\", value: \"Synthetic Leather\"}]}) { product { id title metafields(first: 1) { nodes { id namespace key value } } } userErrors { field message } } }"
  }'
  ```

  #### React Router

  ```javascript
  import { authenticate } from "../shopify.server";

  export const loader = async ({request}) => {
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(
      `#graphql
    mutation {
      productCreate(product: {title: "Hiking Boots", metafields: [{namespace: "my_fields", key: "liner_material", type: "single_line_text_field", value: "Synthetic Leather"}]}) {
        product {
          id
          title
          metafields(first: 1) {
            nodes {
              id
              namespace
              key
              value
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    );
    const json = await response.json();
    return json.data;
  }
  ```

  #### Ruby

  ```ruby
  session = ShopifyAPI::Auth::Session.new(
    shop: "your-development-store.myshopify.com",
    access_token: access_token
  )
  client = ShopifyAPI::Clients::Graphql::Admin.new(
    session: session
  )

  query = <<~QUERY
    mutation {
      productCreate(product: {title: "Hiking Boots", metafields: [{namespace: "my_fields", key: "liner_material", type: "single_line_text_field", value: "Synthetic Leather"}]}) {
        product {
          id
          title
          metafields(first: 1) {
            nodes {
              id
              namespace
              key
              value
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  QUERY

  response = client.query(query: query)
  ```

  #### Node.js

  ```javascript
  const client = new shopify.clients.Graphql({session});
  const data = await client.query({
    data: `mutation {
      productCreate(product: {title: "Hiking Boots", metafields: [{namespace: "my_fields", key: "liner_material", type: "single_line_text_field", value: "Synthetic Leather"}]}) {
        product {
          id
          title
          metafields(first: 1) {
            nodes {
              id
              namespace
              key
              value
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
  });
  ```

  #### Response

  ```json
  {
    "productCreate": {
      "product": {
        "id": "gid://shopify/Product/1072482057",
        "title": "Hiking Boots",
        "metafields": {
          "nodes": [
            {
              "id": "gid://shopify/Metafield/1069230536",
              "namespace": "my_fields",
              "key": "liner_material",
              "value": "Synthetic Leather"
            }
          ]
        }
      },
      "userErrors": []
    }
  }
  ```

* ### Create a product with SEO settings and tags

  #### Description

  Create a new product with search engine optimization (SEO) settings and product tags. This example demonstrates how to create a product titled "Eco-Friendly Water Bottle" with custom SEO title and description for optimal search visibility. The product also includes descriptive tags for improved organization and discoverability. The mutation returns the product's ID, title, handle, description, product type, vendor, status, SEO settings, tags, options, and variants.

  #### Query

  ```graphql
  mutation {
    productCreate(product: {title: "Eco-Friendly Water Bottle", descriptionHtml: "<p>Stay hydrated with our premium stainless steel water bottle. Features double-wall insulation to keep drinks cold for 24 hours or hot for 12 hours.</p>", productType: "Drinkware", vendor: "EcoLifestyle", status: ACTIVE, handle: "eco-friendly-water-bottle", seo: {title: "Eco Water Bottle - 24hr Cold, 12hr Hot | EcoLifestyle", description: "Premium stainless steel water bottle with double-wall insulation. Eco-friendly, BPA-free, and perfect for active lifestyles. Free shipping available."}, tags: ["eco-friendly", "stainless-steel", "insulated", "BPA-free", "sports", "outdoors"], productOptions: [{name: "Size", values: [{name: "16oz"}, {name: "20oz"}, {name: "32oz"}]}, {name: "Color", values: [{name: "Forest Green"}, {name: "Ocean Blue"}, {name: "Sunset Orange"}]}]}) {
      product {
        id
        title
        handle
        descriptionHtml
        productType
        vendor
        status
        seo {
          title
          description
        }
        tags
        options {
          id
          name
          position
          values
          optionValues {
            id
            name
            hasVariants
          }
        }
        variants(first: 1) {
          nodes {
            id
            title
            selectedOptions {
              name
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
  ```

  #### cURL

  ```bash
  curl -X POST \
  https://your-development-store.myshopify.com/admin/api/2026-01/graphql.json \
  -H 'Content-Type: application/json' \
  -H 'X-Shopify-Access-Token: {access_token}' \
  -d '{
  "query": "mutation { productCreate(product: {title: \"Eco-Friendly Water Bottle\", descriptionHtml: \"<p>Stay hydrated with our premium stainless steel water bottle. Features double-wall insulation to keep drinks cold for 24 hours or hot for 12 hours.</p>\", productType: \"Drinkware\", vendor: \"EcoLifestyle\", status: ACTIVE, handle: \"eco-friendly-water-bottle\", seo: {title: \"Eco Water Bottle - 24hr Cold, 12hr Hot | EcoLifestyle\", description: \"Premium stainless steel water bottle with double-wall insulation. Eco-friendly, BPA-free, and perfect for active lifestyles. Free shipping available.\"}, tags: [\"eco-friendly\", \"stainless-steel\", \"insulated\", \"BPA-free\", \"sports\", \"outdoors\"], productOptions: [{name: \"Size\", values: [{name: \"16oz\"}, {name: \"20oz\"}, {name: \"32oz\"}]}, {name: \"Color\", values: [{name: \"Forest Green\"}, {name: \"Ocean Blue\"}, {name: \"Sunset Orange\"}]}]}) { product { id title handle descriptionHtml productType vendor status seo { title description } tags options { id name position values optionValues { id name hasVariants } } variants(first: 1) { nodes { id title selectedOptions { name value } } } } userErrors { field message } } }"
  }'
  ```

  #### React Router

  ```javascript
  import { authenticate } from "../shopify.server";

  export const loader = async ({request}) => {
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(
      `#graphql
    mutation {
      productCreate(product: {title: "Eco-Friendly Water Bottle", descriptionHtml: "<p>Stay hydrated with our premium stainless steel water bottle. Features double-wall insulation to keep drinks cold for 24 hours or hot for 12 hours.</p>", productType: "Drinkware", vendor: "EcoLifestyle", status: ACTIVE, handle: "eco-friendly-water-bottle", seo: {title: "Eco Water Bottle - 24hr Cold, 12hr Hot | EcoLifestyle", description: "Premium stainless steel water bottle with double-wall insulation. Eco-friendly, BPA-free, and perfect for active lifestyles. Free shipping available."}, tags: ["eco-friendly", "stainless-steel", "insulated", "BPA-free", "sports", "outdoors"], productOptions: [{name: "Size", values: [{name: "16oz"}, {name: "20oz"}, {name: "32oz"}]}, {name: "Color", values: [{name: "Forest Green"}, {name: "Ocean Blue"}, {name: "Sunset Orange"}]}]}) {
        product {
          id
          title
          handle
          descriptionHtml
          productType
          vendor
          status
          seo {
            title
            description
          }
          tags
          options {
            id
            name
            position
            values
            optionValues {
              id
              name
              hasVariants
            }
          }
          variants(first: 1) {
            nodes {
              id
              title
              selectedOptions {
                name
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
    }`,
    );
    const json = await response.json();
    return json.data;
  }
  ```

  #### Ruby

  ```ruby
  session = ShopifyAPI::Auth::Session.new(
    shop: "your-development-store.myshopify.com",
    access_token: access_token
  )
  client = ShopifyAPI::Clients::Graphql::Admin.new(
    session: session
  )

  query = <<~QUERY
    mutation {
      productCreate(product: {title: "Eco-Friendly Water Bottle", descriptionHtml: "<p>Stay hydrated with our premium stainless steel water bottle. Features double-wall insulation to keep drinks cold for 24 hours or hot for 12 hours.</p>", productType: "Drinkware", vendor: "EcoLifestyle", status: ACTIVE, handle: "eco-friendly-water-bottle", seo: {title: "Eco Water Bottle - 24hr Cold, 12hr Hot | EcoLifestyle", description: "Premium stainless steel water bottle with double-wall insulation. Eco-friendly, BPA-free, and perfect for active lifestyles. Free shipping available."}, tags: ["eco-friendly", "stainless-steel", "insulated", "BPA-free", "sports", "outdoors"], productOptions: [{name: "Size", values: [{name: "16oz"}, {name: "20oz"}, {name: "32oz"}]}, {name: "Color", values: [{name: "Forest Green"}, {name: "Ocean Blue"}, {name: "Sunset Orange"}]}]}) {
        product {
          id
          title
          handle
          descriptionHtml
          productType
          vendor
          status
          seo {
            title
            description
          }
          tags
          options {
            id
            name
            position
            values
            optionValues {
              id
              name
              hasVariants
            }
          }
          variants(first: 1) {
            nodes {
              id
              title
              selectedOptions {
                name
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
  QUERY

  response = client.query(query: query)
  ```

  #### Node.js

  ```javascript
  const client = new shopify.clients.Graphql({session});
  const data = await client.query({
    data: `mutation {
      productCreate(product: {title: "Eco-Friendly Water Bottle", descriptionHtml: "<p>Stay hydrated with our premium stainless steel water bottle. Features double-wall insulation to keep drinks cold for 24 hours or hot for 12 hours.</p>", productType: "Drinkware", vendor: "EcoLifestyle", status: ACTIVE, handle: "eco-friendly-water-bottle", seo: {title: "Eco Water Bottle - 24hr Cold, 12hr Hot | EcoLifestyle", description: "Premium stainless steel water bottle with double-wall insulation. Eco-friendly, BPA-free, and perfect for active lifestyles. Free shipping available."}, tags: ["eco-friendly", "stainless-steel", "insulated", "BPA-free", "sports", "outdoors"], productOptions: [{name: "Size", values: [{name: "16oz"}, {name: "20oz"}, {name: "32oz"}]}, {name: "Color", values: [{name: "Forest Green"}, {name: "Ocean Blue"}, {name: "Sunset Orange"}]}]}) {
        product {
          id
          title
          handle
          descriptionHtml
          productType
          vendor
          status
          seo {
            title
            description
          }
          tags
          options {
            id
            name
            position
            values
            optionValues {
              id
              name
              hasVariants
            }
          }
          variants(first: 1) {
            nodes {
              id
              title
              selectedOptions {
                name
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
    }`,
  });
  ```

  #### Response

  ```json
  {
    "productCreate": {
      "product": {
        "id": "gid://shopify/Product/1072482056",
        "title": "Eco-Friendly Water Bottle",
        "handle": "eco-friendly-water-bottle",
        "descriptionHtml": "<p>Stay hydrated with our premium stainless steel water bottle. Features double-wall insulation to keep drinks cold for 24 hours or hot for 12 hours.</p>",
        "productType": "Drinkware",
        "vendor": "EcoLifestyle",
        "status": "ACTIVE",
        "seo": {
          "title": "Eco Water Bottle - 24hr Cold, 12hr Hot | EcoLifestyle",
          "description": "Premium stainless steel water bottle with double-wall insulation. Eco-friendly, BPA-free, and perfect for active lifestyles. Free shipping available."
        },
        "tags": [
          "BPA-free",
          "eco-friendly",
          "insulated",
          "outdoors",
          "sports",
          "stainless-steel"
        ],
        "options": [
          {
            "id": "gid://shopify/ProductOption/1064577878",
            "name": "Size",
            "position": 1,
            "values": [
              "16oz"
            ],
            "optionValues": [
              {
                "id": "gid://shopify/ProductOptionValue/1054674812",
                "name": "16oz",
                "hasVariants": true
              },
              {
                "id": "gid://shopify/ProductOptionValue/1054674813",
                "name": "20oz",
                "hasVariants": false
              },
              {
                "id": "gid://shopify/ProductOptionValue/1054674814",
                "name": "32oz",
                "hasVariants": false
              }
            ]
          },
          {
            "id": "gid://shopify/ProductOption/1064577879",
            "name": "Color",
            "position": 2,
            "values": [
              "Forest Green"
            ],
            "optionValues": [
              {
                "id": "gid://shopify/ProductOptionValue/1054674815",
                "name": "Forest Green",
                "hasVariants": true
              },
              {
                "id": "gid://shopify/ProductOptionValue/1054674816",
                "name": "Ocean Blue",
                "hasVariants": false
              },
              {
                "id": "gid://shopify/ProductOptionValue/1054674817",
                "name": "Sunset Orange",
                "hasVariants": false
              }
            ]
          }
        ],
        "variants": {
          "nodes": [
            {
              "id": "gid://shopify/ProductVariant/1070326033",
              "title": "16oz / Forest Green",
              "selectedOptions": [
                {
                  "name": "Size",
                  "value": "16oz"
                },
                {
                  "name": "Color",
                  "value": "Forest Green"
                }
              ]
            }
          ]
        }
      },
      "userErrors": []
    }
  }
  ```

* ### Create a product with a combined listing role

  #### Description

  Create a new parent product with the title "Helmet Nova". The parent product is the main product that includes multiple child products, using Shopify's existing product model to create the combinations. This example returns the product's ID and combined listing role (\`PARENT\`). Learn more about \[combined listings]\(https://shopify.dev/docs/apps/build/product-merchandising/combined-listings).

  #### Query

  ```graphql
  mutation {
    productCreate(product: {title: "Helmet Nova", combinedListingRole: PARENT}) {
      product {
        id
        combinedListingRole
      }
      userErrors {
        field
        message
      }
    }
  }
  ```

  #### cURL

  ```bash
  curl -X POST \
  https://your-development-store.myshopify.com/admin/api/2026-01/graphql.json \
  -H 'Content-Type: application/json' \
  -H 'X-Shopify-Access-Token: {access_token}' \
  -d '{
  "query": "mutation { productCreate(product: {title: \"Helmet Nova\", combinedListingRole: PARENT}) { product { id combinedListingRole } userErrors { field message } } }"
  }'
  ```

  #### React Router

  ```javascript
  import { authenticate } from "../shopify.server";

  export const loader = async ({request}) => {
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(
      `#graphql
    mutation {
      productCreate(product: {title: "Helmet Nova", combinedListingRole: PARENT}) {
        product {
          id
          combinedListingRole
        }
        userErrors {
          field
          message
        }
      }
    }`,
    );
    const json = await response.json();
    return json.data;
  }
  ```

  #### Ruby

  ```ruby
  session = ShopifyAPI::Auth::Session.new(
    shop: "your-development-store.myshopify.com",
    access_token: access_token
  )
  client = ShopifyAPI::Clients::Graphql::Admin.new(
    session: session
  )

  query = <<~QUERY
    mutation {
      productCreate(product: {title: "Helmet Nova", combinedListingRole: PARENT}) {
        product {
          id
          combinedListingRole
        }
        userErrors {
          field
          message
        }
      }
    }
  QUERY

  response = client.query(query: query)
  ```

  #### Node.js

  ```javascript
  const client = new shopify.clients.Graphql({session});
  const data = await client.query({
    data: `mutation {
      productCreate(product: {title: "Helmet Nova", combinedListingRole: PARENT}) {
        product {
          id
          combinedListingRole
        }
        userErrors {
          field
          message
        }
      }
    }`,
  });
  ```

  #### Response

  ```json
  {
    "productCreate": {
      "product": {
        "id": "gid://shopify/Product/1072482058",
        "combinedListingRole": "PARENT"
      },
      "userErrors": []
    }
  }
  ```

* ### Create a product with media

  #### Description

  Create a new product and \[asynchronously associate media]\(https://shopify.dev/docs/apps/build/graphql/migrate/new-product-model/product-model-components#asynchronous-media-management) to the product. The product title is "Helmet Nova" and the media consists of a Shopify-hosted image and an externally hosted video. This example returns the product ID, title, and media for the product.

  #### Query

  ```graphql
  mutation CreateProductWithNewMedia($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id
        title
        media(first: 10) {
          nodes {
            alt
            mediaContentType
            preview {
              status
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
  ```

  #### Variables

  ```json
  {
    "product": {
      "title": "Helmet Nova"
    },
    "media": [
      {
        "originalSource": "https://cdn.shopify.com/shopifycloud/brochure/assets/sell/image/image-@artdirection-large-1ba8d5de56c361cec6bc487b747c8774b9ec8203f392a99f53c028df8d0fb3fc.png",
        "alt": "Gray helmet for bikers",
        "mediaContentType": "IMAGE"
      },
      {
        "originalSource": "https://www.youtube.com/watch?v=4L8VbGRibj8&list=PLlMkWQ65HlcEoPyG9QayqEaAu0ftj0MMz",
        "alt": "Testing helmet resistance against impacts",
        "mediaContentType": "EXTERNAL_VIDEO"
      }
    ]
  }
  ```

  #### cURL

  ```bash
  curl -X POST \
  https://your-development-store.myshopify.com/admin/api/2026-01/graphql.json \
  -H 'Content-Type: application/json' \
  -H 'X-Shopify-Access-Token: {access_token}' \
  -d '{
  "query": "mutation CreateProductWithNewMedia($product: ProductCreateInput!, $media: [CreateMediaInput!]) { productCreate(product: $product, media: $media) { product { id title media(first: 10) { nodes { alt mediaContentType preview { status } } } } userErrors { field message } } }",
   "variables": {
      "product": {
        "title": "Helmet Nova"
      },
      "media": [
        {
          "originalSource": "https://cdn.shopify.com/shopifycloud/brochure/assets/sell/image/image-@artdirection-large-1ba8d5de56c361cec6bc487b747c8774b9ec8203f392a99f53c028df8d0fb3fc.png",
          "alt": "Gray helmet for bikers",
          "mediaContentType": "IMAGE"
        },
        {
          "originalSource": "https://www.youtube.com/watch?v=4L8VbGRibj8&list=PLlMkWQ65HlcEoPyG9QayqEaAu0ftj0MMz",
          "alt": "Testing helmet resistance against impacts",
          "mediaContentType": "EXTERNAL_VIDEO"
        }
      ]
    }
  }'
  ```

  #### React Router

  ```javascript
  import { authenticate } from "../shopify.server";

  export const loader = async ({request}) => {
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(
      `#graphql
    mutation CreateProductWithNewMedia($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
      productCreate(product: $product, media: $media) {
        product {
          id
          title
          media(first: 10) {
            nodes {
              alt
              mediaContentType
              preview {
                status
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
          "product": {
              "title": "Helmet Nova"
          },
          "media": [
              {
                  "originalSource": "https://cdn.shopify.com/shopifycloud/brochure/assets/sell/image/image-@artdirection-large-1ba8d5de56c361cec6bc487b747c8774b9ec8203f392a99f53c028df8d0fb3fc.png",
                  "alt": "Gray helmet for bikers",
                  "mediaContentType": "IMAGE"
              },
              {
                  "originalSource": "https://www.youtube.com/watch?v=4L8VbGRibj8&list=PLlMkWQ65HlcEoPyG9QayqEaAu0ftj0MMz",
                  "alt": "Testing helmet resistance against impacts",
                  "mediaContentType": "EXTERNAL_VIDEO"
              }
          ]
      },
    },
    );
    const json = await response.json();
    return json.data;
  }
  ```

  #### Ruby

  ```ruby
  session = ShopifyAPI::Auth::Session.new(
    shop: "your-development-store.myshopify.com",
    access_token: access_token
  )
  client = ShopifyAPI::Clients::Graphql::Admin.new(
    session: session
  )

  query = <<~QUERY
    mutation CreateProductWithNewMedia($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
      productCreate(product: $product, media: $media) {
        product {
          id
          title
          media(first: 10) {
            nodes {
              alt
              mediaContentType
              preview {
                status
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
  QUERY

  variables = {
    "product": {
      "title": "Helmet Nova"
    },
    "media": [
      {
        "originalSource": "https://cdn.shopify.com/shopifycloud/brochure/assets/sell/image/image-@artdirection-large-1ba8d5de56c361cec6bc487b747c8774b9ec8203f392a99f53c028df8d0fb3fc.png",
        "alt": "Gray helmet for bikers",
        "mediaContentType": "IMAGE"
      },
      {
        "originalSource": "https://www.youtube.com/watch?v=4L8VbGRibj8&list=PLlMkWQ65HlcEoPyG9QayqEaAu0ftj0MMz",
        "alt": "Testing helmet resistance against impacts",
        "mediaContentType": "EXTERNAL_VIDEO"
      }
    ]
  }

  response = client.query(query: query, variables: variables)
  ```

  #### Node.js

  ```javascript
  const client = new shopify.clients.Graphql({session});
  const data = await client.query({
    data: {
      "query": `mutation CreateProductWithNewMedia($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
        productCreate(product: $product, media: $media) {
          product {
            id
            title
            media(first: 10) {
              nodes {
                alt
                mediaContentType
                preview {
                  status
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      "variables": {
          "product": {
              "title": "Helmet Nova"
          },
          "media": [
              {
                  "originalSource": "https://cdn.shopify.com/shopifycloud/brochure/assets/sell/image/image-@artdirection-large-1ba8d5de56c361cec6bc487b747c8774b9ec8203f392a99f53c028df8d0fb3fc.png",
                  "alt": "Gray helmet for bikers",
                  "mediaContentType": "IMAGE"
              },
              {
                  "originalSource": "https://www.youtube.com/watch?v=4L8VbGRibj8&list=PLlMkWQ65HlcEoPyG9QayqEaAu0ftj0MMz",
                  "alt": "Testing helmet resistance against impacts",
                  "mediaContentType": "EXTERNAL_VIDEO"
              }
          ]
      },
    },
  });
  ```

  #### Response

  ```json
  {
    "productCreate": {
      "product": {
        "id": "gid://shopify/Product/1072482059",
        "title": "Helmet Nova",
        "media": {
          "nodes": [
            {
              "alt": "Gray helmet for bikers",
              "mediaContentType": "IMAGE",
              "preview": {
                "status": "UPLOADED"
              }
            },
            {
              "alt": "Testing helmet resistance against impacts",
              "mediaContentType": "EXTERNAL_VIDEO",
              "preview": {
                "status": "UPLOADED"
              }
            }
          ]
        }
      },
      "userErrors": []
    }
  }
  ```

* ### Create a product with product metadata

  #### Description

  Create a new product titled "Wireless Headphones" by specifying details such as \`productType\` and \`vendor\`. The mutation returns the product's ID, title, product type, vendor, status, and variants. Learn more about \[adding product data]\(https://shopify.dev/docs/apps/build/graphql/migrate/new-product-model/add-data).

  #### Query

  ```graphql
  mutation {
    productCreate(product: {title: "Wireless Headphones", productType: "Electronics", vendor: "AudioTech", status: ACTIVE}) {
      product {
        id
        title
        productType
        vendor
        status
        variants(first: 1) {
          nodes {
            id
            price
            inventoryItem {
              id
              tracked
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
  ```

  #### cURL

  ```bash
  curl -X POST \
  https://your-development-store.myshopify.com/admin/api/2026-01/graphql.json \
  -H 'Content-Type: application/json' \
  -H 'X-Shopify-Access-Token: {access_token}' \
  -d '{
  "query": "mutation { productCreate(product: {title: \"Wireless Headphones\", productType: \"Electronics\", vendor: \"AudioTech\", status: ACTIVE}) { product { id title productType vendor status variants(first: 1) { nodes { id price inventoryItem { id tracked } } } } userErrors { field message } } }"
  }'
  ```

  #### React Router

  ```javascript
  import { authenticate } from "../shopify.server";

  export const loader = async ({request}) => {
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(
      `#graphql
    mutation {
      productCreate(product: {title: "Wireless Headphones", productType: "Electronics", vendor: "AudioTech", status: ACTIVE}) {
        product {
          id
          title
          productType
          vendor
          status
          variants(first: 1) {
            nodes {
              id
              price
              inventoryItem {
                id
                tracked
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    );
    const json = await response.json();
    return json.data;
  }
  ```

  #### Ruby

  ```ruby
  session = ShopifyAPI::Auth::Session.new(
    shop: "your-development-store.myshopify.com",
    access_token: access_token
  )
  client = ShopifyAPI::Clients::Graphql::Admin.new(
    session: session
  )

  query = <<~QUERY
    mutation {
      productCreate(product: {title: "Wireless Headphones", productType: "Electronics", vendor: "AudioTech", status: ACTIVE}) {
        product {
          id
          title
          productType
          vendor
          status
          variants(first: 1) {
            nodes {
              id
              price
              inventoryItem {
                id
                tracked
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
  QUERY

  response = client.query(query: query)
  ```

  #### Node.js

  ```javascript
  const client = new shopify.clients.Graphql({session});
  const data = await client.query({
    data: `mutation {
      productCreate(product: {title: "Wireless Headphones", productType: "Electronics", vendor: "AudioTech", status: ACTIVE}) {
        product {
          id
          title
          productType
          vendor
          status
          variants(first: 1) {
            nodes {
              id
              price
              inventoryItem {
                id
                tracked
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
  });
  ```

  #### Response

  ```json
  {
    "productCreate": {
      "product": {
        "id": "gid://shopify/Product/1072482045",
        "title": "Wireless Headphones",
        "productType": "Electronics",
        "vendor": "AudioTech",
        "status": "ACTIVE",
        "variants": {
          "nodes": [
            {
              "id": "gid://shopify/ProductVariant/1070326022",
              "price": "0.00",
              "inventoryItem": {
                "id": "gid://shopify/InventoryItem/1070326022",
                "tracked": false
              }
            }
          ]
        }
      },
      "userErrors": []
    }
  }
  ```

* ### Create a product with product options and option values

  #### Description

  Create a new product with product options and option values. This example creates a product titled "New product" with options for color ("Red", "Green") and size ("Small", "Medium"). It returns the product's ID and details about the product options and first five variants. Only one product variant is created and linked with the first option value specified for each option name. Learn more about \[adding product data]\(https://shopify.dev/docs/apps/build/graphql/migrate/new-product-model/add-data).

  #### Query

  ```graphql
  mutation {
    productCreate(product: {title: "New product", productOptions: [{name: "Color", values: [{name: "Red"}, {name: "Green"}]}, {name: "Size", values: [{name: "Small"}, {name: "Medium"}]}]}) {
      userErrors {
        field
        message
      }
      product {
        id
        options {
          id
          name
          position
          values
          optionValues {
            id
            name
            hasVariants
          }
        }
        variants(first: 5) {
          nodes {
            id
            title
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
  ```

  #### cURL

  ```bash
  curl -X POST \
  https://your-development-store.myshopify.com/admin/api/2026-01/graphql.json \
  -H 'Content-Type: application/json' \
  -H 'X-Shopify-Access-Token: {access_token}' \
  -d '{
  "query": "mutation { productCreate(product: {title: \"New product\", productOptions: [{name: \"Color\", values: [{name: \"Red\"}, {name: \"Green\"}]}, {name: \"Size\", values: [{name: \"Small\"}, {name: \"Medium\"}]}]}) { userErrors { field message } product { id options { id name position values optionValues { id name hasVariants } } variants(first: 5) { nodes { id title selectedOptions { name value } } } } } }"
  }'
  ```

  #### React Router

  ```javascript
  import { authenticate } from "../shopify.server";

  export const loader = async ({request}) => {
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(
      `#graphql
    mutation {
      productCreate(product: {title: "New product", productOptions: [{name: "Color", values: [{name: "Red"}, {name: "Green"}]}, {name: "Size", values: [{name: "Small"}, {name: "Medium"}]}]}) {
        userErrors {
          field
          message
        }
        product {
          id
          options {
            id
            name
            position
            values
            optionValues {
              id
              name
              hasVariants
            }
          }
          variants(first: 5) {
            nodes {
              id
              title
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
    }`,
    );
    const json = await response.json();
    return json.data;
  }
  ```

  #### Ruby

  ```ruby
  session = ShopifyAPI::Auth::Session.new(
    shop: "your-development-store.myshopify.com",
    access_token: access_token
  )
  client = ShopifyAPI::Clients::Graphql::Admin.new(
    session: session
  )

  query = <<~QUERY
    mutation {
      productCreate(product: {title: "New product", productOptions: [{name: "Color", values: [{name: "Red"}, {name: "Green"}]}, {name: "Size", values: [{name: "Small"}, {name: "Medium"}]}]}) {
        userErrors {
          field
          message
        }
        product {
          id
          options {
            id
            name
            position
            values
            optionValues {
              id
              name
              hasVariants
            }
          }
          variants(first: 5) {
            nodes {
              id
              title
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
    }
  QUERY

  response = client.query(query: query)
  ```

  #### Node.js

  ```javascript
  const client = new shopify.clients.Graphql({session});
  const data = await client.query({
    data: `mutation {
      productCreate(product: {title: "New product", productOptions: [{name: "Color", values: [{name: "Red"}, {name: "Green"}]}, {name: "Size", values: [{name: "Small"}, {name: "Medium"}]}]}) {
        userErrors {
          field
          message
        }
        product {
          id
          options {
            id
            name
            position
            values
            optionValues {
              id
              name
              hasVariants
            }
          }
          variants(first: 5) {
            nodes {
              id
              title
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
    }`,
  });
  ```

  #### Response

  ```json
  {
    "productCreate": {
      "userErrors": [],
      "product": {
        "id": "gid://shopify/Product/1072482053",
        "options": [
          {
            "id": "gid://shopify/ProductOption/1064577873",
            "name": "Color",
            "position": 1,
            "values": [
              "Red"
            ],
            "optionValues": [
              {
                "name": "Red",
                "hasVariants": true
              },
              {
                "name": "Green",
                "hasVariants": false
              }
            ]
          },
          {
            "id": "gid://shopify/ProductOption/1064577874",
            "name": "Size",
            "position": 2,
            "values": [
              "Small"
            ],
            "optionValues": [
              {
                "name": "Small",
                "hasVariants": true
              },
              {
                "name": "Medium",
                "hasVariants": false
              }
            ]
          }
        ],
        "variants": {
          "nodes": [
            {
              "id": "gid://shopify/ProductVariant/1070326030",
              "title": "Red / Small",
              "selectedOptions": [
                {
                  "name": "Color",
                  "value": "Red"
                },
                {
                  "name": "Size",
                  "value": "Small"
                }
              ]
            }
          ]
        }
      }
    }
  }
  ```

* ### productCreate reference

[Open in GraphiQL](http://localhost:3457/graphiql?query=mutation%20%7B%0A%20%20productCreate\(product%3A%20%7Btitle%3A%20%22Cool%20socks%22%2C%20productOptions%3A%20%5B%7Bname%3A%20%22Color%22%2C%20values%3A%20%5B%7Bname%3A%20%22Red%22%7D%2C%20%7Bname%3A%20%22Blue%22%7D%5D%7D%2C%20%7Bname%3A%20%22Size%22%2C%20values%3A%20%5B%7Bname%3A%20%22Small%22%7D%2C%20%7Bname%3A%20%22Large%22%7D%5D%7D%5D%7D\)%20%7B%0A%20%20%20%20product%20%7B%0A%20%20%20%20%20%20id%0A%20%20%20%20%20%20title%0A%20%20%20%20%20%20options%20%7B%0A%20%20%20%20%20%20%20%20id%0A%20%20%20%20%20%20%20%20name%0A%20%20%20%20%20%20%20%20position%0A%20%20%20%20%20%20%20%20optionValues%20%7B%0A%20%20%20%20%20%20%20%20%20%20id%0A%20%20%20%20%20%20%20%20%20%20name%0A%20%20%20%20%20%20%20%20%20%20hasVariants%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20userErrors%20%7B%0A%20%20%20%20%20%20field%0A%20%20%20%20%20%20message%0A%20%20%20%20%7D%0A%20%20%7D%0A%7D)

##### GQL

```graphql
mutation {
  productCreate(product: {title: "Cool socks", productOptions: [{name: "Color", values: [{name: "Red"}, {name: "Blue"}]}, {name: "Size", values: [{name: "Small"}, {name: "Large"}]}]}) {
    product {
      id
      title
      options {
        id
        name
        position
        optionValues {
          id
          name
          hasVariants
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

##### cURL

```bash
curl -X POST \
https://your-development-store.myshopify.com/admin/api/2026-01/graphql.json \
-H 'Content-Type: application/json' \
-H 'X-Shopify-Access-Token: {access_token}' \
-d '{
"query": "mutation { productCreate(product: {title: \"Cool socks\", productOptions: [{name: \"Color\", values: [{name: \"Red\"}, {name: \"Blue\"}]}, {name: \"Size\", values: [{name: \"Small\"}, {name: \"Large\"}]}]}) { product { id title options { id name position optionValues { id name hasVariants } } } userErrors { field message } } }"
}'
```

##### React Router

```javascript
import { authenticate } from "../shopify.server";

export const loader = async ({request}) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
  mutation {
    productCreate(product: {title: "Cool socks", productOptions: [{name: "Color", values: [{name: "Red"}, {name: "Blue"}]}, {name: "Size", values: [{name: "Small"}, {name: "Large"}]}]}) {
      product {
        id
        title
        options {
          id
          name
          position
          optionValues {
            id
            name
            hasVariants
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }`,
  );
  const json = await response.json();
  return json.data;
}
```

##### Node.js

```javascript
const client = new shopify.clients.Graphql({session});
const data = await client.query({
  data: `mutation {
    productCreate(product: {title: "Cool socks", productOptions: [{name: "Color", values: [{name: "Red"}, {name: "Blue"}]}, {name: "Size", values: [{name: "Small"}, {name: "Large"}]}]}) {
      product {
        id
        title
        options {
          id
          name
          position
          optionValues {
            id
            name
            hasVariants
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }`,
});
```

##### Ruby

```ruby
session = ShopifyAPI::Auth::Session.new(
  shop: "your-development-store.myshopify.com",
  access_token: access_token
)
client = ShopifyAPI::Clients::Graphql::Admin.new(
  session: session
)

query = <<~QUERY
  mutation {
    productCreate(product: {title: "Cool socks", productOptions: [{name: "Color", values: [{name: "Red"}, {name: "Blue"}]}, {name: "Size", values: [{name: "Small"}, {name: "Large"}]}]}) {
      product {
        id
        title
        options {
          id
          name
          position
          optionValues {
            id
            name
            hasVariants
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
QUERY

response = client.query(query: query)
```

## Response

JSON

```json
{
  "productCreate": {
    "product": {
      "id": "gid://shopify/Product/1072482054",
      "title": "Cool socks",
      "options": [
        {
          "id": "gid://shopify/ProductOption/1064577875",
          "name": "Color",
          "position": 1,
          "optionValues": [
            {
              "id": "gid://shopify/ProductOptionValue/1054674807",
              "name": "Red",
              "hasVariants": true
            },
            {
              "id": "gid://shopify/ProductOptionValue/1054674808",
              "name": "Blue",
              "hasVariants": false
            }
          ]
        },
        {
          "id": "gid://shopify/ProductOption/1064577876",
          "name": "Size",
          "position": 2,
          "optionValues": [
            {
              "id": "gid://shopify/ProductOptionValue/1054674809",
              "name": "Small",
              "hasVariants": true
            },
            {
              "id": "gid://shopify/ProductOptionValue/1054674810",
              "name": "Large",
              "hasVariants": false
            }
          ]
        }
      ]
    },
    "userErrors": []
  }
}
```