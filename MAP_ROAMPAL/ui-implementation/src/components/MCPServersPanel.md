# MCPServersPanel.tsx - Map

## Summary

`MCPServersPanel.tsx` is the management console for Model Context Protocol (MCP) servers. Unlike higher-level integrations, this panel controls individual server processes (e.g., filesystem, git, or memory servers) that RoamPal executes. It allows users to add custom servers by defining commands and arguments, monitor server status, and quickly deploy "popular" pre-configured servers.

---

## Technical Map

### Component Props (`MCPServersPanelProps`)

- `isOpen`: Controls visibility.
- `onClose`: Callback to dismiss the panel.

### State & Workflows

#### Server Management (Lines 51-205)

- **Fetching**: Hits `GET /api/mcp/servers` on mount to get current status and configuration.
- **Popular Servers**: Hits `GET /api/mcp/popular` to retrieve a list of curated MCP server templates.
- **Add Server**: Hits `POST /api/mcp/servers` with `name`, `command`, and `args` (parsed from string to array).
- **Remove Server**: Hits `DELETE /api/mcp/servers/{name}`.
- **Lifecycle Operations**:
  - `handleTestConnection`: Pings the server process to verify it's responsive.
  - `handleReconnect`: Restarts the server process if it has crashed or disconnected.

#### Data Structures (`MCPServer`)

- `status`: One of `connected` (Green), `disconnected` (Yellow), or `error` (Red).
- `toolCount`: Number of specific tools exposed by the server.
- `lastError`: Captured stderr or connection error message.

### UI Structure

- **Header**: Standard title/subtitle for MCP server management.
- **Configured Servers (Lines 257-330)**:
  - Each server row shows a status dot, tool count, and action buttons.
  - Responsive buttons switch between "Test" (for connected servers) and "Reconnect" (for failed servers).
  - Trash icon for removal.
- **Popular Servers (Lines 333-364)**: A 2-column grid of "Quick Add" cards for common servers.
- **Add Custom (Lines 367-377)**: Modal-triggering button for manual configuration.
- **Educational Information (Lines 380-394)**: Purple background info box explaining how servers work as separate processes.

---

## Connection & Dependencies

- **Toast.tsx**: Used for notifications on server lifecycle events.
- **apiFetch.ts**: Standard backend wrapper.
- **Backend API**:
  - `/api/mcp/servers` (GET/POST/DELETE)
  - `/api/mcp/servers/{name}/test` (POST)
  - `/api/mcp/servers/{name}/reconnect` (POST)
  - `/api/mcp/popular` (GET)
