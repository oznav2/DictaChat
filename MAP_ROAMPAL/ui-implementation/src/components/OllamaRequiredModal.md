# OllamaRequiredModal.tsx - Map

## Summary

`OllamaRequiredModal.tsx` is the primary onboarding interface for RoamPal. It serves as a "welcome" screen that guides users through the initial setup of local LLM providers (Ollama, LM Studio) and explains the Model Context Protocol (MCP) integration capabilities. It functions as a blocking modal to ensure the core local-first infrastructure is ready before user interaction.

---

## Technical Map

### Component Props (`OllamaRequiredModalProps`)

- `isOpen`: Controls visibility.
- `onClose`: Callback to dismiss the modal (labeled "Get Started").
- `onOpenIntegrations`: (Optional) Redirects the user to the MCP setup panel.

### State & Workflows

#### Setup Tabs (Line 11, 30-51)

- **`llm` (Default)**: Focuses on local inference hardware.
- **`mcp`**: Explains the protocol and how to bridge memory to other tools (Claude, Cursor, etc.).

#### Universal Navigation (Lines 15-22)

- Uses `@tauri-apps/api/shell`'s `open` function to launch system browser links for downloads.
- **Fallback**: Drains to `window.open` if the Tauri API is unavailable.

### UI Structure

#### LLM Setup View (Lines 54-105)

- **Provider Comparison**: Recommends Ollama for zero-config vs. LM Studio for advanced control.
- **Value Proposition**: Explicitly mentions offline execution, privacy, and free/open-source nature.
- **Download Buttons**: High-contrast buttons linking directly to Ollama and LM Studio websites.

#### MCP Integration View (Lines 108-175)

- **Explanation**: Defines MCP as a "universal standard" for cross-tool memory access.
- **Step-by-Step Guide**: Instructions for scanning and connecting tools.
- **Compatibility List**: Mentions Claude Desktop, Cursor, Continue.dev, and Cline explicitly as primary use cases.
- **Pro Tip**: Explains real-time memory syncing across all client tools.

#### Onboarding Completion (Lines 178-183)

- A persistent green "Get Started" button at the bottom of the modal, regardless of which tab is active.

---

## Connection & Dependencies

- **Tauri Shell API**: For launching web links.
- **ConnectedChat.tsx**: Typically triggers this modal upon detecting a missing local server connection.
- **IntegrationsPanel.tsx**: Referenced as the destination for the "Open Integrations Settings" button.
