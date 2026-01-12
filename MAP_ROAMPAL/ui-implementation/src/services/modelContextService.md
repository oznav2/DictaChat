# modelContextService.ts - Map

## Summary

`modelContextService.ts` is a singleton service that manages the retrieval, caching, and updating of LLM context window limits. It acts as the bridge between the UI (Settings) and the backend's model-specific configuration. It implements a multi-level caching system (5-minute TTL) and provides robust fallback values for popular models (Llama, Qwen, Phi, etc.) in case of API failure.

---

## Technical Map

### Core Data Structures

- **`ModelContextInfo`**: Represents a specific model's `current`, `default`, and `max` token counts, plus an `is_override` flag.
- **`AllModelContexts`**: Bulk response structure from the backend.

### Service Logic

#### Caching (Lines 25-29, 165-169)

- **TTL**: 5 minutes (`CACHE_DURATION`).
- **Storage**: Internal `Map` for individual models and a root object for bulk data.
- **Invalidation**: `setContextSize` and `resetContextSize` automatically purge the specific model's cache to ensure the next read is fresh.

#### CRUD Operations

- **Read**:
  - `getAllContexts()`: Fetches global limits for all supported models.
  - `getModelContext(modelName)`: Fetches specifically for one model (e.g., `llama3.2:3b`).
- **Update**:
  - `setContextSize(modelName, size)`: `POST` to backend to persist a user override.
- **Delete**:
  - `resetContextSize(modelName)`: `DELETE` to backend to revert to factory defaults.

#### Fallback System (Lines 171-221)

- Hardcoded defaults for major model families (e.g., Llama 3.x defaults to 32K/131K).
- **Matching**: Uses case-insensitive prefix matching on model names.
- **Safe Baseline**: Defaults to 8K/32K if the model is unknown.

---

## Connection & Dependencies

- **ModelContextSettings.tsx**: Primary consumer for the context adjustment UI.
- **ConnectedChat.tsx**: Uses this service to display "Active Context" limits in the UI.
- **ROAMPAL_CONFIG**: External configuration for the `apiUrl`.
