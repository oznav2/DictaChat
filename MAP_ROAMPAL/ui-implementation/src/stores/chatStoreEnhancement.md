# chatStoreEnhancement.ts - Map

## Summary

The `chatStoreEnhancement.ts` file acts as a supplementary utility for `useChatStore.ts`, providing advanced data structures and handlers for processing complex streaming events. It defines the `EnhancedMessage` and `ToolExecution` interfaces which allow messages to contain not just text, but also metadata about tool usage, code blocks, and citations. It features a standalone handler `handleEnhancedStreamingEvent` for Server-Sent Events (SSE) and a dedicated React hook `useEnhancedMessageDisplay` to extract formatted message data for the UI.

---

## Technical Map

### Interfaces

- **Lines 9-15**: `ToolExecution` - Tracks a single tool's lifecycle (status, description, details, and metadata like query parameters).
- **Lines 17-38**: `EnhancedMessage` - An extension of the basic message structure.
  - `thinking`: Stores the model's reasoning process.
  - `toolExecutions`: Active or historical tool calls.
  - `codeBlocks`: Specifically parsed language/code segments.
  - `citations`: Source references for RAG responses.
  - `toolsUsed`: Summary of tools that contributed to the final answer.

### Functions

- **Lines 41-97**: `handleEnhancedStreamingEvent` - A switch-based reducer for updating an assistant message based on event types:
  - `tool_execution`: Appends a new `ToolExecution` object to the message.
  - `response_with_code`: Directly sets `content` and `codeBlocks`.
  - `token`: Regular incremental text update.
  - `complete`: Finalizes the message, marking `streaming: false` and attaching `citations` and `toolsUsed`.
- **Lines 128-142**: `useEnhancedMessageDisplay` - A React/Zustand hook that simplifies retrieving a message's enhanced properties by its ID.

### Integration (Documentation)

- **Lines 99-125**: Comments showing how to incorporate `handleEnhancedStreamingEvent` into the SSE line-parsing loop of a store's `sendMessage` function.

---

## Connection & Dependencies

- `useChatStore.ts`: Provides the underlying message store that this file enhances.
- **SSE Stream**: Expects a backend that emits structured JSON events (type: 'token', 'tool_execution', etc.) instead of raw text.
- **UI Components**: Used by components that need to render more than simple markdown, such as the `ToolExecutionDisplay` or `MemoryCitation` components.
