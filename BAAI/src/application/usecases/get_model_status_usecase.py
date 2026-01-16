from typing import Annotated

from fastapi import Depends

from core.config.app_config import AppConfig
from data.repositories.embedding_model_repository_impl import (
    EmbeddingModelRepositoryImpl,
)
from domain.repositories.embedding_model_repository import EmbeddingModelRepository


class GetModelStatusUseCase:
    def __init__(
        self,
        config: Annotated[AppConfig, Depends()],
        repository: Annotated[EmbeddingModelRepository, Depends(EmbeddingModelRepositoryImpl)],
    ):
        self.config = config
        self.repository = repository

    async def execute(self) -> dict[str, bool | str]:
        return {
            "is_loaded": self.repository.is_model_loaded(),
            "model_name": self.config.embedding_model_name,
            "device": self.config.device,
        }
