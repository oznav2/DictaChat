# correction_utils.py (utils) - Map

## Summary

`correction_utils.py` manages the "Blacklist" or "Negative Feedback" loop for the RoamPal memory system. When a user explicitly corrects or rejects an AI retrieved memory (using the "Downvote" or "Correction" UI), this utility logs the event to a local JSONL file. This data is then used to penalize specific chunks, effectively filtering them out of future semantic search results to ensure the agent doesn't repeat the same retrieval mistakes.

---

## Technical Map

### Feedback Logging (Lines 9-18)

- **`log_correction(chunk_id, user_prompt, reason)`**:
  - Appends a new dictionary to the `corrections.jsonl` file.
  - Captures the specific `chunk_id` responsible for the error, the `user_prompt` that triggered it, and the `reason` (if provided).
  - Ensures the parent directory exists before appending to prevent IO crashes.

### Blacklist retrieval (Lines 20-27)

- **`load_corrections()`**: reads the entire logs file and parses each line back into a list of objects.
- **`get_penalized_chunks()`**: returns a `set` of IDs that have been flagged for correction.

---

## Connection & Dependencies

- **Settings.py**: provides the `corrections_jsonl_path`.
- **UnifiedMemorySystem.py**: calls `get_penalized_chunks()` during the search process to exclude these IDs from the final list of retrieved fragments.
- **EnhancedChatMessage (Frontend)**: The "Thumbs Down" UI interaction triggers the API call that eventually invokes `log_correction`.
