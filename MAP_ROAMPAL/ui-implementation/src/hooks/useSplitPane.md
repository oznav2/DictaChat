# useSplitPane.ts - Map

## Summary

`useSplitPane.ts` is a custom React hook that manages the logic for resizable sidebars and panels. it handles mouse event tracking for drag-to-resize behavior, enforces minimum and maximum size constraints, supports both vertical and horizontal directions, and optionally persists state to `localStorage`.

---

## Technical Map

### Hook Configuration (`UseSplitPaneOptions`)

- `initialSize`: The default width/height.
- `minSize` / `maxSize`: Clamp boundaries.
- `direction`: `'horizontal'` (column resize) or `'vertical'` (row resize).
- `storageKey`: (Optional) Key used for `localStorage` persistence.
- `inverted`: Boolean flag for right-sidebars where dragging "left" (negative delta) means "growing" the pane.

### Core Logic

#### Persistence (Lines 22-37)

- On initialization, it checks `localStorage` for a saved size.
- **Safety**: If the saved size is too small (≤ 50), it defaults back to `initialSize` to prevent panels from being "lost" on page load.

#### Draggability (Lines 43-92)

- **Mouse Down**: Captures the start position and size. Sets global document styles (`cursor: col-resize`, `userSelect: none`) to ensure resizing isn't interrupted by text selection.
- **Mouse Move**: Calculates `delta` from start position. Applies inversion logic if needed. Clamps the result between `min` and `max`.
- **Mouse Up**: Finalizes the size and commits it to `localStorage`. Cleans up global styles.

### Return Values

- `size`: The current numeric width/height.
- `isDragging`: Boolean flag for UI feedback (e.g., highlighting the dragger bar).
- `handleMouseDown`: Event handler to be attached to the "resizer" element.
- `reset`: Function to revert to initial size.
- `setSize`: Direct setter for programmatic collapse/expand.

---

## Connection & Dependencies

- **ConnectedChat.tsx**: Uses two instances of this hook to manage the left "Sessions" sidebar and the right "Memory" pane.
- **localStorage**: Used for browser-level persistence of UI layout.
