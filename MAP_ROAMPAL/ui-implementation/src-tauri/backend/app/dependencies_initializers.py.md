# dependencies_initializers.py (app) - Map

## Summary

`dependencies_initializers.py` acts as the IoC (Inversion of Control) container for the RoamPal backend. It provides factory functions to instantiate and configure all core services—LLM clients, vector database adapters, prompt engines, and book processors. It ensures that every service is properly initialized with shard-specific paths and centralized settings before the application starts accepting traffic.

---

## Technical Map

### Shard-Aware Initialization (Lines 70-110)

- **`initialize_fragment_memory_adapter(fragment_id, ...)`**:
  - The most critical initializer.
  - **Security**: Validates the `fragment_id` against regex (`^[a-zA-Z0-9_-]+$`) to prevent path traversal.
  - **Dynamic Discovery**: Automatically resolves the vector store path to `data/shards/{fragment_id}` and names the ChromaDB collection as `roampal_{fragment_id}_soul_fragments`. This allows RoamPal to switch between different "Mindsets" (shards) by simply changing the `fragment_id`.

### Client Initializers

- **LLM**: `initialize_llm_client` currently only supports **Ollama**. It casts the client to the `LLMClientInterface` to ensure internal code remains provider-agnostic.
- **Scraper**: `initialize_web_scraper` sets up the Playwright headless browser client for the agentic web search tool.
- **Prompting**: `initialize_og_prompt_engine` loads templates from both the global library and shard-specific layers.

### Support Functions (Lines 44-57)

- **`load_dynamic_books`**: Scans `data/og_books/` for `.txt` files on startup and automatically populates the `BOOKS` registry with metadata, using keywords to categorize them as "Coding" or "Philosophy" based on their filenames.

---

## Connection & Dependencies

- **main.py**: The `lifespan` handler calls these initializers and attaches the resulting instances (e.g., `app.state.llm_client`) to the global FastAPI application state.
- **Core Interfaces**: All initializers enforce return types defined in `core.interfaces/`, ensuring architectural consistency and allowing for easier mocking during unit tests.
- **Settings.py**: The primary configuration source; every initializer consumes a specific `*Settings` sub-object (e.g., `LLMSettings`).
- **Shards**: The directory structure created and managed by these initializers is the backbone of RoamPal's cross-session memory organization.
