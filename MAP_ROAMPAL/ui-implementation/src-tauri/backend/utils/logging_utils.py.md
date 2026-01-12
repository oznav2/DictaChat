# logging_utils.py (utils) - Map

## Summary

`logging_utils.py` provides a standardized logging configuration for the Python backend. It ensures consistent log formatting across all application modules and addresses platform-specific challenges, such as handling Unicode characters in the Windows terminal. By centralizing the setup, it prevents duplicate log messages often caused by the intersection of FastAPI (Uvicorn) and custom application loggers.

---

## Technical Map

### Root Setup (Lines 6-43)

- **`setup_logging(log_level)`**:
  - Dynamically resolves log levels from strings (INFO, DEBUG, etc.).
  - Clears existing root handlers to ensure RoamPal's custom format is the dominant output.
- **Unicode Support (Lines 26-35)**:
  - Implements a critical fix for Windows: wraps `sys.stdout` in a `TextIOWrapper` with `UTF-8` encoding. This prevents the "GGUF/Ollama" progress arrows or special emojis from crashing the backend on Windows-based shell environments.

### Format Design

- **Format String**: `%(asctime)s | %(levelname)-8s | %(name)-35s | %(module)s.%(funcName)s:%(lineno)d - %(message)s`.
- This format provides high visibility into which code module and line number generated the log, making it easier to debug the complex asynchronous orchestration of the memory system.

---

## Connection & Dependencies

- **main.py**: Calls `setup_logging()` as one of the first lines of execution.
- **Tauri UI**: the backend logs are streamed to the Tauri process and often displayed in the developer "Terminal" component if enabled.
- **Third-party libraries**: Controls the verbosity of noisy libraries like `httpx` and `playwright`.
