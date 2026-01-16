from typing import Annotated, List

from fastapi import Depends

from core.config.app_config import AppConfig
from core.logger.logger import Logger
from data.workers.bge_m3_embedding_worker import EmbeddingResult
from domain.services.embedding_service import EmbeddingService


class CreateEmbeddingsUseCase:
    def __init__(
        self,
        config: Annotated[AppConfig, Depends()],
        logger: Annotated[Logger, Depends()],
        embedding_service: Annotated[EmbeddingService, Depends()],
    ) -> None:
        self.config = config
        self.logger = logger
        self.embedding_service = embedding_service

    async def execute(
        self,
        texts: List[str],
        include_dense: bool = True,
        include_sparse: bool = False,
        include_colbert: bool = False,
    ) -> EmbeddingResult:
        self.logger.info(f"Executing embedding creation for {len(texts)} texts")

        result: EmbeddingResult = self.embedding_service.create_embeddings(
            texts,
            include_dense,
            include_sparse,
            include_colbert,
        )

        self.logger.info("Returning embedding creation result")

        return result
