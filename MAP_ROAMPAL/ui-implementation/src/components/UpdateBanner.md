# UpdateBanner.tsx - Map

## Summary

`UpdateBanner.tsx` is an application lifecycle component that notifies users when a new version of RoamPal is available. It uses a custom hook to check for updates and differentiates between optional and critical updates using distinct color coding (Zinc vs Red). It provides direct links to the download page and allows users to dismiss non-essential notifications.

---

## Technical Map

### Core Logic

#### `useUpdateChecker` Hook (Line 10)

- Encapsulates the update checking logic, returning:
  - `updateInfo`: Object containing `version`, `notes`, `is_critical`, and `download_url`.
  - `dismiss`: Callback to hide the banner (typically stored in session/local storage).
  - `openDownload`: Function to launch the external download URL in the browser.

### UI Structure

#### Visual Variations (Lines 15-30, 44-71)

- **Standard Update**: Zinc-800 background, blue accent icons and buttons. Closeable.
- **Critical Update**: Red-900 background, red accent icons. Forced visibility (no "Later" or "Close" buttons).

#### Banner Layout

- **Global Positioning**: Anchored to the bottom-right corner (`fixed bottom-4 right-4`).
- **Icon Section**: High-contrast icon (downward arrow) indicating a download is ready.
- **Content Section**:
  - **Title**: Dynamic heading based on criticality.
  - **Notes**: Displays a brief snippet of release notes if provided by the update server.
- **Button Row**: Primary "Download" button and an optional "Later" button for non-mandatory releases.

---

## Connection & Dependencies

- **useUpdateChecker.ts**: The functional backend for this component.
- **ConnectedChat.tsx**: Typically hosts this component at the root level of the main chat view to ensure it's always visible regardless of active modals.
- **Tauri API**: Indirectly uses the shell API via the hook to open browser links.
