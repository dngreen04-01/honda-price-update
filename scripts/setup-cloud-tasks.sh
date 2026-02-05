#!/bin/bash
#
# Cloud Tasks Setup Script
# Configures Google Cloud Tasks queue and updates Cloud Scheduler jobs
#
# Prerequisites:
# - gcloud CLI installed and authenticated
# - Appropriate IAM permissions
# - Cloud Run service deployed
#
# Usage:
#   ./scripts/setup-cloud-tasks.sh
#
# Environment variables (optional, will prompt if not set):
#   GCP_PROJECT_ID - GCP project ID
#   GCP_LOCATION - GCP region (default: us-central1)
#   CLOUD_RUN_SERVICE_URL - Cloud Run service URL
#   CLOUD_TASKS_SA_EMAIL - Service account email for OIDC

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Cloud Tasks Setup Script"
echo "=========================================="

# Get or prompt for configuration
PROJECT_ID="${GCP_PROJECT_ID:-}"
LOCATION="${GCP_LOCATION:-us-central1}"
QUEUE_NAME="${CLOUD_TASKS_QUEUE:-job-queue}"
SERVICE_URL="${CLOUD_RUN_SERVICE_URL:-}"
SA_EMAIL="${CLOUD_TASKS_SA_EMAIL:-}"

if [ -z "$PROJECT_ID" ]; then
  echo -e "${YELLOW}GCP_PROJECT_ID not set. Attempting to get from gcloud...${NC}"
  PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
  if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: Could not determine project ID. Set GCP_PROJECT_ID or run 'gcloud config set project <project>'${NC}"
    exit 1
  fi
fi

if [ -z "$SERVICE_URL" ]; then
  echo -e "${YELLOW}Fetching Cloud Run service URL...${NC}"
  SERVICE_URL=$(gcloud run services describe nodejs-api --region="$LOCATION" --format='value(status.url)' 2>/dev/null || echo "")
  if [ -z "$SERVICE_URL" ]; then
    echo -e "${RED}Error: Could not determine Cloud Run service URL. Set CLOUD_RUN_SERVICE_URL.${NC}"
    exit 1
  fi
fi

if [ -z "$SA_EMAIL" ]; then
  echo -e "${YELLOW}Using default compute service account...${NC}"
  PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
  SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi

echo ""
echo "Configuration:"
echo "  Project ID: $PROJECT_ID"
echo "  Location: $LOCATION"
echo "  Queue Name: $QUEUE_NAME"
echo "  Service URL: $SERVICE_URL"
echo "  Service Account: $SA_EMAIL"
echo ""

# Confirm before proceeding
read -p "Continue with this configuration? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Step 1: Enable Cloud Tasks API
echo ""
echo -e "${GREEN}Step 1: Enabling Cloud Tasks API...${NC}"
gcloud services enable cloudtasks.googleapis.com --project="$PROJECT_ID"

# Step 2: Create Cloud Tasks queue
echo ""
echo -e "${GREEN}Step 2: Creating Cloud Tasks queue...${NC}"

# Check if queue exists
QUEUE_EXISTS=$(gcloud tasks queues describe "$QUEUE_NAME" --location="$LOCATION" --project="$PROJECT_ID" 2>/dev/null && echo "yes" || echo "no")

if [ "$QUEUE_EXISTS" = "yes" ]; then
  echo -e "${YELLOW}Queue '$QUEUE_NAME' already exists. Updating configuration...${NC}"
  gcloud tasks queues update "$QUEUE_NAME" \
    --location="$LOCATION" \
    --project="$PROJECT_ID" \
    --max-concurrent-dispatches=1 \
    --max-attempts=5 \
    --min-backoff=60s \
    --max-backoff=3600s \
    --max-doublings=4
else
  echo "Creating queue '$QUEUE_NAME'..."
  gcloud tasks queues create "$QUEUE_NAME" \
    --location="$LOCATION" \
    --project="$PROJECT_ID" \
    --max-concurrent-dispatches=1 \
    --max-attempts=5 \
    --min-backoff=60s \
    --max-backoff=3600s \
    --max-doublings=4
fi

# Step 3: Grant IAM permissions
echo ""
echo -e "${GREEN}Step 3: Configuring IAM permissions...${NC}"

# Allow service account to create tasks
echo "Granting Cloud Tasks Enqueuer role..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/cloudtasks.enqueuer" \
  --condition=None \
  --quiet 2>/dev/null || echo "  (Role may already be granted)"

# Allow Cloud Tasks to invoke Cloud Run
echo "Granting Cloud Run Invoker role to Cloud Tasks..."
gcloud run services add-iam-policy-binding nodejs-api \
  --region="$LOCATION" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/run.invoker" \
  --quiet 2>/dev/null || echo "  (Role may already be granted)"

# Step 4: Update or create Cloud Scheduler jobs
echo ""
echo -e "${GREEN}Step 4: Configuring Cloud Scheduler jobs...${NC}"

# Nightly scraper job
echo "Configuring nightly-scraper job..."
NIGHTLY_EXISTS=$(gcloud scheduler jobs describe nightly-scraper --location="$LOCATION" --project="$PROJECT_ID" 2>/dev/null && echo "yes" || echo "no")

if [ "$NIGHTLY_EXISTS" = "yes" ]; then
  echo "  Updating existing nightly-scraper job..."
  gcloud scheduler jobs update http nightly-scraper \
    --location="$LOCATION" \
    --project="$PROJECT_ID" \
    --uri="${SERVICE_URL}/api/schedule/nightly-scrape" \
    --http-method=POST \
    --oidc-service-account-email="$SA_EMAIL" \
    --oidc-token-audience="$SERVICE_URL" \
    --schedule="0 2 * * *" \
    --time-zone="Pacific/Auckland" \
    --description="Triggers nightly price scrape via Cloud Tasks"
else
  echo "  Creating nightly-scraper job..."
  gcloud scheduler jobs create http nightly-scraper \
    --location="$LOCATION" \
    --project="$PROJECT_ID" \
    --uri="${SERVICE_URL}/api/schedule/nightly-scrape" \
    --http-method=POST \
    --oidc-service-account-email="$SA_EMAIL" \
    --oidc-token-audience="$SERVICE_URL" \
    --schedule="0 2 * * *" \
    --time-zone="Pacific/Auckland" \
    --description="Triggers nightly price scrape via Cloud Tasks"
fi

# Weekly crawler job
echo "Configuring weekly-crawler job..."
WEEKLY_EXISTS=$(gcloud scheduler jobs describe weekly-crawler --location="$LOCATION" --project="$PROJECT_ID" 2>/dev/null && echo "yes" || echo "no")

if [ "$WEEKLY_EXISTS" = "yes" ]; then
  echo "  Updating existing weekly-crawler job..."
  gcloud scheduler jobs update http weekly-crawler \
    --location="$LOCATION" \
    --project="$PROJECT_ID" \
    --uri="${SERVICE_URL}/api/schedule/weekly-crawl" \
    --http-method=POST \
    --oidc-service-account-email="$SA_EMAIL" \
    --oidc-token-audience="$SERVICE_URL" \
    --schedule="0 2 * * 0" \
    --time-zone="Pacific/Auckland" \
    --description="Triggers weekly website crawl via Cloud Tasks"
else
  echo "  Creating weekly-crawler job..."
  gcloud scheduler jobs create http weekly-crawler \
    --location="$LOCATION" \
    --project="$PROJECT_ID" \
    --uri="${SERVICE_URL}/api/schedule/weekly-crawl" \
    --http-method=POST \
    --oidc-service-account-email="$SA_EMAIL" \
    --oidc-token-audience="$SERVICE_URL" \
    --schedule="0 2 * * 0" \
    --time-zone="Pacific/Auckland" \
    --description="Triggers weekly website crawl via Cloud Tasks"
fi

# Nightly offers crawler job (runs at 1 AM, before the 2 AM price scraper)
echo "Configuring nightly-offers-crawler job..."
OFFERS_EXISTS=$(gcloud scheduler jobs describe nightly-offers-crawler --location="$LOCATION" --project="$PROJECT_ID" 2>/dev/null && echo "yes" || echo "no")

if [ "$OFFERS_EXISTS" = "yes" ]; then
  echo "  Updating existing nightly-offers-crawler job..."
  gcloud scheduler jobs update http nightly-offers-crawler \
    --location="$LOCATION" \
    --project="$PROJECT_ID" \
    --uri="${SERVICE_URL}/api/schedule/nightly-offers" \
    --http-method=POST \
    --oidc-service-account-email="$SA_EMAIL" \
    --oidc-token-audience="$SERVICE_URL" \
    --schedule="0 1 * * *" \
    --time-zone="Pacific/Auckland" \
    --description="Triggers nightly offers-only crawl via Cloud Tasks (runs before price scraper)"
else
  echo "  Creating nightly-offers-crawler job..."
  gcloud scheduler jobs create http nightly-offers-crawler \
    --location="$LOCATION" \
    --project="$PROJECT_ID" \
    --uri="${SERVICE_URL}/api/schedule/nightly-offers" \
    --http-method=POST \
    --oidc-service-account-email="$SA_EMAIL" \
    --oidc-token-audience="$SERVICE_URL" \
    --schedule="0 1 * * *" \
    --time-zone="Pacific/Auckland" \
    --description="Triggers nightly offers-only crawl via Cloud Tasks (runs before price scraper)"
fi

# Step 5: Verify configuration
echo ""
echo -e "${GREEN}Step 5: Verifying configuration...${NC}"

echo ""
echo "Cloud Tasks Queue:"
gcloud tasks queues describe "$QUEUE_NAME" --location="$LOCATION" --project="$PROJECT_ID" --format="table(name,state,rateLimits.maxConcurrentDispatches,retryConfig.maxAttempts)"

echo ""
echo "Cloud Scheduler Jobs:"
gcloud scheduler jobs list --location="$LOCATION" --project="$PROJECT_ID" --format="table(name,schedule,timeZone,state)"

echo ""
echo "=========================================="
echo -e "${GREEN}Setup complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Deploy the updated application to Cloud Run"
echo "2. Test the scheduler endpoints manually:"
echo "   curl -X POST ${SERVICE_URL}/api/schedule/nightly-scrape"
echo "3. Test Cloud Scheduler by running jobs manually:"
echo "   gcloud scheduler jobs run nightly-scraper --location=$LOCATION"
echo "4. Monitor Cloud Tasks queue:"
echo "   gcloud tasks list --queue=$QUEUE_NAME --location=$LOCATION"
echo ""
echo "Environment variables to set in Cloud Run:"
echo "  GCP_PROJECT_ID=$PROJECT_ID"
echo "  GCP_LOCATION=$LOCATION"
echo "  CLOUD_TASKS_QUEUE=$QUEUE_NAME"
echo "  CLOUD_TASKS_SA_EMAIL=$SA_EMAIL"
echo "  CLOUD_RUN_SERVICE_URL=$SERVICE_URL"
echo ""
