# settings.py (config) - Map

## Summary

`settings.py` is the primary configuration engine for the RoamPal backend. It uses `pydantic-settings` to manage strongly-typed configurations for paths, LLM providers, memory systems, and UI tone. It implements a platform-aware path resolution system that differentiates between local development and production AppData environments.

---

## Technical Map

### Path Orchestration (Lines 15-78, 246-331)

- **`PROJECT_ROOT`**: The base directory of the backend source.
- **`ROAMPAL_DATA_DIR`**: detected from env var.
- **`DATA_PATH` (The One True Memory Path)**:
  - **Windows**: `%APPDATA%/Roampal/data`.
  - **MacOS**: `~/Library/Application Support/Roampal/data`.
  - **Linux**: `~/.local/share/roampal/data`.
- **`PathSettings` class**: provides helper methods like `get_vector_db_dir()`, `get_knowledge_graph_path()`, and `get_sessions_dir()` to ensure all application data is stored in a clean, predictable hierarchy.

### Core Configuration Classes

- **`LLMSettings`**: Controls the active provider (`ollama`, `openchat`, `lmstudio`). Defines `ollama_base_url` and default model names.
- **`EmbeddingSettings`**: configuration for the vector engine. Supports "Align with LLM" behavior where the embedding model automatically matches the inference model if provided by Ollama.
- **`ChromaDBSettings`**: Toggles between embedded mode and server-mode (localhost:8003).

### AI Logic & Thresholds

- **`ThresholdSettings`**: Controls the "Memory Window" (e.g., `token_budget_memory_context` = 1200 tokens) and deduplication limits (cosine similarity > 0.95).
- **`FeedbackSettings`**: Defines how memory fragments are scored. Implements a 30% sentiment / 70% usefulness blend with a 1% daily score decay.
- **`ToneSettings`**: Maps system personality modes (`build`, `vision`, `burnout`, `vent`) to specific linguistic instructions.

### Memory & Sharding (Lines 354-419)

- **`MemoryLayerSettings`**: (Legacy/Deprecated) Replaced by Unified system but still provides seed counts for initial data ingestion.
- **`MemoryInjectorSettings`**: Manages the priority order for context injection (preference: User > Assistant > Book Quote).

---

## Connection & Dependencies

- **main.py**: Imports the `settings` singleton to initialize all handlers.
- **.env**: Source for all `ROAMPAL_` and `OG_` prefixed environment overrides.
- **UnifiedMemorySystem.py**: Consumes `chromadb`, `memory`, and `paths` settings to configure the vector database.
- **Tauri `main.rs`**: Passes `ROAMPAL_DATA_DIR` as an environment variable to the child process to control where these paths resolve.
