# MemoryCitation.tsx - Map

## Summary

`MemoryCitation.tsx` is a specialized component that visualizes RAG (Retrieval Augmented Generation) data within the chat interface. It parses assistant messages for numeric citations (e.g., [1], [2]), styles them as interactive superscripts, and provides both hover-based tooltips and a summary list for detail inspection. It categorizes memories into system-specific collections like `books`, `working`, `history`, and `patterns`.

---

## Technical Map

### Component Props (`MemoryCitationProps`)

- `message`: The raw text content of the assistant's response.
- `citations`: Array of `Citation` objects containing metadata like source, confidence, and collection type.

### Feature Logic

#### Inline Citation Parsing (Lines 57-71)

- Uses a `useMemo` hook to scan the message text via regex (`\[\d+\]`).
- Replaces matches with specialized `<sup>` tags containing `citation-link` classes and `data-citation-id` attributes.
- **Safety**: Rendered using `dangerouslySetInnerHTML` to allow the styled superscripts.

#### Interactive Tooltips (Lines 73-94, 109-139)

- Implements a global `mouseover` listener to detect when a user hovers over a generated `.citation-link`.
- Highlights the specific `hoveredCitation` and renders a `fixed` position tooltip with deep metadata:
  - Source name and collection icon.
  - Confidence score (Color-coded: Green ≥ 90%, Yellow ≥ 70%, Orange < 70%).
  - The original snippet of retrieved text.

#### Collection Encoding

- **Icons**: `books` (BookOpen), `working` (CpuChip), `history` (Clock), `patterns` (Bolt).
- **Colors**: Purple (Books), Blue (Working), Green (History), Yellow (Patterns).

### UI Structure

- **Message Area (Lines 103-106)**: The core text block with injected superscripts.
- **Collapsible Footer (Lines 142-195)**:
  - A summary button showing "Used X memories".
  - Expands into a detailed list of all memory cards with icons, percentages, and (truncated) text snippets.

---

## Connection & Dependencies

- **MessageThread.tsx**: The parent component that passes citations and message text.
- **heroicons**: Comprehensive use of outline icons for semantic categorization.
- **Backend API**: Expects the `citations` array to be populated by the RAG pipeline in the chat response.
