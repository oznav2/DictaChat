from typing import Any, List, Optional

from pydantic import BaseModel


class SparseEmbedding(BaseModel):
    indices: List[int]
    values: List[Any]


class TextEmbedding(BaseModel):
    text: str
    dense: Optional[List[Any]] = None
    sparse: Optional[SparseEmbedding] = None
    colbert: Optional[List[List[Any]]] = None


class CreateEmbeddingsResultDto(BaseModel):
    embeddings: List[TextEmbedding]
