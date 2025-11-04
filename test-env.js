#!/usr/bin/env node

// Simple test to verify environment and Shopify connection
import dotenv from 'dotenv';

dotenv.config();

console.log('=== Environment Check ===\n');

// Check required env vars
const required = {
  'SUPABASE_URL': process.env.SUPABASE_URL,
  'SUPABASE_SERVICE_KEY': process.env.SUPABASE_SERVICE_KEY,
  'SHOPIFY_STORE_DOMAIN': process.env.SHOPIFY_STORE_DOMAIN,
  'SHOPIFY_ADMIN_ACCESS_TOKEN': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  'FIRECRAWL_API_KEY': process.env.FIRECRAWL_API_KEY,
  'SENDGRID_API_KEY': process.env.SENDGRID_API_KEY,
};

for (const [key, value] of Object.entries(required)) {
  if (value) {
    console.log(`✅ ${key}: SET (${value.length} chars)`);
  } else {
    console.log(`❌ ${key}: NOT SET`);
  }
}

console.log('\n=== Shopify Connection Test ===\n');

const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

if (!storeDomain || !token) {
  console.log('❌ Missing Shopify credentials');
  process.exit(1);
}

console.log(`Store: ${storeDomain}`);
console.log(`Token: ${token.substring(0, 10)}...${token.slice(-4)}`);

// Test Shopify API
console.log('\nTesting Shopify API...');

try {
  const response = await fetch(`https://${storeDomain}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({
      query: `{
        shop {
          name
          email
        }
      }`,
    }),
  });

  console.log(`Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    console.log('❌ API request failed');

    if (response.status === 401) {
      console.log('\n🔑 Authentication Error:');
      console.log('Your access token is invalid.');
      console.log('\nSteps to fix:');
      console.log('1. Go to Shopify Admin → Settings → Apps and sales channels');
      console.log('2. Click "Develop apps"');
      console.log('3. Create or select your app');
      console.log('4. Configure scopes: read_products, write_products');
      console.log('5. Install app and copy Admin API access token');
    }
    process.exit(1);
  }

  const data = await response.json();

  if (data.errors) {
    console.log('❌ GraphQL errors:', JSON.stringify(data.errors, null, 2));
    process.exit(1);
  }

  if (data.data?.shop) {
    console.log('✅ Shopify API connected successfully!');
    console.log(`   Store: ${data.data.shop.name}`);
    console.log(`   Email: ${data.data.shop.email}`);
  }

  console.log('\n✅ All checks passed!');

} catch (error) {
  console.log('❌ Error:', error.message);
  process.exit(1);
}
