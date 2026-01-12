# memory_bank.py (routers) - Map

## Summary

`memory_bank.py` provides the administrative interface for RoamPal's "Identity Layer" (the 5th collection). This collection stores authoritative, long-term facts about the user, their goals, and the agent's own growth. While the LLM has autonomy to manage this collection during chat, this router exposes endpoints for the user to manually override, refine, or audit their persistent memory through the Settings UI.

---

## Technical Map

### Memory Lifecycle Management

- **Listing & Filtering (Lines 37-96)**: Retrieves memories with support for tag filtering and pagination (up to 1,000 entries). It handles metadata parsing for `tags`, `mentioned_count`, and `status`.
- **Soft Delete/Archive (Lines 408-445)**: Implements an "Archive" mechanism where memories are marked as inactive rather than being immediately destroyed. Includes specialized support for manual user restoration (`/restore`) and permanent hard deletion (`/delete`).
- **Update with Tracking (Lines 357-405)**: When a memory is updated via the API, the system automatically archives the old version and creates a new entry, maintaining a historical trace of fact revision.

### Search & Discovery

- **Semantic Search (Lines 218-271)**: Provides a dedicated search endpoint for the memory bank that converts ChromaDB distances into a user-friendly "relevance" score.
- **Aggregated Statistics (Lines 273-314)**: Calculates system-wide metrics including the total count of active vs. archived memories and a list of unique tags currently in use across the identity layer.

### Integration Support

- **Authoritative Creation (Lines 316-355)**: Allows external tools or the MCP bridge to inject new "mastered" facts into the system. These are treated as authoritative (starting with a default importance of 0.7).

---

## Connection & Dependencies

- **UnifiedMemorySystem.py**: The backend engine implementing the `search_memory_bank`, `store_memory_bank`, and `archive_memory_bank` methods.
- **Settings UI (Frontend)**: The primary consumer of these endpoints, providing the "My Memory" view where users can manually edit their personal profile.
- **mcp.py**: Uses these endpoints to expose memory CRUD capabilities to external clients (like Claude Desktop) through the MCP bridge.
