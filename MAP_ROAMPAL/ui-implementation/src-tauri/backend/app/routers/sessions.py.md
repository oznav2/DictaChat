# sessions.py (routers) - Map

## Summary

`sessions.py` provides the management layer for RoamPal's conversation history. It handles the retrieval, loading, and cleanup of session-specific `.jsonl` files stored in the user's data directory. Crucially, it ensures that deleting a conversation also triggers a cleanup of all associated vector memories, maintaining consistency between the chat logs and the memory system.

---

## Technical Map

### Conversation Discovery (`/list`)

- **Summary Generation (Lines 42-111)**: Efficiently scans session files by reading only the first and last lines. This allows the UI to display conversation titles, message counts, and "last updated" timestamps without loading full histories.
- **Legacy Compatibility (Lines 54-72)**: Includes logic to parse both old-format session entries (merged user/assistant records) and new-format entries (atomic role/content records).
- **Time Normalization (Lines 75-101)**: Normalizes disparate timestamp formats (ISO strings vs. Unix floats) to ensure consistent sorting of the chat list by recency.

### Session Core Logic

- **Detailed Loading (`/{session_id}`)**: Streams and parses the full `.jsonl` file into a standardized list of messages, complete with citations and metadata, for rendering in the chat window.
- **Recursive Cleanup (`delete`)**: When a session is deleted, the router:
  1. Unlinks the `.jsonl` log file.
  2. Calls `memory.delete_by_conversation` to purge all related vectors from ChromaDB (Working memory and Patterns).
  3. Resets the application's active conversation pointer if the deleted session was the current one.

### Security

- **Path Traversal Protection (Lines 130-143)**: Validates session IDs against a strict alphanumeric regex and resolves the absolute path to ensure operations stay within the `sessions` subdirectory.

---

## Connection & Dependencies

- **UnifiedMemorySystem.py**: Provides the data directory path and handles the deletion of conversation-specific memories from vector storage.
- **agent_chat.py**: While `agent_chat.py` manages the _writing_ of sessions during generation, `sessions.py` manages the _management_ of those files afterward.
- **Chat List (Frontend)**: The sidebar component that uses these endpoints to show the history of interactions.
