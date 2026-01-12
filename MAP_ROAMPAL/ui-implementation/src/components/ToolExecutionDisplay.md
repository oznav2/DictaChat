# ToolExecutionDisplay.tsx - Map

## Summary

`ToolExecutionDisplay.tsx` is a specialized renderer for assistant background actions (tool calls). It provides a visual timeline of what the LLM is doing (e.g., searching memory, reading a file, or executing code). It displays progress indicators, completion marks, or error states for each sequential action perform in a single message turn.

---

## Technical Map

### Component Props (`ToolExecutionDisplayProps`)

- `executions`: Array of `ToolExecution` objects containing:
  - `tool`: Internal identifier (e.g., `vector_search`).
  - `description`: Human-readable label (e.g., "Searching documentation").
  - `status`: `running` (Spinning), `completed` (Green check), or `failed` (Red X).
  - `detail`: (Optional) Technical output or error snippet.

### UI Structure

- **List Container**: A vertical stack with `space-y-2`.
- **Action Card (Lines 29-62)**:
  - **Status Indicator**:
    - **Running**: A custom blue CSS spinner.
    - **Completed**: Solid Green `CheckCircleIcon`.
    - **Failed**: Solid Red `XCircleIcon`.
  - **Header**: Displays the primary `description` in `zinc-300` and a blue "Running..." tag if active.
  - **Technical Detail**: Subtle `zinc-500` text below the header for secondary info (e.g., "Found 5 matches").

---

## Connection & Dependencies

- **EnhancedChatMessage.tsx**: The primary parent that embeds this display before the main markdown response.
- **TerminalMessageThread.tsx**: Uses this to render the interleaved tool execution history.
- **heroicons**: Source for completion and failure icons.
- **useChatStore.ts**: Provides the real-time stream of tool execution events via the message object.
