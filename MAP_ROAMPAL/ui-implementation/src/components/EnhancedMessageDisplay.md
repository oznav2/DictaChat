# EnhancedMessageDisplay.tsx - Map

## Summary

`EnhancedMessageDisplay.tsx` is the primary renderer for assistant messages. It converts raw markdown content into stylized HTML, provides syntax highlighting for code blocks using `react-syntax-highlighter`, and renders a collapsible section for citations/memories retrieved by the LLM.

---

## Technical Map

### Core Dependencies

- **Markdown**: `react-markdown`.
- **Syntax Highlighting**: `react-syntax-highlighter` (Prism, oneDark style).
- **Icons**: `lucide-react` (Copy, Check, ChevronDown, ChevronUp).

### Component Props (`EnhancedMessageDisplayProps`)

- `content`: Raw markdown string from the assistant.
- `codeBlocks`: (Optional) Metadata for code segments.
- `citations`: (Optional) List of memory sources retrieved.

### Features

#### Inline & Block Code Rendering (Lines 41-90)

- **Regex Detection**: Uses `language-(\w+)` to identify code block languages.
- **Copy Functionality**: Injects a floating "Copy" button into code block headers. Manages `copiedIndex` to show a temporary checkmark.
- **Syntax Highlighting**: Wraps multi-line code in `SyntaxHighlighter` with the `oneDark` theme.
- **Styling**: Inline code (e.g., \`code\`) is rendered with a simple `zinc-800` background.

#### Citation System (Lines 101-133)

- **Collapsible Toggle**: Uses a chevron icon to expand/collapse the list if `citations` are present.
- **Badge Metadata**: For each citation, it displays:
  - `citation_id`: The numeric reference (e.g. [1]).
  - `source`: Filename or URL.
  - `confidence`: Percentage score.
  - `collection`: The memory storage it came from (e.g., `knowledge`).
  - `text`: (Optional) Snippet of the actual content matched.

#### Typography (Lines 95-99)

- Uses Tailwind's `prose prose-invert` classes for consistent styling of bold, italic, lists, and links within the markdown output.

---

## Connection & Dependencies

- **EnhancedChatMessage.tsx**: The parent component that feeds data into this display.
- **useChatStore.tsx**: Provides the `citations` and `content` through the message object.
