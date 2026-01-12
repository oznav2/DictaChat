# DeleteSessionModal.tsx - Map

## Summary

`DeleteSessionModal.tsx` is a streamlined confirmation dialog used specifically for deleting individual chat sessions from the sidebar. Unlike the more complex `DeleteConfirmationModal`, it relies on standard "Cancel/Delete" buttons without requiring manual text entry, making it more efficient for routine session cleanup.

---

## Technical Map

### Component Props (`DeleteSessionModalProps`)

- `isOpen`: Controls visibility.
- `sessionTitle`: The human-readable name of the session to be deleted (displayed in bold for clarity).
- `onConfirm`: Callback to execute the deletion.
- `onCancel`: Callback to close the modal without action.

### UI Structure

- **Global Inset (Line 20)**: Fixed backdrop with centered positioning.
- **Header (Lines 23-41)**:
  - Features a circular red warning icon.
  - Displays "Delete Conversation" title and a permanent-loss warning.
  - Includes a top-right "X" close button using `XMarkIcon`.
- **Content (Lines 44-51)**:
  - Text block confirming the target `sessionTitle`.
  - Clarifies that _all_ messages within the session will be purged.
- **Actions (Lines 54-70)**:
  - Right-aligned buttons.
  - **Cancel**: Gray (`zinc-800`).
  - **Delete**: Bright red (`red-600`).

---

## Connection & Dependencies

- **Sidebar.tsx**: The primary consumer of this modal, triggered when the user clicks the trash icon on a session list item.
- **useChatStore.ts**: The `onConfirm` callback typically calls `deleteSession` from the chat store.
- **heroicons**: Icon provider.
