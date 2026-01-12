# BookProcessorModal.tsx - Map

## Summary

`BookProcessorModal.tsx` is the ingestion gateway for RoamPal's "Books" collection (long-term reference material). It provides a full-featured upload workflow including drag-and-drop, metadata refinement (Title/Author), and real-time processing feedback via WebSockets. It also serves as a library manager where users can view and delete previously processed documents.

---

## Technical Map

### Components & State

- **Files Management**: `files` array tracks `ProcessingFile` objects with states: `pending` → `uploading` → `processing` → `completed`.
- **Library state**: `existingBooks` stores the list of documents already present in the backend.
- **Ref management**: `wsConnections` and `processingTimeouts` ensure clean resource handling to prevent memory leaks.

### Core Workflows

#### File Selection & Validation (Lines 274-329)

- **Constraints**: 10MB size limit.
- **Formats**: Support for `.txt`, `.md`, `.pdf`, `.docx`, `.xlsx`, `.xls`, `.csv`, `.tsv`, `.html`, `.rtf`.
- **Metadata Defaults**: Automatically extracts a default `customTitle` from the filename (minus extension).

#### Sequential Processing (Lines 363-491)

- **Upload**: Uses `multipart/form-data` to POST to `/api/book-upload/upload`.
- **Duplicate Detection**: Backend signals if a file has already been processed using content hashing; the UI displays a warning rather than re-processing (Lines 424-438).
- **Task Association**: Receives a `task_id` for tracking the background job.

#### WebSocket Progress Tracking (Lines 161-272)

- **Connection**: Connects to `ws/api/book-upload/ws/progress/{taskId}`.
- **Exponential Backoff**: Implements a retry mechanism (up to 3 attempts) with `delay = 1000 * 2^retry`.
- **Timeout**: Enforces a 5-minute Hard timeout (Line 183) for stall detection.
- **Completion Logic**: On `completed`, it auto-refreshes the library after 2 seconds and broadcasts a `memoryUpdated` event for the rest of the UI (Lines 207-217).

#### Library Management (Lines 84-159)

- **Fetching**: Queries `/api/book-upload/books`.
- **Deletion**: Triggers a DELETE request to `/api/book-upload/books/{id}`. This is a destructive action that removes all chunks, embeddings, and summaries associated with the document.

### UI Structure

- **Tabs (Lines 622-646)**: Toggle between "Upload New" and "Manage Library".
- **Drop Zone (Lines 653-687)**: Visual dashed container with drag states.
- **File List (Lines 690-800)**:
  - Card-based display for each file.
  - Input fields for Title and Author (visible in `pending` state).
  - Progress bars and status text (visible during `processing`).
- **Confirmation Modals**: Delete confirmations for both the list items and the library entries.

---

## Connection & Dependencies

- **ROAMPAL_CONFIG**: Provides the `apiUrl`.
- **lucide-react**: Rich iconography for file types and status indicators.
- **window.dispatchEvent**: Signals `memoryUpdated` for the memory sidebar to refresh its fragments.
- **Backend API**:
  - `POST /api/book-upload/upload`
  - `GET /api/book-upload/books`
  - `DELETE /api/book-upload/books/{id}`
  - `POST /api/book-upload/cancel/{taskId}`
