# circuit_breaker.py (utils) - Map

## Summary

`circuit_breaker.py` implements the Circuit Breaker pattern to protect the RoamPal backend from cascading failures. When a dependency (e.g., Ollama, ChromaDB, or the Embedding Service) becomes unresponsive or returns multiple errors, the circuit "opens," immediately failing subsequent requests without overwhelming the failing service. This maintains application stability and allows the UI to provide clear, immediate feedback to the user about service outages.

---

## Technical Map

### States (Lines 14-18)

- **CLOSED**: Normal operation. Requests flow through to the target service.
- **OPEN**: Failure threshold reached. All requests are blocked and raise `CircuitOpenError`.
- **HALF_OPEN**: Recovery phase. The system allows a single test request to pass through after a cooldown period to check if the service has recovered.

### Manager Attributes (Lines 19-70)

- **`failure_threshold`**: Number of consecutive failures before the circuit opens (defaults range from 2 to 5 depending on the service).
- **`recovery_timeout`**: How long the circuit stays open (in seconds) before entering `HALF_OPEN` state.
- **`_record_failure` / `_record_success`**: Internally manages the counter and state transitions based on the results of the `call` method.

### Global Registry (Lines 140-153)

- **Preconfigured Breakers**:
  - **`embedding_service`**: 3 failures, 30s timeout.
  - **`chromadb`**: 5 failures, 60s timeout.
  - **`ollama`**: 3 failures, 45s timeout.
  - **`playwright`**: 2 failures, 30s timeout.

---

## Connection & Dependencies

- **EmbeddingServiceClient.py**: Wraps every REST call to the embedding port in `get_circuit_breaker("embedding_service").call(...)`.
- **OllamaClient.py**: Protects the local inference loop.
- **Tauri UI**: the `/api/circuit-status` endpoint (exposed via the router) is used to show "Service Outage" warnings or "Offline" indicators in the sidebar without waiting for a request to timeout.
- **UnifiedMemorySystem.py**: Protects vector search operations from ChromaDB hanging.
