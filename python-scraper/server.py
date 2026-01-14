from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from scrapling import DynamicFetcher
import uvicorn
import logging
from typing import Optional, Dict, Any, List

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

        logger.info(f"Successfully fetched URL: {request.url} with status: {response.status}")

        return {
            "success": True,
            "data": {
                "html": response.body,
                "status": response.status,
                "headers": dict(response.headers)
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

if __name__ == "__main__":
    # Defaulting to 8002 as requested
    uvicorn.run("server:app", host="0.0.0.0", port=8002, reload=True)
