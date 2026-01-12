# feature_flag_validator.py (config) - Map

## Summary

`feature_flag_validator.py` provides a critical safety layer for the RoamPal application. It acts as a gatekeeper that enforces production-ready security rules by detecting and blocking dangerous feature combinations (e.g., autonomous code changes without user confirmation). It ensures that even if a developer accidentally enables high-risk features in a production environment, the system gracefully degrades to a safe, supervised state.

---

## Technical Map

### Dangerous Combinations (Lines 18-34)

- **Autonomy Check**: Blocks `ENABLE_AUTONOMY` if `REQUIRE_CONFIRMATION` is false.
- **File System Protection**: Blocks non-dry-run file writes (`PLANNER_DRY_RUN: False`) if `MAX_FILE_WRITES_PER_SESSION > 0`.
- **Git Safety**: Prevents unconfirmed Git operations.
- **Runaway Prevention**: Limits `MAX_AUTONOMOUS_ACTIONS` to a reasonable threshold for auto-apply features.

### Validation Engine

- **`validate_and_log(config, is_production)`**:
  - Iterates through the rules.
  - Matches exact flag values or executes lambda functions for range-based checks (e.g., `x > 10`).
  - Returns `False` if dangerous combinations are found in production, preventing the server from starting with a `CRITICAL` log.

### Production Sanitization (Lines 114-155)

- **`sanitize_for_production(config)`**:
  - A proactive transformation function.
  - Forcefully overrides high-risk flags (`AUTONOMY`, `AUTO_REFACTOR`, `GIT`) to `False`.
  - Resets `MAX_AUTONOMOUS_ACTIONS` and `MAX_FILE_WRITES` to `0`.
  - Enforces `REQUIRE_CONFIRMATION` and `DRY_RUN` modes regardless of the input config.

---

## Connection & Dependencies

- **feature_flags.py**: Provides the `config` dictionary that this validator analyzes.
- **main.py**: Calls `sanitize_for_production()` during the `lifespan` initialization before the FastAPI app starts. This ensures the backend is always in a safe state when bundled as a user application.
- **AppStatus**: A failure in `validate_and_log` during production mode will halt the application startup, surfacing the error in the Tauri window logs.
