from scrapling import DynamicFetcher
import logging

logging.basicConfig(level=logging.DEBUG)

def test_scrape():
    url = "https://example.com"
    print(f"Fetching {url}...")
    try:
        response = DynamicFetcher.fetch(url, stealth=True)
        print(f"Status: {response.status}")
        print(f"Body length: {len(response.body)}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_scrape()
