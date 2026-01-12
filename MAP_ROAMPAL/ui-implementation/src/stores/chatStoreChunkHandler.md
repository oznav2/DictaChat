# chatStoreChunkHandler.ts - Map

## Summary

The `chatStoreChunkHandler.ts` file provides a utility function `handleChunkedResponse` to manage incremental updates to assistant messages during streaming responses. It maintains an internal, module-level `Map` to accumulate text chunks for specific message IDs, ensuring that the UI reflects the full message content as it arrives piece by piece. Once the final chunk is received, it cleans up the stored chunks.

---

## Technical Map

### Interfaces & Internal State

- **Lines 6-9**: `ChunkedMessage` - Interface defining the structure of an accumulated message (array of `chunks` and a `isComplete` boolean).
- **Line 11**: `chunkedMessages` - A `Map<string, ChunkedMessage>` that stores chunks indexed by message ID.

### Functions

- **Lines 13-49**: `handleChunkedResponse` - The core logic for handling `token_chunk` events.
  - **Arguments**: `event` (the data chunk), `assistantMsgId` (target message ID), `messages` (current store state).
  - **Logic**:
    - Locates the assistant message in the provided `messages` array.
    - If the event type is `token_chunk`, it retrieves or initializes the list of chunks for that message.
    - Appends the new chunk content to the list.
    - Joins all chunks into a single string and updates `assistantMsg.content`.
    - If `event.final` is true, it marks the message as complete and removes it from the `chunkedMessages` Map.
  - **Returns**: The updated `messages` array.

### Suggested Usage (Documentation)

- **Lines 51-70**: Comments providing example code for integrating this handler into a Zustand-style store (`set` state calls), distinguishing between `token_chunk` (accumulated) and `token` (replaced or direct) event types.

---

## Connection & Dependencies

- This file is designed to be imported and used within `useChatStore.ts` (or any other message store using similar streaming events).
- It relies on stable message IDs generated during the chat initiation process.
