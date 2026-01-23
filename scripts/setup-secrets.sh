#!/bin/bash

# ============================================
# Secret Manager Setup Script
# ============================================
# Creates all required secrets in GCP Secret Manager
# Run after setup-gcp.sh and before first deployment
# ============================================

set -e

PROJECT_ID="honda-price-update"

echo "=========================================="
echo "  Setting up GCP Secret Manager"
echo "=========================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found in current directory"
    echo "Please run this script from the project root"
    exit 1
fi

# Load environment variables
source .env

# Function to create or update a secret
create_secret() {
    local secret_name=$1
    local secret_value=$2

    if [ -z "$secret_value" ]; then
        echo "  Warning: $secret_name is empty, skipping"
        return
    fi

    if gcloud secrets describe $secret_name --project=$PROJECT_ID &> /dev/null; then
        echo "  Updating $secret_name..."
        echo -n "$secret_value" | gcloud secrets versions add $secret_name --data-file=- --project=$PROJECT_ID
    else
        echo "  Creating $secret_name..."
        echo -n "$secret_value" | gcloud secrets create $secret_name --data-file=- --project=$PROJECT_ID
    fi
}

echo "Creating secrets from .env file..."
echo ""

# Supabase
create_secret "SUPABASE_URL" "$SUPABASE_URL"
create_secret "SUPABASE_ANON_KEY" "$SUPABASE_ANON_KEY"
create_secret "SUPABASE_SERVICE_KEY" "$SUPABASE_SERVICE_KEY"

# Shopify
create_secret "SHOPIFY_STORE_DOMAIN" "$SHOPIFY_STORE_DOMAIN"
create_secret "SHOPIFY_ADMIN_ACCESS_TOKEN" "$SHOPIFY_ADMIN_ACCESS_TOKEN"

# SendGrid
create_secret "SENDGRID_API_KEY" "$SENDGRID_API_KEY"

# Gemini
create_secret "GEMINI_API_KEY" "$GEMINI_API_KEY"

# Optional: Bright Data (if used)
if [ -n "$BRIGHT_DATA_PROXY_PASSWORD" ]; then
    create_secret "BRIGHT_DATA_PROXY_PASSWORD" "$BRIGHT_DATA_PROXY_PASSWORD"
fi

echo ""
echo "=========================================="
echo "  Secrets Created!"
echo "=========================================="
echo ""
echo "Granting Cloud Run access to secrets..."

# Get project number
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Grant access for each secret
for SECRET in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_KEY SHOPIFY_STORE_DOMAIN SHOPIFY_ADMIN_ACCESS_TOKEN SENDGRID_API_KEY GEMINI_API_KEY; do
    if gcloud secrets describe $SECRET --project=$PROJECT_ID &> /dev/null; then
        gcloud secrets add-iam-policy-binding $SECRET \
            --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
            --role="roles/secretmanager.secretAccessor" \
            --project=$PROJECT_ID \
            --quiet
    fi
done

echo ""
echo "Done! Secrets are ready for Cloud Run."
