# build.rs - Map

## Summary

`build.rs` is a standard Rust build script that runs before the main compilation stage. In a Tauri project, its primary function is to invoke the `tauri_build` macro, which compiles high-level configurations into low-level Rust code and bundles assets for the target operating system.

---

## Technical Map

### Logic (Lines 1-3)

- Executes `tauri_build::build()`.
- **Purpose**:
  1. Parses `tauri.conf.json`.
  2. Generates the necessary boilerplate for IPC (Inter-Process Communication).
  3. Handles the inclusion of icons and desktop-specific metadata for the final binary.

---

## Connection & Dependencies

- **tauri-build (Cargo.toml)**: The build-time dependency providing the logic for this script.
- **tauri.conf.json**: The source of truth for the configurations processed by this script.
