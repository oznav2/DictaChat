# tool_definitions.py (utils) - Map

## Summary

`tool_definitions.py` contains the JSON schemas that RoamPal uses to describe its capabilities to LLMs (e.g., via Ollama's `tools` API). These definitions provide the "Instructions" for the AI on how to interact with the underlying vector databases. The file focuses heavily on the "Superpower" memory search and management tools that enable RoamPal's core identity as a persistent intelligence.

---

## Technical Map

### Active Tools (Lines 5-188)

- **`search_memory`**:
  - **Purpose**: Unified search across 5 collections (`memory_bank`, `books`, `history`, `patterns`, `working`).
  - **Logic**: Encourages "Automatic Routing" by letting the system decide which collection is best, but allows manual overrides.
  - **Metadata Filtering**: Supports precision filters for timestamps, outcomes (`worked`/`failed`), and book metadata (e.g., `has_code: true`).
- **`create_memory`**:
  - **Three-Layer Storage**: Focuses on **User Context** (identity), **System Mastery** (effective strategies), and **Agent Growth** (learning from mistakes).
  - **Attributes**: Supports `importance` and `confidence` weights (0.0-1.0) to help rank retrieved results.
- **`update_memory` / `archive_memory`**:
  - CRUD utilities to correct or prune the `memory_bank` based on evolving user feedback or project status.

### Prompts & Branding

- These tool descriptions are highly opinionated and instructional. they use bold headers and specific "Be Proactive" vs "Be Selective" guidelines to influence the LLM's agency and frequency of tool-use.
- The descriptions explicitly mention the **Automatic Cold Start** feature to prevent redundant searches on the first message of a session.

---

## Connection & Dependencies

- **ollama_client.py**: Consumes `AVAILABLE_TOOLS` to build the `tools` array for the API request payload.
- **UnifiedMemorySystem.py**: Implements the actual search and storage logic described in these schemas.
- **AgentChatService.py**: Orchestrates the loop where the LLM decides to "Call" these tools based on the definitions provided here.
- **Tauri UI**: the `ToolExecutionDisplay` component uses the tool names from these definitions to render the visual timeline of agent actions.
