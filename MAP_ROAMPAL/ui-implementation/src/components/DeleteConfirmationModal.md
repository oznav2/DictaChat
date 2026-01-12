# DeleteConfirmationModal.tsx - Map

## Summary

`DeleteConfirmationModal.tsx` is a high-friction confirmation dialog used for irreversible data deletion. It requires the user to manually type "DELETE" into an input field to enable the final action button, preventing accidental data loss. It is used as a sub-component within the `DataManagementModal`.

---

## Technical Map

### Component Props (`DeleteConfirmationModalProps`)

- `isOpen`: Controls visibility.
- `onClose`: Dismisses the modal and resets local confirmation text.
- `onConfirm`: The destructive callback function to execute if validation passes.
- `title`: Header text (distinguished by red coloring).
- `message`: Detailed explanation of what will be lost.
- `itemCount`: (Optional) Displays the exact number of objects (e.g., 50 memories) being deleted.
- `collectionName`: (Optional) Human-readable name of the database collection target.

### Component Logic

- **Input Validation (Line 47)**: The `isValid` variable is a boolean that is true ONLY if `confirmText === 'DELETE'`. This controls the `disabled` state of the primary button.
- **Async Execution (Lines 25-38)**: `handleConfirm` sets an `isDeleting` loading state, awaits the `onConfirm` callback, and then closes and resets itself.

### UI Structure

- **Backdrop (Lines 50-53)**: A `black/60` overlay that triggers a safe `handleClose` on click.
- **Modal Box (Line 55)**: A centered card with a distinct `red-600/30` border to signal danger.
- **Header (Lines 59-75)**: Red-themed top section with a warning icon and Title.
- **Warning Banner (Lines 79-81)**: A high-visibility `red-600/10` box at the top of the content area.
- **Metadata Card (Lines 85-98)**: A breakdown of items and collection name, displayed if `itemCount > 0`.
- **Confirmation Input (Lines 100-112)**: The core validation field.
- **Footer (Lines 116-144)**:
  - **Cancel**: Close button.
  - **Delete Permanently**: Red button that is disabled by default. Shows a spinner during deletion.

---

## Connection & Dependencies

- **DataManagementModal.tsx**: This component is the primary consumer.
- **heroicons**: Standard UI iconography (Warning icon, Close button).
