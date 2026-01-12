# migrate_knowledge_graph.py (utils) - Map

## Summary

`migrate_knowledge_graph.py` is a one-time migration utility designed to reorganize legacy Knowledge Graph data. Older versions of RoamPal stored the graph in a globally hardcoded path; this script moves that data into a shard-specific structure (e.g., the `og` shard), updates the metadata within the JSON for consistency, and handles backups/conflict resolution if existing data is detected in the new location.

---

## Technical Map

### Migration Workflow (Lines 21-111)

- **Path Resolution**:
  - **Old**: `data/og_data/og_data/knowledge_graph/knowledge_graph.json`.
  - **New**: Resolved via `settings.paths.get_knowledge_graph_path("og")`.
- **Conflict Handling**:
  - If a file already exists in the target directory, the script compares literal file sizes.
  - If the "Legacy" file is larger (suggesting more data), it creates a `.json.backup` of the new file automatically.
  - Prompts the user for interactive confirmation before overwriting.
- **Data Enrichment (Lines 79-91)**:
  - Loads the migrated JSON.
  - Injects `shard_id: "og"` and `migrated: True` into the `metadata` block.
  - Re-saves the file with pretty-printing.

---

## Connection & Dependencies

- **Settings.py**: Provides the Pydantic PATH settings used to resolve the new destination.
- **UnifiedMemorySystem.py**: Consumes the modernized shard-based graph directory for retrieval.
- **KnowledgeGraph.tsx (Frontend)**: Visualizes the JSON data moved and updated by this script.
