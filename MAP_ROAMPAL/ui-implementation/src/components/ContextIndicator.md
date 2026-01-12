# ContextIndicator.tsx - Map

## Summary

`ContextIndicator.tsx` is a compact status bar component that displays active "Context Signals" for the current turn. It visually surfaces backend states such as which file is being edited, whether an error occurred, if code generation is ready, or how many memories were retrieved for the last query.

---

## Technical Map

### Data Structure (`ContextInfo`)

- `current_file`: Path of the file the LLM is focused on (Blue indicator).
- `last_error`: Presence of a processing error (Red indicator).
- `has_code`: Boolean indicating if a code block was generated or is being held (Green indicator).
- `memories_retrieved`: Number of RAG fragments pulled for the current message (Purple indicator).

### Component Props (`ContextIndicatorProps`)

- `context`: The `ContextInfo` object to render.
- `className`: Optional tailwind classes for positioning/spacing.

### UI Structure

- A horizontal flexbox within a `gray-800` rounded container.
- **Conditional Rendering**:
  - **File Section**: `FileIcon` + filename.
  - **Error Section**: `AlertCircleIcon` + "Error present" text.
  - **Code Section**: `CodeIcon` + "Code ready" text.
  - **Memory Section**: `DatabaseIcon` + retrieval count.

---

## Connection & Dependencies

- Usually displayed at the bottom of a message thread or just above the input field.
- Data is typically provided by the backend in message metadata and piped through `useChatStore`.
- **lucide-react**: Core icon provider.
