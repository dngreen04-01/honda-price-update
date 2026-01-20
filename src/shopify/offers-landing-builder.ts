import { Offer } from '../types/index.js';

/**
 * Truncate text to a specified length, adding ellipsis if needed
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3).trim() + '...';
}

/**
 * Format a date for display (e.g., "31 Mar 2026")
 */
function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;

  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

/**
 * Check if an offer is expiring soon (within specified days)
 */
function isExpiringSoon(endDateStr: string | null, withinDays: number = 7): boolean {
  if (!endDateStr) return false;

  try {
    const endDate = new Date(endDateStr);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= withinDays;
  } catch {
    return false;
  }
}

/**
 * Calculate days remaining until end date
 */
function getDaysRemaining(endDateStr: string | null): number | null {
  if (!endDateStr) return null;

  try {
    const endDate = new Date(endDateStr);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : null;
  } catch {
    return null;
  }
}

/**
 * Build HTML for a single offer tile on the landing page
 *
 * @param offer - The offer data
 * @param pageHandle - The Shopify page handle for the offer page
 * @param heroImageUrl - Optional hero image URL (from Shopify Files)
 * @returns HTML string for the tile
 */
export function buildOfferTileHtml(
  offer: Offer,
  pageHandle: string,
  heroImageUrl?: string | null
): string {
  const summary = offer.summary ? truncateText(offer.summary, 100) : '';
  const formattedEndDate = formatDate(offer.end_date);
  const expiringSoon = isExpiringSoon(offer.end_date);
  const daysRemaining = getDaysRemaining(offer.end_date);

  // Build the urgency badge if expiring soon
  let urgencyBadge = '';
  if (expiringSoon && daysRemaining !== null) {
    const badgeText = daysRemaining === 1 ? 'Ends tomorrow!' : `${daysRemaining} days left`;
    urgencyBadge = `
      <span class="offer-tile__urgency-badge">
        ${badgeText}
      </span>`;
  }

  // Build the image section
  const imageHtml = heroImageUrl
    ? `<img src="${heroImageUrl}" alt="${offer.title}" class="offer-tile__image" loading="lazy" />`
    : `<div class="offer-tile__image offer-tile__image--placeholder">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z"/>
        </svg>
      </div>`;

  return `
<div class="offer-tile">
  <a href="/pages/${pageHandle}" class="offer-tile__link">
    <div class="offer-tile__image-container">
      ${imageHtml}
      ${urgencyBadge}
    </div>
    <div class="offer-tile__content">
      <h3 class="offer-tile__title">${offer.title}</h3>
      ${summary ? `<p class="offer-tile__summary">${summary}</p>` : ''}
      ${formattedEndDate ? `<span class="offer-tile__end-date">Ends ${formattedEndDate}</span>` : ''}
    </div>
  </a>
</div>`.trim();
}

/**
 * Build the full offers landing page HTML
 *
 * @param tiles - Array of tile HTML strings
 * @param introText - Optional intro text to display at the top
 * @returns Complete landing page HTML
 */
export function buildOffersLandingPageHtml(
  tiles: string[],
  introText?: string
): string {
  // CSS styles for the landing page
  const styles = `
<style>
  .offers-landing {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  .offers-landing__header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .offers-landing__title {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 1rem;
    color: #1a1a1a;
  }

  .offers-landing__intro {
    font-size: 1.1rem;
    color: #666;
    max-width: 600px;
    margin: 0 auto;
  }

  .offers-landing__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  .offers-landing__empty {
    text-align: center;
    padding: 4rem 2rem;
    background: #f9f9f9;
    border-radius: 8px;
  }

  .offers-landing__empty-text {
    font-size: 1.1rem;
    color: #666;
  }

  .offer-tile {
    background: #fff;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .offer-tile:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .offer-tile__link {
    text-decoration: none;
    color: inherit;
    display: block;
  }

  .offer-tile__image-container {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: #f0f0f0;
  }

  .offer-tile__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .offer-tile__image--placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ccc;
  }

  .offer-tile__urgency-badge {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    background: #e53935;
    color: #fff;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .offer-tile__content {
    padding: 1.25rem;
  }

  .offer-tile__title {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
    line-height: 1.3;
  }

  .offer-tile__summary {
    font-size: 0.95rem;
    color: #666;
    margin: 0 0 0.75rem 0;
    line-height: 1.5;
  }

  .offer-tile__end-date {
    display: inline-block;
    font-size: 0.85rem;
    color: #888;
    font-weight: 500;
  }

  @media (max-width: 640px) {
    .offers-landing__grid {
      grid-template-columns: 1fr;
    }

    .offers-landing__title {
      font-size: 1.5rem;
    }
  }
</style>`;

  // Build the intro section
  const introSection = introText
    ? `<p class="offers-landing__intro">${introText}</p>`
    : '';

  // Build the grid content or empty state
  let gridContent: string;
  if (tiles.length === 0) {
    gridContent = `
      <div class="offers-landing__empty">
        <p class="offers-landing__empty-text">
          No current offers available. Check back soon for new promotions!
        </p>
      </div>`;
  } else {
    gridContent = `
      <div class="offers-landing__grid">
        ${tiles.join('\n        ')}
      </div>`;
  }

  return `
${styles}
<div class="offers-landing">
  <div class="offers-landing__header">
    <h1 class="offers-landing__title">Current Offers</h1>
    ${introSection}
  </div>
  ${gridContent}
</div>`.trim();
}

/**
 * Default intro text for the offers landing page
 */
export const DEFAULT_INTRO_TEXT =
  'Explore our latest promotions and special offers on Honda products.';
