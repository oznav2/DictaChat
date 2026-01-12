# startup_cleanup.py (utils) - Map

## Summary

`startup_cleanup.py` manages the "Soft Deletion" and resource lifecycle of different AI shards and local data structures. It solves the common problem of file locks preventing direct directory deletion on Windows/macOS by implementing a two-stage process: marking a shard for deletion with a `SHARD_DELETED.txt` file and then performing the actual filesystem and ChromaDB cleanup during the next application boot.

---

## Technical Map

### Shard Cleanup Logic (Lines 14-64)

- **`cleanup_soft_deleted_shards()`**:
  - Scans the `backend/data/shards` directory on startup.
  - Identifies folders containing a `SHARD_DELETED.txt` marker.
  - **Step 1**: invokes the ChromaDB API to drop all vector collections associated with the shard (global and private user layers).
  - **Step 2**: attempts to remove the physical directory using `shutil.rmtree()`. If a file is still locked, it gracefully skips and logs a warning for the next reboot.

### Runtime Deletion (Lines 126-206)

- **`attempt_online_deletion()`**:
  - Coordinates the "Soft Delete" workflow while the application is running.
  - **Resource Disconnection (Lines 67-123)**: Proactively clears references to memory adapters, code processors, and DB connections in the `app_state`.
  - **ChromaDB Cleanup**: deletes server-side collections immediately using the `HttpClient`.
  - **Marker Placement**: If `rmtree` fails (common in production), it writes the `SHARD_DELETED.txt` file to bridge the gap until the next restart.

### Vector Store Management (Lines 212-287)

- **`delete_chromadb_collections_for_shard`**:
  - Connects to the ChromaDB server (port 8003).
  - Iterates through all available collections.
  - Uses pattern matching (e.g., `global_{shard}_fragments`) to find and destroy all vector indices belonging to the target shard.

---

## Connection & Dependencies

- **main.py**: executes `cleanup_soft_deleted_shards()` during the `lifespan` startup phase to ensure the system is clean before accepting requests.
- **data_management_router.py**: The primary API caller for `attempt_online_deletion` when a user selects a shard to be removed from the UI.
- **chromadb**: Required for remote collection management.
- **app_state**: The global FastAPI state container modified during the resource disconnection phase.
