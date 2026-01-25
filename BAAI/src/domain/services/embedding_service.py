from typing import Annotated, List

from fastapi import Depends

from core.config.app_config import AppConfig
from core.logger.logger import Logger
from data.repositories.embedding_model_repository_impl import (
    EmbeddingModelRepositoryImpl,
)
from data.workers.bge_m3_embedding_worker import EmbeddingResult
from domain.repositories.embedding_model_repository import EmbeddingModelRepository


class EmbeddingService:
    def __init__(
        self,
        config: Annotated[AppConfig, Depends()],
        embedding_model_repository: Annotated[
            EmbeddingModelRepository,
            Depends(EmbeddingModelRepositoryImpl),
        ],
        logger: Annotated[Logger, Depends()],
    ) -> None:
        self.config = config
        self.embedding_model_repository = embedding_model_repository
        self.logger = logger

    def create_embeddings(
        self,
        texts: List[str],
        include_dense: bool = True,
        include_sparse: bool = False,
        include_colbert: bool = False,
    ) -> EmbeddingResult:
        self.logger.debug("Starting creation of embeddings")

        result: EmbeddingResult = self.embedding_model_repository.create_embeddings(
            texts,
            include_dense,
            include_sparse,
            include_colbert,
        )

        self.logger.debug("Completed creation of embeddings")

        return result
