# feature_flags.py (config) - Map

## Summary

`feature_flags.py` implements a sophisticated feature-toggling system used to control advanced and experimental capabilities within the RoamPal backend. It supports multiple levels of overrides (hardcoded defaults → JSON config → environment variables) and includes safety validation logic to prevent dangerous combinations of features (e.g., autonomous actions without user confirmation).

---

## Technical Map

### Core Flag Categories (Lines 17-66)

- **Core (Always On)**: `ENABLE_MEMORY`, `ENABLE_SEARCH`, `ENABLE_OUTCOME_TRACKING`.
- **Advanced (Default Off)**: `ENABLE_AUTONOMY`, `ENABLE_PATTERN_CRON`, `ENABLE_AUTO_REFACTOR`, `ENABLE_GIT_OPERATIONS`.
- **UI Critical**: `ENABLE_WEBSOCKET_STREAMING` (Token-by-token UI updates).
- **Dry-Run Modes**: `PLANNER_DRY_RUN`, `ORCHESTRATOR_DRY_RUN`, `REFLECTION_DRY_RUN` (Allows logic execution without external side effects).
- **Safety Limits**: `MAX_AUTONOMOUS_ACTIONS`, `MAX_FILE_WRITES_PER_SESSION`, `REQUIRE_CONFIRMATION`.

### Manager Logic (Lines 67-165)

- **Priority Stack**:
  1. **Environment Variables**: Highest priority (`ROAMPAL_FLAGNAME`).
  2. **JSON Config**: Persisted in `data/feature_flags.json`.
  3. **Hardcoded Defaults**: Defined in the `FeatureFlags` dataclass.
- **`validate()` Method**: Checks for logical conflicts, such as enabling `AUTONOMY` but disabling `REQUIRE_CONFIRMATION`, or enabling `PATTERN_CRON` without a `KNOWLEDGE_GRAPH`.

### Predefined Profiles (Lines 192-232)

- **Development**: Enables detailed logging and disables dry-runs for rapid iteration.
- **Production**: Force-enables metrics, disables verbose logging, and ensures `REQUIRE_CONFIRMATION` is active.
- **Experimental**: Unlocks autonomous limits and allows for headless execution (used for MCP benchmarking).

---

## Connection & Dependencies

- **main.py**: Calls `get_flag_manager()` during startup to sanitize the application state based on the active logic profile (`ROAMPAL_PROFILE`).
- **FeatureFlagValidator.py**: Uses the manager's state to perform multi-factor health checks before the FastAPI server begins accepting requests.
- **AgentChatService.py**: Queries `is_enabled()` to decide whether to trigger autonomous planning or knowledge graph lookups during a conversation.
