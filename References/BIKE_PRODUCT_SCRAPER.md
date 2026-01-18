# Bike Product Scraper Reference

**Created**: 2026-01-16
**Scope**: `hondamotorbikes.co.nz` | Product type: Bikes only

## Objective

Scrape structured product data from Honda Motorbikes NZ bike pages to extract assets for Shopify product creation.

---

## Implementation

### Files Created

| File | Purpose |
|------|---------|
| `src/scraper/bike-product-selectors.ts` | CSS selector configuration for bike pages |
| `src/scraper/bike-product-scraper.ts` | Main scraping logic using Scrapling + Cheerio |
| `src/api/bike-scraper-api.ts` | Express API endpoint handler |

### Files Modified

| File | Change |
|------|--------|
| `src/types/index.ts` | Added `BikeProductAssets`, `BikeFeature`, `BikeSpecification`, `BikeSpecificationCategory` types |
| `src/server.ts` | Added `/api/scrape-bike` route |

---

## CSS Selectors Discovered

### Images

| Component | Selector | Attribute | Notes |
|-----------|----------|-----------|-------|
| Hero Image | `.product-view-section-top picture source` | `srcset` | Main banner at top of page |
| Feature 1 Image | `.section__full-img-banner picture source` | `srcset` | Full-width feature banner |
| Feature 2-4 Images | `.swiper-slide .swiper-slide__image` | `src` | Carousel images (3 slides) |
| Product Image | `.section__2columns img` | `src` | Image next to specifications |

### Text Content

| Component | Selector | Notes |
|-----------|----------|-------|
| Product Title | `.page-title-wrapper.product h1` | e.g., "TRX420FA6" |
| Description | `.product.attribute.overview` | Contains HTML markup |
| Feature 1 Title | `.section__full-img-banner .image-title` | Full-width banner title |
| Feature 1 Description | `.section__full-img-banner .image-description` | Full-width banner description |
| Carousel Titles | `.swiper-slide__title` | Per-slide titles |
| Carousel Descriptions | `.swiper-slide__text` | Per-slide descriptions |

### Specifications (Accordion)

| Component | Selector | Notes |
|-----------|----------|-------|
| Container | `.mgz-block-content` | Accordion wrapper |
| Panel | `.mgz-panel` | Individual accordion section |
| Panel Header | `.mgz-panel-heading h4` | Category name (e.g., "Engine") |
| Spec Rows | `.mgz-panel-body table tbody tr` | Table rows within panel |
| Spec Label | `td:nth-child(1)` | e.g., "Engine Type" |
| Spec Value | `td:nth-child(2)` | e.g., "Liquid-cooled..." |

---

## Data Structure

```typescript
interface BikeProductAssets {
  url: string;
  scrapedAt: string;

  images: {
    hero: string | null;           // Main banner image
    product: string | null;        // Product cutout image
    features: (string | null)[];   // [feature1, feature2, feature3, feature4]
  };

  content: {
    title: string | null;          // Product name
    description: string | null;    // HTML description
    features: BikeFeature[];       // Array of feature objects
  };

  specifications: BikeSpecificationCategory[];  // Grouped by accordion panel
}

interface BikeFeature {
  title: string | null;
  description: string | null;
  image: string | null;
}

interface BikeSpecificationCategory {
  category: string;                // Accordion header (e.g., "Engine")
  specs: BikeSpecification[];      // Label/value pairs
}

interface BikeSpecification {
  label: string;
  value: string;
}
```

---

## API Usage

### Endpoint

```
POST /api/scrape-bike
Content-Type: application/json

{
  "url": "https://www.hondamotorbikes.co.nz/trx420fa6"
}
```

### Example Request

```bash
curl -X POST http://localhost:3000/api/scrape-bike \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.hondamotorbikes.co.nz/trx420fa6"}'
```

### Response Structure

```json
{
  "success": true,
  "data": {
    "url": "...",
    "scrapedAt": "2026-01-16T07:13:39.745Z",
    "images": { ... },
    "content": { ... },
    "specifications": [ ... ]
  }
}
```

---

## Test Results (TRX420FA6)

### Images Extracted

| Type | URL |
|------|-----|
| Hero | `https://www.hondamotorbikes.co.nz/media/images_motorbikes/trx420fa6/banner/1966/trx420fa6-hero-desktop-3200-x-1680.jpg` |
| Product | `https://www.hondamotorbikes.co.nz/media/images_motorbikes/trx420fa6/thumbnail/atv-clear-cuts-trx420fa6-2000-x-2000.png` |
| Feature 1 | `https://www.hondamotorbikes.co.nz/media/images_motorbikes/trx420fa6/banner/1967/trx420fa6-dct-3200-x-1520.jpg` |
| Feature 2 | `/media/images_motorbikes/trx420fa6/feature/855/trx420fa2-product-page-desktop-feature-tiles-img1-1780x1040.jpg` |
| Feature 3 | `/media/images_motorbikes/trx420fa6/feature/856/trx420fa2-product-page-desktop-feature-tiles-img2-1780x1040.jpg` |
| Feature 4 | `/media/images_motorbikes/trx420fa6/feature/857/trx420fa2-product-page-desktop-feature-tiles-img3-1780x1040.jpg` |

### Features Extracted

1. **Automatic Dual-Clutch Transmission** - DCT description
2. **Utility Box** - 1.9 litre weatherproof storage
3. **Heavy Duty Carry Racks** - Front and rear racks
4. **Pro-Connect** - Accessory system

### Specifications Extracted

| Category | Spec Count |
|----------|------------|
| Engine | 7 |
| Transmission | 4 |
| Wheels, Suspension, Steering & Brakes | 7 |
| Dimensions & Height | 11 |
| **Total** | **29** |

---

## Known Issues / Observations

### 1. Relative Image URLs
Feature images 2-4 return relative paths (e.g., `/media/...`) instead of absolute URLs. The scraper could prepend the domain if needed.

### 2. Description Contains Raw HTML
The description field includes Magento PageBuilder markup with dynamic class names. Consider stripping to plain text or basic HTML if cleaner output is needed.

### 3. Feature 1 Image Separation
Feature 1 (from the full-width banner section) has its image in `images.features[0]` but `content.features[0].image` is `null`. This is because Feature 1 comes from a different page section than Features 2-4.

### 4. Stray Accessibility Text
The Pro-Connect description captured "Turn on screen reader support" at the end - appears to be accessibility tooltip text.

### 5. Dynamic Class Names to Avoid
The page uses Magento PageBuilder which generates hashed class names like:
- `oqKkHfaOPPYm`
- `mqAjJV1TfgDU`
- `7wDmzBnf0EhY`
- `2dSLHGK25RiE`

These should NOT be used in selectors as they may change on site rebuild. Use stable class names instead (`.section__full-img-banner`, `.mgz-panel`, `.swiper-slide`, etc.).

---

## Dependencies

- **Scrapling** (Python service on port 8002) - Fetches HTML with JavaScript rendering
- **Cheerio** - HTML parsing and CSS selector queries
- **Express** - API endpoint

---

## Future Enhancements

1. **URL normalization** - Prepend domain to relative image URLs
2. **HTML cleanup** - Strip Magento markup from description
3. **Text sanitization** - Remove stray accessibility text
4. **Batch scraping** - Add endpoint for multiple URLs
5. **Other product types** - ATVs, accessories may have different page layouts
