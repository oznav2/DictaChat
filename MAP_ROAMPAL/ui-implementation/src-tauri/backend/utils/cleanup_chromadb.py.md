# cleanup_chromadb.py (utils) - Map

## Summary

`cleanup_chromadb.py` is a specialized maintenance utility for the local vector database. ChromaDB occasionally creates orphaned UUID-named folders when collections are poorly handled or the system crashes during a migration. This script scans the data directory, identifies these orphaned UUID paths using regex, and safely removes them while preserving the named collections (e.g., `roampal_books`, `roampal_working`) required for the application's runtime.

---

## Technical Map

### UUID Pattern Matching (Lines 18-21)

- **`is_uuid_folder`**: uses a strict regex to match standard 8-4-4-4-12 hex UUID formats. This prevents the script from accidentally deleting named folders that might contain legitimate user data.

### Cleanup Workflow (Lines 36-98)

- **`cleanup_chromadb_folders`**:
  - Scans the `./data/chromadb` directory.
  - Compares found directories against a whitelist of `active_collections` (legacy names like `loopsmith_*` are included for backward compatibility during transitions).
  - **Safe-Deletions**: Any UUID-named folder NOT in the active whitelist is marked for removal.
- **Windows Resilience (Lines 83-97)**: Implements 3 retries with a 1-second delay for `shutil.rmtree` to handle common permission errors caused by background indexing locks.

### CLI & Reporting (Lines 119-139)

- **Safe-By-Default**: The script runs in `dry_run` mode by default, logging what _would_ be deleted.
- **Execution**: Requires the `--execute` flag to perform actual deletions.
- **Metrics**: provides a final report on the remaining disk usage of the vector store in MB.

---

## Connection & Dependencies

- **Settings.py**: provides the default `DATA_PATH` for the scan.
- **UnifiedMemorySystem.py**: References the `active_collections` listed here, ensuring that the cleanup logic remains aligned with the memory system's internal organization.
- **Tauri UI**: This script is often triggered by the "Optimize DB" button in the Advanced Settings panel.
