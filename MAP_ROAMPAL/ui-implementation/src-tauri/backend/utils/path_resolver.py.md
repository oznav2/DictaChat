# path_resolver.py (utils) - Map

## Summary

`path_resolver.py` is a utility designed to handle the RoamPal backend's transition from a legacy file-prefixed storage model to a modern UUID-based user directory structure. It abstraction layer that allows the rest of the application to "read" and "write" user data (sessions, images, shards) without knowing exactly where on the filesystem the data lives or whether it has been migrated yet.

---

## Technical Map

### Dual-Mode Logic (Lines 39-76)

- **Legacy Mode**: files are stored in a common directory with a `{username}_` prefix (e.g., `backend/data/shards/roampal/sessions/ilan_123.json`).
- **New UUID Mode**: files are stored in a dedicated user directory: `backend/data/users/{uuid}/shards/{shard}/{type}/`.
- **`resolve_user_path`**: Returns a tuple containing the potential "New" path and the confirmed "Legacy" path.

### Decision Engine (Lines 78-103)

- **`get_user_data_path`**:
  - **Read Operation**: Checks the New UUID path first; if it doesn't exist, it falls back to the Legacy path.
  - **Write Operation**: Prefers the New UUID path if the user has an assigned UUID (loaded from `users.json`); otherwise, it writes to the Legacy location.
- **`get_user_uuid`**: Uses a thread-safe cached lookup of `backend/data/users.json` to map usernames to internal IDs.

### Migration & Management (Lines 105-175)

- **`migrate_user_data`**: a one-way transfer utility that moves files from the legacy prefixed-system to the new UUID-based structure, cleaning up the filenames in the process.
- **`list_user_files`**: Aggregate listing that deduplicates results if a file exists in both the legacy and new locations (prioritizing the new one).

---

## Connection & Dependencies

- **Settings.py**: provides the base `backend/data` path used as a root for all relative calculations.
- **sessions_router.py**: Relies on this resolver to list and load chat histories for specific users.
- **UnifiedImageService.py**: Uses this to store and retrieve base64 or file-based image attachments safely.
- **users.json**: the source of truth for the UUID mapping.
