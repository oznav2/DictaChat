import uvicorn
from fastapi import FastAPI
from fastapi.responses import ORJSONResponse

from api.handlers.global_exception_handler import GlobalExceptionHandler
from api.middlewares.process_time_middleware import ProcessTimeMiddleware
from api.routers.embedding_router import EmbeddingRouter
from api.routers.reranker_router import RerankRouter  # NEW
from api.routers.health_check_router import HealthCheckRouter
from api.routers.model_router import ModelRouter
from core.config.app_config import AppConfig
from core.logger.logger import Logger


class APIServer:
    def __init__(
        self,
        config: AppConfig,
        logger: Logger,
    ) -> None:
        self.config = config
        self.logger = logger
        self.app = FastAPI(
            title=f"BAAI {config.service_type.capitalize()} API",  # MODIFIED
            default_response_class=ORJSONResponse
        )
        self.exception_handler = GlobalExceptionHandler(self.app, logger)
        self.app.add_middleware(ProcessTimeMiddleware, logger=logger)
        
        # Common routes
        self.app.include_router(HealthCheckRouter().router, tags=["HealthCheck"])
        self.app.include_router(ModelRouter().router, tags=["Model"])
        
        # NEW: Service-specific routes
        if self.config.service_type == "embedding":
            self.logger.info("Loading Embedding routes...")
            self.app.include_router(EmbeddingRouter().router, tags=["Embeddings"])
        elif self.config.service_type == "reranker":
            self.logger.info("Loading Reranker routes...")
            self.app.include_router(RerankRouter().router, tags=["Reranker"])
        else:
            raise ValueError(f"Unknown service_type: {self.config.service_type}")

    def start(self) -> None:
        self.logger.info(f"Starting FastAPI {self.config.service_type} server...")
        uvicorn.run(
            self.app,
            host=self.config.fastapi_host,
            port=self.config.fastapi_port,
            server_header=False,
            log_config=None,
        )