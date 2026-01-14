// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { AlertCircle, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'

interface ActionItem {
  id: string
  type: 'supplier_only' | 'shopify_only' | 'low_confidence' | 'price_mismatch'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  url: string
  detected_at: string
  action_required: string
}

export const ActionsRequired: React.FC = () => {
  const [actions, setActions] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadActionItems()
  }, [])

  const loadActionItems = async () => {
    try {
      const actionsList: ActionItem[] = []

      // Get all products from shopify_catalog_cache
      const { data: shopifyCache } = await supabase
        .from('shopify_catalog_cache')
        .select('*')
        .limit(500)

      if (shopifyCache) {
        shopifyCache.forEach((item: any) => {
          const supplierPrice = item.scraped_sale_price
          const shopifyPrice = item.shopify_price
          const scrapeConfidence = item.scrape_confidence

          // 1. Products not scraped yet (no supplier price)
          if (!item.scraped_sale_price && item.source_url_canonical) {
            actionsList.push({
              id: `no-scrape-${item.id}`,
              type: 'supplier_only',
              priority: 'medium',
              title: 'Product not scraped',
              description: item.product_title || item.source_url_canonical,
              url: item.source_url_canonical,
              detected_at: item.last_synced_at,
              action_required: 'Run scraper to get supplier price',
            })
          }

          // 2. Low confidence price extractions (low priority)
          if (scrapeConfidence !== null && scrapeConfidence < 0.7 && supplierPrice !== null) {
            actionsList.push({
              id: `confidence-${item.id}`,
              type: 'low_confidence',
              priority: 'low',
              title: 'Low confidence price extraction',
              description: item.product_title || item.source_url_canonical,
              url: item.source_url_canonical,
              detected_at: item.last_scraped_at || item.last_synced_at,
              action_required: 'Verify price is correct and update scraper if needed',
            })
          }

          // 3. Price mismatches (high priority)
          if (supplierPrice && shopifyPrice && Math.abs(supplierPrice - shopifyPrice) > 0.01) {
            actionsList.push({
              id: `mismatch-${item.id}`,
              type: 'price_mismatch',
              priority: 'high',
              title: 'Price mismatch detected',
              description: `Supplier: $${supplierPrice.toFixed(2)} | Shopify: $${shopifyPrice.toFixed(2)}`,
              url: item.source_url_canonical,
              detected_at: item.last_scraped_at || item.last_synced_at,
              action_required: 'Update Shopify price to match supplier',
            })
          }
        })
      }

      // Sort by priority and date
      actionsList.sort((a, b) => {
        const priorityWeight = { high: 3, medium: 2, low: 1 }
        if (priorityWeight[a.priority] !== priorityWeight[b.priority]) {
          return priorityWeight[b.priority] - priorityWeight[a.priority]
        }
        return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
      })

      setActions(actionsList)
    } catch (error) {
      console.error('Error loading action items:', error)
    } finally {
      setLoading(false)
    }
  }

  const getPriorityBadge = (priority: string) => {
    const styles = {
      high: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
      medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
      low: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    }
    return styles[priority as keyof typeof styles] || styles.low
  }

  const getPriorityIcon = (priority: string) => {
    if (priority === 'high') return <AlertCircle className="h-4 w-4 text-red-600" />
    if (priority === 'medium') return <AlertTriangle className="h-4 w-4 text-yellow-600" />
    return <CheckCircle className="h-4 w-4 text-blue-600" />
  }

  const highPriorityCount = actions.filter((a) => a.priority === 'high').length
  const mediumPriorityCount = actions.filter((a) => a.priority === 'medium').length
  const lowPriorityCount = actions.filter((a) => a.priority === 'low').length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading action items...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Actions Required</h1>
        <p className="text-muted-foreground">
          Items that need your attention
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Priority</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{highPriorityCount}</div>
            <p className="text-xs text-muted-foreground">Requires immediate attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Medium Priority</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{mediumPriorityCount}</div>
            <p className="text-xs text-muted-foreground">Should be addressed soon</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Priority</CardTitle>
            <CheckCircle className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{lowPriorityCount}</div>
            <p className="text-xs text-muted-foreground">Can be addressed later</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Action Items</CardTitle>
          <CardDescription>{actions.length} items require your attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {actions.length > 0 ? (
              actions.map((action) => (
                <div
                  key={action.id}
                  className="flex items-start justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {getPriorityIcon(action.priority)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold">{action.title}</h4>
                        <span
                          className={`text-xs px-2 py-0.5 rounded uppercase font-medium ${getPriorityBadge(
                            action.priority
                          )}`}
                        >
                          {action.priority}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {action.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        <strong>Action:</strong> {action.action_required}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Detected: {format(new Date(action.detected_at), 'PP')}
                      </p>
                    </div>
                  </div>
                  <a
                    href={action.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-4 text-primary hover:underline flex-shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <p className="text-lg font-medium">All caught up!</p>
                <p className="text-sm text-muted-foreground">
                  No action items require your attention at this time.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
