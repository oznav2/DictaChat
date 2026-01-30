from typing import Annotated

from fastapi import Depends

from core.config.app_config import AppConfig
from core.logger.logger import Logger
from data.repositories.embedding_model_repository_impl import (
    EmbeddingModelRepositoryImpl,
)


class LoadModelUseCase:
    def __init__(
        self,
        config: Annotated[AppConfig, Depends()],
        logger: Annotated[Logger, Depends()],
        embedding_repository: Annotated[EmbeddingModelRepositoryImpl, Depends(EmbeddingModelRepositoryImpl)],
    ) -> None:
        self.config = config
        self.logger = logger
        self.embedding_repository = embedding_repository

    async def execute(self) -> str:
        self.logger.info("Loading embedding model")

        self.embedding_repository.start_worker()

        self.logger.info("Embedding model loaded successfully")

        return "Model loaded successfully"
