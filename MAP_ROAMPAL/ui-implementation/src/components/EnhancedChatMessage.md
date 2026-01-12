# EnhancedChatMessage.tsx - Map

## Summary

`EnhancedChatMessage.tsx` is the primary container for rendering a single message in the chat thread. It differentiates between user and assistant senders, fetches assistant identity from personality settings, and orchestrates the display of complex assistant outputs including tool executions, citations, and markdown content.

---

## Technical Map

### Component Props (`EnhancedChatMessageProps`)

- `message`: Object containing:
  - `id`, `sender` (`user`/`assistant`), `content`.
  - `streaming`: Boolean for active generation state.
  - `thinking`: Reasoning block.
  - `toolExecutions`: Array of background actions performed by the LLM.
  - `citations`: Array of source references used in the message.
  - `metadata`: includes `model_name`.

### Component Logic

- **Assistant Identity (Lines 58-81)**: If the sender is an assistant, the component fetches the current personality profile from `/api/personality/current` and parses the YAML content to extract the `name` field (defaulting to "Roampal").
- **Time Formatting**: Displays local time in 2-digit hour/minute format.
- **Model Attribution (Lines 117-121)**: If provided in metadata, the model source (e.g., "llama3") is displayed in a small badge.

### UI Structure

- **Message Row (Lines 84-87)**: Flexbox with `gap-3`. User messages have a subtle `zinc-900/30` background for visual grouping.
- **Avatar (Lines 90-101)**:
  - User: Blue `User` icon.
  - Assistant: Zinc `Bot` icon.
- **Content Area (Lines 105-154)**:
  - **Header**: Sender Name + Time + Model Badge + Pulsing "Typing" indicator if streaming.
  - **User Body**: Plain text with `whitespace-pre-wrap` (Line 130).
  - **Assistant Body**:
    - **Tool Execution (Lines 135-142)**: Renders the `ToolExecutionDisplay` for background tasks (e.g., search, file read).
    - **Main Content (Lines 146-151)**: Delegates to `EnhancedMessageDisplay.tsx` for rich markdown and citation rendering.

---

## Connection & Dependencies

- **EnhancedMessageDisplay.tsx**: Child component for specialized text formatting.
- **ToolExecutionDisplay.tsx**: Child component for showing AI actions.
- **apiFetch.ts**: Used to retrieve assistant personality.
- **lucide-react**: Icon provider.
- Used within `MessageThread.tsx` (the older thread implementation).
