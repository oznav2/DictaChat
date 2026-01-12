# main.tsx - Map

## Summary

`main.tsx` is the bootstrap of the RoamPal application. It orchestrates the initial application lifecycle, including backend process verification (using `useBackendAutoStart`), global error handling via a root React Error Boundary, and the mounting of the primary workspace components (`ConnectedChat` and `UpdateBanner`).

---

## Technical Map

### Application Lifecycle

#### Backend Boot (Lines 12-46)

The root `App` component is a state machine driven by the `useBackendAutoStart` hook:

- **`checking` / `starting`**: Renders a fullscreen "dark mode" splash screen with a blue spinner and status text (e.g., "Starting Roampal backend...").
- **`error`**: Renders a fatal error screen displaying the specific `errorMessage` (e.g., failed to bind port or missing binary). Provides a "Retry" button that triggers a hard page reload.
- **`ready`**: Mounts the main chat interface.

#### Workspace Assembly (Lines 48-53)

Once initialized, the app renders:

1. **`ConnectedChat`**: The primary split-pane chat and memory interface.
2. **`UpdateBanner`**: A global floating notification for version management.

#### Error Recovery (Lines 57-94)

- Implements a classic React Class Component `ErrorBoundary`.
- **Catch**: Log errors to the console.
- **UI**: If a crash occurs (e.g., a message fails to render or a hook errors), it swaps the entire viewport for a "Something went wrong" recovery screen with a "Reload App" button.

### Root Mounting (Lines 97-101)

- Traditional `ReactDOM.createRoot` targeting the `#root` element in the HTML template.
- Wraps the entire application in the `ErrorBoundary`.

---

## Connection & Dependencies

- **useBackendAutoStart.ts**: Functional dependency for the boot sequence.
- **ConnectedChat.tsx**: The primary view component.
- **index.css**: Imports global styling and Tailwind base.
- **ErrorBoundary**: Prevents white-screen-of-death (WSOD) scenarios by providing a structured fallback.
