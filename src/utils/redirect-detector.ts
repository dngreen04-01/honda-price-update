import { RedirectType } from '../scraper/scrapling-client.js';

export interface RedirectAnalysis {
  isRedirect: boolean;
  redirectType: RedirectType;
  originalUrl: string;
  finalUrl: string;
  likelyDiscontinued: boolean;
  suggestedAction: 'update_url' | 'mark_discontinued' | 'none';
  message: string;
}

/**
 * Analyzes redirect information and provides user-friendly messaging.
 * This works with the redirect data returned from the Python scraper.
 */
export function analyzeRedirect(
  originalUrl: string,
  finalUrl: string | undefined,
  redirectDetected: boolean | undefined,
  redirectType: RedirectType | undefined
): RedirectAnalysis {
  // No redirect detected
  if (!redirectDetected || !finalUrl || redirectType === 'none') {
    return {
      isRedirect: false,
      redirectType: 'none',
      originalUrl,
      finalUrl: finalUrl || originalUrl,
      likelyDiscontinued: false,
      suggestedAction: 'none',
      message: '',
    };
  }

  // Analyze based on redirect type
  const analysis: RedirectAnalysis = {
    isRedirect: true,
    redirectType: redirectType || 'unknown',
    originalUrl,
    finalUrl,
    likelyDiscontinued: false,
    suggestedAction: 'none',
    message: '',
  };

  switch (redirectType) {
    case 'category':
      // Category redirects strongly indicate discontinued product
      analysis.likelyDiscontinued = true;
      analysis.suggestedAction = 'mark_discontinued';
      analysis.message = `This product URL has been redirected to a category page (${finalUrl}), suggesting the product is no longer available from the supplier.`;
      break;

    case 'product':
      // Product redirects might indicate URL change or replacement
      analysis.likelyDiscontinued = false;
      analysis.suggestedAction = 'update_url';
      analysis.message = `This product URL has been redirected to a different product page (${finalUrl}). The URL may have changed or the product may have been replaced.`;
      break;

    case 'domain':
      // Domain redirects need manual review
      analysis.likelyDiscontinued = false;
      analysis.suggestedAction = 'update_url';
      analysis.message = `This product URL has been redirected to a different domain (${finalUrl}). Please verify if this is the correct product.`;
      break;

    case 'unknown':
    default:
      // Unknown redirect type - needs manual review
      analysis.likelyDiscontinued = false;
      analysis.suggestedAction = 'update_url';
      analysis.message = `This product URL has been redirected to ${finalUrl}. Please review and update if needed.`;
      break;
  }

  return analysis;
}

/**
 * Formats redirect info for API response.
 * Returns undefined if no redirect was detected.
 */
export function formatRedirectInfo(analysis: RedirectAnalysis): {
  detected: boolean;
  originalUrl: string;
  finalUrl: string;
  redirectType: RedirectType;
  likelyDiscontinued: boolean;
  suggestedAction: 'update_url' | 'mark_discontinued' | 'none';
  message: string;
} | undefined {
  if (!analysis.isRedirect) {
    return undefined;
  }

  return {
    detected: true,
    originalUrl: analysis.originalUrl,
    finalUrl: analysis.finalUrl,
    redirectType: analysis.redirectType,
    likelyDiscontinued: analysis.likelyDiscontinued,
    suggestedAction: analysis.suggestedAction,
    message: analysis.message,
  };
}
