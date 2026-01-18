"""
Hebrew NER Service - FastAPI Application
Provides Named Entity Recognition for Hebrew text using DictaBERT-NER
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import pipeline
from tokenizers.decoders import WordPiece
from typing import List, Optional, Dict, Any
import logging
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Hebrew NER Service",
    description="Named Entity Recognition for Hebrew text using DictaBERT-NER",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variable for the NER pipeline
ner_pipeline = None


# Pydantic models
class NERRequest(BaseModel):
    text: str = Field(..., description="Hebrew text to analyze", min_length=1)
    aggregation_strategy: str = Field(
        default="simple",
        description="Aggregation strategy for entities: 'simple', 'first', 'average', 'max', or 'none'"
    )
    confidence_threshold: Optional[float] = Field(
        default=0.0,
        description="Minimum confidence score for entities (0.0-1.0)",
        ge=0.0,
        le=1.0
    )


class Entity(BaseModel):
    entity_group: str = Field(..., description="Entity type (PER, GPE, ORG, LOC, TIMEX, TTL, etc.)")
    score: float = Field(..., description="Confidence score")
    word: str = Field(..., description="Recognized entity text")
    start: int = Field(..., description="Start position in text")
    end: int = Field(..., description="End position in text")


class NERResponse(BaseModel):
    entities: List[Entity]
    text: str
    processing_time_ms: float
    entity_count: int
    entity_types: Dict[str, int]


class BatchNERRequest(BaseModel):
    texts: List[str] = Field(..., description="List of Hebrew texts to analyze")
    aggregation_strategy: str = Field(default="simple")
    confidence_threshold: Optional[float] = Field(default=0.0, ge=0.0, le=1.0)


class HealthResponse(BaseModel):
    status: str
    model: str
    version: str


# Initialize the NER model on startup
@app.on_event("startup")
async def load_model():
    """Load the Hebrew NER model on application startup"""
    global ner_pipeline
    try:
        logger.info("Loading DictaBERT-NER model...")
        ner_pipeline = pipeline(
            'ner',
            model='dicta-il/dictabert-ner',
            aggregation_strategy='simple'
        )
        
        # Set up the decoder
        ner_pipeline.tokenizer.backend_tokenizer.decoder = WordPiece()
        
        logger.info("Model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load model: {str(e)}")
        raise


def filter_entities_by_confidence(entities: List[Dict], threshold: float) -> List[Dict]:
    """Filter entities by confidence threshold"""
    if threshold <= 0.0:
        return entities
    return [e for e in entities if e.get('score', 0.0) >= threshold]


def count_entity_types(entities: List[Dict]) -> Dict[str, int]:
    """Count occurrences of each entity type"""
    counts = {}
    for entity in entities:
        entity_type = entity.get('entity_group', 'UNKNOWN')
        counts[entity_type] = counts.get(entity_type, 0) + 1
    return counts


@app.get("/", tags=["root"])
async def root():
    """Root endpoint"""
    return {
        "message": "Hebrew NER Service",
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "ner": "/api/v1/ner",
            "batch_ner": "/api/v1/batch-ner"
        }
    }


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy" if ner_pipeline is not None else "unhealthy",
        model="dicta-il/dictabert-ner",
        version="1.0.0"
    )


@app.post("/api/v1/ner", response_model=NERResponse, tags=["ner"])
async def extract_entities(request: NERRequest):
    """
    Extract named entities from Hebrew text
    
    Supported entity types:
    - PER: Person names
    - GPE: Geopolitical entities (countries, cities, states)
    - ORG: Organizations
    - LOC: Locations
    - TIMEX: Time expressions
    - TTL: Titles
    - And more...
    """
    if ner_pipeline is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        start_time = time.time()
        
        # Run NER
        entities = ner_pipeline(
            request.text,
            aggregation_strategy=request.aggregation_strategy
        )
        
        # Filter by confidence threshold
        filtered_entities = filter_entities_by_confidence(
            entities,
            request.confidence_threshold
        )
        
        # Calculate processing time
        processing_time = (time.time() - start_time) * 1000
        
        # Count entity types
        entity_type_counts = count_entity_types(filtered_entities)
        
        logger.info(
            f"Processed text of length {len(request.text)}, "
            f"found {len(filtered_entities)} entities in {processing_time:.2f}ms"
        )
        
        return NERResponse(
            entities=[Entity(**e) for e in filtered_entities],
            text=request.text,
            processing_time_ms=round(processing_time, 2),
            entity_count=len(filtered_entities),
            entity_types=entity_type_counts
        )
        
    except Exception as e:
        logger.error(f"Error processing NER request: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/batch-ner", tags=["ner"])
async def extract_entities_batch(request: BatchNERRequest):
    """
    Extract named entities from multiple Hebrew texts in batch
    """
    if ner_pipeline is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if len(request.texts) > 100:
        raise HTTPException(
            status_code=400,
            detail="Maximum 100 texts per batch request"
        )
    
    try:
        start_time = time.time()
        results = []
        
        for text in request.texts:
            entities = ner_pipeline(
                text,
                aggregation_strategy=request.aggregation_strategy
            )
            
            # Filter by confidence threshold
            filtered_entities = filter_entities_by_confidence(
                entities,
                request.confidence_threshold
            )
            
            results.append({
                "text": text,
                "entities": [Entity(**e).dict() for e in filtered_entities],
                "entity_count": len(filtered_entities),
                "entity_types": count_entity_types(filtered_entities)
            })
        
        processing_time = (time.time() - start_time) * 1000
        
        logger.info(
            f"Processed batch of {len(request.texts)} texts "
            f"in {processing_time:.2f}ms"
        )
        
        return {
            "results": results,
            "total_texts": len(request.texts),
            "processing_time_ms": round(processing_time, 2)
        }
        
    except Exception as e:
        logger.error(f"Error processing batch NER request: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/entity-types", tags=["info"])
async def get_entity_types():
    """
    Get information about supported entity types
    """
    return {
        "entity_types": {
            "PER": "Person names (e.g., דוד בן-גוריון)",
            "GPE": "Geopolitical entities - countries, cities, states (e.g., ישראל, ירושלים)",
            "ORG": "Organizations (e.g., האו״ם, משרד החינוך)",
            "LOC": "Locations (e.g., הכנסת, בית המשפט)",
            "TIMEX": "Time expressions (e.g., 16 באוקטובר 1886, אתמול)",
            "TTL": "Titles and positions (e.g., ראש הממשלה, נשיא המדינה)",
            "FAC": "Facilities (e.g., נמל התעופה)",
            "WOA": "Works of art (e.g., names of books, songs)",
            "EVE": "Events (e.g., מלחמת העצמאות)"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)