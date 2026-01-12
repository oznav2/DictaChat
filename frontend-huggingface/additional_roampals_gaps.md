# Additional Roampal Parity Gaps Analysis

This document identifies deep logic, architectural, and wiring gaps discovered during a systematic comparison of the local BricksLLM codebase against the Roampal repository. These items are **in addition** to those already listed in `roampal_gaps.md`.

---

## Executive Summary (What roampal_gaps.md missed)

The existing `roampal_gaps.md` focuses primarily on component-by-component UI parity and some memory API/graph differences. After reading Roampal’s full `ui-implementation/src` (58 files), there are several **non-obvious wiring/architecture layers** that Roampal relies on which are not reflected in the current gap list:

- A dedicated “backend SDK” abstraction (type validation, retries, idempotency keys, transport fallbacks)
- A specific “chat + tool streaming event model” (WebSocket message schema + chronological interleaving timeline)
- Cross-component “event bus” via `window.dispatchEvent(...)` for memory refresh and action status updates
- A completely different “Books” ingestion API surface (`/api/book-upload/*` with WS progress), including richer file-type support
- Local persistence and migration concerns (active conversation persistence + localStorage migration)
- Model/provider management and context-window configuration endpoints that Roampal UI expects (many `/api/model/*` endpoints)
- Optional but first-class “shards” concept (endpoints in config + UI stubs), which isn’t represented in current parity docs

---

## Additional Gaps (Not in roampal_gaps.md)

### Gap B: Roampal’s Chat Runtime Has a Specific Streaming/Event Contract

**Roampal references:**

- [useChatStore.ts](file:///tmp/roampal_repo/ui-implementation/src/stores/useChatStore.ts#L359-L918)

**Roampal’s key behaviors (not captured by current parity docs):**

- WebSocket endpoint per conversation: `ws://.../ws/conversation/{conversationId}` with handshake + 30s ping heartbeat.
- Message types beyond “token streaming”: `action-status-update`, `action_status`, `tool_start`, `tool_complete`, `stream_start`, `stream_complete`, `validation_error`, `memory_update`, etc.
- A “chronological interleaving timeline” stored on the assistant message (`events`) that captures text segments and tool executions in time order (needed for Roampal’s interleaved tool/response display).
- Dual-mode generation: prefers WebSocket streaming, but includes polling fallback (`/api/agent/stream`, `/api/agent/progress/{id}`) and cancellation (`/api/agent/cancel/{id}`).

**What’s missing in BricksLLM (as a Roampal-parity surface):**

- No equivalent WebSocket event schema and message timeline model in the UI layer.
- No explicit “tool execution timeline” data model that can preserve partial text segments before/after tool calls (Roampal treats this as a first-class rendering primitive).
- No explicit UI-driven cancel flow that talks to an agent task endpoint (Roampal cancels both client-side and backend task).

**Why it matters:**
Roampal’s “transparency” UX is not just `<think>` display; it’s a structured event stream that drives UI state. If your goal is “same level of production UX,” you’ll need comparable event modeling and wiring.

---

### Gap C: Roampal Uses a Global UI Event Bus for Memory + Action Updates

**Roampal references:**

- `memoryUpdated` events fired from book ingestion and stream completion:
  - [BookProcessorModal.tsx](file:///tmp/roampal_repo/ui-implementation/src/components/BookProcessorModal.tsx#L126-L130)
  - [useChatStore.ts](file:///tmp/roampal_repo/ui-implementation/src/stores/useChatStore.ts#L806-L813)
- Action + explanation events:
  - [useChatStore.ts](file:///tmp/roampal_repo/ui-implementation/src/stores/useChatStore.ts#L419-L446)

**What’s missing in BricksLLM:**

- No evidence of `window.dispatchEvent(new CustomEvent('memoryUpdated'|...))` patterns to decouple producers (chat/books/tools) from consumers (memory panel, stats, etc.).

**Why it matters:**
Roampal’s UI does not rely solely on “shared store state” to trigger refreshes. If BricksLLM’s memory panels don’t subscribe to a comparable cross-cutting signal, some backend actions can become “buried” (implemented but not visible), especially for background ingestion jobs.

---

### Gap D: Books Ingestion API Surface Is Different (and More Complex)

**Roampal references:**

- Books API usage: [BookProcessorModal.tsx](file:///tmp/roampal_repo/ui-implementation/src/components/BookProcessorModal.tsx#L84-L272)
- Upload utilities: [fileUpload.ts](file:///tmp/roampal_repo/ui-implementation/src/utils/fileUpload.ts#L20-L107)

**What Roampal expects:**

- REST endpoints under `/api/book-upload/*` (not `/api/memory/books/*`):
  - `GET /api/book-upload/books` (list library)
  - `DELETE /api/book-upload/books/{bookId}` (delete from library)
  - `WS /api/book-upload/ws/progress/{taskId}` (processing progress via WebSocket)
- “Book processing” is an async pipeline with server-pushed progress, reconnection logic, and a 5-minute timeout guard.
- File type support appears broader in the UI than a minimal txt/md pipeline (the modal allows `.pdf`, `.docx`, `.xlsx`, `.csv`, `.html`, `.rtf`, etc.).

**What’s missing in BricksLLM (relative to Roampal UI contract):**

- No `/api/book-upload/*` compatibility layer.
- No WebSocket progress channel for ingestion jobs (Roampal’s modal assumes push updates and reconnection).
- No explicit library management behaviors matched to Roampal’s contract (delete → triggers memory refresh event).

**Why it matters:**
Even if “books exist” in BricksLLM, the **wiring model** (async job + WS progress + library management + refresh triggers) is part of Roampal’s production UX and is currently not represented in the parity list.

---

### Gap E: A Large Model/Provider Management Surface Exists in Roampal UI

**Roampal references:**

- Model context window service: [modelContextService.ts](file:///tmp/roampal_repo/ui-implementation/src/services/modelContextService.ts#L1-L225)
- Model/provider management embedded in chat shell: [ConnectedChat.tsx](file:///tmp/roampal_repo/ui-implementation/src/components/ConnectedChat.tsx#L65-L241)

**What Roampal expects (examples of endpoints used):**

- `/api/model/available`, `/api/model/current`, `/api/model/registry?tool_capable_only=true`
- Provider status: `/api/model/ollama/status`, `/api/model/lmstudio/status`
- GPU + quantization UX: `/api/model/gpu`, `/api/model/{model}/quantizations`
- Context windows: `GET /api/model/contexts`, `GET/POST/DELETE /api/model/context/{model}`

**What’s missing in BricksLLM:**

- No equivalent Roampal-style model management API surface and corresponding UI wiring inside the “chat shell.”

**Why it matters:**
Roampal treats “tool-capable model selection” and “context window override” as first-class, user-facing configuration that impacts memory/tool workflows. Parity requires aligning not just the settings UI, but the backend capabilities and the “source of truth” sync patterns.

---

### Gap F: Roampal Has Client-Side Persistence + Migration Logic Beyond “Just localStorage”

**Roampal references:**

- Active conversation persistence: [useChatStore.ts](file:///tmp/roampal_repo/ui-implementation/src/stores/useChatStore.ts#L10-L12) and [useChatStore.ts](file:///tmp/roampal_repo/ui-implementation/src/stores/useChatStore.ts#L337-L339)
- Storage migration: [migrateLegacyStorage.ts](file:///tmp/roampal_repo/ui-implementation/src/utils/migrateLegacyStorage.ts#L1-L77)
- Transparency preferences store: [usePreferenceStore.ts](file:///tmp/roampal_repo/ui-implementation/src/stores/usePreferenceStore.ts#L1-L72)
- Split pane persistence: [useSplitPane.ts](file:///tmp/roampal_repo/ui-implementation/src/hooks/useSplitPane.ts#L13-L110)

**What’s missing in BricksLLM:**

- No explicit localStorage migration step to keep older clients working after schema changes.
- No direct equivalent of Roampal’s “transparency preferences” persistence as a stable UI contract.
- No explicit persisted split-pane state (if you want layout parity with Roampal’s resizable panels).

**Why it matters:**
Roampal’s UX assumes persistent settings and safe upgrades. If BricksLLM’s memory UI evolves rapidly, missing migration logic can quietly break “production-ready” user experience (especially for local-first apps).

---

### Gap G: Roampal Has an Explicit “Backend SDK” Layer (Retries + Idempotency + Schema Validation)

**Roampal references:**

- [RoampalClient.ts](file:///tmp/roampal_repo/ui-implementation/src/lib/roampalClient/RoampalClient.ts#L18-L101)
- [schemas.ts](file:///tmp/roampal_repo/ui-implementation/src/lib/roampalClient/schemas.ts#L1-L128)

**What Roampal implements:**

- Request idempotency keys (`X-Idempotency-Key`) for safer retries.
- Exponential backoff with jitter.
- Response schema validation with Zod + defaulting to “sensible contract.”
- Mock-mode fallback when health checks fail.
- Transport abstraction (WS vs SSE).

**What’s missing in BricksLLM:**

- No equivalent “client contract enforcement” layer for memory/tool endpoints (typed validation + safe defaults + retry/idempotency strategy).

**Why it matters:**
This is one of the main “production hardening” layers that prevents subtle UI breakage when backend responses shift. Roampal’s UI is defensive at the contract boundary, not inside components.

---

### Gap H: “Shards” Are a First-Class Concept in Roampal Config (Even If UI Uses Stubs)

**Roampal references:**

- Shard endpoints in config: [roampal.ts](file:///tmp/roampal_repo/ui-implementation/src/config/roampal.ts#L23-L34)
- Shard modals referenced in shell: [ConnectedChat.tsx](file:///tmp/roampal_repo/ui-implementation/src/components/ConnectedChat.tsx#L17-L21)

**What’s missing in BricksLLM:**

- No equivalent notion of “memory/chat shards” with list/switch endpoints and UI affordances.

**Why it matters:**
If your parity target includes Roampal’s “multiple shard” workflow (different memory spaces / personas / projects), BricksLLM needs an explicit model for it (data + UI + routing).

---

### Gap I: Roampal Assumes MCP Auto-Discovery + Connect/Disconnect by Config Path

**Roampal references:**

- MCP scan/connect/disconnect UI: [IntegrationsPanel.tsx](file:///tmp/roampal_repo/ui-implementation/src/components/IntegrationsPanel.tsx#L56-L121)

**What Roampal expects:**

- `/api/mcp/scan` to discover MCP-compatible tools
- `/api/mcp/connect` and `/api/mcp/disconnect` that take a `config_path`
- Per-tool hide/unhide state persisted in localStorage (`hiddenMCPTools`)

**What’s missing in BricksLLM:**

- BricksLLM manages MCP servers directly (manual add/select) and does not expose Roampal-style “scan local configs” or “connect by config_path” flows.

**Why it matters:**
Roampal’s UX makes MCP onboarding and tool discovery mostly automatic. If parity is required, BricksLLM needs either equivalent discovery APIs or a deliberate alternative UX that reaches the same “it just works” outcome.

---
