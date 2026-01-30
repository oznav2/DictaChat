import threading
import logging
from typing import Callable, Optional, Union

from domain.exceptions.invalid_interval_error import InvalidIntervalError

# Enterprise-grade Timer with robust error handling
# Prevents InvalidIntervalError from crashing the service

_logger = logging.getLogger(__name__)


class Timer:
    """
    Enterprise-grade timer with graceful degradation.
    
    If interval is invalid (<=0 or None), the timer will:
    1. Log a warning
    2. Skip timer scheduling (no-op)
    3. NOT raise an exception that crashes the service
    
    This ensures the embedding service remains operational even with
    misconfigured MODEL_IDLE_TIMEOUT environment variable.
    """
    
    # Default fallback interval (60 seconds) when config is invalid
    DEFAULT_FALLBACK_INTERVAL: int = 60
    
    def __init__(self) -> None:
        self.interval: float = 0.0
        self.function: Optional[Callable] = None  # type: ignore
        self._timer: Optional[threading.Timer] = None
        self._cancelled: bool = False
        self._disabled: bool = False  # Track if timer is disabled due to config issue

    def _reset_timer(self) -> None:
        if self._timer:
            self._timer.cancel()

        if not self._cancelled and not self._disabled and self.interval > 0:
            self._timer = threading.Timer(self.interval, self._execute)
            self._timer.start()

    def start(
        self,
        interval: Union[int, float, None],
        function: Callable,  # type: ignore
    ) -> None:
        """
        Start the timer with graceful handling of invalid intervals.
        
        Args:
            interval: Timer interval in seconds. If None, 0, or negative,
                     the timer will use a fallback or be disabled gracefully.
            function: Function to call when timer expires.
        """
        # Graceful handling of invalid interval - DO NOT crash the service
        if interval is None:
            _logger.warning(
                "Timer.start() called with interval=None. "
                "Using fallback interval of %d seconds. "
                "Check MODEL_IDLE_TIMEOUT environment variable.",
                self.DEFAULT_FALLBACK_INTERVAL
            )
            interval = self.DEFAULT_FALLBACK_INTERVAL
        
        if not isinstance(interval, (int, float)):
            _logger.warning(
                "Timer.start() called with non-numeric interval: %s (type: %s). "
                "Disabling idle timeout timer. Service will remain loaded.",
                interval, type(interval).__name__
            )
            self._disabled = True
            return
            
        if interval <= 0:
            _logger.warning(
                "Timer.start() called with interval=%s (must be > 0). "
                "Disabling idle timeout timer. Service will remain loaded. "
                "To enable idle timeout, set MODEL_IDLE_TIMEOUT > 0 in environment.",
                interval
            )
            # Instead of raising InvalidIntervalError, gracefully disable
            self._disabled = True
            return

        self._disabled = False
        self.interval = float(interval)
        self.function = function
        self._cancelled = False
        self._reset_timer()

    def _execute(self) -> None:
        if self.function and not self._cancelled:
            self.function()
            self._reset_timer()

    def cancel(self) -> None:
        self._cancelled = True
        if self._timer:
            self._timer.cancel()
            self._timer = None


class TimerFactory:
    def create(self) -> "Timer":
        return Timer()
