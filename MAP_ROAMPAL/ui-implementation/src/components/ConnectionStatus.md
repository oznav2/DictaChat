# ConnectionStatus.tsx - Map

## Summary

`ConnectionStatus.tsx` is a lightweight status indicator that shows the current state of the application's connection to the backend. It uses simple color-coded dots and text labels to represent connected, connecting, disconnected, and error states.

---

## Technical Map

### Component Props (`ConnectionStatusProps`)

- `status`: one of `connecting`, `connected`, `disconnected`, or `error`.

### Status Configurations (Lines 8-35)

- **Connected**: `bg-green-500`, "Connected".
- **Connecting**: `bg-yellow-500`, "Connecting...", with `animate-pulse`.
- **Disconnected**: `bg-zinc-500`, "Disconnected".
- **Error**: `bg-red-500`, "Connection Error".

### UI Structure

- A horizontal flexbox container with:
  - A 2x2 rounded dot for the color indicator.
  - A `text-zinc-400` span for the human-readable status text.

---

## Connection & Dependencies

- Embedded in the header of `ConnectedChat.tsx`.
- Status usually derived from `useChatStore.tsx`.
