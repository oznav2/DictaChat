# create_vector_index.py (utils) - Map

## Summary

`create_vector_index.py` is a standalone migration and indexing script used to populate the vector database from the raw JSON/YAML files of the "Soul Layer" (RoamPal's foundational knowledge). It orchestrates the entire pipeline: loading documents (Summaries, Quotes, Models, Learnings), cleaning them of "garbage" reasoning phrases, generating semantic embeddings via the `EmbeddingService`, and upserting them into the ChromaDB vector store.

---

## Technical Map

### Ingestion Pipeline (Lines 49-153)

- **`main(full_reindex)`**:
  - **Cleaning**: Uses `is_valid_document` to strip out meta-reasoning from LLM extraction (e.g., phrases like "here are three direct and impactful quotes").
  - **ID Serialization**: Implements a hierarchical ID resolver that prefers `chunk_id` or `model_id` but falls back to a stable hash of the text.
  - **Categorization**:
    - **Summaries**: Indexed with `source_type: "summary"`.
    - **Quotes**: Indexed with context and book titles.
    - **Models**: Specialized formatting as `"Model: {name}. Description: {desc}"` for better semantic retrieval.
    - **Learnings**: Captured from the shared experience memory layer.

### Processing Efficiency (Lines 155-169)

- **Batching**: Operates in chunks of 64 documents to optimize network IO and GPU usage of the embedding service.
- **Async Concurrency**: Uses `asyncio.gather` to trigger multiple embedding requests in parallel before performing a bulk `upsert_vectors` call to ChromaDB.

### CLI Interface (Lines 175-183)

- **`--full-reindex`**: provides a "Clean Slate" option that deletes the entire ChromaDB collection before starting. Used when upgrading the embedding model or fixing accidental data corruption.

---

## Connection & Dependencies

- **EmbeddingService.py**: Provides the `embed_text` logic and model metadata.
- **ChromaDBAdapter.py**: The interface for persisting vectors.
- **SoulLayerManager.py**: The source-of-truth for the raw structured data stored in the local filesystem.
- **Tauri Backend**: This script is typically run once during initial application setup or during a "Clear Memory" action from the Data Management UI.
