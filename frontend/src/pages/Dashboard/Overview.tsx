// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Activity, TrendingUp, ShoppingCart, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { format } from 'date-fns'

interface DashboardStats {
  totalProducts: number
  totalDomains: number
  lastScrapeAt: string | null
  productsScrapedToday: number
  pricesUpdatedToday: number
  supplierOnlyCount: number
  shopifyOnlyCount: number
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
      // Get total products
      const { count: totalProducts } = await supabase
        .from('product_pages')
        .select('*', { count: 'exact', head: true })

      // Get total domains
      const { count: totalDomains } = await supabase
        .from('domains')
        .select('*', { count: 'exact', head: true })
        .eq('active', true)

      // Get last scrape time
      const { data: lastScrape } = await supabase
        .from('product_pages')
        .select('last_seen_at')
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .single()

      // Get products scraped today
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { count: productsScrapedToday } = await supabase
        .from('product_pages')
        .select('*', { count: 'exact', head: true })
        .gte('last_seen_at', today.toISOString())

      // Get prices updated today
      const { count: pricesUpdatedToday } = await supabase
        .from('shopify_catalog_cache')
        .select('*', { count: 'exact', head: true })
        .gte('last_synced_at', today.toISOString())

      // Get reconciliation counts
      const { data: reconcileData } = await supabase
        .from('reconcile_results')
        .select('product_type')
        .is('resolved_at', null)

      const supplierOnlyCount = reconcileData?.filter(r => r.product_type === 'supplier_only').length || 0
      const shopifyOnlyCount = reconcileData?.filter(r => r.product_type === 'shopify_only').length || 0

      // Get extraction stats
      const { data: allProducts } = await supabase
        .from('product_pages')
        .select('confidence, latest_sale_price')

      const totalWithPrice = allProducts?.filter(p => p.latest_sale_price !== null).length || 0
      const allProductsCount = allProducts?.length || 1
      const extractionSuccessRate = (totalWithPrice / allProductsCount) * 100

      const highConfidenceCount = allProducts?.filter(p => p.confidence === 'high').length || 0
      const highConfidenceRate = (highConfidenceCount / allProductsCount) * 100

      // Get recent price changes
      const { data: priceChanges } = await supabase
        .from('price_history')
        .select(`
          id,
          sale_price,
          scraped_at,
          product_page_id,
          product_pages (
            canonical_url,
            domains (
              root_url
            )
          )
        `)
        .order('scraped_at', { ascending: false })
        .limit(5)

      setStats({
        totalProducts: totalProducts || 0,
        totalDomains: totalDomains || 0,
        lastScrapeAt: lastScrape?.last_seen_at || null,
        productsScrapedToday: productsScrapedToday || 0,
        pricesUpdatedToday: pricesUpdatedToday || 0,
        supplierOnlyCount,
        shopifyOnlyCount,
        extractionSuccessRate,
        highConfidenceRate,
      })

      setRecentPriceChanges(priceChanges || [])
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
              Across {stats.totalDomains} active suppliers
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
            <CardTitle className="text-sm font-medium">Shopify Updates</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pricesUpdatedToday}</div>
            <p className="text-xs text-muted-foreground">Prices synced today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Actions Required</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.supplierOnlyCount + stats.shopifyOnlyCount}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.supplierOnlyCount} supplier / {stats.shopifyOnlyCount} Shopify
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
                        {change.product_pages?.canonical_url?.split('/').pop() || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        ${change.sale_price?.toFixed(2) || 'N/A'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(change.scraped_at), 'HH:mm')}
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
