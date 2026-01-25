import threading
import time
from typing import Annotated, List, Optional

from fastapi import Depends

from core.config.app_config import AppConfig
from core.logger.logger import Logger
from core.timer.timer import TimerFactory
from data.factories.embedding_worker_factory import EmbeddingWorkerFactory
from data.workers.bge_m3_embedding_worker import EmbeddingRequest, EmbeddingResult
from domain.repositories.embedding_model_repository import EmbeddingModelRepository


class EmbeddingModelRepositoryImpl(EmbeddingModelRepository):  # type: ignore
    _instance: Optional["EmbeddingModelRepositoryImpl"] = None
    _lock = threading.Lock()

    def __new__(
        cls,
        config: Annotated[AppConfig, Depends()],
        timer_factory: Annotated[TimerFactory, Depends()],
        logger: Annotated[Logger, Depends()],
        worker_factory: Annotated[EmbeddingWorkerFactory, Depends()],
    ) -> "EmbeddingModelRepositoryImpl":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(EmbeddingModelRepositoryImpl, cls).__new__(cls)
                    cls._instance._initialize(config, timer_factory, logger, worker_factory)

        return cls._instance

    def _initialize(
        self,
        config: AppConfig,
        timer_factory: TimerFactory,
        logger: Logger,
        worker_factory: EmbeddingWorkerFactory,
    ) -> None:
        self.config = config
        self.timer = timer_factory.create()
        self.logger = logger
        self.worker = worker_factory.create()
        self.last_access_time = 0.0

    def _check_idle_timeout(self) -> None:
        self.logger.debug("Checking embedding model idle timeout")

        if self.worker.is_alive() and not self.worker.is_processing():
            with self._lock:
                self.worker.stop()
                self.timer.cancel()
                self.logger.info("Embedding model stopped due to idle timeout")

    def start_worker(self) -> None:
        with self._lock:
            if not self.worker.is_alive():
                self.logger.info("Starting embedding worker")
                self.worker.start()

    def stop_worker(self) -> None:
        with self._lock:
            if self.worker.is_alive():
                self.worker.stop()
                self.timer.cancel()
                self.logger.info("Embedding worker stopped manually")

    def create_embeddings(
        self,
        texts: List[str],
        include_dense: bool = True,
        include_sparse: bool = False,
        include_colbert: bool = False,
    ) -> EmbeddingResult:
        with self._lock:
            if not self.worker.is_alive():
                self.logger.info("Starting embedding worker")
                self.worker.start()

        self.logger.debug("Embedding creation started")

        request = EmbeddingRequest(
            texts=texts,
            include_dense=include_dense,
            include_sparse=include_sparse,
            include_colbert=include_colbert,
        )

        result: EmbeddingResult = self.worker.create_embeddings(request)

        self.timer.start(
            self.config.model_idle_timeout,
            self._check_idle_timeout,
        )

        self.last_access_time = time.time()

        self.logger.debug("Embedding creation completed")

        return result

    def is_model_loaded(self) -> bool:
        return self.worker.is_alive()  # type: ignore
