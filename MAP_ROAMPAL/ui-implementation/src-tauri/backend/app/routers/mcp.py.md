# mcp.py (routers) - Map

## Summary

`mcp.py` is the "RoamPal-as-a-Server" orchestrator. Its primary purpose is to auto-detect other AI tools on the user's system (like Claude Desktop, Cursor, or VS Code) and provide a one-click integration to expose RoamPal's memory system as an MCP (Model Context Protocol) server to those tools. This allows users to access their RoamPal memory bank directly from within other primary AI interfaces.

---

## Technical Map

### Auto-Detection Logic (`scan_for_mcp_tools`)

- **Config Scanning (Lines 200-391)**: Performs a cross-platform scan of home directories, `AppData`, `Library/Application Support`, and `.config` folders to find known MCP configuration files (e.g., `claude_desktop_config.json`, `config.json`).
- **Priority Scoring (Lines 241-271)**: Implements a heuristic-based priority system to distinguish between official MCP configs and generic UI settings files, ensuring the correct file is targeted for integration.
- **Claude Desktop Migration (Lines 150-197)**: Includes specialized logic to detect and fix common setup errors in Claude Desktop where MCP configurations are occasionally saved to the wrong JSON file.

### Integration Engine (`connect` / `disconnect`)

- **RoamPal Executable Detection (Lines 56-121)**: Dynamically determines the correct command to launch RoamPal in headless MCP mode (`--mcp`). It accounts for bundled executables (`Roampal.exe`, `.app` bundles) and development Python environments.
- **Config Injection (Lines 395-466)**: Atomically updates third-party JSON configuration files to add or remove the `roampal` entry under the `mcpServers` key.
- **Custom Path Persistence (Lines 125-148)**: Manages a local `mcp_custom_paths.json` file to track user-added configuration locations that fall outside the standard search directories.

### Security and Validation

- **Path Traversal Protection (Lines 400-412)**: Enforces strict path resolution and ensures that any configuration file being modified resides within the user's home directory.
- **Platform Specifics**: Handles differences in directory structures and executable extensions across Windows, macOS, and Linux.

---

## Connection & Dependencies

- **RoamPal Core**: The router configures external tools to call RoamPal with the `--mcp` flag, which triggers the internal MCP server implementation in the main application entry point.
- **Claude Desktop / Cursor / VS Code**: The primary "clients" that this router targets for integration.
- **mcp_servers.py (Counterpart)**: While `mcp.py` makes RoamPal a _server_ for others, `mcp_servers.py` manages RoamPal as a _client_ connecting to other servers.
- **Settings/Paths**: Uses `DATA_PATH` from `config.settings` to store its own state.
