# text_utils.py (utils) - Map

## Summary

`text_utils.py` provides high-level text processing capabilities for the RoamPal backend, focusing on query normalization and AI response parsing. It includes utilities to strip "fluff" from user queries, perform simple keyword-based retrieval as a fallback for vector search, and extract "thinking" tags from reasoning-heavy models like DeepSeek-R1.

---

## Technical Map

### Query Normalization (Lines 7-25)

- **`strip_fluff_phrases`**: Removes common conversational filler (e.g., "Could you please explain...") from the start of user messages to improve the quality of semantic search queries. Uses the wordlist defined in `settings.text.fluff_phrases`.
- **`approximate_token_count`**: a fast, space-based estimation of complexity.
- **`keyword_based_search`**: implements a basic Jaccard-style keyword intersection search. It filters out English stop words and provides a deterministic baseline for finding documents when vector embeddings are noisy.

### Reasoning Extraction (Lines 40-62)

- **Thinking Tags**: Specifically designed for models (like DeepSeek) that output internal monologues between `<think>` or `<thinking>` tags.
- **`extract_thinking(response)`**:
  - Uses regex (supporting both closed and unclosed tags) to bifurcate the response.
  - Returns a tuple: `(thinking_content, clean_response)`. This allows RoamPal to display the model's logic in the "Thought" UI panel while only showing the final answer in the main chat thread.

---

## Connection & Dependencies

- **Settings.py**: Consumes `fluff_phrases` and `english_stop_words`.
- **AgentChatService.py**: Uses `extract_thinking` to separate reasoning from action when processing multi-turn agent conversations.
- **UnifiedMemorySystem.py**: Employs `keyword_based_search` as a fallback retrieval mechanism during "Hybrid Search" mode.
- **Tauri UI**: the cleaned response and extracted thinking content are sent as separate fields in the API payload, directly populating the different layers of the chat interface.
