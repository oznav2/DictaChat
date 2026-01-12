# Toast.tsx - Map

## Summary

`Toast.tsx` is a lightweight notification component for displaying transient system messages. It provides visual feedback for operations like successful saves, connection errors, or information alerts. It features automatic self-dismissal, specialized styling for different message types, and enter-animations.

---

## Technical Map

### Component Props (`ToastProps`)

- `message`: Text content of the notification.
- `type`: Category (`success`, `error`, `info`).
- `onClose`: Callback triggered upon dismissal.
- `duration`: Time in milliseconds before the toast disappears (defaults to 4000ms).

### Feature Logic

- **Lifecycle (Lines 11-17)**: Uses a `useEffect` with a `setTimeout` to trigger `onClose` after the specified duration. The timer is cleared on unmount to prevent memory leaks.
- **Categorization Styles**:
  - **Success (Green)**: Checkmark icon, green border/glow.
  - **Error (Red)**: X-circle icon, red border/glow.
  - **Info (Blue)**: Info-circle icon, blue border/glow.

### UI Structure

- **Global Inset (Line 50)**: Fixed at the top-right corner (`top-4 right-4`) with high z-index (`z-[100]`).
- **Animations**: Uses Tailwind's `animate-in` and `slide-in-from-top-2` for smooth entry.
- **Content Area**: Flexbox layout with a fixed icon, auto-wrapping message text, and a manual "X" close button.

---

## Connection & Dependencies

- Used extensively in:
  - **IntegrationsPanel.tsx** (MCP connection status).
  - **MCPServersPanel.tsx** (Server lifecycle events).
  - **PersonalityCustomizer.tsx** (Configuration save results).
  - **BookProcessorModal.tsx** (Document ingestion updates).
