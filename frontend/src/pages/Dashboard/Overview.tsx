// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Activity, TrendingUp, ShoppingCart, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { format } from 'date-fns'

interface DashboardStats {
  totalProducts: number
  productsWithUrls: number
  lastScrapeAt: string | null
  productsScrapedToday: number
  productsWithPrices: number
  notScrapedCount: number
  priceMismatchCount: number
  extractionSuccessRate: number
  highConfidenceRate: number
}

export const Overview: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentPriceChanges, setRecentPriceChanges] = useState<any[]>([])

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      // Get all products from shopify_catalog_cache (single source of truth)
      const { data: allProducts } = await supabase
        .from('shopify_catalog_cache')
        .select('*')

      if (!allProducts) {
        throw new Error('Failed to load products')
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Calculate stats from shopify_catalog_cache
      const totalProducts = allProducts.length
      const productsWithUrls = allProducts.filter(p => p.source_url_canonical).length
      const productsWithPrices = allProducts.filter(p => p.scraped_sale_price !== null).length
      const notScrapedCount = allProducts.filter(p => p.source_url_canonical && p.scraped_sale_price === null).length

      // Calculate price mismatches
      const priceMismatchCount = allProducts.filter(p => {
        if (!p.scraped_sale_price || !p.shopify_price) return false
        return Math.abs(p.scraped_sale_price - p.shopify_price) > 0.01
      }).length

      // Get products scraped today
      const productsScrapedToday = allProducts.filter(p => {
        if (!p.last_scraped_at) return false
        return new Date(p.last_scraped_at) >= today
      }).length

      // Get last scrape time
      const scrapedProducts = allProducts.filter(p => p.last_scraped_at)
      const lastScrapeAt = scrapedProducts.length > 0
        ? scrapedProducts.reduce((latest, p) =>
            new Date(p.last_scraped_at!) > new Date(latest) ? p.last_scraped_at! : latest,
            scrapedProducts[0].last_scraped_at!
          )
        : null

      // Get extraction stats
      const extractionSuccessRate = productsWithUrls > 0
        ? (productsWithPrices / productsWithUrls) * 100
        : 0

      // High confidence = scrape_confidence >= 0.7
      const highConfidenceCount = allProducts.filter(p =>
        p.scrape_confidence !== null && p.scrape_confidence >= 0.7
      ).length
      const highConfidenceRate = productsWithPrices > 0
        ? (highConfidenceCount / productsWithPrices) * 100
        : 0

      // Get recent scraped products for activity feed
      const recentlyScraped = allProducts
        .filter(p => p.last_scraped_at && p.scraped_sale_price !== null)
        .sort((a, b) => new Date(b.last_scraped_at!).getTime() - new Date(a.last_scraped_at!).getTime())
        .slice(0, 5)
        .map(p => ({
          id: p.id,
          product_title: p.product_title,
          source_url_canonical: p.source_url_canonical,
          scraped_sale_price: p.scraped_sale_price,
          last_scraped_at: p.last_scraped_at,
        }))

      setStats({
        totalProducts,
        productsWithUrls,
        lastScrapeAt,
        productsScrapedToday,
        productsWithPrices,
        notScrapedCount,
        priceMismatchCount,
        extractionSuccessRate,
        highConfidenceRate,
      })

      setRecentPriceChanges(recentlyScraped)
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!stats) {
    return <div>Error loading dashboard data</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard Overview</h1>
        <p className="text-muted-foreground">
          Monitor scraping performance and system health
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              {stats.productsWithUrls} with supplier URLs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scraped Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.productsScrapedToday}</div>
            <p className="text-xs text-muted-foreground">
              {stats.lastScrapeAt
                ? `Last: ${format(new Date(stats.lastScrapeAt), 'HH:mm')}`
                : 'No scrapes yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">With Prices</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.productsWithPrices}</div>
            <p className="text-xs text-muted-foreground">Products with scraped prices</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Actions Required</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.notScrapedCount + stats.priceMismatchCount}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.notScrapedCount} not scraped / {stats.priceMismatchCount} mismatches
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quality Metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Extraction Quality</CardTitle>
            <CardDescription>Price extraction success rates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Overall Success Rate</span>
                <span className="text-sm font-bold">{stats.extractionSuccessRate.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{ width: `${stats.extractionSuccessRate}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">High Confidence</span>
                <span className="text-sm font-bold">{stats.highConfidenceRate.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${stats.highConfidenceRate}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest price updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentPriceChanges.length > 0 ? (
                recentPriceChanges.slice(0, 5).map((change: any) => (
                  <div key={change.id} className="flex items-center justify-between text-sm">
                    <div className="flex-1 truncate">
                      <span className="text-muted-foreground">
                        {change.product_title || change.source_url_canonical?.split('/').pop() || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        ${change.scraped_sale_price?.toFixed(2) || 'N/A'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(change.last_scraped_at), 'HH:mm')}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No recent activity</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
