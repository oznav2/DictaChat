# model_mode_matrix.py (config) - Map

## Summary

`model_mode_matrix.py` defines the relationship between specific LLM models and the application "modes" they are capable of supporting. This matrix is primarily dictated by the model's context window size and reasoning capabilities. It ensures that users are not allowed to trigger resource-intensive modes (like "Agent" mode with high tool-use) on small models that would likely fail due to token overflows or lack of logic depth.

---

## Technical Map

### Mode Tiers & Logic (Lines 6-46)

- **"Basic" Mode**: Standard chat without persistent memory injection. Supported by all models, including tiny versions like `qwen3:1b` and `phi`.
- **"Learning" Mode**: Chat with fragment-based memory retrieval. Requires at least 8K-12K tokens of context. Supported by models like `mistral:7b` and `llama3:8b`.
- **"Agent" Mode**: Full autonomous tool-use and multi-step reasoning. Requires 12K+ tokens and high instruction-following scores. Supported by `llama3.1+`, `qwen2.5-coder`, `deepseek-r1`, and `mistral-nemo`.

### Mode Enforcement (Lines 83-106)

- **`enforce_mode(model_name, requested_mode)`**:
  - The core validation function.
  - If a user requests "Agent" mode on a model that only supports "Learning", the system automatically downgrades the request to "Learning".
  - If even "Learning" is unsupported, it falls back to "Basic".
- **`get_supported_modes`**: Implements fuzzy matching to resolve model versions (e.g., `llama3.3:latest` matches `llama3.3`).

---

## Connection & Dependencies

- **model_switcher_router.py**: Uses the matrix to filter the UI options shown to the user based on the currently selected model.
- **AgentChatService.py**: Checks `can_use_mode()` before initializing the agentic reasoning loop. If the model is insufficient, it switches to a simplified memory-enhanced chat flow instead.
- **Tauri UI**: Consumes the list of supported modes to disable/enable feature toggles in the sidebar.
