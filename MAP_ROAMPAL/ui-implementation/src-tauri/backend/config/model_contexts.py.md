# model_contexts.py (config) - Map

## Summary

`model_contexts.py` acts as the single source of truth for LLM context window limits within the RoamPal backend. It provides a mapping of known models to their "safe defaults" and "theoretical maximums". it also manages user-defined persistent overrides stored in a local JSON file, allowing individuals to fine-tune their memory window based on their specific hardware capabilities.

---

## Technical Map

### Core Data & Priorities

- **`MODEL_CONTEXTS` Mapping**: Hardcoded defaults for major model families:
  - **High Capacity**: Llama 3.1+, Command-R, and Phi-4 default to 32K but support up to 128K+.
  - **Balanced**: Mistral/Mixtral default to 16K, supporting up to 32K.
  - **Safe Fallback**: Unknown models default to 8K.
- **Resolution Order (Lines 115-124)**:
  1. Runtime Override (passed during API call).
  2. User Preference (loaded from `user_model_contexts.json`).
  3. Model-specific internal default.
  4. Safe baseline (8192 tokens).

### Persistence & Concurrency

- **`SETTINGS_FILE`**: Located at `${DATA_PATH}/user_model_contexts.json`.
- **`_settings_lock`**: A global `threading.Lock()` ensures that concurrent save/delete operations from different threads (e.g., parallel API workers) don't corrupt the JSON file.

### Public API Functions

- **`get_context_size(model_name)`**: The primary getter used by the inference engine to determine the `num_ctx` value for the LLM request.
- **`save_user_override` / `delete_user_override`**: CRUD operations for persisting custom limits.
- **`get_model_info`**: Returns a comprehensive object containing current, default, and max limits, used for rendering the context slider in the UI.

---

## Connection & Dependencies

- **Settings.py**: Provides the `DATA_PATH` used to resolve the settings file location.
- **model_contexts_router.py**: The FastAPI router that exposes these functions to the frontend.
- **OllamaClient.py**: Uses the resolved context size when building the payload for `/api/generate`.
