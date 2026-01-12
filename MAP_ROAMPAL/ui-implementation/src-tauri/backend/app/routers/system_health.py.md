# system_health.py (routers) - Map

## Summary

`system_health.py` is the diagnostic hub for RoamPal. It provides a comprehensive view of the application's resource usage, focusing on disk health and storage growth across its various data silos (ChromaDB, SQLite, JSONL sessions, and backups). It also serves as a communication channel for maintenance events, such as data migrations.

---

## Technical Map

### Resource Monitoring (`/health`)

- **Disk Usage (Lines 37-55)**: Uses `shutil.disk_usage` to monitor the host system's storage. It triggers tiered alerts (Warning/Critical) if free space falls below 5GB, 1GB, or 500MB.
- **Data Silo Auditing (Lines 57-110)**: Recursively calculates the size of:
  - **ChromaDB**: The vector store (warns if > 1GB).
  - **Sessions**: Individual conversation logs (warns if > 1,000 files).
  - **Backups**: Historical ZIP archives (warns if > 500MB).
- **Integrity Integration (Lines 111-115)**: Aggregates results from application-level integrity checks that are stored in the global `app.state`.

### Migration Management

- **v0.1.7 Embedding Migration (Lines 230-277)**: Handles the detection and dismissal of migration notices. This specifically tracked the transition to new embedding models, ensuring users were aware of potential re-indexing requirements.

---

## Connection & Dependencies

- **Settings/AppData**: Audits the folders defined in the application's data path.
- **Dashboard UI (Frontend)**: The "Settings > System Health" view that visualizes these metrics with progress bars and status indicators.
- **data_management.py**: While `system_health.py` _monitors_ the storage, `data_management.py` provides the tools to _remediate_ low-space warnings (Clear/Purge functions).
