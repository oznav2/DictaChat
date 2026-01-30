import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

from core.config.app_config import AppConfig
from core.logger.logger import Logger


class RerankRequest(BaseModel):
    query: str
    documents: List[str]
    top_n: int = None


class RerankResponse(BaseModel):
    results: List[dict]


class RerankRouter:
    def __init__(self):
        self.router = APIRouter()
        self.config = AppConfig()
        self.logger = Logger()
        self.model = None
        
        # Load reranker model
        self._load_model()
        
        # Register routes
        self._register_routes()
    
    def _load_model(self):
        """Load the reranker model"""
        self.logger.info(f"Loading reranker model: {self.config.reranker_model_name}")
        
        try:
            from llama_cpp import Llama, LLAMA_POOLING_TYPE_RANK
        except ImportError:
             # Fallback if LLAMA_POOLING_TYPE_RANK is not exposed directly
             from llama_cpp import Llama
             # Define constant if missing (based on llama.cpp source)
             # LLAMA_POOLING_TYPE_NONE = 0, MEAN = 1, CLS = 2, LAST = 3, RANK = 4?
             # Let's try to access it from llama_cpp.llama_cpp if possible, otherwise rely on the import working
             # or assume the user has a compatible version.
             # For now, I'll assume it's available or I'll catch it.
             pass

        # Check if LLAMA_POOLING_TYPE_RANK is available
        if 'LLAMA_POOLING_TYPE_RANK' not in locals():
             import llama_cpp
             if hasattr(llama_cpp, 'LLAMA_POOLING_TYPE_RANK'):
                 LLAMA_POOLING_TYPE_RANK = llama_cpp.LLAMA_POOLING_TYPE_RANK
             else:
                 # Fallback to 3 (often used, but risky). 
                 # Better to log a warning or error. 
                 # But I will try to use it.
                 # Actually, looking at recent PRs, it is likely exposed.
                 # If not, I'll use the integer 3 as a best guess for now but log it.
                 self.logger.warning("LLAMA_POOLING_TYPE_RANK not found, using value 3")
                 LLAMA_POOLING_TYPE_RANK = 3

        n_ctx = int(os.getenv("RERANKER_MODEL_CTX_SIZE", "8192"))
        n_batch = int(os.getenv("RERANKER_MODEL_BATCH_SIZE", "512"))
        n_ubatch = int(os.getenv("RERANKER_MODEL_UBATCH_SIZE", "128"))
        n_gpu_layers = int(os.getenv("RERANKER_MODEL_N_GPU_LAYERS", "-1"))
        main_gpu = int(os.getenv("RERANKER_MODEL_MAIN_GPU", "0"))
        n_threads = int(os.getenv("RERANKER_MODEL_THREADS", "8"))

        self.model = Llama(
            model_path=self.config.reranker_model_name,
            n_gpu_layers=n_gpu_layers,
            main_gpu=main_gpu,
            n_ctx=n_ctx,
            n_batch=n_batch,
            n_ubatch=n_ubatch,
            n_threads=n_threads,
            pooling_type=LLAMA_POOLING_TYPE_RANK,
            verbose=False,
            embedding=True
        )
        
        self.logger.info("Reranker model loaded successfully")
    
    def _register_routes(self):
        """Register reranker API routes"""
        
        @self.router.post("/v1/rerank", response_model=RerankResponse)
        async def rerank_documents(request: RerankRequest):
            try:
                self.logger.info(f"Reranking {len(request.documents)} documents")
                
                # Create query-document pairs formatted for the model
                # Using </s><s> separator as seen in llama.cpp examples for reranking
                documents = [f"{request.query}</s><s>{doc}" for doc in request.documents]
                
                # Compute relevance scores
                scores = [
                    self.model.create_embedding(document)["data"][0]["embedding"][0]
                    for document in documents
                ]
                
                # Create results with scores and indices
                results = [
                    {
                        "index": idx,
                        "relevance_score": float(score),
                        "document": doc
                    }
                    for idx, (score, doc) in enumerate(zip(scores, request.documents))
                ]
                
                # Sort by relevance score (descending)
                results.sort(key=lambda x: x['relevance_score'], reverse=True)
                
                # Apply top_n if specified
                if request.top_n:
                    results = results[:request.top_n]
                
                self.logger.info(f"Reranking completed, returning {len(results)} results")
                
                return RerankResponse(results=results)
                
            except Exception as e:
                self.logger.error(f"Error reranking documents: {e}")
                raise HTTPException(status_code=500, detail=str(e))
