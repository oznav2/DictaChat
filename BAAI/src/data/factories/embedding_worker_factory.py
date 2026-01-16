from typing import Annotated

from fastapi import Depends

from core.config.app_config import AppConfig
from core.logger.logger import Logger
from data.workers.bge_m3_embedding_worker import (
    BgeM3EmbeddingConfig,
    BgeM3EmbeddingWorker,
)
from domain.exceptions.unsupported_model_configuration_error import (
    UnsupportedModelConfigurationError,
)


class EmbeddingWorkerFactory:
    def __init__(
        self,
        config: Annotated[AppConfig, Depends()],
        logger: Annotated[Logger, Depends()],
    ):
        self.config = config
        self.logger = logger

    def create(self) -> BgeM3EmbeddingWorker:
        return BgeM3EmbeddingWorker(
            BgeM3EmbeddingConfig(
                device=self.config.device,
                model_name=self.config.embedding_model_name,
                log_level=self.config.log_level,
                use_fp16=self.config.use_fp16,
            ),
            logger=self.logger,
        )
