# fetch.ts - Map

## Summary

`fetch.ts` provides a unified `apiFetch` wrapper that abstracts away the differences between standard web environments and the Tauri native bridge. It ensures that networking works seamlessly in development (native `fetch`) and production (Tauri's granular `@tauri-apps/api/http` client), while providing special handling for localhost/streaming requirements.

---

## Technical Map

### Branching Logic (Lines 13-19)

The function chooses a fetch implementation based on the environment and target URL:

- **Native `fetch`**: Used if not in Tauri, or if the URL points to `localhost`/`127.0.0.1`.
  - **Rationale**: Browser `fetch` natively supports SSE (Server-Sent Events) and Chunked Streaming, which are critical for real-time AI responses from the local Python backend.
- **Tauri HTTP Client**: used in production for non-local external URLs.

### Tauri Bridge Implementation (Lines 22-62)

When using the native Tauri bridge, the function performs several transformations:

- **Body Serialization**: Manually converts `RequestInit` bodies (strings, JSON objects, `FormData`, `URLSearchParams`) into Tauri-compatible `Body.text()` objects.
- **Header normalization**: Maps standard HTTP headers to Tauri's internal key-value structure.
- **Response Mapping**: Converts the result from Tauri's internal `Response` type back into a standard web-compatible `Response` object. This allows the rest of the app to use `.json()`, `.text()`, and `.ok` properties as if it were a standard fetch.

---

## Connection & Dependencies

- **useChatStore.ts**: Relies on this for all conversation and session management API calls.
- **modelContextService.ts**: Uses this for dynamic context limit discovery.
- **Tauri HTTP API**: Required for native network operations.
