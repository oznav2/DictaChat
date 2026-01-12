# ConnectedChat.tsx - Map

## Summary

`ConnectedChat.tsx` is the primary orchestrator for the RoamPal workspace. It combines the chat interface, session history (left sidebar), memory panel (right sidebar), and an extensive model management system. It acts as the bridge between the individual UI components and the Python backend, handling complex tasks like parallel memory collection fetching, real-time model installation progress via Server-Sent Events (SSE), and synchronization of model/provider states. It also manages the application's boot sequence, environment-aware features (Tauri vs Web), and UI layout through resizable split panes.

---

## Technical Map

### Core Dependencies

- **State**: `useChatStore` (Zustand) for global messages, sessions, and processing status.
- **Hooks**: `useSplitPane` (layout), `useBackendAutoStart` (init).
- **Communication**: `apiFetch` (HTTP), custom SSE reader (for model downloads).
- **Components**: `Sidebar`, `TerminalMessageThread`, `ConnectedCommandInput`, `MemoryPanelV2`, `BookProcessorModal`, `SettingsModal`, `OllamaRequiredModal`, `PersonalityCustomizer`, `MemoryStatsPanel`.

### State Management & Refs

- **Model Hooks (Lines 66-124)**: Manages `selectedModel`, `availableModels`, `installedModelsMetadata`, and provider states (`ollama`, `lmstudio`).
- **GPU & Quantization (Lines 90-112)**: Tracks `gpuInfo` and available quantization levels for optimized local inference.
- **Sidebar Layout (Lines 1269-1330)**: Managed through `useSplitPane` hooks for both left and right panes, with `inverted` logic for the right sidebar.
- **Memory Local State (Lines 1218-1224)**: Caches `localMemories` and `knowledgeGraphData` for the right panel.
- **Refs**: `messagesContainerRef` (scrolling), `titleRegenerationTriggered` (preventing redundant API calls).

### Key Workflows

#### Model Discovery & Selection (Lines 242-458)

- **`fetchModels()`**: Batch queries `${ROAMPAL_CONFIG.apiUrl}/api/model/available`.
- **`fetchCurrentModel()`**: Syncs active model and provider from the backend source of truth.
- **`switchModel()`**: Triggers `/api/model/switch`. Includes logic to warn the user if switching mid-conversation (Line 386).

#### Model Installation (Lines 604-937)

- **SSE Streaming (Lines 830-907)**: Uses `reader.read()` to parse incremental JSON pulses (`type: 'progress'`) containing download percentage, speed, and size.
- **Auto-Switch**: If the user installs their first chat-capable model, the system automatically performs a model switch (Line 871).

#### Memory Ingestion & Visualization (Lines 1469-1708)

- **Parallel Fetches (Line 1568)**: Concurrently fetches fragments from 'working', 'history', and 'patterns' collections to minimize latency.
- **Lazy Load Knowledge Graph**: The KG API is only called the first time the right pane is opened (`kgHasLoaded` flag).
- **Event Listeners**: Refreshes UI on `memoryUpdated` (broadcast by `BookProcessorModal`).

#### Session Title Generation (Lines 1506-1552)

- Subscribes to store changes. If a session is "Untitled" and has >= 2 messages, it triggers a background POST to `/api/chat/generate-title` using the first 4 messages as context.

### UI Structure (Return JSX)

- **Main Container**: Flexbox h-screen layout.
- **Header (Lines 1821-1859)**: Contains the Roampal logo (SVG), title, and `ConnectionStatus`.
- **Left Pane (Lines 1864-1895)**: Renders `Sidebar` with draggable resize handle.
- **Main Main (Lines 1913-2229)**:
  - Sub-header with Provider and Model dropdowns.
  - Message Area: Three-way switch (Loading → No Models Installed → `TerminalMessageThread`).
  - Input: `ConnectedCommandInput`.
- **Right Pane (Lines 2248-2274)**: Renders `MemoryPanelV2` for RAG insights.
- **Modals Overlay (Lines 2279-3186)**: Large stack of conditional modals for settings, book processing, personality, and model installation confirmation.

---

## Connection & Dependencies

- **useChatStore.ts**: The data backbone for all messages and session persistence.
- **modelContextService.ts**: Queries for hardware-specific token limits.
- **useSplitPane.ts**: Controls the draggable UI interaction.
- **Backend API**: Deeply integrated with `/api/model/*`, `/api/memory/*`, and `/api/chat/generate-title`.
- **window.dispatchEvent**: Used to broadcast `modelChanged` and list `memoryUpdated` events.
