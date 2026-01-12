# migrateLegacyStorage.ts - Map

## Summary

`migrateLegacyStorage.ts` is a one-time utility that runs immediately upon application import. It handles the transition of user data from older development or alpha versions (e.g., "Neural UI") to the current RoamPal standard. It cleans up deprecated feature flags and reshapes stored JSON structures to match active store schemas.

---

## Technical Map

### Migration Logic

#### Atomic Guard (Lines 9-11, 68)

- Checks for `roampal_migration_v2_complete` in `localStorage`. If present, the utility exits immediately to prevent redundant processing.

#### Chat History Reshaping (Lines 25-41)

- Identifies the legacy `chat_history` key.
- extracts sessions and messages.
- maps them to the new `roampal-chat` format used by the current `useChatStore`.

#### Store Wrapping (Lines 44-61)

- Detects if `roampal-chat` data is missing the required `{ state, version }` wrapper (expected by newer Zustand persistence middleware).
- If naked data is found, it "wraps" it to ensure compatibility with versioned persistence.

#### Cleanup (Lines 64-65)

- Explicitly deletes obsolete debug flags like `VITE_ENABLE_NEURAL_UI` and `VITE_ENABLE_MOCK_MODE`.

---

## Connection & Dependencies

- **localStorage**: The primary database for this utility.
- **useChatStore.ts**: The destination format for most migrations.
- **main.tsx**: Indirectly triggered as this is a module-level execution on import.
