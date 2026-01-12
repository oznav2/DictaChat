# model_limits.py (config) - Map

## Summary

`model_limits.py` provides a sophisticated, research-backed system for managing the dynamic constraints of various LLMs during tool-use and reasoning tasks. It calculates token budgets, iteration limits, and truncation strategies based on the specific capabilities of the model (e.g., Llama 3 vs. Qwen 2.5) and the detected complexity of the user's request. It implements a "safe character limit" strategy (70% of max context) to maintain high output quality.

---

## Technical Map

### Model Tiering (Lines 28-82)

- **Small (4K-8K)**: CodeLlama 7B, Llama 3.2 3B. Limits to ~5 base iterations for speed.
- **Medium (16K-32K)**: DeepSeek-R1 (7B-32B), Qwen 2.5/3 (Medium). Allows up to 7-8 iterations.
- **Large (128K+)**: Llama 3.1 70B, Gemma 3. Limits context to 320,000 characters and allows 10+ iterations for complex coding tasks.
- **Ultra (1M+)**: Llama 4 (experimental profiles). Support for massive context windows.

### Task Complexity Intelligence (Lines 132-152, 260-285)

- **Simple**: Keywords like "list", "show", "find". Uses 60% of base iterations.
- **Medium**: "Analyze", "explain", "debug". Uses 100% of base iterations.
- **Complex**: "Refactor", "architecture", "entire codebase". Uses 150% iterations (max 15).

### Quality & Performance Monitoring

- **`IterationMetrics`**: Tracks latency, token counts, and coherence per reasoning step.
- **`should_continue_iterations`**: The decision engine that halts reasoning if token budget is low (<20%), quality degrades, or the goal is reached.
- **`smart_truncate`**: Context-aware content reduction.
  - **Files**: Shows start and end, hides the middle.
  - **Directories**: Shows the first 20 items and a count.
  - **Search**: Limits to the most relevant lines.

### Helpers & Optimization

- **`estimate_tokens`**: Conservative character-to-token estimator (~4 chars/token). Uses `tiktoken` if available for higher accuracy.
- **Caching**: Uses `lru_cache` and thread-safe dicts (`_model_cache`) to avoid repeated expensive complexity analysis and configuration lookups.

---

## Connection & Dependencies

- **Settings.py**: Consumes `ROAMPAL_CONTEXT_SAFETY_MARGIN` to adjust the baseline 70% safety margin.
- **AgentChatService.py**: The primary consumer. Uses `get_model_limits()` to configure the loop for autonomous tool-use.
- **OllamaClient.py**: Uses `get_generation_params()` to adjust `num_predict` and `temperature` for specific models like DeepSeek-R1 (reasoning mode).
