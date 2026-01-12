# mcp_servers.py (routers) - Map

## Summary

`mcp_servers.py` is the management API for RoamPal's Model Context Protocol (MCP) integrations. It provides endpoints for users to configure, monitor, and troubleshoot external tool servers (e.g., Google Search, Brave, or local script runners). The router acts as a bridge to the `mcp_manager` state, allowing the UI to dynamically add new tool capabilities at runtime without restarting the backend.

---

## Technical Map

### Server Lifecycle (Lines 26-131)

- **`GET /servers`**: Returns a status array of all configured servers, including their connection health (Connected/Error), command line arguments, and environment variables.
- **`POST /servers`**: registers a new MCP server. Expects a `command` (e.g., `npx`), `args` (e.g., `github-mcp-server`), and optional `env` variables (e.g., API keys).
- **`toggle_server`**: allows soft-disabling a tool server without deleting its configuration.
- **`test_connection` & `reconnect_server`**: diagnostic tools that attempt to shake hands with the external process and refresh the tool schema if the server crashed.

### Tool Discovery (Lines 134-157)

- **`GET /tools`**: Aggregates every individual tool exposed by all _active_ MCP servers. It returns the prefixed `name` (to avoid collisions) and the human-readable `description` that the agent uses to decide when to call the tool.
- **`GET /popular`**: Returns a curated list of "Quick Setup" servers defined in the backend config to help users find common integrations.

---

## Connection & Dependencies

- **mcp_manager (App State)**: the stateful manager instance (defined in `modules.mcp_client`) that handles the actual `stdio` sub-processes and JSON-RPC communication.
- **AgentChatService.py**: uses the tools registered via this router to build the available function list for the LLM.
- **MCPManagerV2 (Frontend)**: The UI component that displays the server list and provides the "Add Server" form.
