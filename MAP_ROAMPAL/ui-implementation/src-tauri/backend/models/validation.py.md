# validation.py (models) - Map

## Summary

`validation.py` defines the robust Pydantic models used to validate and sanitize all incoming requests to the RoamPal backend API. It enforces strict constraints on message length, conversation ID formats, and collection names. By implementing a "Sanitize-on-Initialize" pattern (using regex and field validators), it protects the memory system from malformed data and potential injection-style attacks.

---

## Technical Map

### Validated Request Models

- **`ChatRequest`**:
  - **Constraints**: Message (1-100,000 chars), Conversation ID (must match `conv_` pattern).
  - **Logic**: Strips whitespace and blocks invalid ASCII control characters to prevent log injection or protocol corruption in MCP mode.
- **`BookUploadRequest`**:
  - **Sanitization**: Automatically removes OS-illegal characters (`<>:"\|?*`) from titles and authors to ensure safety when creating local files.
- **`MemorySearchRequest`**:
  - **Logic**: Restricts search scope to known valid collection names (`books`, `working`, `history`, `patterns`, `memory_bank`).
- **`FeedbackRequest`**:
  - **Inter-field Validation**: Forces a `failure_reason` if the `outcome` is set to `failed`. Validates that document IDs match the system hex/prefix format.
- **`CommandRequest`**:
  - **Whitelisting**: Blocks unauthorized slash-commands. Only allows a specific set of operational commands (e.g., `/help`, `/memory`, `/fix`).

### Pattern Enforcement

- **Conversation IDs**: Enforces a consistent `conv_[a-z0-9_]` regex, ensuring that session management and file-based exports remain cross-platform compatible.
- **Confidence Scores**: strictly limits floats to `0.0 - 1.0` range.

---

## Connection & Dependencies

- **FastAPI Routes**: These models are used as type hints in the router function signatures (e.g., `async def chat(request: ChatRequest)`). FastAPI automatically triggers these validations before the function code runs.
- **UnifiedMemorySystem.py**: Consumes the validated `MemorySearchRequest` and `FeedbackRequest` objects to perform the actual vector operations.
- **app.routers.agent_chat**: Uses `ChatRequest` to parse user messages before feeding them into the LLM reasoning loop.
