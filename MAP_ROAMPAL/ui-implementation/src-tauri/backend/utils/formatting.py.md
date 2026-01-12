# formatting.py (utils) - Map

## Summary

`formatting.py` contains transformation logic to prepare backend data for consumption by the React frontend. specifically, it handles the conversion of technical vector distance metrics into human-interpretable percentage scores, ensuring that the UI can consistently display confidence levels for memory retrievals.

---

## Technical Map

### UI Preparation (Lines 3-19)

- **`format_fragment_for_ui(result)`**:
  - Extracts `original_text`, `source_type`, and identifiers from the raw ChromaDB result.
  - **Confidence Score Calculation**: Converts the L2 (Euclidean) `distance` from the vector search into a `0-100` percentage using the formula: `round((1 / (1 + distance)) * 100)`. A lower distance results in a higher confidence score.
  - **ID Resolution**: Normalizes different ID field names (`chunk_id`, `learning_id`, `id`) into a single `chunk_id` field for the UI to use as a React key.

---

## Connection & Dependencies

- **UnifiedMemorySystem.py**: Consumes this function to map its search results before returning them to the API layer.
- **MemoryPanelV2 (Frontend)**: Displays the `confidence` score and `text` produced by this utility.
- **MemoryCitation (Frontend)**: References the `chunk_id` to link a chat message back to its source fragment in the knowledge graph.
