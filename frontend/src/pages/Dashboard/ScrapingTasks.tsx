// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'

interface ScrapingStats {
  total_products: number
  products_with_urls: number
  products_scraped: number
  high_confidence: number
  low_confidence: number
  last_scraped_at: string | null
  not_scraped: number
}

export const ScrapingTasks: React.FC = () => {
  const [stats, setStats] = useState<ScrapingStats | null>(null)
  const [recentProducts, setRecentProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadScrapingStats()
  }, [])

  const loadScrapingStats = async () => {
    try {
      const { data: products } = await supabase
        .from('shopify_catalog_cache')
        .select('*')

      if (!products) return

      const total_products = products.length
      const products_with_urls = products.filter(p => p.source_url_canonical).length
      const products_scraped = products.filter(p => p.scraped_sale_price !== null).length
      const high_confidence = products.filter(p => p.scrape_confidence !== null && p.scrape_confidence >= 0.7).length
      const low_confidence = products.filter(p => p.scrape_confidence !== null && p.scrape_confidence < 0.7).length
      const not_scraped = products.filter(p => p.source_url_canonical && p.scraped_sale_price === null).length

      // Get last scrape time
      const scrapedProducts = products.filter(p => p.last_scraped_at)
      const last_scraped_at = scrapedProducts.length > 0
        ? scrapedProducts.reduce((latest, p) =>
            new Date(p.last_scraped_at!) > new Date(latest) ? p.last_scraped_at! : latest,
            scrapedProducts[0].last_scraped_at!
          )
        : null

      setStats({
        total_products,
        products_with_urls,
        products_scraped,
        high_confidence,
        low_confidence,
        last_scraped_at,
        not_scraped,
      })

      // Get recently scraped products
      const recent = products
        .filter(p => p.last_scraped_at)
        .sort((a, b) => new Date(b.last_scraped_at!).getTime() - new Date(a.last_scraped_at!).getTime())
        .slice(0, 10)

      setRecentProducts(recent)
    } catch (error) {
      console.error('Error loading scraping stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading scraping stats...</p>
        </div>
      </div>
    )
  }

  if (!stats) {
    return <div>Error loading scraping stats</div>
  }

  const successRate = stats.products_with_urls > 0
    ? (stats.products_scraped / stats.products_with_urls) * 100
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Scraping Tasks</h1>
        <p className="text-muted-foreground">Monitor scraping performance and status</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Scraping Overview</CardTitle>
              <CardDescription>
                {stats.last_scraped_at
                  ? `Last scraped: ${format(new Date(stats.last_scraped_at), 'PPp')}`
                  : 'Never scraped'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {successRate >= 90 ? (
                <CheckCircle className="h-6 w-6 text-green-600" />
              ) : successRate >= 70 ? (
                <Clock className="h-6 w-6 text-yellow-600" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-red-600" />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Products</p>
              <p className="text-2xl font-bold">{stats.total_products}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">With URLs</p>
              <p className="text-2xl font-bold">{stats.products_with_urls}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Scraped</p>
              <p className="text-2xl font-bold text-green-600">{stats.products_scraped}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">High Confidence</p>
              <p className="text-2xl font-bold text-green-600">{stats.high_confidence}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Not Scraped</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.not_scraped}</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Scraping Success Rate</span>
              <span className="text-sm font-bold">{successRate.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{ width: `${successRate}%` }}
              ></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recently Scraped Products</CardTitle>
          <CardDescription>Last 10 products that were scraped</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentProducts.length > 0 ? (
              recentProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {product.product_title || 'Unknown Product'}
                    </p>
                    {product.variant_sku && (
                      <p className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded inline-block">
                        SKU: {product.variant_sku}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(product.last_scraped_at), 'PPp')}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Price</p>
                      <p className="text-lg font-bold">
                        ${product.scraped_sale_price?.toFixed(2) || 'N/A'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Confidence</p>
                      <p className={`text-sm font-medium ${
                        product.scrape_confidence >= 0.7 ? 'text-green-600' : 'text-yellow-600'
                      }`}>
                        {product.scrape_confidence !== null
                          ? `${(product.scrape_confidence * 100).toFixed(0)}%`
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No products have been scraped yet
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
