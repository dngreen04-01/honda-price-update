# Firecrawl Credit Issue

## Problem

```
ERROR: Insufficient credits to perform this request.
For more credits, you can upgrade your plan at https://firecrawl.dev/pricing
```

The scraper cannot discover products because Firecrawl has run out of credits.

---

## Immediate Solutions

### Option 1: Add More Firecrawl Credits (Quick Fix)

1. **Visit**: https://firecrawl.dev/pricing
2. **Add credits** to your account
3. **Cost**: Approximately $1-5 for 1,000-5,000 credits
4. **Usage**: ~50-150 credits per scrape run with caching

**Pros**:
- Quick fix (works immediately)
- Keeps current system working

**Cons**:
- Ongoing cost
- Credits expire
- Doesn't scale well for daily scrapes

---

### Option 2: Use Cached URLs (Temporary Workaround)

If you've scraped before and have URLs in the database, you can skip discovery and scrape known URLs:

**Modify the orchestrator to use cached URLs:**

```typescript
// In src/scraper/scraper-orchestrator.ts
async discoverProducts(domainUrl: string): Promise<string[]> {
  // NEW: Try to get URLs from database first
  const { data: cachedPages } = await supabase
    .from('product_pages')
    .select('canonical_url')
    .eq('domain_id', this.currentDomainId);

  if (cachedPages && cachedPages.length > 0) {
    logger.info('Using cached URLs from database', { count: cachedPages.length });
    return cachedPages.map(p => p.canonical_url);
  }

  // Fall back to Firecrawl Map if no cached URLs
  logger.info('No cached URLs found, using Firecrawl Map');
  return this.firecrawlMap(domainUrl);
}
```

**Pros**:
- Free (no Firecrawl credits needed)
- Works immediately if you have historical data

**Cons**:
- Won't discover NEW products from suppliers
- Requires initial scrape to populate URLs

---

### Option 3: Manual URL List (Low-Tech Solution)

Create a static list of product URLs to scrape:

```typescript
// src/scraper/manual-urls.ts
export const HONDA_OUTDOORS_URLS = [
  'https://www.hondaoutdoors.co.nz/eu20i-generator',
  'https://www.hondaoutdoors.co.nz/eu22i-generator',
  // ... add all known product URLs
];

export const HONDA_MARINE_URLS = [
  'https://www.hondamarine.co.nz/bf20-outboard',
  // ... etc
];
```

Then modify the orchestrator to use these lists instead of Firecrawl Map.

**Pros**:
- Zero ongoing cost
- Complete control over what gets scraped
- Fast (no discovery overhead)

**Cons**:
- Requires manual URL maintenance
- Won't auto-discover new products
- Labor-intensive

---

## Long-Term Solutions

### Option 4: Migrate to Puppeteer + Bright Data (RECOMMENDED)

This was already planned in the implementation roadmap. Benefits:

**Cost Comparison**:
| Scenario | Firecrawl | Puppeteer + Bright Data | Savings |
|----------|-----------|------------------------|---------|
| Weekly scrapes | $2-5/mo | $5-10/mo | Predictable cost |
| Daily scrapes | $20-50/mo | $10-15/mo | 50-70% savings |
| Discovery only | $1/week | $0 (manual) | 100% savings |

**Implementation**:
1. Use manual URL lists OR one-time Firecrawl Map to get all product URLs
2. Store URLs in database
3. Use Puppeteer to scrape those URLs (bypasses Firecrawl entirely)
4. Periodically update URL list (monthly manual check or infrequent Firecrawl Map run)

**Timeline**: 2-3 days to implement (see IMPLEMENTATION_PLAN.md Phase 2)

---

### Option 5: Hybrid Approach (Best Balance)

**Discovery**: Firecrawl Map (once per month, ~$0.10-0.50)
**Scraping**: Puppeteer + Bright Data (daily, ~$10-15/mo)

**Workflow**:
1. **Monthly**: Run Firecrawl Map to discover new product URLs → store in database
2. **Daily**: Scrape known URLs with Puppeteer (no Firecrawl credits used)
3. **Weekly**: Compare discovered URLs vs scraped URLs to detect new products

**Pros**:
- Low cost (~$10-15/mo total)
- Automatic new product discovery (monthly)
- Daily price updates

**Cons**:
- 2-3 days to implement Puppeteer scraper
- Slight delay (up to 30 days) in discovering brand new products

---

## Recommendation

**Immediate** (TODAY):
1. Add $5 of Firecrawl credits to unblock the scraper
2. Run one full scrape to populate database with URLs

**Short-term** (THIS WEEK):
1. Implement Option 2 (use cached URLs from database)
2. This eliminates ongoing Firecrawl costs for scraping

**Long-term** (NEXT 2 WEEKS):
1. Implement Puppeteer scraper (see IMPLEMENTATION_PLAN.md)
2. Move to hybrid approach: monthly discovery + daily scraping

---

## Cost Projection

**Current Approach** (all Firecrawl):
- Weekly scrapes: $2-10/month
- Daily scrapes: $50-100/month

**Hybrid Approach** (recommended):
- Discovery (monthly): $0.50/month
- Scraping (daily): $10-15/month
- **Total: ~$15/month**

**Savings**: 70-85% reduction in costs

---

## Implementation Timeline

| Timeline | Action | Cost | Status |
|----------|--------|------|--------|
| **Today** | Add $5 Firecrawl credits | $5 one-time | ⏳ Pending |
| **Today** | Run full scrape to populate URLs | $0 (uses credits) | ⏳ Pending |
| **This Week** | Implement cached URL fallback | $0 (dev time) | ⏳ Pending |
| **Week 2-3** | Implement Puppeteer scraper | $0 (dev time) | ⏳ Pending |
| **Month 2+** | Hybrid discovery + scraping | ~$15/mo | ⏳ Future |

---

## Questions?

1. **How many Firecrawl credits do you currently have?**
   - Check: https://firecrawl.dev/account

2. **How often do Honda add new products?**
   - If rarely (quarterly), manual URL lists work fine
   - If frequently (monthly), need automated discovery

3. **What's your budget for ongoing scraping?**
   - $0-10/mo → Use cached URLs + manual discovery
   - $10-20/mo → Hybrid approach (recommended)
   - $20+/mo → Keep Firecrawl for everything

4. **Do you want to implement Puppeteer now or later?**
   - Now → 2-3 days work, 70% cost savings
   - Later → Add Firecrawl credits, revisit in 1-2 months
