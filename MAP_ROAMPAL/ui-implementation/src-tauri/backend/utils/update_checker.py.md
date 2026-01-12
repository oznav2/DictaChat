# update_checker.py (utils) - Map

## Summary

`update_checker.py` is a simple, resilient service used to notify users about new RoamPal versions. It implements a non-blocking check against a remote JSON manifest, performs semantic version comparison, and differentiates between routine updates and critical security/compatibility patches. To ensure privacy and speed, the check has a strict 5-second timeout and fails silently without affecting core application functionality.

---

## Technical Map

### Core Logic (Lines 30-77)

- **`CURRENT_VERSION`**: Hardcoded as `0.2.12` in the backend.
- **Remote manifest**: Fetches data from `https://roampal.ai/updates/latest.json`.
- **Version Comparison**:
  - Uses `parse_version` to convert strings like "0.2.12" into integer tuples `(0, 2, 12)` for reliable comparison.
  - **`is_critical`**: True if the user's current version is lower than the `min_version` specified in the remote manifest. This triggers the mandatory update banner in the UI.
- **Fail-Safe**: Uses `httpx.AsyncClient` with a timeout. All exceptions are caught and logged at `DEBUG` level to prevent startup crashes if the user is offline.

### Public API

- **`check_for_updates()`**: returns a dictionary containing the new `version`, `notes`, `download_url` (typically Gumroad), and critical status.
- **`get_current_version()`**: Helper to expose the hardcoded version string.

---

## Connection & Dependencies

- **main.py**: Exposes the result of `check_for_updates()` via the `/api/check-update` endpoint.
- **useUpdateChecker (Frontend Hook)**: Calls the backend endpoint regularly and manages the state of the update notification UI.
- **UpdateBanner (Frontend Component)**: Renders the notification logic based on whether `is_critical` is true.
