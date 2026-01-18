# Honda Price Update - Google Cloud Platform Deployment ExecPlan

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `References/Plans.md`.

---

## Purpose / Big Picture

This plan enables the Honda Price Update application to run reliably in the cloud with automated deployments, eliminating manual local execution and providing production-grade reliability, monitoring, and scaling.

**What someone gains after this change**: The application will automatically scrape Honda NZ supplier websites nightly, sync prices to Shopify, and send digest emails - all without manual intervention. The team can deploy changes by pushing to GitHub, monitor system health via dashboards, and scale resources automatically based on demand.

**How to see it working**: After deployment, navigate to `https://[your-domain]/` to access the dashboard. Check `https://[api-url]/api/health` for API status. View Cloud Scheduler to confirm nightly jobs are scheduled. Check Cloud Logging for execution logs.

---

## Progress

- [ ] Phase 1: GCP Project Setup and Infrastructure (Using Existing Project)
  - [ ] Enable required APIs on existing GCP project
  - [ ] Set up Artifact Registry
  - [ ] Configure Secret Manager with all credentials
  - [ ] Create service accounts with IAM bindings
  - [ ] Set up Workload Identity Federation for GitHub Actions

- [ ] Phase 2: Containerization
  - [ ] Create Dockerfile.api for Node.js API service
  - [ ] Create Dockerfile.scraper for Python scraper service
  - [ ] Create .dockerignore files
  - [ ] Create docker-compose.yml for local development
  - [ ] Test local Docker builds
  - [ ] Add HTTP trigger endpoints for Cloud Scheduler

- [ ] Phase 3: CI/CD Pipeline (Production Only)
  - [ ] Create GitHub Actions workflow (.github/workflows/ci-cd.yml)
  - [ ] Configure GitHub Secrets for production
  - [ ] Create GitHub production Environment with protection rules
  - [ ] Test build and deploy pipeline

- [ ] Phase 4: Cloud Run Deployment (Production)
  - [ ] Deploy Python Scraper service to production
  - [ ] Deploy Node.js API service to production
  - [ ] Configure internal service-to-service communication
  - [ ] Set up Cloud Scheduler jobs (nightly scrape, weekly crawl)

- [ ] Phase 5: Frontend Deployment (Firebase Default URL)
  - [ ] Configure Firebase Hosting
  - [ ] Deploy frontend static assets
  - [ ] Verify Firebase default URL works

- [ ] Phase 6: Monitoring and Validation
  - [ ] Set up Cloud Logging dashboards
  - [ ] Configure alerting policies
  - [ ] Run end-to-end validation test
  - [ ] Document runbooks and procedures

---

## Surprises & Discoveries

_To be updated as implementation proceeds._

---

## Decision Log

- **Decision**: Use Cloud Run instead of GKE/Kubernetes
  - **Rationale**: Cloud Run provides serverless container execution with automatic scaling, HTTPS, and pay-per-use pricing. The application's workload pattern (scheduled jobs + occasional API calls) is ideal for Cloud Run's scale-to-zero capability. GKE would be over-engineered for this use case.
  - **Date/Author**: 2026-01-17 / Planning Phase

- **Decision**: Keep Supabase as the database (do not migrate to Cloud SQL)
  - **Rationale**: Supabase is already configured with RLS policies, auth, and all migrations applied. Migration to Cloud SQL would add complexity without significant benefit. Supabase provides managed PostgreSQL with automatic backups.
  - **Date/Author**: 2026-01-17 / Planning Phase

- **Decision**: Use Firebase Hosting for frontend instead of Cloud Storage + CDN
  - **Rationale**: Firebase Hosting provides built-in CDN, automatic SSL, easy rollbacks, and seamless integration with Cloud Run for API rewrites. Simpler deployment workflow.
  - **Date/Author**: 2026-01-17 / Planning Phase

- **Decision**: Use Cloud Scheduler + HTTP triggers instead of internal node-cron
  - **Rationale**: Cloud Scheduler provides reliable scheduling with automatic retries, monitoring, and doesn't require a long-running container. The API will expose HTTP endpoints that Cloud Scheduler calls to trigger jobs.
  - **Date/Author**: 2026-01-17 / Planning Phase

- **Decision**: Deploy to australia-southeast1 (Sydney) region
  - **Rationale**: Lowest latency to New Zealand users. Supabase is likely in a nearby region. Cost-competitive with US regions.
  - **Date/Author**: 2026-01-17 / Planning Phase

---

## Outcomes & Retrospective

_To be completed at major milestones or at completion._

---

## Context and Orientation

### Application Overview

The Honda Price Update application is a full-stack web application that:
1. Crawls Honda NZ supplier websites to discover products and prices
2. Scrapes product pages for pricing information
3. Syncs prices to a Shopify store
4. Sends email digests with price changes
5. Provides a React dashboard for monitoring and management

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Current Local Architecture                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │ React       │    │ Node.js API │    │ Python Scraper      │ │
│  │ Frontend    │───►│ (Express)   │───►│ (FastAPI+Scrapling) │ │
│  │ Port 5173   │    │ Port 3000   │    │ Port 8002           │ │
│  └─────────────┘    └──────┬──────┘    └─────────────────────┘ │
│                            │                                    │
│                    ┌───────┴───────┐                           │
│                    │ node-cron     │                           │
│                    │ (Scheduler)   │                           │
│                    └───────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                           │
├─────────────────────────────────────────────────────────────────┤
│  Supabase (PostgreSQL) │ Shopify API │ SendGrid │ Gemini AI    │
└─────────────────────────────────────────────────────────────────┘
```

### Key Files and Directories

| Path | Purpose |
|------|---------|
| `src/server.ts` | Express API server entry point (port 3000) |
| `src/index.ts` | Nightly job orchestrator with node-cron scheduler |
| `src/api/` | API route handlers (crawl, scrape, sync, admin) |
| `src/scraper/` | Price extraction and scraping logic |
| `src/crawler/` | Website crawling and product discovery |
| `src/database/` | Supabase client and queries |
| `src/shopify/` | Shopify GraphQL client and sync logic |
| `src/scheduler/` | Job scheduling (node-cron based) |
| `src/utils/config.ts` | Environment variable configuration |
| `python-scraper/server.py` | FastAPI scraper with Scrapling |
| `python-scraper/requirements.txt` | Python dependencies |
| `frontend/` | React 19 + Vite frontend application |
| `migrations/` | SQL migration files (10 migrations) |

### Environment Variables Required

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...

# Shopify
SHOPIFY_STORE_DOMAIN=store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxx
SHOPIFY_API_VERSION=2024-07
SHOPIFY_LOCATION_ID=xxx

# SendGrid
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=notifications@domain.com
SENDGRID_DIGEST_TEMPLATE_ID=d-xxx
SENDGRID_RECIPIENT_EMAILS=email1,email2

# Gemini AI
GEMINI_API_KEY=AIza...

# Scraping
SCRAPLING_SERVICE_URL=http://localhost:8002
SCRAPLING_TIMEOUT_MS=60000
SCRAPLING_MAX_RETRIES=3

# Application
NODE_ENV=production
API_PORT=3000
TIMEZONE=Pacific/Auckland
LOG_LEVEL=info
SUPERUSER_EMAIL=admin@domain.com
```

---

## Plan of Work

### Milestone 1: GCP Infrastructure Setup

**Goal**: Establish the foundational GCP infrastructure required for deployment.

**What will exist at the end**: A configured GCP project with Artifact Registry for container images, Secret Manager with all application secrets, service accounts with appropriate IAM roles, and Workload Identity Federation configured for GitHub Actions.

**Work**:

1. **Enable GCP APIs** via gcloud CLI:
   - Cloud Run API
   - Artifact Registry API
   - Cloud Scheduler API
   - Secret Manager API
   - Cloud Build API
   - Firebase Hosting API

2. **Create Artifact Registry repository**:
   - Repository name: `honda-registry`
   - Location: `australia-southeast1`
   - Format: Docker

3. **Configure Secret Manager** with all environment variables listed above. Each secret should be created with automatic replication.

4. **Create Service Accounts**:
   - `honda-api-sa`: For API service (needs secretmanager.secretAccessor, run.invoker)
   - `honda-scraper-sa`: For scraper service (needs secretmanager.secretAccessor)
   - `honda-scheduler-sa`: For Cloud Scheduler (needs run.invoker)
   - `github-actions-deployer`: For CI/CD (needs run.admin, artifactregistry.writer, storage.admin)

5. **Configure Workload Identity Federation** for GitHub Actions to authenticate without long-lived keys.

**Commands to run** (from project root):

    gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
      cloudscheduler.googleapis.com secretmanager.googleapis.com \
      cloudbuild.googleapis.com firebase.googleapis.com

    gcloud artifacts repositories create honda-registry \
      --repository-format=docker \
      --location=australia-southeast1 \
      --description="Honda Price Update container images"

**Validation**: Run `gcloud artifacts repositories list` and verify `honda-registry` appears. Run `gcloud secrets list` and verify all secrets are created.

---

### Milestone 2: Containerization

**Goal**: Create production-ready Docker containers for all services.

**What will exist at the end**: Dockerfiles for API and Scraper services, docker-compose for local development, and verified local container builds.

**Work**:

1. **Create Dockerfile.api** at repository root:

   Multi-stage build with:
   - Stage 1 (builder): Install deps, compile TypeScript
   - Stage 2 (production): Copy dist and node_modules, run as non-root user
   - Health check on `/api/health`
   - Expose port 3000

2. **Create Dockerfile.scraper** at `python-scraper/Dockerfile`:

   Multi-stage build with:
   - Stage 1 (builder): Install Python deps in venv
   - Stage 2 (production): Install Chromium dependencies for Scrapling, copy venv
   - Install Patchright browser
   - Use dumb-init for signal handling
   - Health check on `/health`
   - Expose port 8002

3. **Create .dockerignore files** to exclude node_modules, .git, tests, etc.

4. **Create docker-compose.yml** for local development with:
   - api service (port 3000)
   - scraper service (port 8002)
   - Environment variables from .env file
   - Health check dependencies

5. **Add HTTP trigger endpoints** to `src/server.ts` for Cloud Scheduler:
   - `POST /api/jobs/nightly` - Triggers nightly scrape job
   - `POST /api/jobs/weekly-crawl` - Triggers weekly crawler job
   - These endpoints should be protected and only callable by Cloud Scheduler

**Commands to run**:

    docker compose build
    docker compose up -d
    curl http://localhost:3000/api/health
    curl http://localhost:8002/health

**Validation**: Both health endpoints return 200 OK. API can reach scraper service internally.

---

### Milestone 3: GitHub Actions CI/CD Pipeline

**Goal**: Automate building, testing, and deploying via GitHub Actions.

**What will exist at the end**: A complete CI/CD pipeline that builds containers on push, deploys to appropriate environments based on branch, and includes manual rollback capability.

**Work**:

1. **Create `.github/workflows/ci-cd.yml`** with:

   **Build Stage** (runs on all pushes/PRs):
   - Lint and type-check TypeScript (backend + frontend)
   - Run unit tests with vitest
   - Build TypeScript to dist/
   - Build React frontend with Vite

   **Container Stage** (runs on main/staging/develop):
   - Authenticate to GCP via Workload Identity Federation
   - Build Docker images for API and Scraper
   - Push to Artifact Registry with commit SHA and environment tags

   **Deploy Stage** (environment-specific):
   - Deploy Scraper to Cloud Run
   - Deploy API to Cloud Run (with scraper URL)
   - Deploy frontend to Firebase Hosting (production) or Cloud Storage (dev/staging)
   - Run database migrations

2. **Configure GitHub Secrets** in repository settings:
   - `GCP_WORKLOAD_IDENTITY_PROVIDER`
   - `GCP_SERVICE_ACCOUNT`
   - `GCP_PROJECT_ID`
   - All Supabase, Shopify, SendGrid secrets per environment

3. **Create GitHub Environments**:
   - `development`: No protection rules
   - `staging`: Optional reviewer
   - `production`: Required reviewers (2+), branch protection (main only)

4. **Create `.github/workflows/rollback.yml`** for manual rollback capability.

**Validation**: Push to develop branch triggers full build and deploy to development environment. Check GitHub Actions logs for successful completion.

---

### Milestone 4: Cloud Run Deployment

**Goal**: Deploy containerized services to Cloud Run with proper configuration.

**What will exist at the end**: Running Cloud Run services for API and Scraper, with Cloud Scheduler jobs configured for nightly and weekly execution.

**Work**:

1. **Deploy Python Scraper service**:
   - Service name: `honda-scraper`
   - Region: `australia-southeast1`
   - Ingress: Internal only (not publicly accessible)
   - CPU: 2-4, Memory: 2-4Gi (for Chromium)
   - Concurrency: 5 (limited due to browser resources)
   - Timeout: 900s (15 minutes for long scrapes)
   - CPU throttling: Disabled (browser needs consistent CPU)

2. **Deploy Node.js API service**:
   - Service name: `honda-api`
   - Region: `australia-southeast1`
   - Ingress: All (publicly accessible)
   - CPU: 1-2, Memory: 512Mi-1Gi
   - Concurrency: 80
   - Timeout: 300s
   - Mount secrets from Secret Manager
   - Set SCRAPLING_SERVICE_URL to internal scraper URL

3. **Create Cloud Scheduler jobs**:

   Nightly scrape (2 AM NZT daily):

       gcloud scheduler jobs create http honda-nightly-scrape \
         --location=australia-southeast1 \
         --schedule="0 13 * * *" \
         --time-zone="Pacific/Auckland" \
         --http-method=POST \
         --uri="https://honda-api-xxx.run.app/api/jobs/nightly" \
         --oidc-service-account-email=honda-scheduler-sa@PROJECT.iam.gserviceaccount.com

   Weekly crawl (Sunday 2 AM NZT):

       gcloud scheduler jobs create http honda-weekly-crawl \
         --location=australia-southeast1 \
         --schedule="0 13 * * 0" \
         --time-zone="Pacific/Auckland" \
         --http-method=POST \
         --uri="https://honda-api-xxx.run.app/api/jobs/weekly-crawl" \
         --oidc-service-account-email=honda-scheduler-sa@PROJECT.iam.gserviceaccount.com

**Commands to validate**:

    gcloud run services list --region=australia-southeast1
    curl https://honda-api-xxx.run.app/api/health
    gcloud scheduler jobs list --location=australia-southeast1

**Validation**: API health returns 200. Scheduler jobs appear in list. Manually trigger nightly job and verify it executes.

---

### Milestone 5: Frontend Deployment

**Goal**: Deploy the React frontend with CDN distribution.

**What will exist at the end**: Frontend accessible at custom domain with fast global CDN delivery, automatic HTTPS, and API routing.

**Work**:

1. **Initialize Firebase Hosting** in frontend directory:

       cd frontend
       firebase init hosting

2. **Configure `firebase.json`** with:
   - SPA rewrite rules (all routes to index.html)
   - API rewrite to Cloud Run (`/api/**` → `honda-api` service)
   - Cache headers for static assets

3. **Build and deploy**:

       npm run build
       firebase deploy --only hosting

4. **(Optional) Configure custom domain** via Firebase Console.

**Validation**: Access frontend URL, verify dashboard loads, login works, and API calls succeed.

---

### Milestone 6: Monitoring and Validation

**Goal**: Establish observability and validate the complete system.

**What will exist at the end**: Cloud Logging dashboard with key metrics, alerting policies for failures, and documented runbooks.

**Work**:

1. **Create Cloud Monitoring dashboard** with:
   - Request latency (p50, p95, p99)
   - Error rate by service
   - Container instance count
   - Scheduler job success/failure

2. **Create alerting policies**:
   - API error rate > 5% for 5 minutes
   - Scheduler job failure
   - Scraper timeout rate > 10%

3. **Run end-to-end validation**:
   - Trigger nightly job manually
   - Verify price scraping completes
   - Verify Shopify sync works
   - Verify email digest is sent
   - Check all data flows through correctly

4. **Document runbooks** for:
   - Manual rollback procedure
   - Triggering jobs manually
   - Viewing logs and debugging
   - Secret rotation procedure

**Validation**: Dashboard shows all green metrics. Alerting fires on simulated failure. Runbooks are complete and tested.

---

## Concrete Steps

### GCP Project Setup

    # Set project
    gcloud config set project YOUR_PROJECT_ID

    # Enable APIs
    gcloud services enable \
      run.googleapis.com \
      artifactregistry.googleapis.com \
      cloudscheduler.googleapis.com \
      secretmanager.googleapis.com \
      cloudbuild.googleapis.com \
      firebase.googleapis.com \
      iam.googleapis.com

    # Create Artifact Registry
    gcloud artifacts repositories create honda-registry \
      --repository-format=docker \
      --location=australia-southeast1 \
      --description="Honda Price Update containers"

### Creating Secrets

    # Example for one secret (repeat for all)
    echo -n "https://xxx.supabase.co" | \
      gcloud secrets create SUPABASE_URL --data-file=-

### Service Account Setup

    # Create service accounts
    gcloud iam service-accounts create honda-api-sa \
      --display-name="Honda API Service"

    gcloud iam service-accounts create honda-scraper-sa \
      --display-name="Honda Scraper Service"

    gcloud iam service-accounts create honda-scheduler-sa \
      --display-name="Honda Scheduler"

    # Grant Secret Manager access
    gcloud projects add-iam-policy-binding PROJECT_ID \
      --member="serviceAccount:honda-api-sa@PROJECT_ID.iam.gserviceaccount.com" \
      --role="roles/secretmanager.secretAccessor"

### Docker Build and Push

    # Configure Docker for Artifact Registry
    gcloud auth configure-docker australia-southeast1-docker.pkg.dev

    # Build images
    docker build -t australia-southeast1-docker.pkg.dev/PROJECT_ID/honda-registry/api:latest -f Dockerfile.api .
    docker build -t australia-southeast1-docker.pkg.dev/PROJECT_ID/honda-registry/scraper:latest -f Dockerfile.scraper python-scraper/

    # Push images
    docker push australia-southeast1-docker.pkg.dev/PROJECT_ID/honda-registry/api:latest
    docker push australia-southeast1-docker.pkg.dev/PROJECT_ID/honda-registry/scraper:latest

### Cloud Run Deployment

    # Deploy Scraper (internal only)
    gcloud run deploy honda-scraper \
      --image=australia-southeast1-docker.pkg.dev/PROJECT_ID/honda-registry/scraper:latest \
      --region=australia-southeast1 \
      --platform=managed \
      --ingress=internal \
      --cpu=2 \
      --memory=2Gi \
      --timeout=900 \
      --concurrency=5 \
      --no-cpu-throttling \
      --service-account=honda-scraper-sa@PROJECT_ID.iam.gserviceaccount.com

    # Get scraper URL
    SCRAPER_URL=$(gcloud run services describe honda-scraper \
      --region=australia-southeast1 \
      --format="value(status.url)")

    # Deploy API
    gcloud run deploy honda-api \
      --image=australia-southeast1-docker.pkg.dev/PROJECT_ID/honda-registry/api:latest \
      --region=australia-southeast1 \
      --platform=managed \
      --ingress=all \
      --allow-unauthenticated \
      --cpu=1 \
      --memory=512Mi \
      --timeout=300 \
      --concurrency=80 \
      --set-env-vars="SCRAPLING_SERVICE_URL=$SCRAPER_URL,NODE_ENV=production" \
      --set-secrets="SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_SERVICE_KEY=SUPABASE_SERVICE_KEY:latest" \
      --service-account=honda-api-sa@PROJECT_ID.iam.gserviceaccount.com

---

## Validation and Acceptance

**API Health Check**:

    curl https://honda-api-xxx.run.app/api/health
    # Expected: {"status":"ok","timestamp":"..."}

**Scraper Health Check** (via API proxy or internal):

    # From within GCP or via API endpoint that proxies
    curl https://honda-api-xxx.run.app/api/scraper/health
    # Expected: {"status":"ok"}

**Scheduler Job Test**:

    gcloud scheduler jobs run honda-nightly-scrape --location=australia-southeast1
    # Check Cloud Logging for job execution
    # Expected: Job completes without errors, prices scraped, Shopify synced

**Frontend Access**:

    # Navigate to Firebase Hosting URL
    # Expected: Dashboard loads, can login, shows product data

**Email Delivery**:

    # After nightly job runs, check recipient inbox
    # Expected: Digest email with price changes received

---

## Idempotence and Recovery

**Docker Builds**: Idempotent - can rebuild and push at any time.

**Cloud Run Deployments**: Idempotent - new revisions created, old revisions preserved for rollback.

**Rollback Procedure**:

    # List revisions
    gcloud run revisions list --service=honda-api --region=australia-southeast1

    # Rollback to previous revision
    gcloud run services update-traffic honda-api \
      --region=australia-southeast1 \
      --to-revisions=honda-api-00002-abc=100

**Secret Rotation**: Update secret version in Secret Manager, then redeploy Cloud Run services.

**Database Recovery**: Supabase provides automatic backups. Point-in-time recovery available.

---

## Artifacts and Notes

### Estimated Monthly Costs (USD)

| Service | Estimate |
|---------|----------|
| Cloud Run - API | $5-15 |
| Cloud Run - Scraper | $10-30 |
| Cloud Scheduler | $0.30 |
| Firebase Hosting | $0-5 |
| Artifact Registry | $1-3 |
| Secret Manager | $0.50-1 |
| Cloud Logging | $0-5 |
| **Total GCP** | **$27-60/month** |
| Supabase (existing) | $0-25 |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Google Cloud Platform                                │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────────────────────────────────┐   │
│  │ Cloud Scheduler │────►│              Cloud Run                       │   │
│  │ (Nightly/Weekly)│     │                                              │   │
│  └─────────────────┘     │  ┌───────────────┐    ┌──────────────────┐  │   │
│                          │  │ honda-api     │───►│ honda-scraper    │  │   │
│  ┌─────────────────┐     │  │ (Node.js)     │    │ (Python+Chromium)│  │   │
│  │ Firebase Hosting│     │  │ Port 3000     │    │ Port 8002        │  │   │
│  │ (React Frontend)│────►│  │ Public        │    │ Internal Only    │  │   │
│  └─────────────────┘     │  └───────┬───────┘    └──────────────────┘  │   │
│                          │          │                                   │   │
│  ┌─────────────────┐     └──────────┼───────────────────────────────────┘   │
│  │ Secret Manager  │◄───────────────┘                                       │
│  │ (Credentials)   │                                                        │
│  └─────────────────┘     ┌─────────────────┐                               │
│                          │ Artifact Registry│                               │
│  ┌─────────────────┐     │ (Docker Images) │                               │
│  │ Cloud Logging   │     └─────────────────┘                               │
│  │ & Monitoring    │                                                        │
│  └─────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
     ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
     │    Supabase     │    │   Shopify API   │    │    SendGrid     │
     │   (PostgreSQL)  │    │  (GraphQL)      │    │   (Email)       │
     └─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## Interfaces and Dependencies

### Files to Create

| File | Purpose |
|------|---------|
| `Dockerfile.api` | Node.js API container (root) |
| `Dockerfile.scraper` | Python scraper container (python-scraper/) |
| `.dockerignore` | Exclude files from Docker builds |
| `docker-compose.yml` | Local development environment |
| `.github/workflows/ci-cd.yml` | Main CI/CD pipeline |
| `.github/workflows/rollback.yml` | Manual rollback workflow |
| `firebase.json` | Firebase Hosting configuration (frontend/) |
| `cloudrun/api-service.yaml` | Cloud Run service spec (reference) |
| `cloudrun/scraper-service.yaml` | Cloud Run service spec (reference) |

### Files to Modify

| File | Changes |
|------|---------|
| `src/server.ts` | Add `/api/jobs/nightly` and `/api/jobs/weekly-crawl` HTTP endpoints for Cloud Scheduler triggers |
| `src/api/` | Add `jobs-api.ts` with job trigger handlers |
| `package.json` | Add Docker-related scripts if needed |

### External Dependencies

| Service | Purpose | Authentication |
|---------|---------|----------------|
| Supabase | PostgreSQL database | Service key (existing) |
| Shopify Admin API | Product/price sync | Access token (existing) |
| SendGrid | Email delivery | API key (existing) |
| Google Gemini | Price extraction fallback | API key (existing) |
| Bright Data | Proxy for scraping | Username/password (existing) |

---

## GitHub Actions Secrets to Configure

| Secret | Environment | Description |
|--------|-------------|-------------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | All | Workload Identity Federation provider |
| `GCP_SERVICE_ACCOUNT` | All | GitHub Actions deployer service account |
| `GCP_PROJECT_ID` | All | GCP project ID |
| `SUPABASE_URL` | Per-env | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Per-env | Supabase service role key |
| `SUPABASE_ANON_KEY` | Per-env | Supabase anon key (frontend) |
| `SHOPIFY_STORE_DOMAIN` | Per-env | Shopify store domain |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Per-env | Shopify Admin API token |
| `SENDGRID_API_KEY` | All | SendGrid API key |
| `SENDGRID_FROM_EMAIL` | All | Sender email address |
| `SENDGRID_DIGEST_TEMPLATE_ID` | All | SendGrid template ID |
| `SENDGRID_RECIPIENT_EMAILS` | Per-env | Comma-separated recipients |
| `GEMINI_API_KEY` | All | Google Gemini API key |
| `FIREBASE_SERVICE_ACCOUNT` | Production | Firebase service account JSON |
| `FIREBASE_PROJECT_ID` | Production | Firebase project ID |
