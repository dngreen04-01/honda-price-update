from fastapi.testclient import TestClient
from server import app
from unittest.mock import patch, MagicMock

client = TestClient(app)

@patch("server.StealthyFetcher")
def test_scrape_endpoint(mock_fetcher_cls):
    # Mock the fetcher instance and its fetch method
    mock_fetcher_instance = MagicMock()
    mock_fetcher_cls.return_value = mock_fetcher_instance
    
    mock_response = MagicMock()
    mock_response.text = "<html><body>Test</body></html>"
    mock_response.status_code = 200
    mock_response.headers = {"Content-Type": "text/html"}
    
    mock_fetcher_instance.fetch.return_value = mock_response
    
    response = client.post("/scrape", json={"url": "https://example.com"})
    
    assert response.status_code == 200
    json_response = response.json()
    assert json_response["success"] is True
    assert json_response["data"]["html"] == "<html><body>Test</body></html>"
    assert json_response["data"]["status"] == 200

@patch("server.StealthyFetcher")
def test_scrape_endpoint_error(mock_fetcher_cls):
    # Mock the fetcher to raise an exception
    mock_fetcher_instance = MagicMock()
    mock_fetcher_cls.return_value = mock_fetcher_instance
    mock_fetcher_instance.fetch.side_effect = Exception("Scraping failed")
    
    response = client.post("/scrape", json={"url": "https://example.com"})
    
    assert response.status_code == 500
    assert response.json()["detail"] == "Scraping failed"
