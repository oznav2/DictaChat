# safe_logger.py (utils) - Map

## Summary

`safe_logger.py` provides a critical text sanitization utility designed to prevent backend crashes and "spaghetti" output in restricted terminal environments (especially legacy Windows CMD). It strips or replaces sophisticated Unicode characters (like smart quotes, em-dashes, and bullet points) with their standard ASCII equivalents before they are sent to the log handlers.

---

## Technical Map

### Sanitization Logic (Lines 5-30)

- **`sanitize_for_logging(text, max_length)`**:
  - **Replacements**: Manually maps high-value Unicode characters (e.g., `\u2019` smart quote) to safer ASCII substitutes (`'`).
  - **ASCII Enforcement**: A final "catch-all" filter replaces any remaining non-ASCII characters (`ord(char) >= 128`) with a simple `?`.
  - **Truncation**: caps the log message at 100 characters by default to keep the console output readable and prevent massive LLM responses from bloating the logs.

---

## Connection & Dependencies

- **logging_utils.py**: Complements the UTF-8 stream handler by ensuring the _content_ being logged is inherently safe for display.
- **OllamaClient.py**: Uses this to log the beginning and end of streaming chunks without flooding the terminal with raw JSON-RPC symbols.
- **AgentChatService.py**: Sanitizes user queries and agent "thoughts" before they are recorded in the developer debug logs.
