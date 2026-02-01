// @ts-nocheck
import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'

// API URL configuration - uses environment variable in production
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
import { Input } from '../../components/ui/Input'
import { Search, Globe, Package, Tag, ExternalLink, EyeOff, RefreshCw, Filter, Loader2, CheckCircle2, AlertCircle, ChevronDown, Square, CheckSquare, MinusSquare, ShoppingBag, Link, ChevronUp, X, Calendar, Clock, ArrowRight, ShoppingCart, Image as ImageIcon } from 'lucide-react'
import { format, differenceInDays, isPast, parseISO } from 'date-fns'
import { DiscoveredProduct, CrawlerOffer, ShopifyOfferPage, ShopifyCatalogProduct, PushOfferResult } from '../../types/database'

type TabType = 'products' | 'offers'
type StatusFilter = 'pending' | 'reviewed' | 'ignored' | 'added' | 'all'

interface CrawlerStats {
  pending: number
  reviewed: number
  ignored: number
  added: number
}

export const Discoveries: React.FC = () => {
  const [products, setProducts] = useState<DiscoveredProduct[]>([])
  const [offers, setOffers] = useState<CrawlerOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('products')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [domainFilter, setDomainFilter] = useState<string>('all')
  const [stats, setStats] = useState<CrawlerStats | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null)
  const [updateSuccess, setUpdateSuccess] = useState<Set<number>>(new Set())
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set())
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [pushingToShopify, setPushingToShopify] = useState<number | null>(null)
  const [pushDropdownOpen, setPushDropdownOpen] = useState<number | null>(null)

  // Manual URL form state
  const [manualFormOpen, setManualFormOpen] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const [manualTemplate, setManualTemplate] = useState<'motorbikes' | 'outboard-motors' | 'default'>('default')
  const [manualPrice, setManualPrice] = useState('')
  const [pushingManual, setPushingManual] = useState(false)
  const [manualResult, setManualResult] = useState<{success: boolean, message: string, url?: string} | null>(null)

  // Offer management state
  const [selectedOffer, setSelectedOffer] = useState<CrawlerOffer | null>(null)
  const [offerPanelOpen, setOfferPanelOpen] = useState(false)
  const [offerShopifyPage, setOfferShopifyPage] = useState<ShopifyOfferPage | null>(null)
  const [linkedProductIds, setLinkedProductIds] = useState<number[]>([])
  const [availableProducts, setAvailableProducts] = useState<ShopifyCatalogProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [offerEndDate, setOfferEndDate] = useState('')
  const [pushingOffer, setPushingOffer] = useState(false)
  const [pushOfferResult, setPushOfferResult] = useState<PushOfferResult | null>(null)
  const [expiringOffers, setExpiringOffers] = useState<CrawlerOffer[]>([])
  const [offerStatuses, setOfferStatuses] = useState<Record<number, ShopifyOfferPage | null>>({})
  const [productSearchTerm, setProductSearchTerm] = useState('')

  // Filter products for offer panel based on search term
  const filteredOfferProducts = useMemo(() => {
    if (!productSearchTerm.trim()) {
      // When no search, show selected products first
      return [...availableProducts].sort((a, b) => {
        const aSelected = linkedProductIds.includes(a.id) ? 0 : 1
        const bSelected = linkedProductIds.includes(b.id) ? 0 : 1
        return aSelected - bSelected
      })
    }
    const term = productSearchTerm.toLowerCase()
    return availableProducts.filter(product => {
      // Search across multiple fields
      const searchableText = [
        product.product_title,
        product.variant_sku,
        product.variant_title,
        // Also search the source URL which often contains the product name/code
        product.source_url_canonical,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      // Support multi-word search (all terms must match)
      const searchTerms = term.split(/\s+/).filter(t => t.length > 0)
      return searchTerms.every(t => searchableText.includes(t))
    })
  }, [availableProducts, productSearchTerm, linkedProductIds])

  useEffect(() => {
    loadData()
  }, [statusFilter])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch products, offers, stats, and expiring offers in parallel
      const [productsRes, offersRes, statsRes, expiringRes] = await Promise.all([
        fetch(`${API_URL}/api/crawl/results${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`),
        fetch(`${API_URL}/api/crawl/offers`),
        fetch(`${API_URL}/api/crawl/stats`),
        fetch(`${API_URL}/api/offers/expiring?days=7`)
      ])

      if (!productsRes.ok) throw new Error('Failed to fetch products')
      if (!offersRes.ok) throw new Error('Failed to fetch offers')
      if (!statsRes.ok) throw new Error('Failed to fetch stats')

      const productsData = await productsRes.json()
      const offersData = await offersRes.json()
      const statsData = await statsRes.json()
      const expiringData = expiringRes.ok ? await expiringRes.json() : { offers: [] }

      // Handle API responses that may return objects with data property or arrays directly
      setProducts(Array.isArray(productsData) ? productsData : productsData?.products || productsData?.data || [])
      const offersArray = Array.isArray(offersData) ? offersData : offersData?.offers || offersData?.data || []
      setOffers(offersArray)
      setStats(statsData)
      setExpiringOffers(expiringData.offers || [])

      // Fetch Shopify status for each offer
      const statusPromises = offersArray.map(async (offer: CrawlerOffer) => {
        try {
          const res = await fetch(`${API_URL}/api/offers/${offer.id}`)
          if (res.ok) {
            const data = await res.json()
            return { id: offer.id, shopifyPage: data.shopifyPage || null }
          }
        } catch {
          // Ignore errors for individual offer status fetches
        }
        return { id: offer.id, shopifyPage: null }
      })

      const statuses = await Promise.all(statusPromises)
      const statusMap: Record<number, ShopifyOfferPage | null> = {}
      statuses.forEach(s => { statusMap[s.id] = s.shopifyPage })
      setOfferStatuses(statusMap)
    } catch (err) {
      console.error('Error loading discoveries:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateStatus = async (productId: number, newStatus: 'pending' | 'ignored' | 'reviewed' | 'added') => {
    setUpdatingStatus(productId)

    try {
      const response = await fetch(`${API_URL}/api/crawl/review/${productId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      if (!response.ok) throw new Error('Failed to update status')

      setUpdateSuccess(prev => new Set(prev).add(productId))

      // Clear success indicator after delay
      setTimeout(() => {
        setUpdateSuccess(prev => {
          const newSet = new Set(prev)
          newSet.delete(productId)
          return newSet
        })
      }, 2000)

      // Reload data to reflect changes
      await loadData()
    } catch (err) {
      console.error('Error updating status:', err)
      alert(`Failed to update status: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUpdatingStatus(null)
    }
  }

  // Bulk update status for selected products
  const handleBulkUpdateStatus = async (newStatus: 'ignored' | 'reviewed' | 'added') => {
    if (selectedProducts.size === 0) return

    setBulkUpdating(true)

    try {
      const updatePromises = Array.from(selectedProducts).map(productId =>
        fetch(`${API_URL}/api/crawl/review/${productId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        })
      )

      const results = await Promise.all(updatePromises)
      const failedCount = results.filter(r => !r.ok).length

      if (failedCount > 0) {
        alert(`${failedCount} of ${selectedProducts.size} updates failed`)
      }

      // Clear selection and reload data
      setSelectedProducts(new Set())
      await loadData()
    } catch (err) {
      console.error('Error in bulk update:', err)
      alert(`Bulk update failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setBulkUpdating(false)
    }
  }

  // Handle push to Shopify
  const handlePushToShopify = async (productId: number, template: 'motorbikes' | 'outboard-motors' | 'default') => {
    setPushingToShopify(productId)
    setPushDropdownOpen(null)

    try {
      const response = await fetch(`${API_URL}/api/shopify/push-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discoveredProductId: productId,
          template
        })
      })

      const result = await response.json()

      if (result.success) {
        // Show success message with link to Shopify
        const viewInShopify = result.shopifyProductUrl
          ? `\n\nView in Shopify: ${result.shopifyProductUrl}`
          : ''
        alert(`Product successfully pushed to Shopify!${result.warnings?.length ? `\n\nWarnings:\n${result.warnings.join('\n')}` : ''}${viewInShopify}`)

        // Reload data to reflect status change
        await loadData()
      } else {
        alert(`Failed to push to Shopify: ${result.message || 'Unknown error'}`)
      }
    } catch (err) {
      console.error('Error pushing to Shopify:', err)
      alert(`Failed to push to Shopify: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setPushingToShopify(null)
    }
  }

  // Handle manual URL push to Shopify
  const handleManualPushToShopify = async (e: React.FormEvent) => {
    e.preventDefault()

    // Basic validation
    if (!manualUrl.trim()) {
      setManualResult({ success: false, message: 'Please enter a URL' })
      return
    }

    try {
      new URL(manualUrl)
    } catch {
      setManualResult({ success: false, message: 'Please enter a valid URL (must start with http:// or https://)' })
      return
    }

    setPushingManual(true)
    setManualResult(null)

    try {
      const response = await fetch(`${API_URL}/api/shopify/push-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: manualUrl.trim(),
          template: manualTemplate,
          price: manualPrice ? parseFloat(manualPrice) : undefined
        })
      })

      const result = await response.json()

      if (result.success) {
        setManualResult({
          success: true,
          message: `Product successfully created in Shopify!${result.warnings?.length ? ` (${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''})` : ''}`,
          url: result.shopifyProductUrl
        })
        // Clear form on success
        setManualUrl('')
        setManualPrice('')
      } else {
        setManualResult({
          success: false,
          message: result.message || 'Failed to create product'
        })
      }
    } catch (err) {
      console.error('Error pushing URL to Shopify:', err)
      setManualResult({
        success: false,
        message: err instanceof Error ? err.message : 'Network error - please try again'
      })
    } finally {
      setPushingManual(false)
    }
  }

  // Offer management handlers
  const handleOpenOfferPanel = useCallback(async (offer: CrawlerOffer) => {
    setSelectedOffer(offer)
    setOfferPanelOpen(true)
    setLinkedProductIds([])
    setPushOfferResult(null)
    setOfferEndDate(offer.end_date ? offer.end_date.split('T')[0] : '')
    setOfferShopifyPage(offerStatuses[offer.id] || null)

    // Fetch available products from Shopify catalog
    setLoadingProducts(true)
    try {
      const [catalogRes, linkedRes] = await Promise.all([
        fetch(`${API_URL}/api/shopify/catalog`),
        fetch(`${API_URL}/api/offers/${offer.id}/products`)
      ])

      if (catalogRes.ok) {
        const catalogData = await catalogRes.json()
        setAvailableProducts(catalogData.products || [])
      }

      if (linkedRes.ok) {
        const linkedData = await linkedRes.json()
        const linkedIds = (linkedData.products || []).map((p: ShopifyCatalogProduct) => p.id)
        setLinkedProductIds(linkedIds)
      }
    } catch (err) {
      console.error('Error loading products:', err)
    } finally {
      setLoadingProducts(false)
    }
  }, [offerStatuses])

  const handleCloseOfferPanel = useCallback(() => {
    setOfferPanelOpen(false)
    setSelectedOffer(null)
    setLinkedProductIds([])
    setAvailableProducts([])
    setPushOfferResult(null)
    setProductSearchTerm('')
  }, [])

  const toggleProductLink = useCallback((productId: number) => {
    setLinkedProductIds(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId)
      }
      return [...prev, productId]
    })
  }, [])

  const handlePushOfferToShopify = useCallback(async () => {
    if (!selectedOffer) return

    setPushingOffer(true)
    setPushOfferResult(null)

    try {
      const response = await fetch(`${API_URL}/api/offers/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: selectedOffer.id,
          productIds: linkedProductIds,
          endDate: offerEndDate || undefined
        })
      })

      const result: PushOfferResult = await response.json()
      setPushOfferResult(result)

      if (result.success) {
        // Reload data to reflect changes
        await loadData()
        // Update the offer status in the panel
        setOfferShopifyPage({
          id: 0,
          offer_id: selectedOffer.id,
          shopify_page_id: result.shopifyPageId || '',
          shopify_page_handle: '',
          hero_image_shopify_url: null,
          status: 'active',
          landing_tile_html: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }
    } catch (err) {
      console.error('Error pushing offer to Shopify:', err)
      setPushOfferResult({
        success: false,
        message: err instanceof Error ? err.message : 'Network error - please try again'
      })
    } finally {
      setPushingOffer(false)
    }
  }, [selectedOffer, linkedProductIds, offerEndDate])

  const getOfferStatus = useCallback((offer: CrawlerOffer): 'pending' | 'active' | 'hidden' | 'expired' => {
    const shopifyPage = offerStatuses[offer.id]
    if (!shopifyPage) return 'pending'
    if (shopifyPage.status === 'hidden' || shopifyPage.status === 'deleted') return 'hidden'
    if (offer.end_date && isPast(parseISO(offer.end_date))) return 'expired'
    return 'active'
  }, [offerStatuses])

  const isOfferExpiringSoon = useCallback((offer: CrawlerOffer): boolean => {
    if (!offer.end_date) return false
    const endDate = parseISO(offer.end_date)
    const daysUntilExpiry = differenceInDays(endDate, new Date())
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 7
  }, [])

  const getOfferStatusBadge = useCallback((status: 'pending' | 'active' | 'hidden' | 'expired') => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'hidden':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
      case 'expired':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }, [])

  // Selection handlers
  const toggleProductSelection = (productId: number) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(productId)) {
        newSet.delete(productId)
      } else {
        newSet.add(productId)
      }
      return newSet
    })
  }

  const toggleSelectAll = () => {
    const pendingProducts = filteredProducts.filter(p => p.status === 'pending')
    if (selectedProducts.size === pendingProducts.length && pendingProducts.length > 0) {
      // Deselect all
      setSelectedProducts(new Set())
    } else {
      // Select all pending products
      setSelectedProducts(new Set(pendingProducts.map(p => p.id)))
    }
  }

  // Check selection state for header checkbox
  const getSelectAllState = () => {
    const pendingProducts = filteredProducts.filter(p => p.status === 'pending')
    if (pendingProducts.length === 0) return 'none'
    if (selectedProducts.size === 0) return 'none'
    if (selectedProducts.size === pendingProducts.length) return 'all'
    return 'some'
  }

  // Extract unique domains from all products
  const availableDomains = useMemo(() => {
    const domains = new Set<string>()
    products.forEach(product => {
      if (product.domain) domains.add(product.domain)
    })
    return Array.from(domains).sort()
  }, [products])

  // Filter products based on search term and domain
  const filteredProducts = useMemo(() => {
    let filtered = products

    // Filter by domain
    if (domainFilter !== 'all') {
      filtered = filtered.filter(product => product.domain === domainFilter)
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(product =>
        product.url?.toLowerCase().includes(term) ||
        product.url_canonical?.toLowerCase().includes(term) ||
        product.page_title?.toLowerCase().includes(term) ||
        product.domain?.toLowerCase().includes(term)
      )
    }

    return filtered
  }, [products, searchTerm, domainFilter])

  // Clear selection when filters change
  useEffect(() => {
    setSelectedProducts(new Set())
  }, [statusFilter, domainFilter, searchTerm])

  // Close push dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pushDropdownOpen !== null) {
        const target = e.target as HTMLElement
        if (!target.closest('.relative')) {
          setPushDropdownOpen(null)
        }
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [pushDropdownOpen])

  // Filter offers based on search term
  const filteredOffers = useMemo(() => {
    if (!searchTerm.trim()) return offers

    const term = searchTerm.toLowerCase()
    return offers.filter(offer =>
      offer.title?.toLowerCase().includes(term) ||
      offer.offer_url?.toLowerCase().includes(term) ||
      offer.summary?.toLowerCase().includes(term)
    )
  }, [offers, searchTerm])

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'reviewed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      case 'ignored':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
      case 'added':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading && products.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading discoveries...</p>
        </div>
      </div>
    )
  }

  if (error && products.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Discoveries</h1>
        <p className="text-muted-foreground">
          Products and offers discovered by the crawler that are not yet in tracking
        </p>
      </div>

      {/* Manual URL Entry Card */}
      <Card>
        <CardHeader className="pb-3">
          <button
            onClick={() => setManualFormOpen(!manualFormOpen)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Link className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-base">Add Product from URL</CardTitle>
                <CardDescription>
                  Manually enter a product URL to scrape and add directly to Shopify
                </CardDescription>
              </div>
            </div>
            {manualFormOpen ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
        </CardHeader>
        {manualFormOpen && (
          <CardContent>
            <form onSubmit={handleManualPushToShopify} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                {/* URL Input */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Product URL</label>
                  <Input
                    type="url"
                    placeholder="https://www.hondamotorbikes.co.nz/cb1000-hornet"
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    disabled={pushingManual}
                    className="w-full"
                  />
                </div>

                {/* Template Selector */}
                <div>
                  <label className="block text-sm font-medium mb-2">Scraper Template</label>
                  <div className="relative">
                    <select
                      value={manualTemplate}
                      onChange={(e) => setManualTemplate(e.target.value as 'motorbikes' | 'outboard-motors' | 'default')}
                      disabled={pushingManual}
                      className="w-full appearance-none pl-4 pr-10 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="motorbikes">Motorbikes</option>
                      <option value="outboard-motors">Outboard Motors</option>
                      <option value="default">Default Product</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {/* Optional Price */}
                <div>
                  <label className="block text-sm font-medium mb-2">Price (optional)</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    disabled={pushingManual}
                    min="0"
                    step="0.01"
                    className="w-full"
                  />
                </div>

                {/* Submit Button */}
                <div className="md:col-span-2 flex items-end">
                  <button
                    type="submit"
                    disabled={pushingManual || !manualUrl.trim()}
                    className="inline-flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {pushingManual ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating Product...
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="h-4 w-4" />
                        Create in Shopify
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Result Message */}
              {manualResult && (
                <div className={`flex items-start gap-3 p-4 rounded-lg ${
                  manualResult.success
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}>
                  {manualResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      manualResult.success
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}>
                      {manualResult.message}
                    </p>
                    {manualResult.url && (
                      <a
                        href={manualResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-sm text-green-600 dark:text-green-400 hover:underline"
                      >
                        View in Shopify Admin
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setManualResult(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </form>
          </CardContent>
        )}
      </Card>

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <Package className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.reviewed}</p>
                <p className="text-xs text-muted-foreground">Reviewed</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <EyeOff className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.ignored}</p>
                <p className="text-xs text-muted-foreground">Ignored</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Tag className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.added}</p>
                <p className="text-xs text-muted-foreground">Added</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Crawler Discoveries</CardTitle>
              <CardDescription>
                {activeTab === 'products'
                  ? `${filteredProducts.length} discovered products`
                  : `${filteredOffers.length} discovered offers`
                }
              </CardDescription>
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Tab Buttons */}
          <div className="flex items-center gap-2 mb-6">
            <button
              onClick={() => setActiveTab('products')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'products'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <Package className="h-4 w-4" />
              Products
              <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === 'products' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'}`}>
                {filteredProducts.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('offers')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'offers'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <Tag className="h-4 w-4" />
              Offers
              <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === 'offers' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'}`}>
                {filteredOffers.length}
              </span>
            </button>
          </div>

          {/* Filters (Products only) */}
          {activeTab === 'products' && (
            <div className="mb-6 space-y-4">
              {/* Status Filter */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Filter by status:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['pending', 'reviewed', 'ignored', 'added', 'all'] as StatusFilter[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                        statusFilter === status
                          ? status === 'pending' ? 'bg-yellow-600 text-white'
                          : status === 'reviewed' ? 'bg-blue-600 text-white'
                          : status === 'ignored' ? 'bg-gray-600 text-white'
                          : status === 'added' ? 'bg-green-600 text-white'
                          : 'bg-purple-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Domain Filter */}
              {availableDomains.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Filter by domain:</span>
                  </div>
                  <div className="relative inline-block">
                    <select
                      value={domainFilter}
                      onChange={(e) => setDomainFilter(e.target.value)}
                      className="appearance-none pl-4 pr-10 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="all">All domains ({products.length})</option>
                      {availableDomains.map((domain) => (
                        <option key={domain} value={domain}>
                          {domain} ({products.filter(p => p.domain === domain).length})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Bulk Actions Bar */}
              {selectedProducts.size > 0 && (
                <div className="flex items-center gap-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {selectedProducts.size} product{selectedProducts.size !== 1 ? 's' : ''} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleBulkUpdateStatus('ignored')}
                      disabled={bulkUpdating}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {bulkUpdating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                      Ignore Selected
                    </button>
                    <button
                      onClick={() => handleBulkUpdateStatus('reviewed')}
                      disabled={bulkUpdating}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {bulkUpdating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Mark Reviewed
                    </button>
                    <button
                      onClick={() => setSelectedProducts(new Set())}
                      disabled={bulkUpdating}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search Box */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={activeTab === 'products'
                  ? "Search by URL, title, or domain..."
                  : "Search by title, URL, or summary..."
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Products Table */}
          {activeTab === 'products' && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="w-10 p-3">
                      {statusFilter === 'pending' && filteredProducts.filter(p => p.status === 'pending').length > 0 && (
                        <button
                          onClick={toggleSelectAll}
                          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                          title={getSelectAllState() === 'all' ? 'Deselect all' : 'Select all pending'}
                        >
                          {getSelectAllState() === 'all' ? (
                            <CheckSquare className="h-5 w-5 text-blue-600" />
                          ) : getSelectAllState() === 'some' ? (
                            <MinusSquare className="h-5 w-5 text-blue-600" />
                          ) : (
                            <Square className="h-5 w-5" />
                          )}
                        </button>
                      )}
                    </th>
                    <th className="text-left p-3 font-medium">Domain</th>
                    <th className="text-left p-3 font-medium">Page Title</th>
                    <th className="text-left p-3 font-medium">URL</th>
                    <th className="text-right p-3 font-medium">Price</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-center p-3 font-medium">Discovered</th>
                    <th className="text-center p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length > 0 ? (
                    filteredProducts.map((product) => (
                      <tr key={product.id} className={`border-b hover:bg-gray-50 dark:hover:bg-gray-800 ${selectedProducts.has(product.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                        <td className="p-3">
                          {product.status === 'pending' && (
                            <button
                              onClick={() => toggleProductSelection(product.id)}
                              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                              {selectedProducts.has(product.id) ? (
                                <CheckSquare className="h-5 w-5 text-blue-600" />
                              ) : (
                                <Square className="h-5 w-5" />
                              )}
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm font-medium">{product.domain}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-sm" title={product.page_title || undefined}>
                            {product.page_title
                              ? product.page_title.length > 50
                                ? `${product.page_title.substring(0, 50)}...`
                                : product.page_title
                              : <span className="text-muted-foreground">No title</span>
                            }
                          </span>
                        </td>
                        <td className="p-3">
                          <a
                            href={product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 text-xs max-w-xs truncate"
                            title={product.url}
                          >
                            <span className="truncate">{product.url_canonical || product.url}</span>
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                        </td>
                        <td className="p-3 text-right">
                          {product.detected_price ? (
                            <span className="font-semibold">${product.detected_price.toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(product.status)}`}>
                            {product.status}
                          </span>
                        </td>
                        <td className="p-3 text-center text-xs text-muted-foreground">
                          {format(new Date(product.created_at), 'PP')}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {product.status === 'pending' && (
                              <>
                                {/* Push to Shopify Dropdown */}
                                <div className="relative">
                                  <button
                                    onClick={() => setPushDropdownOpen(pushDropdownOpen === product.id ? null : product.id)}
                                    disabled={pushingToShopify === product.id}
                                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                      pushingToShopify === product.id
                                        ? 'bg-green-300 text-green-800 cursor-not-allowed'
                                        : 'bg-green-600 text-white hover:bg-green-700'
                                    }`}
                                  >
                                    {pushingToShopify === product.id ? (
                                      <>
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Pushing...
                                      </>
                                    ) : (
                                      <>
                                        <ShoppingBag className="h-3 w-3" />
                                        Push to Shopify
                                        <ChevronDown className="h-3 w-3" />
                                      </>
                                    )}
                                  </button>
                                  {pushDropdownOpen === product.id && (
                                    <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                                      <div className="py-1">
                                        <button
                                          onClick={() => handlePushToShopify(product.id, 'motorbikes')}
                                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                          Motorbikes
                                        </button>
                                        <button
                                          onClick={() => handlePushToShopify(product.id, 'outboard-motors')}
                                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                          Outboard Motors
                                        </button>
                                        <button
                                          onClick={() => handlePushToShopify(product.id, 'default')}
                                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                          Default Product
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Ignore Button */}
                                <button
                                  onClick={() => handleUpdateStatus(product.id, 'ignored')}
                                  disabled={updatingStatus === product.id}
                                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    updateSuccess.has(product.id)
                                      ? 'bg-green-600 text-white cursor-default'
                                      : updatingStatus === product.id
                                      ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                      : 'bg-gray-600 text-white hover:bg-gray-700'
                                  }`}
                                >
                                  {updatingStatus === product.id ? (
                                    <>
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    </>
                                  ) : updateSuccess.has(product.id) ? (
                                    <>
                                      <CheckCircle2 className="h-3 w-3" />
                                    </>
                                  ) : (
                                    <>
                                      <EyeOff className="h-3 w-3" />
                                      Ignore
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                            {product.status === 'ignored' && (
                              <button
                                onClick={() => handleUpdateStatus(product.id, 'pending')}
                                disabled={updatingStatus === product.id}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {updatingStatus === product.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                Restore
                              </button>
                            )}
                            {product.status === 'added' && (
                              <span className="text-xs text-green-600 dark:text-green-400">Added to Shopify</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        {searchTerm || domainFilter !== 'all'
                          ? 'No products match your filters'
                          : statusFilter === 'pending'
                          ? 'No pending products to review'
                          : 'No products found'
                        }
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Offers Grid */}
          {activeTab === 'offers' && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredOffers.length > 0 ? (
                filteredOffers.map((offer) => {
                  const status = getOfferStatus(offer)
                  const expiringSoon = isOfferExpiringSoon(offer)
                  const shopifyPage = offerStatuses[offer.id]

                  return (
                    <Card key={offer.id} className={`overflow-hidden ${expiringSoon && status === 'active' ? 'border-orange-300 dark:border-orange-700' : ''}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base truncate">{offer.title}</CardTitle>
                            {offer.domain?.name && (
                              <CardDescription className="flex items-center gap-1">
                                <Globe className="h-3 w-3" />
                                {offer.domain.name}
                              </CardDescription>
                            )}
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ml-2 flex-shrink-0 ${getOfferStatusBadge(status)}`}>
                            {status}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {offer.summary && (
                          <p className="text-sm text-muted-foreground mb-3">
                            {offer.summary.length > 120
                              ? `${offer.summary.substring(0, 120)}...`
                              : offer.summary
                            }
                          </p>
                        )}

                        {/* End date and expiring warning */}
                        {offer.end_date && (
                          <div className={`flex items-center gap-2 text-xs mb-3 ${expiringSoon ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`}>
                            <Calendar className="h-3 w-3" />
                            <span>
                              {expiringSoon ? (
                                <>
                                  <Clock className="inline h-3 w-3 mr-1" />
                                  Expires {format(parseISO(offer.end_date), 'PP')}
                                  {' '}({differenceInDays(parseISO(offer.end_date), new Date())} days left)
                                </>
                              ) : (
                                <>Ends {format(parseISO(offer.end_date), 'PP')}</>
                              )}
                            </span>
                          </div>
                        )}

                        {/* Shopify page link if active */}
                        {shopifyPage && shopifyPage.status === 'active' && (
                          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 mb-3">
                            <ShoppingBag className="h-3 w-3" />
                            <span>Live on Shopify</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                          <a
                            href={offer.offer_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            Source
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <button
                            onClick={() => handleOpenOfferPanel(offer)}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              status === 'pending'
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                            {status === 'pending' ? (
                              <>
                                <ShoppingCart className="h-3 w-3" />
                                Push to Shopify
                              </>
                            ) : (
                              <>
                                Manage
                                <ArrowRight className="h-3 w-3" />
                              </>
                            )}
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              ) : (
                <div className="col-span-full p-8 text-center text-muted-foreground">
                  {searchTerm ? 'No offers match your search' : 'No offers found'}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Offer Management Slide-out Panel */}
      {offerPanelOpen && selectedOffer && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 transition-opacity"
            onClick={handleCloseOfferPanel}
          />

          {/* Panel */}
          <div className="absolute inset-y-0 right-0 w-full max-w-xl bg-white dark:bg-gray-900 shadow-xl overflow-y-auto">
            {/* Panel Header */}
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{selectedOffer.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedOffer.domain?.name || 'Unknown domain'}
                  </p>
                </div>
                <button
                  onClick={handleCloseOfferPanel}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Panel Content */}
            <div className="p-6 space-y-6">
              {/* Status Section */}
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Shopify Status</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getOfferStatusBadge(getOfferStatus(selectedOffer))}`}>
                    {getOfferStatus(selectedOffer)}
                  </span>
                </div>
                {offerShopifyPage && offerShopifyPage.status === 'active' && (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    This offer is live on your Shopify store
                  </p>
                )}
                {!offerShopifyPage && (
                  <p className="text-sm text-muted-foreground">
                    This offer has not been pushed to Shopify yet
                  </p>
                )}
              </div>

              {/* Offer Details */}
              <div>
                <h3 className="text-sm font-medium mb-2">Offer Summary</h3>
                {selectedOffer.summary ? (
                  <p className="text-sm text-muted-foreground">{selectedOffer.summary}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No summary available</p>
                )}
                <a
                  href={selectedOffer.offer_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mt-2"
                >
                  View source page
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {/* End Date Picker */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Offer End Date
                </label>
                <input
                  type="date"
                  value={offerEndDate}
                  onChange={(e) => setOfferEndDate(e.target.value)}
                  disabled={offerShopifyPage?.status === 'active'}
                  className="w-full px-4 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                {selectedOffer.end_date && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Original end date from source: {format(parseISO(selectedOffer.end_date), 'PP')}
                  </p>
                )}
              </div>

              {/* Product Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">
                    <ShoppingCart className="inline h-4 w-4 mr-1" />
                    Link Products to Offer
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {linkedProductIds.length} selected
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Select products from your Shopify catalog to display on this offer page
                </p>

                {loadingProducts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading products...</span>
                  </div>
                ) : availableProducts.length > 0 ? (
                  <div className="space-y-2">
                    {/* Product Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={productSearchTerm}
                        onChange={(e) => setProductSearchTerm(e.target.value)}
                        placeholder="Search by name or SKU..."
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {productSearchTerm && (
                        <button
                          onClick={() => setProductSearchTerm('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {/* Product count */}
                    <p className="text-xs text-muted-foreground">
                      {productSearchTerm
                        ? `${filteredOfferProducts.length} of ${availableProducts.length} products`
                        : `${availableProducts.length} products`}
                    </p>
                    {/* Product List */}
                    <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                      {filteredOfferProducts.length > 0 ? filteredOfferProducts.map((product) => {
                      const isSelected = linkedProductIds.includes(product.id)
                      return (
                        <button
                          key={product.id}
                          onClick={() => toggleProductLink(product.id)}
                          disabled={offerShopifyPage?.status === 'active'}
                          className={`w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-b-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                            isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                          }`}
                        >
                          {/* Product thumbnail placeholder */}
                          <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                            {product.shopify_image_url ? (
                              <img
                                src={product.shopify_image_url}
                                alt={product.product_title || 'Product'}
                                className="w-full h-full object-cover rounded"
                              />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-gray-400" />
                            )}
                          </div>

                          {/* Product info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {product.product_title || 'Unknown Product'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {product.variant_sku || 'No SKU'}
                              {product.shopify_price && ` • $${product.shopify_price.toFixed(2)}`}
                            </p>
                          </div>

                          {/* Selection indicator */}
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-blue-600 flex-shrink-0" />
                          ) : (
                            <Square className="h-5 w-5 text-gray-400 flex-shrink-0" />
                          )}
                        </button>
                      )
                    }) : (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No products match "{productSearchTerm}"
                      </div>
                    )}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-muted-foreground border border-gray-200 dark:border-gray-700 rounded-lg">
                    No products found in your Shopify catalog.
                    <br />
                    <span className="text-xs">Push some products first before creating offer pages.</span>
                  </div>
                )}
              </div>

              {/* Push Result Feedback */}
              {pushOfferResult && (
                <div className={`flex items-start gap-3 p-4 rounded-lg ${
                  pushOfferResult.success
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}>
                  {pushOfferResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      pushOfferResult.success
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}>
                      {pushOfferResult.success ? 'Offer successfully pushed to Shopify!' : (pushOfferResult.message || 'Failed to push offer')}
                    </p>
                    {pushOfferResult.warnings && pushOfferResult.warnings.length > 0 && (
                      <ul className="mt-2 text-xs text-muted-foreground list-disc list-inside">
                        {pushOfferResult.warnings.map((warning, i) => (
                          <li key={i}>{warning}</li>
                        ))}
                      </ul>
                    )}
                    {pushOfferResult.shopifyPageUrl && (
                      <a
                        href={pushOfferResult.shopifyPageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-sm text-green-600 dark:text-green-400 hover:underline"
                      >
                        View in Shopify Admin
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => setPushOfferResult(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  onClick={handleCloseOfferPanel}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                {offerShopifyPage?.status === 'active' ? (
                  <button
                    disabled
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-100 text-green-800 cursor-not-allowed"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Already Published
                  </button>
                ) : (
                  <button
                    onClick={handlePushOfferToShopify}
                    disabled={pushingOffer || linkedProductIds.length === 0}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {pushingOffer ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Pushing to Shopify...
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="h-4 w-4" />
                        Push to Shopify
                      </>
                    )}
                  </button>
                )}
              </div>

              {linkedProductIds.length === 0 && !offerShopifyPage && (
                <p className="text-xs text-center text-muted-foreground">
                  Select at least one product to push this offer to Shopify
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
