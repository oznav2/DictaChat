# tauri.ts - Map

## Summary

The `tauri.ts` utility contains basic helper functions to check the current runtime environment and return simple UI markers for the Tauri desktop platform.

---

## Technical Map

### Functions

- **Lines 3-5**: `isTauri()` - Checks for the existence of the `window.__TAURI__` object.
- **Lines 7-10**: `getPlatformBadge()` - Returns the string "Desktop" if running within Tauri, otherwise `null`.

---

## Connection & Dependencies

- Used by UI components to conditionally render desktop-specific badges or features.
