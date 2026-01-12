# embedding_config.py (config) - Map

## Summary

`embedding_config.py` establishes the "Unified Embedding" standard for the RoamPal ecosystem. By fixing the model to `sentence-transformers/all-MiniLM-L6-v2` and the dimensions to `384`, it ensures that all memory fragments, knowledge graph nodes, and book chunks are semantically comparable across different versions and services. It enforces a "No Fallback" policy to prevent vector index corruption.

---

## Technical Map

### Constants & Configuration (Lines 15-30)

- **`MODEL_NAME`**: Hardcoded to `sentence-transformers/all-MiniLM-L6-v2` for cross-platform efficiency.
- **`EMBEDDING_DIM`**: Set to `384` dimensions.
- **`EMBEDDING_SERVICE_URL`**: points to a dedicated microservice on `localhost:8004`.
- **Caching**: Implements an in-memory cache of 5,000 vectors with a 30-minute TTL to reduce redundant GPU/CPU inference.
- **`ALLOW_FALLBACK`**: Set to `False`. This is a critical safety feature; if the primary embedding model is unavailable, the system will error rather than generate incompatible vectors using a fallback model.

### API Methods (Lines 32-42)

- **`get_embedding_endpoint()`**: Returns the REST path for the centralized embedding logic.
- **`validate_embedding()`**: A sanity check used before inserting vectors into ChromaDB to ensure dimension alignment.

---

## Connection & Dependencies

- **EmbeddingService.py**: Implements the logic defined here and serves the API on port 8004.
- **UnifiedMemorySystem.py**: Relies on these dimensions to initialize the ChromaDB indexing parameters.
- **SmartBookProcessor.py**: Uses the global `embedding_config` instance to ensure that ingested documents are indexed with the same model as the user's chat history.
