from fastapi.testclient import TestClient
from server import app
from unittest.mock import patch, MagicMock

client = TestClient(app)

@patch("server.DynamicFetcher")
def test_scrape_endpoint(mock_fetcher_cls):
    mock_response = MagicMock()
    mock_response.body = "<html><body>Test</body></html>"
    mock_response.status = 200
    mock_response.headers = {"Content-Type": "text/html"}

    mock_fetcher_cls.fetch.return_value = mock_response

    response = client.post(
        "/scrape",
        json={
            "url": "https://example.com",
            "render_js": True,
            "proxy_url": "http://proxy.example:8080",
        },
    )

    assert response.status_code == 200
    json_response = response.json()
    assert json_response["success"] is True
    assert json_response["data"]["html"] == "<html><body>Test</body></html>"
    assert json_response["data"]["status"] == 200
    mock_fetcher_cls.fetch.assert_called_with(
        "https://example.com",
        stealth=True,
        load_dom=True,
        proxy="http://proxy.example:8080",
    )

@patch("server.DynamicFetcher")
def test_scrape_endpoint_error(mock_fetcher_cls):
    # Mock the fetcher to raise an exception
    mock_fetcher_cls.fetch.side_effect = Exception("Scraping failed")

    response = client.post("/scrape", json={"url": "https://example.com"})

    assert response.status_code == 500
    json_response = response.json()
    assert json_response["success"] is False
    assert json_response["detail"]["message"] == "Scraping failed"
    assert json_response["detail"]["url"] == "https://example.com"

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
