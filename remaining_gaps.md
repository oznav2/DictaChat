# Remaining Gaps (Implementation Guide)

This file is a step-by-step “how to implement safely” guide for the remaining gaps. It is written to avoid reintroducing problems Roampal already solved in its latest code structure.

**Sources of truth**

- BricksLLM backlog (what is still not done): [roampal_gaps.md](file:///home/ilan/BricksLLM/frontend-huggingface/roampal_gaps.md)
- Roampal reference implementation (cloned locally): `SRC_ROAMPAL/` at [SRC_ROAMPAL](file:///home/ilan/BricksLLM/SRC_ROAMPAL)
- BricksLLM project snapshot: [STATUS.md](file:///home/ilan/BricksLLM/STATUS.md)

## Ground Rules (Non‑Regression)

When implementing any item below:

- Prefer additive changes (new fields/endpoints) over breaking JSON shapes.
- Preserve session/user scoping rules (BricksLLM uses `ADMIN_USER_ID` in some routes; do not expand scope accidentally).
- Avoid N+1 database patterns in any polling endpoint.
- Any “batching/debounce” must be last-write-wins and must never drop writes.
- Keep long-running operations bounded and resilient (timeouts, batching, progress feedback).

## Roampal UI + Backend Index (What to Look At)

Roampal “UI implementation” lives under:

- `SRC_ROAMPAL/ui-implementation/src/*` (React/TS)
- `SRC_ROAMPAL/ui-implementation/src-tauri/backend/*` (FastAPI/Python)

**Exported symbols by file (auto-extracted)**

Use this list to find the correct reference file quickly:

```
components/BookProcessorModal.tsx       BookProcessorModal
components/CodeBlock.tsx               CodeBlock
components/CodeChangePreview.tsx       CodeChangePreview
components/CommandInput.tsx            CommandInput
components/ConnectedChat.tsx           ConnectedChat
components/ConnectedCommandInput.tsx   ConnectedCommandInput
components/ConnectionStatus.tsx        ConnectionStatus
components/ContextBar.tsx              ContextBar
components/ContextIndicator.tsx        ContextIndicator
components/ConversationBadges.tsx      ConversationBadges
components/DataManagementModal.tsx     DataManagementModal
components/DeleteConfirmationModal.tsx DeleteConfirmationModal
components/DeleteSessionModal.tsx      DeleteSessionModal
components/DevPanel.tsx                DevPanel
components/EnhancedChatMessage.tsx     EnhancedChatMessage
components/EnhancedMessageDisplay.tsx  EnhancedMessageDisplay
components/ExportModal.tsx             ExportModal
components/FragmentBadges.tsx          FragmentBadges
components/IntegrationsPanel.tsx       IntegrationsPanel
components/KnowledgeGraph.tsx          KnowledgeGraph
components/MCPServersPanel.tsx         MCPServersPanel
components/MemoryBankModal.tsx         MemoryBankModal
components/MemoryCitation.tsx          MemoryCitation
components/MemoryPanelV2.tsx           MemoryPanelV2
components/MemoryStatsPanel.tsx        MemoryStatsPanel
components/MessageGroup.tsx            MessageGroup
components/MessageThread.tsx           MessageThread
components/ModelContextSettings.tsx    ModelContextSettings
components/OllamaRequiredModal.tsx     OllamaRequiredModal
components/PersonalityCustomizer.tsx   PersonalityCustomizer
components/SettingsModal.tsx           SettingsModal
components/Sidebar.tsx                 Sidebar
components/TerminalMessageThread.tsx   TerminalMessageThread
components/Toast.tsx                   Toast
components/ToolExecutionDisplay.tsx    ToolExecutionDisplay
components/UpdateBanner.tsx            UpdateBanner
config/roampal.ts                      ROAMPAL_CONFIG, useTauri
hooks/useBackendAutoStart.ts           useBackendAutoStart
hooks/useSplitPane.ts                  useSplitPane
hooks/useUpdateChecker.ts              useUpdateChecker
lib/roampalClient/RoampalClient.ts     RoampalClient, getRoampalClient
lib/roampalClient/schemas.ts           WS/REST schemas + validators
services/modelContextService.ts        modelContextService
stores/useChatStore.ts                 useChatStore
stores/usePreferenceStore.ts           usePreferenceStore
utils/fetch.ts                         apiFetch
utils/migrateLegacyStorage.ts          migrateLegacyStorage
utils/fileUpload.ts                    upload helpers
utils/tauriEvents.ts                   setupTauri event listeners
```

## Gap-by-Gap Implementation Instructions

### 9) KG query modes (routing | content | both)
### 10) Context‑action effectiveness rollups (action KG summaries)
### 11) O(m) entity merge optimization + problem→solution tracking improvements

**Roampal reference**

- O(m) precompute for routing relationships (v0.2.11 fix):
  - [knowledge_graph_service.py](file:///home/ilan/BricksLLM/SRC_ROAMPAL/ui-implementation/src-tauri/backend/modules/memory/knowledge_graph_service.py#L739-L756)
- Problem→solution tracking:
  - [track_problem_solution](file:///home/ilan/BricksLLM/SRC_ROAMPAL/ui-implementation/src-tauri/backend/modules/memory/knowledge_graph_service.py#L549-L622)
  - [find_known_solutions](file:///home/ilan/BricksLLM/SRC_ROAMPAL/ui-implementation/src-tauri/backend/modules/memory/knowledge_graph_service.py#L473-L548)

### 12) Tests / Observability
