# useBackendAutoStart.ts - Map

## Summary

`useBackendAutoStart.ts` is a mission-critical infrastructure hook for RoamPal's desktop environment. It manages the lifecycle of the Python/Core backend process, ensuring it's running before the UI attempts to communicate with it. It implements a fallback logic that prioritizes existing HTTP connectivity, triggers native process startup if needed, and polls for readiness with a generous timeout for cold boots.

---

## Technical Map

### State Transitions

- **`checking`**: Initial state where it probes for an existing backend.
- **`starting`**: Indicates that the native `start_backend` command has been issued.
- **`ready`**: Backend is confirmed online and responding to status pings.
- **`error`**: Startup failed or timed out (120-second limit).

### Core Workflow

#### Environment Detection (Lines 11-20)

- Checks if `window.__TAURI__` is present.
- **Dev Mode**: If not in Tauri, it assumes the developer is running the backend manually and skips startup logic (sets status to `ready`).

#### Health Probing (Lines 23-38)

- Performs a "pre-check" by hitting `GET /health` with a 2-second timeout.
- If it responds, the UI marks the backend as `ready` immediately, avoiding redundant startup calls.

#### Native Startup (Lines 40-50)

- Dynamically imports `@tauri-apps/api/tauri`'s `invoke` function.
- Calls the Rust-side `start_backend` command.

#### Readiness Polling (Lines 52-80)

- **Schedule**: Every 500ms for up to 120 seconds (240 attempts).
- **Mechanism**: Calls native `check_backend`.
- **Completion**: Clears interval upon success or ultimate timeout.

---

## Connection & Dependencies

- **Tauri Rust Backend**: Communicates via `invoke('start_backend')` and `invoke('check_backend')`.
- **ConnectedChat.tsx**: Typically prevents main UI rendering until this hook returns `ready`.
- **apiFetch.ts**: Used for the initial HTTP health check.
- **ROAMPAL_CONFIG**: Defines the `apiUrl` used for probing.
