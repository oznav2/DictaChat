# tauri.conf.json - Map

## Summary

`tauri.conf.json` is the central configuration file for the Tauri application. It defines build settings, package metadata, security policies (CSP), window configurations, and allowed system API capabilities (allowlist). Crucially, it specifies the bundled resources, including the Python `backend` and external `binaries`, which are distributed with the desktop installer.

---

## Technical Map

### Build Settings (Lines 3-8)

- **`beforeDevCommand`**: Runs `npm run dev` to start the frontend vite server.
- **`devPath`**: Points to `http://localhost:5174`.
- **`distDir`**: Target directory for production frontend builds is `../dist`.

### Application Metadata (Lines 9-12, 46, 69-70)

- **Product Name**: Roampal.
- **Version**: 0.2.12.
- **Identifier**: `com.roampal.app`.

### Security & Capability Allowlist (Lines 13-42, 72-74)

- **Allowlist**:
  - `shell.open`: Enabled for opening external download URLs.
  - `path.all`: Enabled for filesystem navigation.
  - `process.all`: Enabled for managing the Python backend child process.
  - `http.all`: Scoped to `http://localhost:8765/**` for communication with the local backend.
- **CSP**: Restricts connections to `self` and specific localhost ports (`8765`) used by the backend and WebSocket streams.

### Bundling & Resources (Lines 43-71)

- **Resources**: Injects the following into the application bundle:
  - `backend/`: The complete Python source code.
  - `binaries/python`: The embedded Python interpreter.
  - `binaries/models`: Default local model weights if included.
  - License and documentation files.
- **Icons**: References various PNG, ICNS, and ICO sizes for cross-platform taskbar and window icons.

### Window Configuration (Lines 75-86)

- **Default Size**: 1400x900px.
- **Minimum Size**: 900x600px.
- **Title**: "Roampal - Your Private Intelligence".
- **Center**: Application launches in the center of the user's screen.

---

## Connection & Dependencies

- **Cargo.toml**: Used to specify the Rust dependencies required by the features enabled in the allowlist.
- **useTauri Hook (roampal.ts)**: The frontend relies on the capabilities enabled here (especially `shell`, `process`, and `http`).
- **main.rs**: The Rust entry point uses these settings to initialize the window and manage backend processes.
