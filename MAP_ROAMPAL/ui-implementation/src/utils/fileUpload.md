# fileUpload.ts - Map

## Summary

`fileUpload.ts` provides robust utilities for documment ingestion into RoamPal's memory system. It implements "Fail Fast" validation, sequential multi-file uploading (to prevent backend saturation), and real-time progress tracking using `XMLHttpRequest`. The utility is limited to lightweight text-based formats (`.txt`, `.md`) under a 10MB limit.

---

## Technical Map

### Constraints & Types

- **Allowlist**: `.txt`, `.md`.
- **Max Size**: 10MB.
- **`FileUploadState`**: Tracks `file`, `status` (pending/uploading/uploaded/error), `progress` (0-100), and the resulting `bookId`.

### Core Functions

#### `validateFile` (Lines 27-46)

- Checks file extension and size. Returns a boolean and a user-friendly error message if validation fails.

#### `uploadFile` (Lines 52-107)

- Uses `XMLHttpRequest` (instead of `fetch`) to facilitate access to the `upload.progress` event.
- **Form Data**: Automatically appends the file, a derived title (filename minus extension), and an idempotency flag (`check_duplicate: true`).
- **Response Handling**: Parses the server's JSON response to extract the unique `book_id`.

#### `uploadFiles` (Lines 112-133)

- Implements sequential processing using a `for...of` loop.
- **Philosophy**: Stops immediately (Fail Fast) if any individual file fails to upload, ensuring data integrity for bulk operations.

#### Display Helpers

- **`formatFileSize`**: Converts raw bytes into human-readable strings (e.g., `1.2 MB`).
- **`getFileIconType`**: maps MIME types or extensions to semantic categories (`text`, `image`, `document`).

---

## Connection & Dependencies

- **BookProcessorModal.tsx**: Primary consumer of the upload and validation logic.
- **ROAMPAL_CONFIG**: Provides the `apiUrl`.
- **logger.ts**: Internal utility for debugging network operations.
