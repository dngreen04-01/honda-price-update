from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from scrapling import DynamicFetcher
import uvicorn
import logging
from typing import Optional, Dict, Any, List
from urllib.parse import urlparse
from xml.etree import ElementTree

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Honda Scraper Service")

class ScrapeRequest(BaseModel):
    url: str
    render_js: Optional[bool] = None
    proxy_url: Optional[str] = None
    stealth: Optional[bool] = True

class ScrapeResponse(BaseModel):
    success: bool
    data: dict


class SitemapRequest(BaseModel):
    url: str


def normalize_url_for_comparison(url: str) -> str:
    """Normalize URL for redirect comparison (removes www., trailing slash, etc.)"""
    parsed = urlparse(url.lower())
    host = parsed.netloc.replace('www.', '')
    path = parsed.path.rstrip('/')
    return f"{parsed.scheme}://{host}{path}"


def looks_like_product_identifier(path_part: str) -> bool:
    """
    Check if a path part looks like a product identifier (model number, SKU).
    Product identifiers typically contain numbers or follow patterns like HRX217, EU70is, etc.
    """
    import re
    # Contains digits (e.g., hrx217, eu70is, gx390)
    if re.search(r'\d', path_part):
        return True
    # All uppercase or mixed case with numbers pattern
    if re.match(r'^[A-Z]{2,}[0-9]+', path_part, re.IGNORECASE):
        return True
    return False


def looks_like_category(path_part: str) -> bool:
    """
    Check if a path part looks like a category name.
    Categories typically are descriptive words with hyphens.
    """
    # Common category patterns
    category_keywords = [
        'lawn-mower', 'mower', 'generator', 'pump', 'engine', 'tiller',
        'blower', 'trimmer', 'chainsaw', 'sprayer', 'washer', 'marine',
        'outboard', 'portable', 'industrial', 'domestic', 'commercial',
        'accessories', 'parts', 'products', 'category', 'range', 'series'
    ]
    path_lower = path_part.lower()

    # Check if it contains category keywords
    for keyword in category_keywords:
        if keyword in path_lower:
            return True

    # Categories often have hyphens and no numbers
    if '-' in path_part and not any(c.isdigit() for c in path_part):
        return True

    return False


def detect_redirect(original_url: str, final_url: str) -> Dict[str, Any]:
    """
    Detect if a redirect occurred and classify the type.
    Returns redirect information for the API response.
    """
    original_normalized = normalize_url_for_comparison(original_url)
    final_normalized = normalize_url_for_comparison(final_url)

    # No redirect if URLs match after normalization
    if original_normalized == final_normalized:
        return {
            "redirect_detected": False,
            "final_url": final_url,
            "redirect_type": "none"
        }

    # Parse both URLs
    original_parsed = urlparse(original_url)
    final_parsed = urlparse(final_url)

    original_path_parts = [p for p in original_parsed.path.split('/') if p]
    final_path_parts = [p for p in final_parsed.path.split('/') if p]

    # Determine redirect type
    redirect_type = "unknown"

    # Different domain = domain redirect
    if original_parsed.netloc.replace('www.', '') != final_parsed.netloc.replace('www.', ''):
        redirect_type = "domain"
    # Shorter path usually indicates category redirect
    elif len(final_path_parts) < len(original_path_parts):
        redirect_type = "category"
    # Same length but path changed - analyze content
    elif len(final_path_parts) == len(original_path_parts) and final_path_parts != original_path_parts:
        # Check if original looks like product and final looks like category
        original_last = original_path_parts[-1] if original_path_parts else ""
        final_last = final_path_parts[-1] if final_path_parts else ""

        if looks_like_product_identifier(original_last) and looks_like_category(final_last):
            redirect_type = "category"
        elif looks_like_product_identifier(original_last) and not looks_like_product_identifier(final_last):
            # Original was a product code, final is not - likely category
            redirect_type = "category"
        else:
            redirect_type = "product"
    elif len(final_path_parts) > len(original_path_parts):
        redirect_type = "unknown"

    logger.info(f"Redirect detected: {original_url} -> {final_url} (type: {redirect_type})")

    return {
        "redirect_detected": True,
        "final_url": final_url,
        "redirect_type": redirect_type,
        "original_url": original_url
    }

def _build_fetch_kwargs(
    render_js: Optional[bool],
    proxy_url: Optional[str],
) -> Dict[str, Any]:
    fetch_kwargs: Dict[str, Any] = {}
    if render_js is not None:
        fetch_kwargs["load_dom"] = render_js
    if proxy_url:
        fetch_kwargs["proxy"] = proxy_url
    return fetch_kwargs


def fetch_url_sync(
    url: str,
    render_js: Optional[bool],
    proxy_url: Optional[str],
    stealth: Optional[bool],
):
    fetch_kwargs = _build_fetch_kwargs(render_js, proxy_url)
    return DynamicFetcher.fetch(url, stealth=stealth if stealth is not None else True, **fetch_kwargs)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/scrape")
async def scrape_url(request: ScrapeRequest):
    """
    Scrapes a URL using Scrapling's DynamicFetcher.
    Returns HTML content along with redirect detection information.
    """
    logger.info(f"Received scrape request for URL: {request.url}")

    try:
        # Run synchronous fetcher in a separate thread
        response = await run_in_threadpool(
            fetch_url_sync,
            request.url,
            request.render_js,
            request.proxy_url,
            request.stealth,
        )

        # Get the final URL after any redirects
        final_url = str(response.url) if hasattr(response, 'url') else request.url

        # Detect redirect and classify type
        redirect_info = detect_redirect(request.url, final_url)

        logger.info(f"Successfully fetched URL: {request.url} with status: {response.status}, final_url: {final_url}")

        return {
            "success": True,
            "data": {
                "html": response.body,
                "status": response.status,
                "headers": dict(response.headers),
                "final_url": final_url,
                "redirect_detected": redirect_info["redirect_detected"],
                "redirect_type": redirect_info["redirect_type"]
            }
        }
            
    except Exception as e:
        logger.exception("Error scraping URL %s", request.url)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "detail": {
                    "message": str(e),
                    "url": request.url,
                    "error_type": type(e).__name__,
                },
            },
        )


@app.post("/sitemap")
async def fetch_sitemap(request: SitemapRequest):
    """Fetch and parse a sitemap.xml, returning all URLs."""
    logger.info(f"Received sitemap request for URL: {request.url}")

    try:
        response = await run_in_threadpool(
            fetch_url_sync,
            request.url,
            False,  # render_js not needed for XML
            None,   # proxy_url
            True,   # stealth
        )

        # Parse XML
        root = ElementTree.fromstring(response.body)
        namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}

        urls = []
        for url_elem in root.findall('.//ns:url', namespace):
            loc = url_elem.find('ns:loc', namespace)
            if loc is not None and loc.text:
                urls.append(loc.text)

        logger.info(f"Successfully parsed sitemap {request.url}: found {len(urls)} URLs")
        return {"success": True, "urls": urls, "count": len(urls)}
    except Exception as e:
        logger.exception("Error fetching sitemap %s", request.url)
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )


if __name__ == "__main__":
    # Defaulting to 8002 as requested
    uvicorn.run("server:app", host="0.0.0.0", port=8002, reload=True)
