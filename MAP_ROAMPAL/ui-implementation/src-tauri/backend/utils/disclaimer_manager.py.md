# disclaimer_manager.py (utils) - Map

## Summary

`disclaimer_manager.py` is a specialized utility designed to ensure legal compliance and safe AI usage within RoamPal. It manages a repository of context-specific disclaimers (Medical, Legal, Financial, Code) and implements a "Trigger-Based" injection system that automatically appends relevant warnings to AI responses if sensitive keywords are detected in the user's query.

---

## Technical Map

### Disclaimer Registry (Lines 13-38)

- **Static Content**: defines strings for high-risk categories, including code generation and web search synthesis.
- **Branding**: Includes a specific `first_message` welcome sequence to orient new users on the limitations of AI.

### Logic & Triggering (Lines 41-92)

- **`TRIGGER_KEYWORDS`**: A dictionary mapping categories to sensitive keywords (e.g., "doctor" triggers `chat_medical`, "invest" triggers `chat_financial`).
- **`check_triggered_disclaimers(text)`**: performs a case-insensitive check of the user's input against the keyword list and returns the highest-priority matching warning.
- **`add_disclaimer_to_response`**:
  - The main integration point.
  - Injects a `disclaimer` and a `disclaimer_type` (`warning` or `info`) into the final API response dictionary.
  - Decides whether to show the "Welcome" banner or a "Contextual" warning.

### Formatting & UI Components

- **`get_terms_of_use`**: generates a formatted legal agreement with dynamic "Last Updated" timestamps.
- **`get_startup_disclaimer`**: provides an ASCII-art box for terminal/log output during the backend initialization phase.

---

## Connection & Dependencies

- **agent_chat.py**: Calls `add_disclaimer_to_response()` before sending the final LLM output back to the UI.
- **Tauri UI**: the frontend displays the injected `disclaimer` text in a specialized banner at the bottom of the chat message if present.
- **logging_utils.py**: Uses `get_startup_disclaimer()` to output the legal warning to the console/log file on boot.
