from abc import ABC, abstractmethod
from typing import List

from data.workers.bge_m3_embedding_worker import EmbeddingResult


class EmbeddingModelRepository(ABC):
    @abstractmethod
    def create_embeddings(
        self,
        texts: List[str],
        include_dense: bool = True,
        include_sparse: bool = False,
        include_colbert: bool = False,
    ) -> EmbeddingResult:
        pass

    @abstractmethod
    def is_model_loaded(self) -> bool:
        pass
