# Python Scraper Service

This service hosts the [Scrapling](https://github.com/D4Vinci/Scrapling) engine and exposes it via a FastAPI REST endpoint for the Node.js backend.

## Setup

1.  **Create a virtual environment:**
    ```bash
    python3 -m venv venv
    ```

2.  **Activate the virtual environment:**
    ```bash
    source venv/bin/activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

## Running the Server

```bash
uvicorn server:app --reload --port 8002
```

## API

### `POST /scrape`

Scrapes a given URL.

**Request Body:**

```json
{
  "url": "https://example.com"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
      "html": "<html>...</html>",
      "status": 200
  }
}
```
