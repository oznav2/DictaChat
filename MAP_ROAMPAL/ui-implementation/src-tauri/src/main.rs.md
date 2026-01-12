# main.rs - Map

## Summary

`main.rs` is the Rust entry point for the RoamPal desktop application. It manages the core lifecycle of the application, including UI window initialization, background process management (Python backend), and the implementation of native "Invokable" commands that give the frontend access to the OS (filesystem, Git, VS Code integration). It also handles a headless "MCP Mode" for tool-use by other AI agents.

---

## Technical Map

### Core Structures & State

- **`FileContent`**: Serialized structure for filesystem operations (`path`, `content`).
- **`BackendProcess`**: A thread-safe `Arc<Mutex<Option<Child>>>` that stores the handle to the Python backend process.

### Tauri Commands (The Bridge)

#### Filesystem & Tools

- **`read_file` / `write_file` / `list_files`**: Direct standard library (`std::fs`) wrappers for secure local file manipulation.
- **`open_in_vscode` / `open_folder_in_vscode`**: Platform-specific logic to launch VS Code via `Command::new("code")`.
- **`run_git_command`**: Executes native `git` binaries and returns `stdout`/`stderr` as strings.

#### AI & Streaming

- **`stream_llm_response`**: Native implementation of Token-by-Token streaming from a local Ollama instance (`localhost:11434`). Uses `tokio` for non-blocking I/O and `window.emit` to push chunks to the frontend.

#### Process Management

- **`start_backend`**: The primary bootstrapper for the Python backend.
  - **Logic**: Locates the bundled `python.exe` and `main.py`, reads `.env` for ports, and spawns the process with `CREATE_NO_WINDOW` (on Windows).
  - **Self-Healing (v0.2.9)**: Detects if the backend port is already in use (e.g., after a UI refresh) to avoid redundant startup cycles.
- **`check_backend`**: Pings the backend's `/health` endpoint to verify status.
- **`exit_app`**: Formally kills the Python child process and exits the Tauri runtime.

### Logic Flows

#### Application Lifecycle (Lines 421-482)

- **Startup**: Checks for `--mcp` flag first. If absent, initializes the Tauri Builder.
- **Setup**: Configures window dimensions (1400x900) and sets up a `WindowEvent::Destroyed` listener to ensure the backend process is cleaned up if the app is force-quit.
- **Persistence (v0.2.8)**: The standard "X" Close button no longer kills the backend, allowing for faster re-opens. Clean shutdown is delegated to the `exit_app` command.

#### MCP Mode (Lines 357-419)

- If launched with `--mcp`, the app bypasses the GUI entirely and executes `run_mcp_backend()`.
- **Protocol**: Signals the Python backend to start in MCP mode (`--mcp` argument), enabling standard I/O pipes for JSON-RPC communication with agents like Claude.

---

## Connection & Dependencies

- **Tauri Config**: Determines available permissions for these commands.
- **Frontend (roampal.ts)**: Invokes these commands using the `tauri.invoke` bridge.
- **Python Backend (main.py)**: Spawned and managed as a child process by this file.
- **Ollama**: External dependency for `stream_llm_response`.
