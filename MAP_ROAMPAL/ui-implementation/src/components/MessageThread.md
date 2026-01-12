# MessageThread.tsx - Map

## Summary

`MessageThread.tsx` is the primary orchestrator for the chat display. It takes a flat list of messages and applies a grouping algorithm to cluster consecutive messages from the same sender within a short time window (5 minutes). It then delegates the rendering of these clusters to the `MessageGroup` component. It also defines the core `Message` and metadata interfaces (Actions, CodeChanges, Citations) used across the chat UI.

---

## Technical Map

### Data Structures

#### `Message` Interface (Lines 10-23)

- `id`, `sender`, `content`, `timestamp`.
- `status`: Tracking for `sending` and `error` states.
- `memories`: References to RAG fragments used.
- `citations`: Source metadata.
- `attachments`: List of files.
- `processing`: Current stage of AI activity (retrieval, thinking, etc.).
- `actions`: Tool executions (completed, failed).
- `code_changes`: Proposed file edits.

### Component Logic

#### `groupMessages` Helper (Lines 101-134)

- Iterates through the message array to create semantic clusters.
- **Grouping Rule**: A new group is started if:
  - The sender changes.
  - The time difference between messages exceeds 5 minutes.
  - It's the first message in the thread.
- Returns an array of groups, each with a sender, a base timestamp, and its constituent messages.

### UI Structure

- **Container**: A vertical stack with `space-y-6`.
- **List Rendering**: Iterates over `groupedMessages` and renders a `MessageGroup` for each.
- **End Anchor (Line 95)**: A null div (`#messages-end`) used as a target for programmatic scrolling to keep the latest message in view.

---

## Connection & Dependencies

- **MessageGroup.tsx**: Primary child component for rendering clusters.
- **TerminalMessageThread.tsx**: Higher-level variant that implements virtualization and terminal-style aesthetics. `MessageThread` is the more traditional conversational baseline.
- **useChatStore.tsx**: Provides the source of truth for the `messages` array.
