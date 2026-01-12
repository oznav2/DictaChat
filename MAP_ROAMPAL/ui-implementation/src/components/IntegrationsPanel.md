# IntegrationsPanel.tsx - Map

## Summary

`IntegrationsPanel.tsx` is the interface for managing Model Context Protocol (MCP) tool integrations. It allows RoamPal to connect its local memory to compatible external tools. The panel supports automated scanning for local tools, connecting/disconnecting via config paths, manual path entry for custom clients, and a local "hiding" mechanism to declutter the tool list.

---

## Technical Map

### Component Props (`IntegrationsPanelProps`)

- `isOpen`: Controls visibility.
- `onClose`: Callback to dismiss the panel.

### State & Workflows

#### Tool Discovery (Lines 56-69)

- **Scanning**: Hits `GET /api/mcp/scan` on mount or manual refresh. Returns a list of `MCPTool` objects.
- **Filtering**: Maintains a `hiddenTools` list in `localStorage`. Tools can be moved to a "Discover More" section to keep the main list clean.

#### Connection Management (Lines 71-121)

- **Connect**: Hits `POST /api/mcp/connect` with a `config_path`. Shows a success toast on completion and triggers a re-scan.
- **Disconnect**: Hits `POST /api/mcp/disconnect`.
- **Custom Path**: Opens a secondary modal layer (Lines 376-417) where users can manually type a filesystem path to a tool configuration.

### UI Structure

- **Toast Integration (Lines 169-175)**: Uses the `Toast` component for transient success/error messages.
- **Header**: Centered title with an "Integrations" subtitle.
- **Action Bar (Lines 204-213)**: Simple "Refresh" button for manual re-scanning.
- **Main List (Lines 240-286)**:
  - **Status Indicator**: Full-circle colored dots (Green = Connected, Yellow = Available, Zinc = Not Installed).
  - **Tool Details**: Name and current status text.
  - **Actions**: Dynamic "Connect" (Blue) or "Disconnect" (Zinc) buttons, plus an "Eye-slash" icon to hide the tool.
- **Discover More (Lines 290-338)**: An accordion-style section at the bottom for un-hiding tools.
- **Add Custom (Lines 343-353)**: A large button at the bottom to trigger the manual path entry flow.
- **Educational Box (Lines 356-370)**: Blue information card explaining local-first privacy and reactivation steps.

---

## Connection & Dependencies

- **Toast.tsx**: For feedback messages.
- **apiFetch.ts**: For MCP control operations.
- **localStorage**: Persists user preferences for hidden tools.
- **Backend API**:
  - `/api/mcp/scan`
  - `/api/mcp/connect`
  - `/api/mcp/disconnect`
