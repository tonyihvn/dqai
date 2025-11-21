# Chromadb service for Intelliform

This folder contains a minimal FastAPI service that runs a Chromadb instance (DuckDB+Parquet persistence) and exposes simple endpoints to index and query documents. It's intended to be run in a Conda environment.

Setup (with miniconda):

```bash
# create and activate env
conda env create -f environment.yml
conda activate intelliform-chroma

# run the service
uvicorn app:app --host 127.0.0.1 --port 8001 --reload
```

Endpoints:
- `GET /health` - health check
- `POST /index` - JSON body: `{ "id": "string", "text": "document text", "metadata": { ... } }`
- `POST /query` - JSON body: `{ "query": "text", "top_k": 5 }` returns chroma query results
- `POST /delete` - form/query param `id` or JSON body `{"id":"..."}` deletes item

Notes:
- This is intentionally minimal. For production, configure security, persistent storage location, authentication, and CORS properly.
- The Node server can call this service on localhost:8001 to add documents and perform RAG retrieval before sending context to an LLM.
