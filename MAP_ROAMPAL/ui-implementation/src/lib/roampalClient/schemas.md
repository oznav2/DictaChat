# schemas.ts - Map

## Summary

The `schemas.ts` file defines the contract between the RoamPal UI and its backend. It uses the `zod` library to declare schemas for every major API interaction (Chat, Memory, Shards, Health, and WebSockets). These schemas serve dual purposes: providing TypeScript types through inference (`z.infer`) and performing runtime validation and data normalization (e.g., transforming date strings into `Date` objects) via `safeParse`.

---

## Technical Map

### Core Message Model

- **Lines 9-24**: `MessageSchema` - The fundamental message structure used across the UI.
  - Features: Auto-generated IDs, default sender ('assistant'), and a transformer (Line 14) that converts incoming ISO date strings into JavaScript `Date` objects. Includes optional `citations` and `meta`.

### Chat API Schemas

- **Lines 29-34**: `SendMessageRequestSchema` - Payload for sending user messages.
- **Lines 39-50**: `SendMessageResponseSchema` - Structure for the direct response from the assistant. Includes `request_id` for tracking async streams.

### Memory API Schemas

- **Lines 55-59**: `MemorySearchRequestSchema` - Query/Limit/Shard filters.
- **Lines 61-69**: `MemorySearchResponseSchema` - A collection of `items` representing retrieved memory fragments with `relevance` scores.
- **Lines 74-83**: Addition schemas for creating new memories.

### Context (Shard) Management

- **Lines 86-89**: `ShardsListResponseSchema` - Lists all available memory contexts and the current `active` one.
- **Lines 93-100**: Switch request and confirmation schemas.

### System & Real-time Schemas

- **Lines 103-107**: `HealthCheckResponseSchema` - Minimal schema for backend availability checks.
- **Lines 112-116**: `WSMessageSchema` - Standard wrapper for all WebSocket traffic.
  - `type`: Discriminated union of 'token', 'processing', 'memory_update', etc.
- **Lines 121-125**: `ProcessingStateSchema` - Specific payload used during the 'processing' update type to inform the user which cognitive stage the model is in (thinking, retrieval, etc.).

---

## Connection & Dependencies

- **Zod**: External dependency for schema definition.
- **RoampalClient.ts**: Uses these schemas to validate every network request/response.
- **useChatStore.ts**: Relies on the TypeScript types inferred from these schemas (`Message`, `SendMessageResponse`, etc.) to maintain type safety within its state.
