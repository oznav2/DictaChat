# Tauri and System Utils - Map

## Overview

The `src/utils` directory contains low-level wrappers and boilerplate for interacting with the native OS and managing application logs.

---

### logger.ts

- **Purpose**: A centralized logging utility that provides a consistent interface (`log`, `warn`, `error`, `debug`) for app diagnostics.
- **Features**:
  - prepends timestamps to log entries for easier debugging of asynchronous race conditions.
  - can be easily extended to pipe logs to a file or remote observability service in production builds.

### tauri.ts

- **Purpose**: A lightweight bridge that exposes `@tauri-apps/api/fs` and `@tauri-apps/api/path` functions in a safe way.
- **Key Functions**:
  - `readFile` / `writeFile`: Direct filesystem access (subject to Tauri permissions).
  - `isTauri`: A reliable browser-safe check for the native environment (`window.__TAURI__`).

### tauriEvents.ts

- **Purpose**: helper for subscribing to native events emitted by the Rust core (e.g., periodic health checks, CPU/GPU status, or download progress).
- **Core Function**: `listenToEvent` - A wrapper around `@tauri-apps/api/event` that handles component-level unmounting by returning a cleanup function.

---

## Connection & Dependencies

- **useChatStore.ts**: Relies on `tauri.ts` for session persistence to disk.
- **ConnectionStatus.tsx**: Uses `tauriEvents.ts` to listen for backend heartbeat signals.
- **File Upload Utilities**: Use `logger.ts` for tracking multipart upload success/failures.
