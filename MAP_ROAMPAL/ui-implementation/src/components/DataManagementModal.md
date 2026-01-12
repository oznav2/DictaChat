# DataManagementModal.tsx - Map

## Summary

`DataManagementModal.tsx` is the administrative control center for user data in RoamPal. It provides a dual-interface for **Exporting** (creating ZIP backups of conversations, memories, books, and knowledge) and **Deleting** (permanently purging specific memory collections). It includes real-time size estimation and database compaction tools to manage local storage footprint.

---

## Technical Map

### Component Props (`DataManagementModalProps`)

- `isOpen`: Controls visibility.
- `onClose`: Callback to dismiss the modal.

### State & Workflows

#### Export System (Lines 68-190)

- **Selection**: `exportOptions` toggles between Sessions, Memory (ChromaDB), Books, and Knowledge Graph.
- **Size Estimation**: Uses a `useEffect` to poll `/api/backup/estimate` whenever selection changes. It returns megabyte counts and file counts to the UI.
- **Generation**: Hits `POST /api/backup/create`. It handles the response as a `blob`, extracts the filename from `Content-Disposition`, and triggers a browser download.

#### Delete System (Lines 192-229)

- **Granular Control**: Supports deleting specific collections: `memory_bank`, `working`, `history`, `patterns`, `books`, `sessions`, `knowledge-graph`.
- **Logic**: Hit `POST /api/data/clear/{target}`.
- **Signals**: Dispatches a `memoryUpdated` event to trigger UI refreshes across the app after deletion.

#### Database Maintenance (Lines 231-257)

- **Compaction**: Calls `/api/data/compact-database` to reclaim free space from the underlying vector database. It returns `space_reclaimed_mb` for user feedback.

### UI Structure

- **Global Layout**: Fixed inset with a backdrop-blur and a central `zinc-900` card.
- **Tabs (Lines 331-363)**:
  - **Export**: Blue-themed, uses `unDraw` style icons for backup.
  - **Delete**: Red-themed "Danger Zone".
- **Export View (Lines 367-542)**: List of checkboxes with metadata (MB and count) for each category. Includes a summary box and a primary export button with a loading spinner.
- **Delete View (Lines 544-622)**: A list of all data collections with their current item counts and specific "Delete" buttons.
- **Confirmation Layer**: Integrates the `DeleteConfirmationModal` for an extra security step before destructive actions.

---

## Connection & Dependencies

- **DeleteConfirmationModal.tsx**: Child component used for secondary confirmation.
- **ROAMPAL_CONFIG**: Provides base URL for backend endpoints.
- **apiFetch.ts**: Standard wrapper for all data operations.
- **window.dispatchEvent**: Used to broadcast `memoryUpdated` to sync the state of memory panels.
- **Backend API**:
  - `/api/backup/*`
  - `/api/data/*`
