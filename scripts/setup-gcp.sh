#!/bin/bash

# ============================================
# GCP Setup Script for Honda Price Update
# ============================================
# Run this script after installing gcloud CLI
# and authenticating with: gcloud auth login
# ============================================

set -e  # Exit on error

# Configuration
PROJECT_ID="honda-price-update"
REGION="us-central1"
REGISTRY="${REGION}-docker.pkg.dev"

echo "=========================================="
echo "  Honda Price Update - GCP Setup"
echo "=========================================="
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed."
    echo "Install it with: brew install google-cloud-sdk"
    exit 1
fi

# Check if logged in
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
    echo "Error: Not logged in to gcloud."
    echo "Run: gcloud auth login"
    exit 1
fi

echo "Step 1: Creating GCP project..."
if gcloud projects describe $PROJECT_ID &> /dev/null; then
    echo "  Project '$PROJECT_ID' already exists, skipping creation."
else
    gcloud projects create $PROJECT_ID --name="Honda Price Update"
    echo "  Project created."
fi

echo ""
echo "Step 2: Setting project as default..."
gcloud config set project $PROJECT_ID
echo "  Done."

echo ""
echo "Step 3: Enabling required APIs..."
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    containerregistry.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    cloudscheduler.googleapis.com \
    --quiet
echo "  Done."

echo ""
echo "Step 4: Creating Artifact Registry repository..."
if gcloud artifacts repositories describe honda-price-update --location=$REGION &> /dev/null; then
    echo "  Repository already exists, skipping."
else
    gcloud artifacts repositories create honda-price-update \
        --repository-format=docker \
        --location=$REGION \
        --description="Honda Price Update container images"
    echo "  Done."
fi

echo ""
echo "Step 5: Configuring Docker for Artifact Registry..."
gcloud auth configure-docker $REGISTRY --quiet
echo "  Done."

echo ""
echo "Step 6: Creating service account for GitHub Actions..."
SA_NAME="github-actions"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe $SA_EMAIL &> /dev/null; then
    echo "  Service account already exists, skipping creation."
else
    gcloud iam service-accounts create $SA_NAME \
        --display-name="GitHub Actions Deployer"
    echo "  Service account created."
fi

echo ""
echo "Step 7: Granting IAM roles to service account..."
for ROLE in roles/run.admin roles/storage.admin roles/artifactregistry.writer roles/iam.serviceAccountUser roles/secretmanager.secretAccessor; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SA_EMAIL" \
        --role="$ROLE" \
        --quiet
done
echo "  Done."

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "IMPORTANT: Manual steps required:"
echo ""
echo "1. Enable billing for the project:"
echo "   https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
echo ""
echo "2. Create service account key for GitHub Actions:"
echo "   gcloud iam service-accounts keys create gcp-key.json \\"
echo "     --iam-account=$SA_EMAIL"
echo ""
echo "3. Add the key contents to GitHub Secrets as 'GCP_SA_KEY'"
echo ""
echo "4. Create secrets in Secret Manager (run scripts/setup-secrets.sh)"
echo ""
echo "5. Push to main branch to trigger deployment"
echo ""
