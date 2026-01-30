"""
Hebrew NER Service Python Client
Production-grade client with retry logic, connection pooling, and comprehensive error handling
"""

from typing import List, Dict, Optional, Any, Union
from dataclasses import dataclass
from enum import Enum
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import logging
from contextlib import contextmanager


# ============================================================
# Types and Enums
# ============================================================

class EntityType(str, Enum):
    """Supported entity types"""
    PER = "PER"  # Person
    ORG = "ORG"  # Organization
    GPE = "GPE"  # Geopolitical entity
    LOC = "LOC"  # Location
    TIMEX = "TIMEX"  # Time expression
    TTL = "TTL"  # Title
    FAC = "FAC"  # Facility
    WOA = "WOA"  # Work of art
    EVE = "EVE"  # Event


class AggregationStrategy(str, Enum):
    """Token aggregation strategies"""
    SIMPLE = "simple"
    FIRST = "first"
    AVERAGE = "average"
    MAX = "max"
    NONE = "none"


# ============================================================
# Data Classes
# ============================================================

@dataclass
class Entity:
    """Represents a named entity"""
    entity_group: str
    word: str
    score: float
    start: int
    end: int

    @property
    def entity_type(self):
        """Get entity type as enum"""
        try:
            return EntityType(self.entity_group)
        except ValueError:
            return self.entity_group

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'entity_group': self.entity_group,
            'word': self.word,
            'score': self.score,
            'start': self.start,
            'end': self.end
        }


@dataclass
class NERResponse:
    """Response from NER service"""
    entities: List[Entity]
    entity_count: int
    entity_types: Dict[str, int]
    processing_time_ms: float

    @property
    def people(self) -> List[Entity]:
        """Get all person entities"""
        return [e for e in self.entities if e.entity_group == "PER"]

    @property
    def organizations(self) -> List[Entity]:
        """Get all organization entities"""
        return [e for e in self.entities if e.entity_group == "ORG"]

    @property
    def locations(self) -> List[Entity]:
        """Get all location entities"""
        return [e for e in self.entities if e.entity_group in ["GPE", "LOC"]]

    @property
    def times(self) -> List[Entity]:
        """Get all time entities"""
        return [e for e in self.entities if e.entity_group == "TIMEX"]

    def get_entities_by_type(self, entity_type: str) -> List[Entity]:
        """Get entities of a specific type"""
        if isinstance(entity_type, EntityType):
            entity_type = entity_type.value
        return [e for e in self.entities if e.entity_group == entity_type]


# ============================================================
# Exceptions
# ============================================================

class NERClientError(Exception):
    """Base exception for NER client errors"""
    pass


class ServiceUnavailableError(NERClientError):
    """Service is not available"""
    pass


class InvalidInputError(NERClientError):
    """Invalid input provided"""
    pass


# ============================================================
# Hebrew NER Client
# ============================================================

class HebrewNERClient:
    """
    Production-grade client for Hebrew NER service
    
    Features:
    - Automatic retry with exponential backoff
    - Connection pooling
    - Timeout handling
    - Comprehensive error handling
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        timeout: int = 30,
        max_retries: int = 3,
        logger: Optional[logging.Logger] = None
    ):
        """Initialize NER client"""
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.logger = logger or logging.getLogger(__name__)

        # Configure session with retry and pooling
        self.session = requests.Session()
        
        retry_strategy = Retry(
            total=max_retries,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST"]
        )
        
        adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=10, pool_maxsize=10)
        
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def extract_entities(
        self,
        text: str,
        confidence_threshold: float = 0.85
    ) -> NERResponse:
        """Extract named entities from text"""
        if not text or not text.strip():
            raise InvalidInputError("Text cannot be empty")

        try:
            response = self.session.post(
                f"{self.base_url}/api/v1/ner",
                json={"text": text, "confidence_threshold": confidence_threshold},
                timeout=self.timeout
            )

            if response.status_code != 200:
                raise ServiceUnavailableError(f"Service error: {response.status_code}")

            data = response.json()
            
            entities = [
                Entity(
                    entity_group=e['entity_group'],
                    word=e['word'],
                    score=e['score'],
                    start=e['start'],
                    end=e['end']
                )
                for e in data['entities']
            ]

            return NERResponse(
                entities=entities,
                entity_count=data['entity_count'],
                entity_types=data['entity_types'],
                processing_time_ms=data['processing_time_ms']
            )

        except requests.exceptions.Timeout:
            raise ServiceUnavailableError(f"Request timeout after {self.timeout}s")
        except requests.exceptions.ConnectionError as e:
            raise ServiceUnavailableError(f"Cannot connect to NER service: {e}")

    def extract_entities_batch(self, texts: List[str]) -> List[NERResponse]:
        """Extract entities from multiple texts"""
        if not texts or len(texts) > 100:
            raise InvalidInputError("Texts must be 1-100 items")

        try:
            response = self.session.post(
                f"{self.base_url}/api/v1/batch-ner",
                json={"texts": texts},
                timeout=self.timeout * 2
            )

            if response.status_code != 200:
                raise ServiceUnavailableError(f"Service error: {response.status_code}")

            data = response.json()
            results = []

            for result_data in data['results']:
                entities = [
                    Entity(
                        entity_group=e['entity_group'],
                        word=e['word'],
                        score=e['score'],
                        start=e['start'],
                        end=e['end']
                    )
                    for e in result_data['entities']
                ]

                results.append(NERResponse(
                    entities=entities,
                    entity_count=result_data['entity_count'],
                    entity_types=result_data['entity_types'],
                    processing_time_ms=result_data['processing_time_ms']
                ))

            return results

        except requests.exceptions.RequestException as e:
            raise ServiceUnavailableError(f"Batch request failed: {e}")

    def close(self):
        """Close session"""
        self.session.close()


@contextmanager
def ner_client(base_url: str = "http://localhost:8000", **kwargs):
    """Context manager for NER client"""
    client = HebrewNERClient(base_url, **kwargs)
    try:
        yield client
    finally:
        client.close()
