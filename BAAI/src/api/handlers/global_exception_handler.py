import traceback

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from api.dtos.error_response_dto import ErrorResponseDto
from core.logger.logger import Logger
from domain.exceptions.invalid_interval_error import InvalidIntervalError


class GlobalExceptionHandler:
    """
    Enterprise-grade exception handler with specific handling for known errors.
    
    InvalidIntervalError is handled specially to provide clear remediation steps
    to the frontend, enabling graceful degradation without UI freezes.
    """
    
    def __init__(self, app: FastAPI, logger: Logger):
        self.app = app
        self.logger = logger
        self.register_handlers()

    def register_handlers(self) -> None:
        @self.app.exception_handler(InvalidIntervalError)
        async def handle_invalid_interval_error(request: Request, exc: InvalidIntervalError) -> JSONResponse:
            """
            Handle InvalidIntervalError with detailed remediation guidance.
            
            This error indicates MODEL_IDLE_TIMEOUT is misconfigured.
            The frontend uses this specific error type to trigger circuit breaker
            and provide user-friendly degraded mode.
            """
            content = ErrorResponseDto(
                status_code=503,  # Service Unavailable - more appropriate than 500
                message="Timer configuration error",
                details={
                    "error_type": "InvalidIntervalError",
                    "error_message": str(exc),
                    "remediation": [
                        "Set MODEL_IDLE_TIMEOUT environment variable to a positive integer (e.g., 60)",
                        "Restart the dicta-retrieval container after fixing the configuration",
                        "If using docker-compose: docker-compose restart dicta-retrieval",
                    ],
                    "config_hint": "MODEL_IDLE_TIMEOUT must be > 0 (seconds until model unloads when idle)",
                    "recoverable": True,  # Frontend can retry after fix
                },
                trace=traceback.format_exception(exc),
            ).model_dump(exclude_none=True)

            self.logger.error(f"InvalidIntervalError occurred - timer config issue: {str(content)}")

            return JSONResponse(
                status_code=503,
                content=content,
            )

        @self.app.exception_handler(ValueError)
        async def handle_value_error(request: Request, exc: ValueError) -> JSONResponse:
            content = ErrorResponseDto(
                status_code=422,
                message="Value error",
                details={"error_type": exc.__class__.__name__, "error_message": str(exc)},
                trace=traceback.format_exception(exc),
            ).model_dump(exclude_none=True)

            self.logger.error(f"ValueError occurred: {str(content)}")

            return JSONResponse(
                status_code=422,
                content=content,
            )

        @self.app.exception_handler(Exception)
        async def handle_exception(request: Request, exc: Exception) -> JSONResponse:
            # Check if this is actually an InvalidIntervalError that wasn't caught
            # (defensive programming - shouldn't happen with fixed Timer, but just in case)
            is_interval_error = (
                "InvalidIntervalError" in exc.__class__.__name__ or
                "Interval must be greater than 0" in str(exc)
            )
            
            if is_interval_error:
                content = ErrorResponseDto(
                    status_code=503,
                    message="Timer configuration error (wrapped)",
                    details={
                        "error_type": exc.__class__.__name__,
                        "error_message": str(exc),
                        "remediation": [
                            "Set MODEL_IDLE_TIMEOUT environment variable to a positive integer",
                            "Restart the dicta-retrieval container",
                        ],
                        "recoverable": True,
                    },
                    trace=traceback.format_exception(exc),
                ).model_dump(exclude_none=True)
                
                self.logger.error(f"InvalidIntervalError (wrapped) occurred: {str(content)}")
                
                return JSONResponse(
                    status_code=503,
                    content=content,
                )
            
            content = ErrorResponseDto(
                status_code=500,
                message="Internal server error",
                details={"error_type": exc.__class__.__name__, "error_message": str(exc)},
                trace=traceback.format_exception(exc),
            ).model_dump(exclude_none=True)

            self.logger.error(f"Exception occurred: {str(content)}")

            return JSONResponse(
                status_code=500,
                content=content,
            )
