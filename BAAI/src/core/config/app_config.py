import os
from typing import Optional
from dotenv import load_dotenv
from core.logger.logger import Logger

class AppConfig:
    _instance: Optional["AppConfig"] = None
    log_level: Optional[str]
    device: Optional[str]
    fastapi_host: Optional[str]
    fastapi_port: Optional[int]
    embedding_model_name: Optional[str]
    reranker_model_name: Optional[str]  # NEW
    model_idle_timeout: Optional[int]
    use_fp16: Optional[bool]
    service_type: Optional[str]  # NEW

    def __new__(cls) -> "AppConfig":
        if cls._instance is None:
            cls._instance = super(AppConfig, cls).__new__(cls)
        return cls._instance

    def _load_env_variables(self) -> None:
        self.log_level = os.getenv("LOG_LEVEL", "INFO")
        self.device = os.getenv("DEVICE", "cpu")
        self.fastapi_host = os.getenv("FASTAPI_HOST", "127.0.0.1")
        self.model_idle_timeout = int(os.getenv("MODEL_IDLE_TIMEOUT", "60"))
        self.use_fp16 = os.getenv("USE_FP16", "false").lower() == "true"
        
        # NEW: Service type
        self.service_type = os.getenv("SERVICE_TYPE", "embedding")
        
        # NEW: Model names for both services
        # Prefer explicit container file paths when provided; fall back to legacy names
        self.embedding_model_name = os.getenv(
            "EMBEDDING_MODEL_NAME",
            os.getenv("EMBEDDING_MODEL_PATH", "BAAI/bge-m3"),
        )
        self.reranker_model_name = os.getenv(
            "RERANKER_MODEL_NAME",
            os.getenv("RERANKER_MODEL_PATH", "BAAI/bge-reranker-v2-m3"),
        )
        
        try:
            self.fastapi_port = int(os.getenv("FASTAPI_PORT", "8000"))
        except ValueError:
            self.fastapi_port = 8000

    def initialize(
        self,
        logger: Logger,
    ) -> None:
        logger.info("Initializing configuration...")
        load_dotenv()
        self._load_env_variables()
        
        # Updated config message
        config_message = (
            f"Configuration loaded:\n"
            f"SERVICE_TYPE: {self.service_type}\n"  # NEW
            f"LOG_LEVEL: {self.log_level}\n"
            f"DEVICE: {self.device}\n"
            f"FASTAPI_HOST: {self.fastapi_host}\n"
            f"FASTAPI_PORT: {self.fastapi_port}\n"
            f"EMBEDDING_MODEL_NAME: {self.embedding_model_name}\n"
            f"RERANKER_MODEL_NAME: {self.reranker_model_name}\n"  # NEW
            f"MODEL_IDLE_TIMEOUT: {self.model_idle_timeout}\n"
            f"USE_FP16: {self.use_fp16}"
        )
        logger.info(config_message)
        logger.info("Configuration initialized successfully.")
