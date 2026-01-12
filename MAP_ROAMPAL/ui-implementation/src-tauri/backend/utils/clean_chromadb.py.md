# clean_chromadb.py (utils) - Map

## Summary

`clean_chromadb.py` is a data-integrity utility that synchronizes the vector database with the local structured "Soul Layer" archives. It identifies "Orphaned Vectors"—entries that exist in ChromaDB but are no longer present in the source JSONL files (Summaries, Models, Quotes). This ensures that the AI only retrieves memories that are still part of the user's active knowledge base.

---

## Technical Map

### Canonical Data Loading (Lines 27-46)

- **`load_all_ids_from_jsonl`**:
  - Scans `summaries.jsonl`, `models.jsonl`, and `quotes.jsonl` from the `og_data` directory.
  - Extracts `chunk_id`, handles composite IDs (e.g., `{id}_summary`), and captures verbatim keys like `name` or `quote`.
  - Returns a `set` of valid ID strings representing the current source-of-truth.

### Reconciliation Logic (Lines 48-75)

- **`main()`**:
  - **Step 1**: initializes the `ChromaDBAdapter` targeting the `roampal_og_soul_fragments` collection.
  - **Step 2**: lists all existing vector IDs currently stored in the DB.
  - **Step 3**: performs a set difference (`all_vectors - canonical_ids`) to find "Extra" entries.
  - **Step 4**: invokes `vdb.delete_vectors` to prune the orphaned entries, reclaiming space and preventing "Ghost Memory" hallucinations during chat.

---

## Connection & Dependencies

- **ChromaDBAdapter.py**: used to communicate with the vector store and perform the bulk deletion.
- **og_data/**: The location of the flat-file JSONL archives that act as the canonical input for this script.
- **SoulLayerManager.py**: Indirectly relies on this script to keep its memory retrieval in sync with the underlying filesystem records.
