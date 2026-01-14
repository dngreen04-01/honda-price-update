import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PriceExtractor } from './price-extractor.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Mock logger to prevent console output during tests
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to load HTML fixtures
function loadFixture(domain: string, filename: string): string {
  const fixturePath = path.join(__dirname, '__fixtures__', domain, filename);
  return fs.readFileSync(fixturePath, 'utf-8');
}

describe('PriceExtractor', () => {
  let extractor: PriceExtractor;

  beforeEach(() => {
    vi.clearAllMocks();
    extractor = new PriceExtractor();
  });

  describe('extract() - always returns deterministic source', () => {
    it('should always return source as deterministic', async () => {
      const html = '<html><body><span class="price">$99.00</span></body></html>';
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.source).toBe('deterministic');
    });

    it('should return deterministic even when no price found', async () => {
      const html = '<html><body>No price here</body></html>';
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.source).toBe('deterministic');
      expect(result.salePrice).toBeNull();
    });

    it('should return low confidence when no price found', async () => {
      const html = '<html><body>No price here</body></html>';
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.confidence).toBe('low');
    });
  });

  describe('Honda Outdoors - hondaoutdoors.co.nz', () => {
    const domain = 'hondaoutdoors.co.nz';
    const baseUrl = 'https://www.hondaoutdoors.co.nz';

    it('should extract price from product page with price-final_price', async () => {
      const html = loadFixture(domain, 'product-with-price.html');
      const result = await extractor.extract(`${baseUrl}/product/sample`, html);

      expect(result.source).toBe('deterministic');
      expect(result.salePrice).toBe(2399);
      expect(result.confidence).toBe('high');
      expect(result.currency).toBe('NZD');
    });

    it('should extract sale price when product is on special', async () => {
      const html = loadFixture(domain, 'product-on-sale.html');
      const result = await extractor.extract(`${baseUrl}/product/sale-item`, html);

      expect(result.salePrice).toBe(499);
      expect(result.originalPrice).toBe(599);
      expect(result.confidence).toBe('high');
    });

    it('should handle product without numeric price gracefully', async () => {
      const html = loadFixture(domain, 'product-no-price.html');
      const result = await extractor.extract(`${baseUrl}/product/enquiry-only`, html);

      expect(result.salePrice).toBeNull();
      expect(result.confidence).toBe('low');
    });
  });

  describe('Honda Marine - hondamarine.co.nz', () => {
    const domain = 'hondamarine.co.nz';
    const baseUrl = 'https://www.hondamarine.co.nz';

    it('should extract price from marine product page', async () => {
      const html = loadFixture(domain, 'product-with-price.html');
      const result = await extractor.extract(`${baseUrl}/outboard/bf2.3`, html);

      expect(result.source).toBe('deterministic');
      expect(result.salePrice).toBe(1849);
      expect(result.confidence).toBe('high');
    });
  });

  describe('Honda Motorbikes - hondamotorbikes.co.nz', () => {
    const domain = 'hondamotorbikes.co.nz';
    const baseUrl = 'https://www.hondamotorbikes.co.nz';

    it('should extract price from motorbike product page', async () => {
      const html = loadFixture(domain, 'product-with-price.html');
      const result = await extractor.extract(`${baseUrl}/trx250tm`, html);

      expect(result.source).toBe('deterministic');
      expect(result.salePrice).toBe(12995);
      expect(result.confidence).toBe('high');
    });
  });

  describe('JSON-LD extraction fallback', () => {
    it('should extract price from JSON-LD Product schema', async () => {
      const html = `
        <html>
        <head>
          <script type="application/ld+json">
            {
              "@type": "Product",
              "name": "Test Product",
              "offers": {
                "@type": "Offer",
                "price": "299.99",
                "priceCurrency": "NZD"
              }
            }
          </script>
        </head>
        <body></body>
        </html>
      `;
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(299.99);
      expect(result.currency).toBe('NZD');
      expect(result.confidence).toBe('high');
    });

    it('should extract price from JSON-LD with offers array', async () => {
      const html = `
        <html>
        <head>
          <script type="application/ld+json">
            {
              "@type": "Product",
              "name": "Test Product",
              "offers": [{
                "@type": "Offer",
                "price": "199.00",
                "priceCurrency": "NZD"
              }]
            }
          </script>
        </head>
        <body></body>
        </html>
      `;
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(199);
    });

    it('should extract price from nested JSON-LD', async () => {
      const html = `
        <html>
        <head>
          <script type="application/ld+json">
            {
              "@graph": [{
                "@type": "Product",
                "offers": { "price": "149.95" }
              }]
            }
          </script>
        </head>
        <body></body>
        </html>
      `;
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(149.95);
    });
  });

  describe('Microdata extraction fallback', () => {
    it('should extract price from itemprop="price" with content attribute', async () => {
      const html = `
        <html>
        <body>
          <span itemprop="price" content="149.95">$149.95</span>
          <meta itemprop="priceCurrency" content="NZD">
        </body>
        </html>
      `;
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(149.95);
      expect(result.currency).toBe('NZD');
      expect(result.confidence).toBe('high');
    });

    it('should extract price from itemprop="price" text content', async () => {
      const html = `
        <html>
        <body>
          <span itemprop="price">$249.00</span>
        </body>
        </html>
      `;
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(249);
    });

    it('should extract price from Open Graph meta tags', async () => {
      const html = `
        <html>
        <head>
          <meta property="product:price:amount" content="399.99">
          <meta property="product:price:currency" content="NZD">
        </head>
        <body></body>
        </html>
      `;
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(399.99);
      expect(result.currency).toBe('NZD');
    });
  });

  describe('DOM fallback extraction', () => {
    it('should extract from common .price selector', async () => {
      const html = '<html><body><div class="price">$59.99</div></body></html>';
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(59.99);
      expect(result.confidence).toBe('low'); // DOM fallback is low confidence
    });

    it('should extract from data-price attribute', async () => {
      const html = '<html><body><span class="price" data-price="199.00">$199</span></body></html>';
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(199);
    });

    it('should extract from .product-price selector', async () => {
      const html = '<html><body><div class="product-price">$79.50</div></body></html>';
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(79.5);
    });

    it('should find original price from sibling elements', async () => {
      const html = `
        <html>
        <body>
          <div class="price-wrapper">
            <span class="price">$49.99</span>
            <span class="was-price">$69.99</span>
          </div>
        </body>
        </html>
      `;
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(49.99);
      expect(result.originalPrice).toBe(69.99);
    });
  });

  describe('Price parsing edge cases', () => {
    it('should parse NZ comma-formatted prices', async () => {
      const html = '<html><body><span class="price">$1,299.00</span></body></html>';
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(1299);
    });

    it('should handle prices without cents', async () => {
      const html = '<html><body><span class="price">$500</span></body></html>';
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(500);
    });

    it('should handle prices with currency symbol variations', async () => {
      const html = '<html><body><span class="price">NZD 399.95</span></body></html>';
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(399.95);
    });

    it('should handle European format with comma as decimal', async () => {
      const html = '<html><body><span class="price">49,99</span></body></html>';
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(49.99);
    });

    it('should handle large prices with multiple thousands separators', async () => {
      const html = '<html><body><span class="price">$12,345.67</span></body></html>';
      const result = await extractor.extract('https://example.com/product', html);

      expect(result.salePrice).toBe(12345.67);
    });
  });

  describe('Extraction priority order', () => {
    it('should prefer Honda selectors over JSON-LD for Honda domains', async () => {
      const html = `
        <html>
        <head>
          <script type="application/ld+json">
            { "@type": "Product", "offers": { "price": "999.00" } }
          </script>
        </head>
        <body>
          <h1 class="page-title"><span class="base">Test Product</span></h1>
          <div class="product-info-price">
            <span class="price-final_price">
              <span class="price">$1,499.00</span>
            </span>
          </div>
          <div class="product attribute sku"><span class="value">TEST-123</span></div>
        </body>
        </html>
      `;
      const result = await extractor.extract('https://www.hondaoutdoors.co.nz/product', html);

      // Should use Honda selector (1499) not JSON-LD (999)
      expect(result.salePrice).toBe(1499);
      expect(result.confidence).toBe('high');
    });

    it('should fall back to JSON-LD when Honda selectors fail', async () => {
      const html = `
        <html>
        <head>
          <script type="application/ld+json">
            { "@type": "Product", "offers": { "price": "599.00" } }
          </script>
        </head>
        <body>
          <h1>Product without Honda selectors</h1>
        </body>
        </html>
      `;
      const result = await extractor.extract('https://www.hondaoutdoors.co.nz/product', html);

      expect(result.salePrice).toBe(599);
    });
  });
});
