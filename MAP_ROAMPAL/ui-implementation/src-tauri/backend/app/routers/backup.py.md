# backup.py (routers) - Map

## Summary

`backup.py` provides the full infrastructure for RoamPal's data portability and disaster recovery. It allows users to export their entire AI "mind" (vector embeddings, conversation history, curated books, and knowledge graph) into a compressed ZIP file. The router supports granular selective exports, size estimation, and a safety-first restoration process that automatically backups current data before overwriting it with a legacy archive.

---

## Technical Map

### Selective Export Logic (Lines 49-216)

- **Granular Backups**: The system supports four distinct data silos for export:
  - **`sessions`**: Exports all `.jsonl` chat history files.
  - **`memory`**: Recursively zips the `chromadb/` directory (vector store).
  - **`books`**: packages the `books.db` SQLite file along with the `uploads/` and `metadata/` subdirectories.
  - **`knowledge`**: captures `knowledge_graph.json`, `memory_relationships.json`, and the `outcomes.db` scoring engine.
- **`backup_info.json`**: every archive includes a metadata manifest containing the timestamp, RoamPal version, and specific file counts for each silo, enabling intelligent UI previews during the restore phase.

### Discovery & Estimation (Lines 227-372)

- **`estimate_export_size`**: calculates the literal byte-count on disk for the requested silos before the ZIP process begins, allowing the UI to warn users about large exports.
- **`list_backups`**: scans the `data/backups/` folder and opens ZIP headers to read the `backup_info.json`, providing a detailed inventory of available recovery points without extracting them.

### Safety-First Restoration (Lines 375-519)

- **Active Protection**: Before beginning a restore, the system creates a `pre_restore_<timestamp>.zip` of the _current_ state. This ensures that if a restore is accidentally triggered or the archive is corrupt, the user's data isn't lost.
- **Destructive Sync**: The restore process performs a "Clean Overwrite": it deletes existing directories (e.g., `chromadb/`) before extracting the backup version to prevent mixing old and new vector indices.
- **Lifecycle Enforcement**: the response warns the user that a full application restart is required to re-initialize the SQLite connections and ChromaDB adapters.

---

## Connection & Dependencies

- **Settings.py**: utilizes the `DATA_PATH` to locate sessions and databases.
- **UnifiedMemorySystem.py**: this router bypasses the memory abstraction and touches the physical files, so it requires the system to be in a "quiescent" state (or handled via the restart requirement) to avoid database locks.
- **BackupModal (Frontend)**: The primary UI consumer, providing the checklists for selective export and the upload drag-and-drop for restoration.
- **system_health.py**: monitored backup counts and folder sizes are reported in the health dashboard.
