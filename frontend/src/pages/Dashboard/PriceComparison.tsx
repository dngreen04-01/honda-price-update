// @ts-nocheck
import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

// API URL configuration - uses environment variable in production
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { ExternalLink, Code, AlertCircle, TrendingDown, TrendingUp, Search, Filter, Upload, Loader2, Check, RefreshCw, Square, CheckSquare, MinusSquare, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'

type FilterType = 'all' | 'not_in_shopify' | 'not_in_supplier' | 'prices_matched' | 'prices_unmatched'

interface PriceComparisonRow {
  id: string | number
  canonical_url: string
  domain_url: string

  // Supplier prices
  supplier_current_price: number | null
  supplier_original_price: number | null
  supplier_html_snippet: string | null
  supplier_last_seen: string

  // Shopify data
  shopify_price: number | null
  shopify_compare_at_price: number | null
  shopify_product_id: string | null
  shopify_variant_id: string | null
  shopify_product_title: string | null
  shopify_variant_title: string | null
  shopify_variant_sku: string | null
  shopify_last_synced: string | null

  // Computed values
  price_difference: number | null
  price_difference_percent: number | null
  has_special_price: boolean
}

export const PriceComparison: React.FC = () => {
  const [priceData, setPriceData] = useState<PriceComparisonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showSnippet, setShowSnippet] = useState<string | number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [pushingPrice, setPushingPrice] = useState<string | null>(null)
  const [pushSuccess, setPushSuccess] = useState<Set<string>>(new Set())
  const [rescrapingUrl, setRescrapingUrl] = useState<string | null>(null)
  const [rescrapeSuccess, setRescrapeSuccess] = useState<Set<string>>(new Set())
  const [redirectDialog, setRedirectDialog] = useState<{
    show: boolean
    url: string
    productId: number | null
    redirectInfo: {
      detected: boolean
      originalUrl: string
      finalUrl: string
      redirectType: string
      likelyDiscontinued: boolean
      suggestedAction: string
      message: string
    } | null
    archiveOnShopify: boolean
  }>({ show: false, url: '', productId: null, redirectInfo: null, archiveOnShopify: false })
  const [updatingProduct, setUpdatingProduct] = useState(false)

  // Bulk selection state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [bulkRescraping, setBulkRescraping] = useState(false)
  const [bulkPushing, setBulkPushing] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null)

  // Supplier re-scrape state
  type SupplierType = 'motorbikes' | 'outdoors' | 'marine'
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false)
  const [supplierRescrapeJob, setSupplierRescrapeJob] = useState<{
    jobId: string
    supplier: SupplierType
    status: 'running' | 'completed' | 'failed'
    progress: { current: number; total: number; success: number; failed: number; priceChanges: number }
  } | null>(null)

  useEffect(() => {
    loadPriceComparison()
  }, [])

  const loadPriceComparison = async () => {
    try {
      // Get Shopify catalog data with scraped prices (simplified architecture)
      const { data: shopifyData } = await supabase
        .from('shopify_catalog_cache')
        .select('*')
        .order('product_title', { ascending: true })

      // Combine data from shopify_catalog_cache (single source of truth)
      const comparisonData: PriceComparisonRow[] = (shopifyData || []).map((item, index) => {
        const supplierPrice = item.scraped_sale_price || null
        const shopifyPrice = item.shopify_price || null

        let priceDiff = null
        let priceDiffPercent = null

        if (supplierPrice && shopifyPrice) {
          priceDiff = shopifyPrice - supplierPrice
          priceDiffPercent = (priceDiff / supplierPrice) * 100
        }

        // Create a unique ID based on URL to avoid React key conflicts
        const canonicalUrl = item.source_url_canonical || ''
        const uniqueId = `row-${index}-${canonicalUrl.split('/').pop() || index}`

        // Restore www. subdomain for display (Honda sites require it)
        let displayUrl = canonicalUrl
        let domainUrl = ''
        try {
          const urlObj = new URL(canonicalUrl)
          domainUrl = urlObj.hostname
          // Add www. if missing for display purposes
          if (!urlObj.hostname.startsWith('www.')) {
            urlObj.hostname = `www.${urlObj.hostname}`
            displayUrl = urlObj.toString()
          }
        } catch {}

        return {
          id: uniqueId,
          canonical_url: displayUrl, // Use display URL with www.
          domain_url: domainUrl,
          supplier_current_price: supplierPrice,
          supplier_original_price: item.scraped_original_price || null,
          supplier_html_snippet: null, // No longer storing HTML snippets
          supplier_last_seen: item.last_scraped_at || '',
          shopify_price: shopifyPrice,
          shopify_compare_at_price: item.shopify_compare_at_price || null,
          shopify_product_id: item.shopify_product_id || null,
          shopify_variant_id: item.shopify_variant_id || null,
          shopify_product_title: item.product_title || null,
          shopify_variant_title: item.variant_title || null,
          shopify_variant_sku: item.variant_sku || null,
          shopify_last_synced: item.last_synced_at || null,
          price_difference: priceDiff,
          price_difference_percent: priceDiffPercent,
          has_special_price: !!(item.scraped_original_price && item.scraped_original_price > (item.scraped_sale_price || 0)),
        }
      })

      // Sort by: 1) has both prices, 2) product title, 3) URL
      comparisonData.sort((a, b) => {
        const aHasBoth = a.supplier_current_price && a.shopify_price ? 1 : 0
        const bHasBoth = b.supplier_current_price && b.shopify_price ? 1 : 0

        if (bHasBoth !== aHasBoth) return bHasBoth - aHasBoth

        const aTitle = a.shopify_product_title || a.canonical_url
        const bTitle = b.shopify_product_title || b.canonical_url

        return aTitle.localeCompare(bTitle)
      })

      setPriceData(comparisonData)
    } catch (error) {
      console.error('Error loading price comparison:', error)
    } finally {
      setLoading(false)
    }
  }

  const pushPriceToShopify = async (url: string, row: PriceComparisonRow) => {
    if (!row.supplier_current_price || !row.shopify_product_id) {
      alert('Cannot push price: Missing supplier price or Shopify product')
      return
    }

    setPushingPrice(url)

    try {
      // Call the backend price sync API (we'll implement this as a direct Supabase call)
      const response = await fetch(`${API_URL}/api/price-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: [url],
        }),
      })

      const result = await response.json()

      if (result.success && result.synced > 0) {
        setPushSuccess(prev => new Set(prev).add(url))
        setTimeout(() => {
          setPushSuccess(prev => {
            const newSet = new Set(prev)
            newSet.delete(url)
            return newSet
          })
        }, 3000)

        // Reload data to show updated prices
        await loadPriceComparison()
      } else {
        alert(`Failed to push price: ${result.message || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error pushing price:', error)
      alert(`Error pushing price: ${error.message}`)
    } finally {
      setPushingPrice(null)
    }
  }

  const rescrapeProduct = async (url: string) => {
    setRescrapingUrl(url)

    try {
      const response = await fetch(`${API_URL}/api/rescrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      })

      const result = await response.json()

      if (result.success) {
        setRescrapeSuccess(prev => new Set(prev).add(url))
        setTimeout(() => {
          setRescrapeSuccess(prev => {
            const newSet = new Set(prev)
            newSet.delete(url)
            return newSet
          })
        }, 3000)

        // Show result message
        alert(result.message)

        // Reload data to show updated prices
        await loadPriceComparison()
      } else {
        // Check if this is a redirect issue
        if (result.redirectInfo?.detected) {
          setRedirectDialog({
            show: true,
            url,
            productId: result.data?.productId || null,
            redirectInfo: result.redirectInfo,
            archiveOnShopify: false
          })
        } else {
          alert(`Re-scrape failed: ${result.message || 'Unknown error'}`)
        }
      }
    } catch (error) {
      console.error('Error re-scraping:', error)
      alert(`Error re-scraping: ${error.message}`)
    } finally {
      setRescrapingUrl(null)
    }
  }

  const handleRedirectAction = async (action: 'update_url' | 'mark_discontinued' | 'ignore', newUrl?: string) => {
    if (!redirectDialog.productId) {
      alert('No product ID available')
      setRedirectDialog({ show: false, url: '', productId: null, redirectInfo: null, archiveOnShopify: false })
      return
    }

    setUpdatingProduct(true)

    try {
      const response = await fetch(`${API_URL}/api/update-product-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: redirectDialog.productId,
          action,
          newUrl: action === 'update_url' ? newUrl : undefined,
          archiveOnShopify: action === 'mark_discontinued' ? redirectDialog.archiveOnShopify : undefined,
        }),
      })

      const result = await response.json()

      if (result.success) {
        alert(result.message)
        await loadPriceComparison()
      } else {
        alert(`Action failed: ${result.message || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error updating product:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setUpdatingProduct(false)
      setRedirectDialog({ show: false, url: '', productId: null, redirectInfo: null, archiveOnShopify: false })
    }
  }

  // Bulk selection helpers
  const toggleSelectItem = (url: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(url)) {
        newSet.delete(url)
      } else {
        newSet.add(url)
      }
      return newSet
    })
  }

  const toggleSelectAllVisible = () => {
    const visibleUrls = filteredData.map(row => row.canonical_url).filter(Boolean)
    const allSelected = visibleUrls.every(url => selectedItems.has(url))

    if (allSelected) {
      // Deselect all visible
      setSelectedItems(prev => {
        const newSet = new Set(prev)
        visibleUrls.forEach(url => newSet.delete(url))
        return newSet
      })
    } else {
      // Select all visible
      setSelectedItems(prev => {
        const newSet = new Set(prev)
        visibleUrls.forEach(url => newSet.add(url))
        return newSet
      })
    }
  }

  const getSelectionState = () => {
    const visibleUrls = filteredData.map(row => row.canonical_url).filter(Boolean)
    const selectedVisible = visibleUrls.filter(url => selectedItems.has(url))

    if (selectedVisible.length === 0) return 'none'
    if (selectedVisible.length === visibleUrls.length) return 'all'
    return 'partial'
  }

  // Bulk rescrape action
  const bulkRescrape = async () => {
    const urlsToRescrape = Array.from(selectedItems).filter(url =>
      filteredData.some(row => row.canonical_url === url)
    )

    if (urlsToRescrape.length === 0) {
      alert('No items selected for re-scraping')
      return
    }

    if (!confirm(`Re-scrape ${urlsToRescrape.length} selected product(s)?`)) {
      return
    }

    setBulkRescraping(true)
    setBulkProgress({ current: 0, total: urlsToRescrape.length })

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < urlsToRescrape.length; i++) {
      const url = urlsToRescrape[i]
      setBulkProgress({ current: i + 1, total: urlsToRescrape.length })

      try {
        const response = await fetch(`${API_URL}/api/rescrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        })

        const result = await response.json()

        if (result.success) {
          successCount++
          setRescrapeSuccess(prev => new Set(prev).add(url))
        } else {
          failCount++
        }
      } catch (error) {
        console.error('Error re-scraping:', url, error)
        failCount++
      }
    }

    setBulkRescraping(false)
    setBulkProgress(null)
    setSelectedItems(new Set())

    // Clear success indicators after delay
    setTimeout(() => {
      setRescrapeSuccess(new Set())
    }, 3000)

    alert(`Bulk re-scrape complete!\n✓ Success: ${successCount}\n✗ Failed: ${failCount}`)
    await loadPriceComparison()
  }

  // Bulk push to Shopify action
  const bulkPushToShopify = async () => {
    const rowsToPush = filteredData.filter(row =>
      selectedItems.has(row.canonical_url) &&
      row.supplier_current_price &&
      row.shopify_product_id &&
      shouldShowPushButton(row)
    )

    if (rowsToPush.length === 0) {
      alert('No eligible items selected for pushing to Shopify.\n\nItems must have:\n- A supplier price\n- A linked Shopify product\n- A price difference')
      return
    }

    if (!confirm(`Push prices for ${rowsToPush.length} selected product(s) to Shopify?`)) {
      return
    }

    setBulkPushing(true)
    setBulkProgress({ current: 0, total: rowsToPush.length })

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < rowsToPush.length; i++) {
      const row = rowsToPush[i]
      setBulkProgress({ current: i + 1, total: rowsToPush.length })

      try {
        const response = await fetch(`${API_URL}/api/price-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: [row.canonical_url] }),
        })

        const result = await response.json()

        if (result.success && result.synced > 0) {
          successCount++
          setPushSuccess(prev => new Set(prev).add(row.canonical_url))
        } else {
          failCount++
        }
      } catch (error) {
        console.error('Error pushing price:', row.canonical_url, error)
        failCount++
      }
    }

    setBulkPushing(false)
    setBulkProgress(null)
    setSelectedItems(new Set())

    // Clear success indicators after delay
    setTimeout(() => {
      setPushSuccess(new Set())
    }, 3000)

    alert(`Bulk push complete!\n✓ Success: ${successCount}\n✗ Failed: ${failCount}`)
    await loadPriceComparison()
  }

  // Supplier re-scrape functions
  const SUPPLIER_LABELS: Record<SupplierType, string> = {
    motorbikes: 'Honda Motorbikes',
    outdoors: 'Honda Outdoors',
    marine: 'Honda Marine',
  }

  const startSupplierRescrape = async (supplier: SupplierType) => {
    setSupplierDropdownOpen(false)

    if (!confirm(`Re-scrape all products from ${SUPPLIER_LABELS[supplier]}?\n\nThis will update prices for all products from this supplier. This may take several minutes.`)) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/supplier-rescrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier }),
      })

      const result = await response.json()

      if (result.success) {
        setSupplierRescrapeJob({
          jobId: result.jobId,
          supplier,
          status: 'running',
          progress: { current: 0, total: 0, success: 0, failed: 0, priceChanges: 0 },
        })
      } else {
        alert(`Failed to start re-scrape: ${result.message}`)
      }
    } catch (error) {
      console.error('Error starting supplier re-scrape:', error)
      alert(`Error: ${error.message}`)
    }
  }

  // Poll job status when a supplier re-scrape is running
  useEffect(() => {
    if (!supplierRescrapeJob || supplierRescrapeJob.status !== 'running') {
      return
    }

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/supplier-rescrape/${supplierRescrapeJob.jobId}`)
        const result = await response.json()

        if (result.success && result.job) {
          const job = result.job
          setSupplierRescrapeJob({
            jobId: job.id,
            supplier: job.supplier,
            status: job.status,
            progress: {
              current: job.current,
              total: job.total,
              success: job.success,
              failed: job.failed,
              priceChanges: job.priceChanges,
            },
          })

          // Job completed or failed
          if (job.status === 'completed' || job.status === 'failed') {
            clearInterval(pollInterval)

            if (job.status === 'completed') {
              alert(`Re-scrape complete for ${SUPPLIER_LABELS[job.supplier]}!\n\n✓ Successful: ${job.success}\n✗ Failed: ${job.failed}\n📊 Price changes: ${job.priceChanges}`)
              await loadPriceComparison()
            } else {
              alert(`Re-scrape failed for ${SUPPLIER_LABELS[job.supplier]}. Check the server logs for details.`)
            }

            // Clear the job state after a short delay
            setTimeout(() => setSupplierRescrapeJob(null), 2000)
          }
        }
      } catch (error) {
        console.error('Error polling job status:', error)
      }
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(pollInterval)
  }, [supplierRescrapeJob?.jobId, supplierRescrapeJob?.status])

  // Filter data based on search term and filter type
  const filteredData = useMemo(() => {
    let data = priceData

    // Apply filter type
    switch (activeFilter) {
      case 'not_in_shopify':
        data = data.filter(row => row.supplier_current_price && !row.shopify_price)
        break
      case 'not_in_supplier':
        data = data.filter(row => !row.supplier_current_price && row.shopify_price)
        break
      case 'prices_matched':
        data = data.filter(row => {
          if (!row.supplier_current_price || !row.shopify_price) return false
          // Consider prices matched if they're within $0.01
          return Math.abs(row.price_difference || 0) <= 0.01
        })
        break
      case 'prices_unmatched':
        data = data.filter(row => {
          if (!row.supplier_current_price || !row.shopify_price) return false
          // Prices are unmatched if difference is greater than $0.01
          return Math.abs(row.price_difference || 0) > 0.01
        })
        break
      case 'all':
      default:
        // No filter, show all data
        break
    }

    // Apply search term filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      data = data.filter(row => {
        return (
          row.canonical_url?.toLowerCase().includes(term) ||
          row.shopify_product_title?.toLowerCase().includes(term) ||
          row.shopify_variant_title?.toLowerCase().includes(term) ||
          row.shopify_variant_sku?.toLowerCase().includes(term)
        )
      })
    }

    return data
  }, [priceData, searchTerm, activeFilter])

  // Calculate stats for all data (not filtered)
  const allStats = useMemo(() => {
    const notInShopify = priceData.filter(r => r.supplier_current_price && !r.shopify_price).length
    const notInSupplier = priceData.filter(r => !r.supplier_current_price && r.shopify_price).length
    const pricesMatched = priceData.filter(r => {
      if (!r.supplier_current_price || !r.shopify_price) return false
      return Math.abs(r.price_difference || 0) <= 0.01
    }).length
    const pricesUnmatched = priceData.filter(r => {
      if (!r.supplier_current_price || !r.shopify_price) return false
      return Math.abs(r.price_difference || 0) > 0.01
    }).length
    return { notInShopify, notInSupplier, pricesMatched, pricesUnmatched, total: priceData.length }
  }, [priceData])

  const getShopifyUrl = (productId: string, variantId: string) => {
    // Replace with your actual Shopify store URL
    const storeUrl = 'https://supermoto-honda-parts.myshopify.com'
    return `${storeUrl}/admin/products/${productId.replace('gid://shopify/Product/', '')}`
  }

  const toggleSnippet = (id: string | number) => {
    setShowSnippet(showSnippet === id ? null : id)
  }

  // Check if price difference is significant enough to show push button
  const shouldShowPushButton = (row: PriceComparisonRow) => {
    // Show button if:
    // 1. Has both prices AND they differ by more than $0.01 (standard case)
    // 2. Has Shopify product but NO supplier price yet (newly loaded products)
    // 3. Supplier has a sale price but Shopify doesn't have compare_at_price set

    if (row.shopify_product_id && row.shopify_price && !row.supplier_current_price) {
      return true // Newly loaded product - show button to enable scraping workflow
    }

    // Check if supplier has a sale but Shopify doesn't reflect it
    if (
      row.supplier_current_price &&
      row.shopify_price &&
      row.shopify_product_id &&
      row.has_special_price &&
      !row.shopify_compare_at_price
    ) {
      return true // Supplier has sale price but Shopify missing compare_at_price
    }

    return (
      row.supplier_current_price &&
      row.shopify_price &&
      row.shopify_product_id &&
      Math.abs(row.price_difference || 0) > 0.01
    )
  }

  // Check if price difference looks suspicious (potential scraping error)
  const isSuspiciousPriceDifference = (row: PriceComparisonRow) => {
    if (!row.supplier_current_price || !row.shopify_price) return false

    const diff = Math.abs(row.price_difference || 0)
    const diffPercent = Math.abs(row.price_difference_percent || 0)

    // Flag as suspicious if:
    // 1. Price difference is very large (>$500 or >500%)
    // 2. One price is suspiciously round (like $1000, $1049) and the other is small
    const isLargeDiff = diff > 500 || diffPercent > 500
    const hasRoundPrice = (
      (row.supplier_current_price > 100 && row.supplier_current_price % 100 === 0) ||
      (row.shopify_price > 100 && row.shopify_price % 100 === 0)
    )
    const hasSmallPrice = row.supplier_current_price < 100 || row.shopify_price < 100

    return isLargeDiff || (hasRoundPrice && hasSmallPrice && diffPercent > 100)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading price comparison...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Price Comparison</h1>
        <p className="text-muted-foreground">
          Compare supplier prices with Shopify catalog prices
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Supplier vs Shopify Price Comparison</CardTitle>
              <CardDescription>
                {filteredData.length} of {allStats.total} products shown
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Supplier Re-scrape Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setSupplierDropdownOpen(!supplierDropdownOpen)}
                  disabled={!!supplierRescrapeJob}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    supplierRescrapeJob
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {supplierRescrapeJob ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>
                        Re-scraping {SUPPLIER_LABELS[supplierRescrapeJob.supplier]}...
                        {supplierRescrapeJob.progress.total > 0 && (
                          <span className="ml-1">
                            ({supplierRescrapeJob.progress.current}/{supplierRescrapeJob.progress.total})
                          </span>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Re-scrape Supplier
                      <ChevronDown className="h-4 w-4" />
                    </>
                  )}
                </button>

                {/* Dropdown Menu */}
                {supplierDropdownOpen && !supplierRescrapeJob && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                    <div className="py-1">
                      <button
                        onClick={() => startSupplierRescrape('motorbikes')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Honda Motorbikes
                      </button>
                      <button
                        onClick={() => startSupplierRescrape('outdoors')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Honda Outdoors
                      </button>
                      <button
                        onClick={() => startSupplierRescrape('marine')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Honda Marine
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Refresh Data Button */}
              <button
                onClick={() => {
                  setLoading(true)
                  loadPriceComparison()
                }}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Refreshing...' : 'Refresh Data'}
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter Buttons */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filter by:</span>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                All Products
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-white/20">
                  {allStats.total}
                </span>
              </button>
              <button
                onClick={() => setActiveFilter('not_in_shopify')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeFilter === 'not_in_shopify'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                Not In Shopify
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-white/20">
                  {allStats.notInShopify}
                </span>
              </button>
              <button
                onClick={() => setActiveFilter('not_in_supplier')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeFilter === 'not_in_supplier'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                Not In Supplier
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-white/20">
                  {allStats.notInSupplier}
                </span>
              </button>
              <button
                onClick={() => setActiveFilter('prices_matched')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeFilter === 'prices_matched'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                Prices Matched
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-white/20">
                  {allStats.pricesMatched}
                </span>
              </button>
              <button
                onClick={() => setActiveFilter('prices_unmatched')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeFilter === 'prices_unmatched'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                Prices Unmatched
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-white/20">
                  {allStats.pricesUnmatched}
                </span>
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by URL, Product Title, Variant Title, or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {searchTerm && (
              <p className="text-sm text-muted-foreground mt-2">
                Showing {filteredData.length} result{filteredData.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Bulk Actions Bar */}
          <div className="mb-4 flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {selectedItems.size > 0 ? (
                  <>
                    <span className="text-blue-600 dark:text-blue-400">{selectedItems.size}</span> selected
                  </>
                ) : (
                  'Select items for bulk actions'
                )}
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {/* Bulk Rescrape Button */}
              <button
                onClick={bulkRescrape}
                disabled={selectedItems.size === 0 || bulkRescraping || bulkPushing}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedItems.size === 0 || bulkRescraping || bulkPushing
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-600 text-white hover:bg-gray-700'
                }`}
              >
                {bulkRescraping ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Re-scraping {bulkProgress?.current}/{bulkProgress?.total}...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Bulk Re-scrape
                  </>
                )}
              </button>

              {/* Bulk Push to Shopify Button */}
              <button
                onClick={bulkPushToShopify}
                disabled={selectedItems.size === 0 || bulkRescraping || bulkPushing}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedItems.size === 0 || bulkRescraping || bulkPushing
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {bulkPushing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Pushing {bulkProgress?.current}/{bulkProgress?.total}...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Bulk Push to Shopify
                  </>
                )}
              </button>

              {/* Clear Selection Button */}
              {selectedItems.size > 0 && (
                <button
                  onClick={() => setSelectedItems(new Set())}
                  disabled={bulkRescraping || bulkPushing}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-center p-3 font-medium w-10">
                    <button
                      onClick={toggleSelectAllVisible}
                      disabled={filteredData.length === 0 || bulkRescraping || bulkPushing}
                      className="inline-flex items-center justify-center text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={getSelectionState() === 'all' ? 'Deselect all visible' : 'Select all visible'}
                    >
                      {getSelectionState() === 'all' ? (
                        <CheckSquare className="h-5 w-5 text-blue-600" />
                      ) : getSelectionState() === 'partial' ? (
                        <MinusSquare className="h-5 w-5 text-blue-600" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </button>
                  </th>
                  <th className="text-left p-3 font-medium">Product</th>
                  <th className="text-left p-3 font-medium">SKU</th>
                  <th className="text-right p-3 font-medium">Supplier Price</th>
                  <th className="text-right p-3 font-medium">Special Price</th>
                  <th className="text-right p-3 font-medium">Shopify Price</th>
                  <th className="text-right p-3 font-medium">Difference</th>
                  <th className="text-center p-3 font-medium">Re-scrape</th>
                  <th className="text-center p-3 font-medium">Push to Shopify</th>
                  <th className="text-center p-3 font-medium">Code Snippet</th>
                  <th className="text-center p-3 font-medium">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length > 0 ? (
                  filteredData.map((row) => (
                    <React.Fragment key={row.id}>
                      <tr className={`border-b hover:bg-gray-50 dark:hover:bg-gray-800 ${selectedItems.has(row.canonical_url) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                        {/* Checkbox */}
                        <td className="p-3 text-center">
                          <button
                            onClick={() => toggleSelectItem(row.canonical_url)}
                            disabled={bulkRescraping || bulkPushing}
                            className="inline-flex items-center justify-center text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {selectedItems.has(row.canonical_url) ? (
                              <CheckSquare className="h-5 w-5 text-blue-600" />
                            ) : (
                              <Square className="h-5 w-5" />
                            )}
                          </button>
                        </td>
                        {/* Product Info */}
                        <td className="p-3">
                          <div className="space-y-1">
                            {row.shopify_product_title && (
                              <p className="font-medium text-sm">{row.shopify_product_title}</p>
                            )}
                            {row.shopify_variant_title && row.shopify_variant_title !== row.shopify_product_title && (
                              <p className="text-xs text-muted-foreground">{row.shopify_variant_title}</p>
                            )}
                            <a
                              href={row.canonical_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 text-xs max-w-xs truncate"
                              title={row.canonical_url}
                            >
                              <span className="truncate">{row.canonical_url}</span>
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            </a>
                          </div>
                        </td>

                        {/* SKU */}
                        <td className="p-3">
                          {row.shopify_variant_sku ? (
                            <span className="font-mono text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                              {row.shopify_variant_sku}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </td>

                        {/* Supplier Current Price */}
                        <td className="p-3 text-right">
                          {row.supplier_current_price ? (
                            <a
                              href={row.canonical_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 inline-flex items-center gap-1 font-semibold"
                              title="Click to view on supplier website"
                            >
                              ${row.supplier_current_price.toFixed(2)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </td>

                        {/* Special Price (Original Price if different) */}
                        <td className="p-3 text-right">
                          {row.has_special_price && row.supplier_original_price ? (
                            <div className="flex flex-col items-end">
                              <span className="text-sm line-through text-muted-foreground">
                                ${row.supplier_original_price.toFixed(2)}
                              </span>
                              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                                <TrendingDown className="h-3 w-3" />
                                Sale!
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </td>

                        {/* Shopify Price */}
                        <td className="p-3 text-right">
                          {row.shopify_price && row.shopify_product_id ? (
                            <div className="flex flex-col items-end">
                              <a
                                href={getShopifyUrl(row.shopify_product_id, row.shopify_variant_id || '')}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 inline-flex items-center gap-1 font-semibold"
                                title="Click to view in Shopify admin"
                              >
                                ${row.shopify_price.toFixed(2)}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                              {row.shopify_compare_at_price && (
                                <span className="text-xs line-through text-muted-foreground">
                                  was ${row.shopify_compare_at_price.toFixed(2)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground flex items-center gap-1 justify-end">
                              <AlertCircle className="h-3 w-3" />
                              Not in Shopify
                            </span>
                          )}
                        </td>

                        {/* Price Difference */}
                        <td className="p-3 text-right">
                          {row.price_difference !== null && row.price_difference_percent !== null ? (
                            <div className="flex flex-col items-end">
                              <span
                                className={`font-medium ${
                                  row.price_difference > 0
                                    ? 'text-red-600'
                                    : row.price_difference < 0
                                    ? 'text-green-600'
                                    : 'text-gray-600'
                                }`}
                              >
                                {row.price_difference > 0 ? '+' : ''}
                                ${row.price_difference.toFixed(2)}
                              </span>
                              <span
                                className={`text-xs flex items-center gap-1 ${
                                  row.price_difference > 0
                                    ? 'text-red-600'
                                    : row.price_difference < 0
                                    ? 'text-green-600'
                                    : 'text-gray-600'
                                }`}
                              >
                                {row.price_difference > 0 ? (
                                  <TrendingUp className="h-3 w-3" />
                                ) : row.price_difference < 0 ? (
                                  <TrendingDown className="h-3 w-3" />
                                ) : null}
                                {row.price_difference_percent > 0 ? '+' : ''}
                                {row.price_difference_percent.toFixed(1)}%
                              </span>
                              {isSuspiciousPriceDifference(row) && (
                                <span className="text-xs text-orange-600 font-medium flex items-center gap-1 mt-1">
                                  <AlertCircle className="h-3 w-3" />
                                  Suspicious
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Re-scrape Button */}
                        <td className="p-3 text-center">
                          {/* Show button for products with prices OR products without supplier prices (newly loaded) */}
                          {row.canonical_url ? (
                            <button
                              onClick={() => rescrapeProduct(row.canonical_url)}
                              disabled={rescrapingUrl === row.canonical_url}
                              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                rescrapeSuccess.has(row.canonical_url)
                                  ? 'bg-green-600 text-white cursor-default'
                                  : rescrapingUrl === row.canonical_url
                                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                  : !row.supplier_current_price
                                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                                  : isSuspiciousPriceDifference(row)
                                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                                  : 'bg-gray-600 text-white hover:bg-gray-700'
                              }`}
                              title={
                                !row.supplier_current_price
                                  ? 'Scrape this product from supplier website'
                                  : 'Re-scrape this product from supplier website'
                              }
                            >
                              {rescrapingUrl === row.canonical_url ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Scraping...
                                </>
                              ) : rescrapeSuccess.has(row.canonical_url) ? (
                                <>
                                  <Check className="h-4 w-4" />
                                  Done!
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="h-4 w-4" />
                                  {!row.supplier_current_price ? 'Scrape' : 'Re-scrape'}
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </td>

                        {/* Push to Shopify Button */}
                        <td className="p-3 text-center">
                          {shouldShowPushButton(row) ? (
                            <button
                              onClick={() => pushPriceToShopify(row.canonical_url, row)}
                              disabled={pushingPrice === row.canonical_url || !row.supplier_current_price}
                              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                pushSuccess.has(row.canonical_url)
                                  ? 'bg-green-600 text-white cursor-default'
                                  : pushingPrice === row.canonical_url
                                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                  : !row.supplier_current_price
                                  ? 'bg-gray-400 text-white cursor-not-allowed opacity-60'
                                  : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                              title={
                                !row.supplier_current_price
                                  ? 'Scrape product first to get supplier price'
                                  : 'Push supplier price to Shopify'
                              }
                            >
                              {pushingPrice === row.canonical_url ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Pushing...
                                </>
                              ) : pushSuccess.has(row.canonical_url) ? (
                                <>
                                  <Check className="h-4 w-4" />
                                  Pushed!
                                </>
                              ) : (
                                <>
                                  <Upload className="h-4 w-4" />
                                  {!row.supplier_current_price ? 'Needs Price' : 'Push to Shopify'}
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </td>

                        {/* Code Snippet Button */}
                        <td className="p-3 text-center">
                          {row.supplier_html_snippet ? (
                            <button
                              onClick={() => toggleSnippet(row.id)}
                              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                              title="View HTML snippet where price was detected"
                            >
                              <Code className="h-4 w-4" />
                              {showSnippet === row.id ? 'Hide' : 'Show'}
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </td>

                        {/* Last Updated */}
                        <td className="p-3 text-center text-xs text-muted-foreground">
                          <div>
                            {row.supplier_last_seen ? (
                              <p>Supplier: {format(new Date(row.supplier_last_seen), 'PP')}</p>
                            ) : (
                              <p>Supplier: —</p>
                            )}
                            {row.shopify_last_synced && (
                              <p className="mt-1">Shopify: {format(new Date(row.shopify_last_synced), 'PP')}</p>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Code Snippet Row (Expandable) */}
                      {showSnippet === row.id && row.supplier_html_snippet && (
                        <tr className="border-b bg-gray-50 dark:bg-gray-900">
                          <td colSpan={11} className="p-4">
                            <div>
                              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                <Code className="h-4 w-4" />
                                HTML Snippet (where price was detected)
                              </p>
                              <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto text-xs">
                                <code>{row.supplier_html_snippet}</code>
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-muted-foreground">
                      {searchTerm ? 'No results found' : 'No price data available'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Redirect Detection Dialog */}
      {redirectDialog.show && redirectDialog.redirectInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Product URL Redirect Detected
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {redirectDialog.redirectInfo.message}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4 space-y-2">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Original URL:</span>
                <p className="text-sm font-mono break-all">{redirectDialog.redirectInfo.originalUrl}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Redirected to:</span>
                <p className="text-sm font-mono break-all text-orange-600">{redirectDialog.redirectInfo.finalUrl}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Redirect Type:</span>
                <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                  redirectDialog.redirectInfo.redirectType === 'category'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {redirectDialog.redirectInfo.redirectType}
                </span>
              </div>
            </div>

            {redirectDialog.redirectInfo.likelyDiscontinued && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  This product is likely discontinued by the supplier.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">What would you like to do?</p>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    const newUrl = prompt('Enter the new URL for this product:', redirectDialog.redirectInfo?.finalUrl || '')
                    if (newUrl) {
                      handleRedirectAction('update_url', newUrl)
                    }
                  }}
                  disabled={updatingProduct}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Update URL
                </button>

                <div className="space-y-2">
                  <button
                    onClick={() => handleRedirectAction('mark_discontinued')}
                    disabled={updatingProduct}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <AlertCircle className="h-4 w-4" />
                    Mark as Discontinued
                  </button>

                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer pl-1">
                    <input
                      type="checkbox"
                      checked={redirectDialog.archiveOnShopify}
                      onChange={(e) => setRedirectDialog(prev => ({ ...prev, archiveOnShopify: e.target.checked }))}
                      className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    Also archive product on Shopify
                  </label>
                </div>

                <button
                  onClick={() => handleRedirectAction('ignore')}
                  disabled={updatingProduct}
                  className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Ignore for Now
                </button>
              </div>
            </div>

            {updatingProduct && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
