#!/bin/bash

# Honda Supplier Price Scraper - Installation Script
# This script automates the initial setup process

set -e

echo "🚀 Honda Supplier Price Scraper - Installation"
echo "=============================================="
echo ""

# Check Node.js version
echo "✓ Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Error: Node.js 18+ is required (found v$NODE_VERSION)"
  exit 1
fi
echo "  Node.js $(node -v) detected"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo ""

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  echo "📝 Creating .env file..."
  cp .env.example .env
  echo "  ⚠️  Please edit .env with your API keys and credentials"
  echo ""
else
  echo "✓ .env file already exists"
  echo ""
fi

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build
echo ""

# Check if .env is configured
echo "🔍 Checking configuration..."
if grep -q "your-project" .env || grep -q "xxxxx" .env; then
  echo "  ⚠️  Warning: .env appears to contain placeholder values"
  echo "  Please update .env with your actual credentials before continuing"
  echo ""
  echo "Required credentials:"
  echo "  - SUPABASE_URL and SUPABASE_SERVICE_KEY"
  echo "  - FIRECRAWL_API_KEY"
  echo "  - SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN"
  echo "  - SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, SENDGRID_DIGEST_TEMPLATE_ID"
  echo "  - SENDGRID_RECIPIENT_EMAILS"
  echo ""
  echo "After updating .env, run: npm run test:components"
  exit 0
fi

# Run component tests
echo "🧪 Testing components..."
npm run test:components

echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Review test results above"
echo "  2. Create Shopify metafield: custom.source_url"
echo "  3. Link Shopify products with supplier URLs"
echo "  4. Create SendGrid template (see sendgrid-template-example.html)"
echo "  5. Run a test scrape: npm run scrape"
echo ""
echo "For detailed instructions, see SETUP.md and DEPLOYMENT.md"
