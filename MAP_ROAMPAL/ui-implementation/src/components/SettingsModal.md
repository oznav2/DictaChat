# SettingsModal.tsx - Map

## Summary

`SettingsModal.tsx` is the central administrative hub for RoamPal. It provides a organized list of links to specialized configuration sub-modals (Memory Bank, Model Context, Integrations, MCP Servers, and Data Management). It also serves as a diagnostic dashboard, showing the real-time status and model counts for detected LLM providers (Ollama/LM Studio) and facilitating a clean shutdown of the application.

---

## Technical Map

### Component Props (`SettingsModalProps`)

- `isOpen`: Controls visibility.
- `onClose`: Callback to dismiss the main hub.
- `initialTab`: (Optional) Can be set to `'integrations'` to immediately trigger the sub-panel upon opening.

### State & Orchestration

#### Detected Infrastructure (Lines 36-65)

- **Current Model**: Hits `GET /api/model/current` to identify the active LLM.
- **Provider Detection**: Hits `GET /api/model/providers/detect` to show which backends are online and how many models they offer.

#### Sub-Modal Matrix (Lines 18-22, 243-272)

Manages the visibility of the internal modal stack:

- `MemoryBankModal`: For permanent context management.
- `ModelContextSettings`: For token window tuning.
- `IntegrationsPanel`: For higher-level tool connections.
- `MCPServersPanel`: For individual server process control.
- `DataManagementModal`: For exports, pings, and database purges.

### UI Structure

#### Providers Status (Lines 116-139)

- Displays small green-dotted badges for each active provider (Ollama, LM Studio) with a model count.

#### Action List (Lines 142-205)

- Color-coded icon buttons for each sub-system:
  - **Cyan**: Memory Bank.
  - **Purple**: Model Context.
  - **Green**: Integrations.
  - **Orange**: MCP Tool Servers.
  - **Coming Soon**: Voice Settings (Disabled placeholder).

#### Utility Actions (Lines 208-237)

- **Data Management (Blue)**: Primary system-wide operations.
- **Exit Roampal (Red)**: Triggers a Tauri-exclusive `exit_app` command for a graceful desktop shutdown.

---

## Connection & Dependencies

- **Tauri API**: Uses `invoke('exit_app')` for native OS interaction.
- **apiFetch.ts**: For infra detection.
- **All sub-modal components**: MemoryBank, Integrations, DataManagement, etc.
- **Sidebar.tsx**: Typically triggers this modal from the bottom settings cog.
