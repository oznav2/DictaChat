# TerminalMessageThread.tsx - Map

## Summary

`TerminalMessageThread.tsx` is a high-performance, terminal-style message display component. It utilizes `react-window` for virtualization, ensuring smooth scrolling even with thousands of messages. The UI is designed to look like a terminal (monospace fonts, `>` prompts for users) and features advanced rendering for markdown, recursive tool executions, and memory citations. It also includes "event-based" rendering for real-time streaming where text and tool steps can be interleaved.

---

## Technical Map

### Core Dependencies

- **Virtualization**: `react-window` (`VariableSizeList`) for efficient rendering of large message lists.
- **Markdown**: `react-markdown` with `remark-gfm` (GitHub Flavored Markdown) and `rehype-raw` (HTML support).
- **Icons**: `lucide-react` (Terminal, CheckCircle, etc.).
- **Components**: `MemoryCitation`, `CodeChangePreview`.

### Internal Components

#### `MemoizedMarkdown` (Lines 12-105)

- **Purpose**: Prevents expensive re-parsing of markdown during streaming or re-renders.
- **Features**:
  - `stripThinkingTags`: Removes `<think>` blocks from the final output.
  - `processCallouts`: Converts `:::type` syntax into styled div callouts (success, warning, etc.).
  - **Syntax Highlighting**: Custom implementation for `<code>` blocks with a copy-to-clipboard button.

#### `ThinkingDots` (Lines 108-123)

- Polling-based animation that cycles through 1-3 dots every 400ms.

#### `CitationsBlock` (Lines 126-176)

- Displays an expandable list of source references.
- **Color Coding**: Different colors for different memory collections (`books`, `working`, `history`, `patterns`, `memory_bank`).

#### `MessageRow` (Lines 209-412)

- Memoized row component for the virtualized list.
- **Measurement**: Uses `useLayoutEffect` and `ResizeObserver` (via `setSize`) to inform `react-window` of the actual row height after content renders.
- **Rendering Modes**:
  1. **Event-based (Lines 280-331)**: Processes a chronological timeline of `text_segment` and `tool_execution` events.
  2. **Legacy (Lines 335-370)**: Flat rendering of content and tool executions for older message formats.
- **Persona Styles**:
  - **User**: Leading `>` prompt, zinc secondary text, attachment chips.
  - **Assistant**: Complex rendering of tools, text, and citations.
  - **System**: Amber-colored alert style starting with `!`.

### Main Component: `TerminalMessageThread` (Lines 424-538)

- **Virtualized List Setup**:
  - `listRef`: For imperative scrolling.
  - `sizeMap`: Caches measured heights of rows.
  - `getSize`: Calculates height; uses an estimation algorithm (Lines 463-474) before actual measurement is available to prevent layout shift.
- **Auto-Scroll**: Triggers `scrollToItem` to the bottom whenever the `messages.length` increases.
- **Container Observation**: Uses `ResizeObserver` to update the list's width and height when the window or sidebar resizes.

---

## Data Structures

- **Message Interface (Lines 178-207)**:
  - `events`: Array of `thinking` | `tool_execution` | `text` | `text_segment`.
  - `toolExecutions`: Status, description, resultCount, and arguments.
  - `citations`: Metadata and snippets from RAG.
  - `_lastTextEndIndex`: Internal cursor for streaming text segments.

---

## Connection & Dependencies

- **react-window**: Core virtualization engine.
- **ConnectedChat.tsx**: Passes the `messages` array and `isProcessing` status.
- **MemoryCitation.tsx**: Specialized component for deep-linking to memory fragments.
- **CSS**: Relies on `animate-pulse-subtle` and `markdown-content` classes.
