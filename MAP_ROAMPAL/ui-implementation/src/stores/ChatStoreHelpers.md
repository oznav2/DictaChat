# Chat Store Helpers - Map

## Overview

The `src/stores` directory contains auxiliary logical handlers used to patch or extend the primary `useChatStore`. These files encapsulate complex event-parsing logic for the SSE/WebSocket stream.

---

### chatStoreChunkHandler.ts

- **Purpose**: Specialized logic for handling `token_chunk` events during long LLM responses.
- **Logic**:
  - Maintains a `Map<messageId, ChunkedMessage>` to accumulate incoming text fragments.
  - `handleChunkedResponse`: An immutable transformer that finds the target message in the state array and updates its `content` by joining current chunks.
  - Cleans up the internal map once an event with `final: true` is received.

### chatStoreEnhancement.ts

- **Purpose**: A "blueprint" or "patch" guide for upgrading the basic chat store to support advanced event types (Tool Executions, Code Blocks, and Citations).
- **Core Function**: `handleEnhancedStreamingEvent`.
- **Event Handling**:
  - `tool_execution`: Appends details to the message's `toolExecutions` tray.
  - `response_with_code`: Directly sets structured `codeBlocks` metadata.
  - `complete`: Finalizes the message turn and attaches backend-generated `citations`.
- **Hook Provided**: `useEnhancedMessageDisplay` - A selector-based hook to extract specific message metadata (thinking, tools, code) for rendering.

---

## Connection & Dependencies

- **useChatStore.ts**: The main state machine where these handlers are either integrated or referenced.
- **EnhancedChatMessage.tsx**: Consumes the metadata structures produced by these handlers.
