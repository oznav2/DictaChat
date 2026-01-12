# Cargo.toml - Map

## Summary

`Cargo.toml` is the manifest file for the Rust-based Tauri backend. It defines the project metadata, build dependencies, and runtime dependencies required for the native desktop application. It enables the full Tauri API suite and integrates standard Rust libraries for JSON serialization, asynchronous execution, and HTTP networking.

---

## Technical Map

### Project Metadata (Lines 1-7)

- **Name**: roampal.
- **Version**: 0.2.9 (Note: This slightly trails the `tauri.conf.json` version).
- **Edition**: 2021.
- **License**: Apache-2.0.

### Dependencies (Lines 12-19)

- **`tauri` (1.5)**: The core desktop framework. Enabled with `api-all` to support all frontend bridge capabilities.
- **`serde` & `serde_json`**: provide high-performance serialization and deserialization for inter-process communication (IPC) between Rust and JavaScript.
- **`tokio` (1.0)**: The asynchronous runtime used to spawn and manage the Python backend process without blocking the UI thread.
- **`reqwest` (0.11)**: Used for native-side HTTP requests, specifically supporting `json` and `stream` features for communicating with local/remote LLM providers.
- **`tokio-util` & `futures-util`**: Utility crates for managing async I/O and stream processing.

### Feature Flags (Lines 21-23)

- **`custom-protocol`**: Enabled by default to allow production builds to serve frontend assets via a secure internal protocol rather than a local web server.

---

## Connection & Dependencies

- **tauri.conf.json**: The `allowlist` settings in the JSON config determine which parts of the `tauri` crate's `api-all` feature are actually accessible to the frontend.
- **main.rs**: Imports the types and macros defined by these dependencies (especially `tauri`, `tokio`, and `serde`).
- **Cargo.lock**: Ensures reproducible builds by pinning the exact versions of all transitive dependencies.
