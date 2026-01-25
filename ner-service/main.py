"""
DictaBERT-NER Service - Hebrew Named Entity Recognition

Enterprise-grade NER extraction with:
- Batch processing support
- Graceful error handling
- Structured response format
- Health monitoring
"""

import os
import time
import logging
import traceback
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import torch
from transformers import pipeline
from tokenizers.decoders import WordPiece

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
MODEL_NAME = os.getenv("MODEL_NAME", "dicta-il/dictabert-ner")
DEVICE = os.getenv("DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
MAX_BATCH_SIZE = int(os.getenv("MAX_BATCH_SIZE", "32"))
MAX_SEQUENCE_LENGTH = int(os.getenv("MAX_SEQUENCE_LENGTH", "512"))
MIN_CONFIDENCE = float(os.getenv("NER_MIN_CONFIDENCE", "0.85"))

# Global model instance
ner_pipeline = None
model_loaded = False
model_load_error = None


class Entity(BaseModel):
    """Single extracted entity."""
    entity_group: str = Field(..., description="Entity type: PER, GPE, TIMEX, TTL")
    word: str = Field(..., description="Extracted entity text")
    score: float = Field(..., ge=0, le=1, description="Confidence score")
    start: int = Field(..., ge=0, description="Start character offset")
    end: int = Field(..., ge=0, description="End character offset")


class NERRequest(BaseModel):
    """Request for NER extraction."""
    texts: List[str] = Field(..., min_length=1, max_length=MAX_BATCH_SIZE)
    min_confidence: Optional[float] = Field(default=MIN_CONFIDENCE, ge=0, le=1)


class NERResponse(BaseModel):
    """Response with extracted entities."""
    model_config = {"protected_namespaces": ()}

    results: List[List[Entity]]
    processing_time_ms: float
    model_version: str = MODEL_NAME


class HealthResponse(BaseModel):
    """Health check response."""
    model_config = {"protected_namespaces": ()}

    status: str
    model_loaded: bool
    device: str
    model_name: str
    cuda_available: bool
    error: Optional[str] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup."""
    global ner_pipeline, model_loaded, model_load_error

    logger.info(f"Starting NER service...")
    logger.info(f"Model: {MODEL_NAME}")
    logger.info(f"Requested device: {DEVICE}")
    logger.info(f"CUDA available: {torch.cuda.is_available()}")

    if torch.cuda.is_available():
        logger.info(f"CUDA device: {torch.cuda.get_device_name(0)}")
        logger.info(f"CUDA memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

    start_time = time.time()

    try:
        # Determine device - use CPU if CUDA not available
        if DEVICE == "cuda" and torch.cuda.is_available():
            device_id = 0
            logger.info("Using CUDA device 0")
        else:
            device_id = -1
            logger.info("Using CPU")

        # Load pipeline exactly as per official HuggingFace example
        # https://huggingface.co/dicta-il/dictabert-ner
        logger.info(f"Loading pipeline from {MODEL_NAME}...")

        ner_pipeline = pipeline(
            'ner',
            model=MODEL_NAME,
            aggregation_strategy='simple',
            device=device_id
        )

        # CRITICAL: DictaBERT requires WordPiece decoder
        # Without this, you get "'NoneType' object has no attribute 'decode'"
        logger.info("Setting WordPiece decoder...")
        ner_pipeline.tokenizer.backend_tokenizer.decoder = WordPiece()

        # Test the pipeline with a simple extraction
        logger.info("Testing pipeline with sample text...")
        test_result = ner_pipeline("בדיקה")
        logger.info(f"Test result: {test_result}")

        model_loaded = True
        load_time = time.time() - start_time
        logger.info(f"NER model loaded successfully in {load_time:.2f}s")

    except Exception as e:
        model_load_error = str(e)
        logger.error(f"Failed to load NER model: {e}")
        logger.error(traceback.format_exc())

    yield

    # Cleanup on shutdown
    logger.info("Shutting down NER service")


app = FastAPI(
    title="DictaBERT-NER Service",
    description="Hebrew Named Entity Recognition",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy" if model_loaded else "unhealthy",
        model_loaded=model_loaded,
        device=DEVICE,
        model_name=MODEL_NAME,
        cuda_available=torch.cuda.is_available(),
        error=model_load_error
    )


@app.post("/extract", response_model=NERResponse)
async def extract_entities(request: NERRequest):
    """
    Extract named entities from texts.

    Supports batch processing for efficiency.
    Returns entities grouped by input text.
    """
    if not model_loaded:
        raise HTTPException(
            status_code=503,
            detail=f"Model not loaded: {model_load_error}"
        )

    if ner_pipeline is None:
        raise HTTPException(
            status_code=503,
            detail="Pipeline not initialized"
        )

    start_time = time.time()

    try:
        all_results = []

        for text in request.texts:
            if not text or not text.strip():
                all_results.append([])
                continue

            # Truncate to max sequence length (approximate char limit)
            truncated = text[:MAX_SEQUENCE_LENGTH * 4]

            # Extract entities
            try:
                raw_entities = ner_pipeline(truncated)
            except Exception as inner_e:
                logger.error(f"Pipeline error for text '{truncated[:50]}...': {inner_e}")
                logger.error(traceback.format_exc())
                raise

            # Filter by confidence and convert to response format
            entities = []
            for e in raw_entities:
                if e["score"] >= request.min_confidence:
                    entities.append(Entity(
                        entity_group=e["entity_group"],
                        word=e["word"],
                        score=round(e["score"], 4),
                        start=e["start"],
                        end=e["end"]
                    ))

            all_results.append(entities)

        processing_time_ms = (time.time() - start_time) * 1000

        return NERResponse(
            results=all_results,
            processing_time_ms=round(processing_time_ms, 2)
        )

    except Exception as e:
        logger.error(f"NER extraction failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


class SingleNERRequest(BaseModel):
    """Request for single text NER extraction."""
    text: str = Field(..., min_length=1)
    min_confidence: Optional[float] = Field(default=MIN_CONFIDENCE, ge=0, le=1)


@app.post("/extract/single")
async def extract_single(request: SingleNERRequest):
    """Convenience endpoint for single text extraction."""
    batch_request = NERRequest(texts=[request.text], min_confidence=request.min_confidence)
    response = await extract_entities(batch_request)
    return {
        "entities": response.results[0],
        "processing_time_ms": response.processing_time_ms
    }


@app.get("/")
async def root():
    """Root endpoint with service info."""
    return {
        "service": "DictaBERT-NER",
        "model": MODEL_NAME,
        "status": "healthy" if model_loaded else "loading",
        "endpoints": ["/health", "/extract", "/extract/single"]
    }
