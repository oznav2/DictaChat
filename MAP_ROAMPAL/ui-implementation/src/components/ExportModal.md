# ExportModal.tsx - Map

## Summary

`ExportModal.tsx` is a focused interface for creating data backups. It allows users to selectively export different categories of their local data (Conversations, Memory, Books, and Knowledge) into a single ZIP archive. It features real-time size estimation based on user selections.

---

## Technical Map

### Component Props (`ExportModalProps`)

- `isOpen`: Controls visibility.
- `onClose`: Callback to dismiss the modal.

### State & Workflows

#### Size Estimation (Lines 44-75)

- **Trigger**: Every time `exportOptions` or `isOpen` changes.
- **Process**: Fetches from `${ROAMPAL_CONFIG.apiUrl}/api/backup/estimate?include={types}`.
- **Display**: Shows total megabytes and specific counts for each selected category.

#### Export Generation (Lines 84-147)

- **Logic**: Hit `POST /api/backup/create`. If all types are selected, it calls the base endpoint; otherwise, it appends an `include` query param.
- **Download mechanism**:
  - Converts response to a `blob`.
  - Creates a temporary `URL.createObjectURL(blob)`.
  - Programmatically clicks a hidden anchor tag to trigger the browser's save dialog.
  - Revokes the URL to prevent memory leaks.
- **Naming**: Extracts the filename from the `Content-Disposition` header, falling back to a timestamped default.

### UI Structure

- **Global Layout**: Fixed backdrop with a centered `zinc-900` card.
- **Options List (Lines 196-272)**:
  - Row-based checkboxes for each category.
  - Shows metadata (MB size and file count) for each row once estimated.
- **Summary Box (Lines 275-286)**: Highlights the final ZIP size in blue.
- **Export Button (Lines 289-314)**: Primary action button with a dynamic loading state (SVG spinner).

---

## Connection & Dependencies

- **ROAMPAL_CONFIG**: API URL source.
- Sub-function of the broader data management strategy, often used individually for quick backups.
- **Backend API**:
  - `GET /api/backup/estimate`
  - `POST /api/backup/create`
