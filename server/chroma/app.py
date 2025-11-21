from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from fastapi.middleware.cors import CORSMiddleware
import chromadb
from chromadb.config import Settings

app = FastAPI(title="Intelliform ChromaDB Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Use a local DuckDB+Parquet persistence by default in ./chroma_db
client = chromadb.Client(Settings(chroma_db_impl="duckdb+parquet", persist_directory="./chroma_db"))
collection = client.get_or_create_collection(name="intelliform")

class IndexItem(BaseModel):
    id: str
    text: str
    metadata: Optional[Dict[str, Any]] = None

class QueryRequest(BaseModel):
    query: str
    top_k: Optional[int] = 5

@app.get("/health")
async def health():
    return {"ok": True}

@app.post("/index")
async def index_item(item: IndexItem):
    try:
        collection.upsert(
            ids=[item.id],
            documents=[item.text],
            metadatas=[item.metadata or {}]
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/query")
async def query(req: QueryRequest):
    try:
        results = collection.query(query_texts=[req.query], n_results=req.top_k)
        # return the results as-is (client-friendly)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/delete")
async def delete(id: str):
    try:
        collection.delete(ids=[id])
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
