# model_contexts.py (routers) - Map

## Summary

`model_contexts.py` manages the context window configuration for various LLMs supported by RoamPal. It allows users to view default context sizes and apply custom overrides per model. This is critical for optimizing performance on local hardware, as larger context windows require significantly more VRAM.

---

## Technical Map

### Context Management Endpoints

- **Bulk Retrieval (Lines 29-45)**: `/api/model/contexts` returns a comprehensive list of all configured models along with their default and maximum allowed context sizes.
- **Specific Model Insight (Lines 47-68)**: `/api/model/context/{model_name}` provides detailed metadata for a single model, indicating whether the current setting is a default value or a user-defined override.
- **Custom Overrides (Lines 70-114)**: `/api/post/model/context/{model_name}` validates and persists user-defined context sizes.
  - **Validation Range**: Enforces a minimum of 512 tokens and a maximum of 200,000 tokens to prevent system stability issues.
- **Reset Functionality (Lines 116-148)**: Allows users to revert a specific model's context setting to its factory default by deleting the local override entry.

### Persistence Logic

- The router delegates the actual reading and writing of settings to the `config.model_contexts` module, which handles the filesystem operations for the settings file.

---

## Connection & Dependencies

- **config/model_contexts.py**: The underlying configuration manager that provides the `save_user_override` and `delete_user_override` functions.
- **Settings UI (Frontend)**: Provides the "Model Settings" interface where users can adjust sliders for context window sizes.
- **Ollama / LM Studio**: These settings are passed as parameters when RoamPal initializes a chat session with the respective backend provider.
- **model_switcher.py**: Works in tandem to ensure that when a model is switched, its specific context limit is respected.
