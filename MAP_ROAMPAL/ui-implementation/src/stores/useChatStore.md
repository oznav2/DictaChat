# useChatStore.ts - Map

## Summary

`useChatStore.ts` is the central state management hub for the RoamPal UI. Built with Zustand, it orchestrates all aspects of the chat experience: from local session persistence and backend synchronization to the high-complexity logic of real-time message streaming and tool-interleaving. It acts as the "source of truth" for the current conversation, ensuring that the UI correctly reflects the LLM's thinking process, tool usage, and memory retrieval outcomes.

---

## Technical Map

### State Schema (`ChatState`)

- **Conversation Storage**:
  - `conversationId`: Currently active session ID (persisted in `localStorage`).
  - `messages`: chronologically ordered array of user/assistant/system messages.
  - `sessions`: Array of `ChatSession` metadata (ID, name, messageCount, etc.).
- **Real-time Status**:
  - `isProcessing`: General flag for any background activity.
  - `isStreaming`: Specific to token-by-token text generation.
  - `processingStage`: Enum (`thinking` | `tool_execution` | `processing` | `idle`).
  - `processingStatus`: Humane string for the transparency line (e.g., "Searching memory...").
- **Connectivity**:
  - `websocket`: Native WebSocket instance for reactive updates.
  - `abortController`: For cancelling in-flight HTTP requests.

### Key Logic & Workflows

#### WebSocket Management (Lines 360-918)

- **Unified Endpoint**: Connects to `ws/conversation/{id}`.
- **Message Types**:
  - `token`: Appends a new text fragment to the last assistant message.
  - `tool_start` / `tool_complete`: Tracks parallel or sequential tool executions.
  - `thinking_start` / `thinking_end`: Toggles the "LLM is thinking" visual state.
  - `stream_start` / `stream_complete`: Marks the boundaries of a generative response.
- **Timeline Events (v0.2.5)**: Implements "interleaved" rendering by creating `text_segment` and `tool_execution` events within a single message object (Lines 701-731).

#### Message Sending (Lines 973-1186)

- **Lazy Creation**: If no conversation exists, `sendMessage` triggers `createConversation` before sending the actual prompt.
- **Dual Flow**:
  - Primary: Initiates generation and listens via WebSocket.
  - Fallback: Uses an HTTP polling mechanism (`api/agent/progress`) if the WebSocket is unavailable (Lines 1073-1157).
- **Intent Detection**: Uses `getQuickIntent` (Lines 96-141) to provide immediate heuristic feedback (e.g., if message starts with "fix", status changes to "Fixing issue...") before the server responds.

#### Session Persistence & Recovery (Lines 1307-1409)

- **`loadSessions`**: Fetches the list of all historical chats for the sidebar.
- **`loadSession`**: Hydrates the `messages` array for a specific ID.
- **Thinking Extraction**: Implements complex regex and metadata parsing to retroactively extract reasoning blocks from stored messages (Lines 1335-1360).

#### Conversation Switching (Lines 206-357)

- **Race Condition Guard**: Uses `_currentSwitchId` to ensure that if a user clicks multiple sessions quickly, only the last one requested is actually set into state.
- **WebSocket Re-init**: Closes the old socket and opens a new one mapped to the new ID.

---

## Connection & Dependencies

- **apiFetch.ts**: Standard wrapper for HTTP requests with `config.apiUrl`.
- **localStorage**: Used for `roampal_active_conversation` and `transparencyLevel`.
- **window.dispatchEvent**: Broadly uses custom events (`llm-explanation`, `action-status-update`, `memoryUpdated`) to signal non-store components.
- **Backend API**:
  - `/api/chat/create-conversation`
  - `/api/sessions/*` (CRUD)
  - `/ws/conversation/*` (Real-time updates)
