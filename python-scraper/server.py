from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from scrapling import StealthyFetcher
import uvicorn
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Honda Scraper Service")

class ScrapeRequest(BaseModel):
    url: str

class ScrapeResponse(BaseModel):
    success: bool
    data: dict

@app.post("/scrape")
async def scrape_url(request: ScrapeRequest):
    """
    Scrapes a URL using Scrapling's StealthyFetcher.
    """
    logger.info(f"Received scrape request for URL: {request.url}")
    
    try:
        fetcher = StealthyFetcher(auto_match=True)
        response = fetcher.fetch(request.url)
        
        logger.info(f"Successfully fetched URL: {request.url} with status: {response.status_code}")
        
        return {
            "success": True,
            "data": {
                "html": response.text,
                "status": response.status_code,
                "headers": dict(response.headers)
            }
        }
            
    except Exception as e:
        logger.error(f"Error scraping URL {request.url}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
