# main.py (backend) - Map

## Summary

`main.py` is the primary entry point for the RoamPal Python backend. It functions as a dual-mode application: a high-performance FastAPI server for the desktop GUI and a standards-compliant Model Context Protocol (MCP) server for headless agent integration. It orchestrates the initialization and lifecycle of core AI services, including the `UnifiedMemorySystem`, `OllamaClient`, and `SmartBookProcessor`.

---

## Technical Map

### Core Architecture & Lifespan

- **Dual Mode**:
  - **FastAPI Mode**: Default mode when launched without arguments. serving REST/WebSocket APIs for the Tauri frontend.
  - **MCP Mode (`--mcp`)**: headless mode using `stdio` for JSON-RPC communication, allowing RoamPal to act as a memory tool for other LLMs.
- **`lifespan` handler**:
  - **Initialization**: sequentially boots up ChromaDB (Memory), LLM Providers (Ollama/LM Studio), Document processor, and MCP Client Manager.
  - **Cleanup**: Ensures safe flush of vector databases and closure of persistent WebSocket/HTTPX connections.

### Key Systems & Services

- **`UnifiedMemorySystem`**: the central intelligence hub. Manages "All", "Working", "History", "Patterns", and "Books" collections.
- **LLM Provider Detection (Lines 314-403)**: Dynamically probes local ports (11434 for Ollama, 1234 for LM Studio) to find available models. Implements provider prioritization and auto-selection.
- **`SmartBookProcessor`**: Handles `.txt` and `.md` ingestion, generating embeddings and sharding long documents into the vector store.
- **MCP Client Manager (v0.2.5)**: Allows RoamPal itself to connect to _other_ MCP servers, extending its tool capabilities dynamically.

### Critical Logic

- **Memory Promotion Task (Lines 203-237)**: A background loop (running every 30 mins) that moves high-value "Working" memories to permanent "History" and prunes stale data.
- **Cold-Start Injection (Lines 171-201)**: Specifically for MCP mode. Automatically injects user profile metadata and relevant memories into the very first tool response of a session to "prime" the agent.
- **Conversation Boundary Detection**: For MCP (which is stateless), it uses time gaps (>10m) and context shifts to decide when to clear internal action caches for scoring.
- **Unified WebSocket (Lines 746-785)**: Provides real-time event streaming for a specific `conversation_id`, keeping the UI in sync with background AI thinking and tool executions.

---

## Connection & Dependencies

- **Tauri UI**: Communicates via port 8765 (default).
- **ChromaDB**: The vector database used for all retrieval operations.
- **Ollama / LM Studio**: Local inference engines for text generation and embeddings.
- **Rotary Logging**: Logs act as a persistent audit trail, stored in system `AppData/logs`.
- **Zustand (Frontend)**: Consumes the SSE and WebSocket streams defined here.
