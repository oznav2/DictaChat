# exceptions.py (utils) - Map

## Summary

`exceptions.py` defines the custom error hierarchy for the RoamPal backend. Using specific exception types allows the system to differentiate between general application errors and external dependency failures (like Ollama), enabling more targeted retry logic and user-friendly error messages in the UI.

---

## Technical Map

### Exception Hierarchy

- **`OGException`**: The base class for all custom RoamPal errors.
- **`OllamaException`**: Specifically for connectivity, timeout, or model-loading failures related to the local Ollama inference server.

---

## Connection & Dependencies

- **OllamaClient.py**: Raises `OllamaException` when the REST API returns a non-200 status or a malformed JSON chunk.
- **AgentChatService.py**: Catches these exceptions to provide the "Ollama Required" modal or suggestions to restart the local provider.
