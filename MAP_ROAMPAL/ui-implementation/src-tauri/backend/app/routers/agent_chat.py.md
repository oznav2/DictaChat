# agent_chat.py (routers) - Map

## Summary

`agent_chat.py` is the primary orchestrator for the RoamPal AI experience. It manages the entire lifecycle of a conversation, from initializing stateful session files and auto-injecting user profiles to executing recursive tool chains and detecting conversational outcomes. Unlike simple chat interfaces, this router implements a highly sophisticated "Memory-First" logic where the LLM is guided by its own past performance and learned entity relationships, ensuring every response is grounded in the user's personal knowledge base.

---

## Technical Map

### Core Chat Service (`AgentChatService`)

- **Session Management (Lines 466-584)**: manages an `OrderedDict` of conversation histories (up to 100) and persists them as `.jsonl` files. It handles concurrent access via `asyncio.Lock` and file-level locking with `FileLock` to prevent corruption.
- **Dynamic Context (Lines 627-668)**: implements "Cold-Start" logic. On the first message of any session, it automatically queries the Content KG to inject a user profile, allowing the agent to "wake up" already knowing who it is talking to.
- **Contextual Guidance (Lines 675-794)**: performs pre-processing on every message to inject guidance blocks. It merges:
  - **Proactive Insights**: Suggested search terms.
  - **Action Stats**: Success rates for specific tool/collection combinations in the current context.
  - **Failure Patterns**: Warnings about what didn't work in similar past scenarios.

### Recursive Tool Execution (Lines 2433-2851)

- **`_execute_tool_and_continue`**: The engine of the agent's agency.
  - **Memory CRUD**: native support for `search_memory`, `create_memory`, `update_memory`, and `archive_memory`.
  - **MCP Integration**: Routes non-native tool calls to external MCP servers (e.g., Brave Research, Google).
  - **Chaining (Lines 2800-2847)**: if a tool returns information, the service recursively feeds it back to the LLM for a multi-turn reasoning loop (up to `max_depth=3`).
  - **Causal Scoring (v0.2.12)**: caches document IDs with positional mappings for selective outcome scoring.

### Outcome Learning Pipeline (Lines 1146-1294)

- **Self-Correction Logic**: After an exchange, the system analyzes the _next_ user message to determine if the _previous_ assistant response was successful.
- **Selective Scoring**:
  - **Causal Marks**: Parses hidden `<!-- MEM: 1👍 2👎 3➖ -->` annotations from the LLM to score specific retrieved fragments.
  - **Outcome Promotion**: Automatically promotes valuable fragments from "Working" memory to the "Memory Bank" if they consistently lead to positive outcomes.

### Infrastructure & Endpoints (Lines 3401-4089)

- **WebSocket Streaming**: provides two ways to generate responses:
  - **Batch (`/stream`)**: creates a background task that polls for completion.
  - **Real-time (`_run_generation_task_streaming`)**: pipes tokens, tool events, and citations directly to the frontend over a persistent WebSocket connection.
- **Administrative Utilities**: handles conversation switching (triggering lazy memory promotion), atomic session creation with `secrets.token_hex`, and concierge title generation via the LLM.

---

## Connection & Dependencies

- **UnifiedMemorySystem.py**: The primary data provider and destination for all learned patterns.
- **OllamaClient.py / LM Studio**: The switcher logic in `model_switcher.py` hot-swaps the LLM client used by this service.
- **transparency_context.py**: used to track _why_ specific memories were retrieved for the UI "Transparency" modal.
- **mcp_client/manager.py**: supplies external tool definitions and execution handlers.
- **ChatWindow (Frontend)**: The central UI component that interacts with the WebSocket and progress polling endpoints.
