# cors_handler.py (app) - Map

## Summary

`cors_handler.py` provides utility functions to ensure that all FastAPI responses from the RoamPal backend include the necessary Cross-Origin Resource Sharing (CORS) headers. Because the React frontend (running on `localhost:5174/5173`) communicates with the Python backend (running on port `8765`), these headers are required to bypass browser security restrictions.

---

## Technical Map

### Response Factories (Lines 8-40)

- **`cors_response`**:
  - Wraps data in a `JSONResponse`.
  - **Default Headers**: Sets `Access-Control-Allow-Origin: *` and allows all standard HTTP methods (`GET`, `POST`, `OPTIONS`, etc.).
  - Enables `Access-Control-Allow-Credentials: true` for persistent session management.
- **`cors_error_response`**:
  - Simplified helper for returning standardized error objects (e.g., `{"error": "message"}`) with full CORS support.

---

## Connection & Dependencies

- **main.py**: while FastAPI usually uses intermediate middleware for CORS, RoamPal's routers often use these manual helpers for edge cases, pre-flight `OPTIONS` requests, or custom error handling where global middleware might be bypassed.
- **Tauri Frontend**: The `axios` or `fetch` calls from the UI expect these headers to be present to successfully process the JSON payload.
