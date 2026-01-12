# logger.ts - Map

## Summary

The `logger.ts` utility is a lightweight wrapper around the standard browser `console` object. Its primary purpose is to suppress debug, info, and log messages in production environments while ensuring that critical errors are still visible. It uses `process.env.NODE_ENV` to determine the current environment and tailors the verbosity of log outputs accordingly.

---

## Technical Map

### Constants

- **Line 2**: `isDev` - Boolean flag deriving from `process.env.NODE_ENV === 'development'`.

### Logger Object (Lines 4-37)

- **`log`, `warn`, `info`, `debug`**: These methods only execute `console` calls if `isDev` is true.
- **`error` (Line 11)**: Implements a specific logic for production:
  - In development: Echoes the full argument list (including stack traces).
  - In production: Only echoes the primary error message string to avoid leaking too much internal state while still alerting about failures.

---

## Connection & Dependencies

- **Consumer components**: Used throughout the codebase (e.g., in `useChatStore`, `RoampalClient`, `fileUpload`) to provide tracing and error reporting without cluttering the production console.
