# data_management.py (routers) - Map

## Summary

`data_management.py` provides the administrative control panel for the RoamPal memory system. It contains endpoints for calculating storage statistics across all collections (Memory Bank, Working, History, etc.) and exposes destructive "Clear" operations for each. It includes specialized logic for "Deep Cleaning" books (managing both vector and relational SQL data) and a database compaction utility to reclaim disk space from the underlying SQLite engines.

---

## Technical Map

### Statistical Reporting (Lines 21-115)

- **`get_data_stats`**:
  - **Collections**: Queries ChromaDB for entry counts across all 5 tiers.
  - **Knowledge Graph**: Parses `knowledge_graph.json` and `memory_relationships.json` to calculate the density of routing patterns and document overlaps.
  - **Sessions**: Counts physical `.jsonl` history files.

### Collection Scrubbing (Lines 119-380)

- **Batch Deletion**: Implementation for `memory_bank`, `working`, and `history` uses 100-item batching to bypass ChromaDB's transaction limits.
- **Deep Nuke (v0.2.9)**: The `clear_books` endpoint performs a full collection destruction (`delete_collection`) rather than a simple ID delete. This is required to force an HNSW index rebuild and eliminate "Ghost Vectors" (hallucinated retrievals from deleted files).
- **Multi-Store Purge**: `clear_books` also wipes the `aiosqlite` metadata database and recreates the empty folder structure for `uploads/` and `metadata/`.

### Administrative Actions (Lines 383-566)

- **Session Purge**: Deletes all `.jsonl` files but includes a safety check to preserve the _current_ active conversation ID.
- **KG Reset**: Overwrites the graph JSON with an empty schema and explicitly clears the in-memory cache in `UnifiedMemorySystem` to prevent stale search results.
- **`compact_database`**: Manually executes a `VACUUM` command on the ChromaDB SQLite file to prune the WAL (Write-Ahead Log) and reduce the file size on disk after a large deletion.

---

## Connection & Dependencies

- **UnifiedMemorySystem.py**: The primary service targeted by all clear and stats operations.
- **SmartBookProcessor.py**: Manages the SQL side of the "Deep Nuke" for the books collection.
- **ghost_registry.py**: Tracking system for blacklisted vector IDs that is cleared whenever a full collection nuke occurs.
- **DataControlPanel (Frontend)**: The UI view providing the "Delete All Memories" or "Reclaim Space" buttons.
