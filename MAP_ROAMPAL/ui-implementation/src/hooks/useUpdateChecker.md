# useUpdateChecker.ts - Map

## Summary

`useUpdateChecker.ts` is a logical hook that handles the background check for new application versions. It implements a non-blocking fetch pattern, a persistent dismissal system using `localStorage`, and native browser interaction via Tauri's shell API.

---

## Technical Map

### State & Workflows

#### Version Check (Lines 36-55)

- **Delay**: Waits 5 seconds after mount before initiating the check to prioritize boot performance.
- **API**: Hits `${ROAMPAL_CONFIG.apiUrl}/api/check-update`.
- **Result**: Populates `updateInfo` if a newer version is identified by the backend.

#### Global Persistence (Lines 26-34, 57-63)

- **Key**: `roampal_update_dismissed_version`.
- **Logic**: If the user clicks "Later", the specific version number is saved to `localStorage`. Subsequent sessions will skip showing the update banner for that specific version unless a _newer_ version is released.

#### Download Redirection (Lines 65-75)

- Attempts to use Tauri's `open()` API to launch the system default browser.
- **Safety**: Falls back to `window.open` if execution occurs in a standard web context or if the native bridge fails.

### Return Values

- `updateInfo`: The update metadata (filtered by `dismissed` state).
- `checking`: Boolean flag for activity monitoring.
- `dismiss`: Callback to persist the "Later" choice.
- `openDownload`: Callback to navigate to the release page.

---

## Connection & Dependencies

- **UpdateBanner.tsx**: The primary consumer of this hook.
- **ROAMPAL_CONFIG**: Provides the update server base URL.
- **Tauri API**: Indirect dependency for desktop-native shell operations.
- **localStorage**: Used for cross-session version exclusion.
