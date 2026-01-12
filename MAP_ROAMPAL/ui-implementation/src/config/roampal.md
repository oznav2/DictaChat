# roampal.ts - Map

## Summary

`roampal.ts` is the central configuration and adapter layer for the RoamPal UI. It defines the networking schema (ports, endpoints, timeouts) and provides a unified `useTauri` hook that bridges high-level app requests (like reading files or running Git commands) to either native Rust `invoke` calls or HTTP fallback APIs.

---

## Technical Map

### Networking Configuration (`ROAMPAL_CONFIG`)

- **Base URLs**: Standardizes `apiUrl`, `apiBase`, and `WS_URL` to `localhost` using a port detected via `VITE_API_PORT` (default 8765).
- **Timeouts & Retries**: 30s request timeout, 3 retries, and 5 WebSocket reconnect attempts.
- **Endpoint Map**: provides semantic namespaces for `CHAT`, `MEMORY`, `SHARDS`, and utility `endpoints` (file, project, test, git).
- **Theme Tokens**: Defines the core palette: Blue (Primary/Intelligence), Green (Secondary/Learning), and Amber (Accent/Active).

### Native Bridge (`useTauri` hook)

This hook abstracts OS-level operations, providing automatic fallback logic for non-Tauri (browser-only) environments:

- **VS Code Integration**: `openInVSCode` and `openFolderInVSCode` call Rust handlers to launch the IDE.
- **Filesystem**:
  - `readFile` / `writeFile`: prioritizes native Rust calls; falls back to the Python backend's `/api/file` endpoint in dev mode.
  - `listFiles`: Tauri-specific listing using native Rust performance.
- **Git Integration**: `runGitCommand` proxies complex command arrays to the native Git worker or the backend REST API fallback.

---

## Connection & Dependencies

- **useChatStore.ts**: Relies on this for endpoint definitions and WebSocket URLs.
- **CodeChangePreview.tsx**: Uses `readFile` / `writeFile` through this bridge to apply diffs.
- **EnhancedMessageDisplay.tsx**: Uses theme tokens for styling complex markdown outputs (callouts, blocks).
- **apiFetch.ts**: Uses `apiUrl` as the prefix for all its operations.
