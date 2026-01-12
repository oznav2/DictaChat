# RoampalClient.ts - Map

## Summary

`RoampalClient.ts` is a type-safe SDK class that encapsulates all communication between the RoamPal UI and its Python backend. it handles multiple transport protocols (REST, WebSocket, SSE), implements complex error recovery (exponential backoff, idempotency keys), and features a robust "Mock Mode" for development or backend-offline scenarios. It serves as the single point of entry for chat, memory management, and shard switching.

---

## Technical Map

### Core Capabilities

#### Transport Orchestration (Lines 183-298)

- **Hybrid Streaming**: Supports both WebSocket (`ws`) and Server-Sent Events (`sse`) for real-time response generation.
  - **WebSocket**: bidirectional, used for complex tool-interactive sessions.
  - **SSE**: unidirectional, used as a lightweight fallback for standard token-by-token streaming.
- **Auto-Selection**: Toggles transport based on `ROAMPAL_CONFIG.TRANSPORT`.

#### Resilience & Reliability (Lines 39-101)

- **Idempotency**: Generates unique keys for every write request (`X-Idempotency-Key`) to prevent duplicate memory entries or duplicate messages on network retry.
- **Retry Logic**: Implements exponential backoff with jitter (`getRetryDelay`) for up to 3 attempts.
- **Health Awareness**: Continually polls `/health`. If pings fail, the client enters `mockMode` to keep the UI functional with simulated responses.

#### Schema Validation (Lines 56-90)

- Uses Zod schemas (imported from `schemas.ts`) to validate every incoming API response. If a response is malformed, it attempts to apply safe defaults rather than crashing the UI.

### Key API Methods

- **`sendMessage`**: Proxies chat inputs to the backend. Normalizes varied response formats (roampal vs memory-viz) into a unified `SendMessageResponse` contract.
- **`searchMemory`**: specifically targets the vector/graph retrieval engine. Handles mapping heterogeneous "fragment" structures into a common `item` interface.
- **`listShards` / `switchShard`**: Manages context multi-tenancy. features multi-endpoint fallback (tries shard-management first, then memory-viz aliases).
- **`addMemory`**: Persists new knowledge fragments with automated idempotency tracking.

---

## Connection & Dependencies

- **ROAMPAL_CONFIG**: Consumption of endpoint templates and timing constants.
- **schemas.ts**: Provider of Zod validation logic.
- **useChatStore.ts**: The primary consumer of the `getRoampalClient()` singleton.
- **MemoryPanelV2.tsx**: Uses `searchMemory` for its real-time filtering logic.
