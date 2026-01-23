# Cloud Deployment Plan: Honda Price Update

## Overview

| Component | Local | Cloud |
|-----------|-------|-------|
| Node.js API | localhost:3000 | GCP Cloud Run |
| Python Scraper | localhost:8002 | GCP Cloud Run |
| Frontend | localhost:5174 | GCP Cloud Run (or Firebase Hosting) |
| Database | Supabase | Supabase (no change) |
| CI/CD | Manual | GitHub Actions |

---

## Prerequisites Checklist

- [ ] Google Cloud account with billing enabled
- [ ] `gcloud` CLI installed locally
- [ ] Docker Desktop installed
- [ ] GitHub repository access

---

## Step 1: Install Google Cloud CLI

### macOS
```bash
brew install google-cloud-sdk
```

### Verify Installation
```bash
gcloud --version
```

---

## Step 2: Create GCP Project

### 2.1 Login to Google Cloud
```bash
gcloud auth login
```

### 2.2 Create New Project
```bash
gcloud projects create honda-price-update --name="Honda Price Update"
```

### 2.3 Set Project as Default
```bash
gcloud config set project honda-price-update
```

### 2.4 Enable Required APIs
```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

### 2.5 Enable Billing
Go to: https://console.cloud.google.com/billing
Link your billing account to the `honda-price-update` project.

---

## Step 3: Create Docker Files

### 3.1 Python Scraper Dockerfile

Create file: `python-scraper/Dockerfile`

```dockerfile
FROM python:3.11-slim

# Install system dependencies for Scrapling/Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN pip install playwright && playwright install chromium

# Copy application code
COPY server.py .

# Expose port
EXPOSE 8080

# Run the application (Cloud Run uses PORT env var)
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}"]
```

### 3.2 Node.js API Dockerfile

Create file: `Dockerfile` (in project root)

```dockerfile
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 8080

# Run the application
CMD ["node", "dist/server.js"]
```

### 3.3 Frontend Dockerfile (Optional)

Create file: `frontend/Dockerfile`

```dockerfile
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
```

Create file: `frontend/nginx.conf`

```nginx
server {
    listen 8080;
    server_name localhost;

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
```

### 3.4 Docker Ignore Files

Create file: `.dockerignore` (in project root)

```
node_modules
.env
.env.*
dist
*.log
.git
.gitignore
*.md
tests
coverage
```

Create file: `python-scraper/.dockerignore`

```
venv
__pycache__
*.pyc
.env
*.log
.git
```

---

## Step 4: Update Application for Cloud Run

### 4.1 Update Python Server Port

Edit `python-scraper/server.py` - ensure it reads PORT from environment:

The server already uses uvicorn, which will use the PORT env var from our Dockerfile CMD.

### 4.2 Update Node.js Server Port

Edit `src/server.ts` - update the port configuration:

```typescript
const PORT = process.env.PORT || 3000;
```

### 4.3 Update Scrapling Service URL Config

The Python scraper URL needs to be configurable for cloud. Update `src/utils/config.ts`:

```typescript
SCRAPLING_SERVICE_URL: process.env.SCRAPLING_SERVICE_URL || 'http://localhost:8002',
```

---

## Step 5: Set Up GCP Secret Manager

### 5.1 Create Secrets

```bash
# Supabase
echo -n "your-supabase-url" | gcloud secrets create SUPABASE_URL --data-file=-
echo -n "your-supabase-anon-key" | gcloud secrets create SUPABASE_ANON_KEY --data-file=-
echo -n "your-supabase-service-key" | gcloud secrets create SUPABASE_SERVICE_KEY --data-file=-

# Shopify
echo -n "your-shopify-domain" | gcloud secrets create SHOPIFY_STORE_DOMAIN --data-file=-
echo -n "your-shopify-token" | gcloud secrets create SHOPIFY_ADMIN_ACCESS_TOKEN --data-file=-

# SendGrid
echo -n "your-sendgrid-key" | gcloud secrets create SENDGRID_API_KEY --data-file=-

# Bright Data Proxy
echo -n "your-proxy-password" | gcloud secrets create BRIGHT_DATA_PROXY_PASSWORD --data-file=-

# Gemini
echo -n "your-gemini-key" | gcloud secrets create GEMINI_API_KEY --data-file=-
```

### 5.2 Grant Cloud Run Access to Secrets

```bash
# Get the project number
PROJECT_NUMBER=$(gcloud projects describe honda-price-update --format='value(projectNumber)')

# Grant access
gcloud secrets add-iam-policy-binding SUPABASE_URL \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Repeat for all secrets (or use a script)
for SECRET in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_KEY \
  SHOPIFY_STORE_DOMAIN SHOPIFY_ADMIN_ACCESS_TOKEN SENDGRID_API_KEY \
  BRIGHT_DATA_PROXY_PASSWORD GEMINI_API_KEY; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## Step 6: Create Artifact Registry Repository

```bash
# Create repository for Docker images
gcloud artifacts repositories create honda-price-update \
  --repository-format=docker \
  --location=us-central1 \
  --description="Honda Price Update container images"

# Configure Docker to use Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev
```

---

## Step 7: Deploy Services to Cloud Run (Manual First)

### 7.1 Build and Push Python Scraper

```bash
cd python-scraper

# Build image
docker build -t us-central1-docker.pkg.dev/honda-price-update/honda-price-update/python-scraper:latest .

# Push to Artifact Registry
docker push us-central1-docker.pkg.dev/honda-price-update/honda-price-update/python-scraper:latest

# Deploy to Cloud Run
gcloud run deploy python-scraper \
  --image us-central1-docker.pkg.dev/honda-price-update/honda-price-update/python-scraper:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 5

cd ..
```

### 7.2 Get Python Scraper URL

```bash
SCRAPER_URL=$(gcloud run services describe python-scraper \
  --region us-central1 \
  --format='value(status.url)')

echo "Python Scraper URL: $SCRAPER_URL"
```

### 7.3 Build and Push Node.js API

```bash
# Build image
docker build -t us-central1-docker.pkg.dev/honda-price-update/honda-price-update/nodejs-api:latest .

# Push to Artifact Registry
docker push us-central1-docker.pkg.dev/honda-price-update/honda-price-update/nodejs-api:latest

# Deploy to Cloud Run with secrets
gcloud run deploy nodejs-api \
  --image us-central1-docker.pkg.dev/honda-price-update/honda-price-update/nodejs-api:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "NODE_ENV=production,TIMEZONE=Pacific/Auckland" \
  --set-env-vars "SCRAPLING_SERVICE_URL=$SCRAPER_URL" \
  --set-secrets "SUPABASE_URL=SUPABASE_URL:latest" \
  --set-secrets "SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest" \
  --set-secrets "SUPABASE_SERVICE_KEY=SUPABASE_SERVICE_KEY:latest" \
  --set-secrets "SHOPIFY_STORE_DOMAIN=SHOPIFY_STORE_DOMAIN:latest" \
  --set-secrets "SHOPIFY_ADMIN_ACCESS_TOKEN=SHOPIFY_ADMIN_ACCESS_TOKEN:latest" \
  --set-secrets "SENDGRID_API_KEY=SENDGRID_API_KEY:latest" \
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

### 7.4 Build and Push Frontend

```bash
cd frontend

# Build image
docker build -t us-central1-docker.pkg.dev/honda-price-update/honda-price-update/frontend:latest .

# Push to Artifact Registry
docker push us-central1-docker.pkg.dev/honda-price-update/honda-price-update/frontend:latest

# Get the API URL first
API_URL=$(gcloud run services describe nodejs-api \
  --region us-central1 \
  --format='value(status.url)')

# Deploy to Cloud Run
gcloud run deploy frontend \
  --image us-central1-docker.pkg.dev/honda-price-update/honda-price-update/frontend:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3

cd ..
```

---

## Step 8: Create GitHub Actions Workflow

### 8.1 Create Workflow File

Create file: `.github/workflows/deploy.yml`

```yaml
name: Deploy to Google Cloud Run

on:
  push:
    branches:
      - main

env:
  PROJECT_ID: honda-price-update
  REGION: us-central1
  REGISTRY: us-central1-docker.pkg.dev

jobs:
  # Job 1: Deploy Python Scraper
  deploy-python-scraper:
    name: Deploy Python Scraper
    runs-on: ubuntu-latest

    permissions:
      contents: read
      id-token: write

    outputs:
      scraper_url: ${{ steps.deploy.outputs.url }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2
        with:
          project_id: ${{ env.PROJECT_ID }}

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.REGISTRY }}

      - name: Build and Push Image
        run: |
          docker build -t ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/python-scraper:${{ github.sha }} \
            -t ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/python-scraper:latest \
            ./python-scraper
          docker push ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/python-scraper:${{ github.sha }}
          docker push ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/python-scraper:latest

      - name: Deploy to Cloud Run
        id: deploy
        uses: google-github-actions/deploy-cloudrun@v2
        with:
          service: python-scraper
          region: ${{ env.REGION }}
          image: ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/python-scraper:${{ github.sha }}
          flags: |
            --memory=2Gi
            --cpu=2
            --timeout=300
            --min-instances=0
            --max-instances=5
            --allow-unauthenticated

      - name: Output URL
        run: echo "Python Scraper URL - ${{ steps.deploy.outputs.url }}"

  # Job 2: Deploy Node.js API (depends on Python Scraper)
  deploy-nodejs-api:
    name: Deploy Node.js API
    runs-on: ubuntu-latest
    needs: deploy-python-scraper

    permissions:
      contents: read
      id-token: write

    outputs:
      api_url: ${{ steps.deploy.outputs.url }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2
        with:
          project_id: ${{ env.PROJECT_ID }}

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.REGISTRY }}

      - name: Build and Push Image
        run: |
          docker build -t ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/nodejs-api:${{ github.sha }} \
            -t ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/nodejs-api:latest \
            .
          docker push ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/nodejs-api:${{ github.sha }}
          docker push ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/nodejs-api:latest

      - name: Deploy to Cloud Run
        id: deploy
        uses: google-github-actions/deploy-cloudrun@v2
        with:
          service: nodejs-api
          region: ${{ env.REGION }}
          image: ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/nodejs-api:${{ github.sha }}
          env_vars: |
            NODE_ENV=production
            TIMEZONE=Pacific/Auckland
            SCRAPLING_SERVICE_URL=${{ needs.deploy-python-scraper.outputs.scraper_url }}
          secrets: |
            SUPABASE_URL=SUPABASE_URL:latest
            SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest
            SUPABASE_SERVICE_KEY=SUPABASE_SERVICE_KEY:latest
            SHOPIFY_STORE_DOMAIN=SHOPIFY_STORE_DOMAIN:latest
            SHOPIFY_ADMIN_ACCESS_TOKEN=SHOPIFY_ADMIN_ACCESS_TOKEN:latest
            SENDGRID_API_KEY=SENDGRID_API_KEY:latest
            GEMINI_API_KEY=GEMINI_API_KEY:latest
          flags: |
            --memory=1Gi
            --cpu=1
            --timeout=300
            --min-instances=0
            --max-instances=10
            --allow-unauthenticated

      - name: Output URL
        run: echo "Node.js API URL - ${{ steps.deploy.outputs.url }}"

  # Job 3: Deploy Frontend (depends on Node.js API)
  deploy-frontend:
    name: Deploy Frontend
    runs-on: ubuntu-latest
    needs: deploy-nodejs-api

    permissions:
      contents: read
      id-token: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2
        with:
          project_id: ${{ env.PROJECT_ID }}

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.REGISTRY }}

      - name: Build and Push Image
        run: |
          docker build -t ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/frontend:${{ github.sha }} \
            -t ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/frontend:latest \
            --build-arg VITE_API_URL=${{ needs.deploy-nodejs-api.outputs.api_url }} \
            --build-arg VITE_SUPABASE_URL=${{ secrets.SUPABASE_URL }} \
            --build-arg VITE_SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }} \
            ./frontend
          docker push ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/frontend:${{ github.sha }}
          docker push ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/frontend:latest

      - name: Deploy to Cloud Run
        id: deploy
        uses: google-github-actions/deploy-cloudrun@v2
        with:
          service: frontend
          region: ${{ env.REGION }}
          image: ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/honda-price-update/frontend:${{ github.sha }}
          flags: |
            --memory=256Mi
            --cpu=1
            --min-instances=0
            --max-instances=3
            --allow-unauthenticated

      - name: Output URL
        run: echo "Frontend URL - ${{ steps.deploy.outputs.url }}"

  # Job 4: Summary
  deployment-summary:
    name: Deployment Summary
    runs-on: ubuntu-latest
    needs: [deploy-python-scraper, deploy-nodejs-api, deploy-frontend]

    steps:
      - name: Print URLs
        run: |
          echo "=== Deployment Complete ==="
          echo "Python Scraper: ${{ needs.deploy-python-scraper.outputs.scraper_url }}"
          echo "Node.js API: ${{ needs.deploy-nodejs-api.outputs.api_url }}"
          echo "Frontend: ${{ needs.deploy-frontend.outputs.url }}"
```

---

## Step 9: Create GCP Service Account for GitHub Actions

### 9.1 Create Service Account

```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Deployer"

# Get the email
SA_EMAIL="github-actions@honda-price-update.iam.gserviceaccount.com"

# Grant required roles
gcloud projects add-iam-policy-binding honda-price-update \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding honda-price-update \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding honda-price-update \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding honda-price-update \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding honda-price-update \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/secretmanager.secretAccessor"
```

### 9.2 Create and Download Key

```bash
gcloud iam service-accounts keys create gcp-key.json \
  --iam-account=$SA_EMAIL

# View the key (you'll add this to GitHub)
cat gcp-key.json
```

### 9.3 Add to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `GCP_SA_KEY` | Contents of `gcp-key.json` |
| `SUPABASE_URL` | Your Supabase URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon key |

### 9.4 Delete Local Key File

```bash
rm gcp-key.json  # Don't commit this!
```

---

## Step 10: Update Frontend for Production

### 10.1 Update Frontend Dockerfile for Build Args

Update `frontend/Dockerfile`:

```dockerfile
FROM node:20-slim AS builder

WORKDIR /app

# Accept build arguments
ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Set as environment variables for build
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
```

---

## Step 11: Handle Scheduled Jobs

Cloud Run is stateless and scales to zero. For scheduled jobs (nightly scraper, weekly crawler), use **Cloud Scheduler**.

### 11.1 Create Cloud Scheduler Jobs

```bash
# Nightly scraper job - runs at 2 AM NZ time
gcloud scheduler jobs create http nightly-scraper \
  --location us-central1 \
  --schedule "0 2 * * *" \
  --time-zone "Pacific/Auckland" \
  --uri "$(gcloud run services describe nodejs-api --region us-central1 --format='value(status.url)')/api/trigger-nightly-scrape" \
  --http-method POST \
  --oidc-service-account-email "$SA_EMAIL"

# Weekly crawler job - runs Sunday at 3 AM NZ time
gcloud scheduler jobs create http weekly-crawler \
  --location us-central1 \
  --schedule "0 3 * * 0" \
  --time-zone "Pacific/Auckland" \
  --uri "$(gcloud run services describe nodejs-api --region us-central1 --format='value(status.url)')/api/trigger-weekly-crawl" \
  --http-method POST \
  --oidc-service-account-email "$SA_EMAIL"
```

### 11.2 Add Trigger Endpoints to API

Add to `src/server.ts`:

```typescript
// Cloud Scheduler trigger endpoints
app.post('/api/trigger-nightly-scrape', async (req, res) => {
  // Verify Cloud Scheduler request (optional but recommended)
  const nightlyJob = await import('./scheduler/nightly-scraper-job');
  await nightlyJob.runNightlyScraper();
  res.json({ success: true });
});

app.post('/api/trigger-weekly-crawl', async (req, res) => {
  const weeklyJob = await import('./scheduler/weekly-crawler-job');
  await weeklyJob.runWeeklyCrawler();
  res.json({ success: true });
});
```

---

## Step 12: Test Deployment

### 12.1 Test Locally with Docker

```bash
# Build and test Python scraper
cd python-scraper
docker build -t python-scraper-test .
docker run -p 8002:8080 python-scraper-test
# Test: curl http://localhost:8002/health

# Build and test Node.js API
cd ..
docker build -t nodejs-api-test .
docker run -p 3000:8080 \
  -e SUPABASE_URL=your-url \
  -e SUPABASE_SERVICE_KEY=your-key \
  -e SCRAPLING_SERVICE_URL=http://host.docker.internal:8002 \
  nodejs-api-test
```

### 12.2 Test Cloud Run Services

```bash
# Get service URLs
gcloud run services list --region us-central1

# Test health endpoints
curl https://python-scraper-xxxxx-uc.a.run.app/health
curl https://nodejs-api-xxxxx-uc.a.run.app/health
```

---

## Execution Checklist

### Phase 1: Setup (Do Once)
- [ ] Install gcloud CLI
- [ ] Create GCP project
- [ ] Enable required APIs
- [ ] Link billing account
- [ ] Create Artifact Registry repository
- [ ] Create GCP secrets
- [ ] Create service account for GitHub Actions
- [ ] Add secrets to GitHub repository

### Phase 2: Dockerize (Do Once)
- [ ] Create `python-scraper/Dockerfile`
- [ ] Create root `Dockerfile` for Node.js
- [ ] Create `frontend/Dockerfile`
- [ ] Create `.dockerignore` files
- [ ] Test Docker builds locally

### Phase 3: Deploy (Do Once Manually)
- [ ] Build and push Python scraper image
- [ ] Deploy Python scraper to Cloud Run
- [ ] Build and push Node.js API image
- [ ] Deploy Node.js API to Cloud Run
- [ ] Build and push frontend image
- [ ] Deploy frontend to Cloud Run
- [ ] Verify all services are running

### Phase 4: CI/CD (Do Once)
- [ ] Create `.github/workflows/deploy.yml`
- [ ] Push to main branch
- [ ] Verify GitHub Actions runs successfully
- [ ] Check all services updated

### Phase 5: Scheduled Jobs
- [ ] Add trigger endpoints to API
- [ ] Create Cloud Scheduler jobs
- [ ] Test scheduler triggers

---

## Cost Estimates (GCP Cloud Run)

| Service | Config | Estimated Monthly Cost |
|---------|--------|------------------------|
| Python Scraper | 2GB RAM, 2 CPU, scales to 0 | $5-20 |
| Node.js API | 1GB RAM, 1 CPU, scales to 0 | $5-15 |
| Frontend | 256MB RAM, scales to 0 | $1-5 |
| Artifact Registry | Storage | $1-3 |
| Cloud Scheduler | 2 jobs | Free tier |
| Secret Manager | ~10 secrets | Free tier |
| **Total** | | **~$12-43/month** |

*Costs depend on actual usage. Cloud Run charges per request + CPU/memory time.*

---

## Troubleshooting

### Common Issues

**Docker build fails**
```bash
# Check for syntax errors
docker build --no-cache -t test .
```

**Cloud Run deploy fails**
```bash
# Check logs
gcloud run services logs read nodejs-api --region us-central1
```

**GitHub Actions fails**
- Check service account has correct permissions
- Verify GCP_SA_KEY secret is valid JSON
- Check Cloud Run logs for deployment errors

**Service can't connect to Supabase**
- Verify secrets are correctly set in Secret Manager
- Check Cloud Run service has secretAccessor role

**Python scraper out of memory**
- Increase memory allocation in Cloud Run config
- Use `--memory 4Gi` if needed for heavy scraping

---

## Next Steps After Deployment

1. **Custom Domain**: Set up custom domain for frontend
2. **Monitoring**: Set up Cloud Monitoring alerts
3. **Logging**: Configure Cloud Logging for debugging
4. **Backup**: Regular Supabase database backups
5. **Security**: Review Cloud Run ingress settings
