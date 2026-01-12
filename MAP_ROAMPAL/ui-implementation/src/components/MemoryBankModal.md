# MemoryBankModal.tsx - Map

## Summary

`MemoryBankModal.tsx` is a full-screen management interface for RoamPal's long-term "Memory Bank". It allows users to browse, filter, and curate the facts the AI has stored about them. The modal supports virtualized lists for high-performance rendering of thousands of memories, a multi-tag filtering system, and an archival system for hiding outdated context without permanent deletion.

---

## Technical Map

### Component Props (`MemoryBankModalProps`)

- `isOpen`: Controls visibility.
- `onClose`: Callback to dismiss the modal.

### State & Logic

#### Data Organization (Lines 15-31)

- **Active Memories**: Context currently utilized by the LLM for reasoning.
- **Archived Memories**: Historical context kept but excluded from active prompts.
- **Stats**: Aggregated metadata (Total count, active/archived split, unique tags).

#### High-Performance Rendering (Lines 38-41, 185-231)

- **`react-window`**: Uses a `VariableSizeList` to render only the visible memory cards.
- **Dynamic Sizing**: `getItemSize` calculates row height based on the presence of hashtags (90px without, 110px with).
- **Auto-resize**: Listens to viewport changes to adjust the virtualized container height in real-time.

#### Content Management (Lines 108-152)

- **Archive**: Moves a memory to the `archived` collection via `PUT /api/memory-bank/{id}`.
- **Restore**: Reverses archival via `POST /api/memory-bank/restore/{id}`.
- **Delete**: Permanently purges a record via `DELETE /api/memory-bank/delete/{id}`.

#### Filtering System (Lines 160-169)

- **Search**: Case-insensitive substring match across memory text and tags.
- **Tag Filter**: An `every` requirement (AND logic); only memories containing ALL selected tags are displayed.

### UI Structure

- **Tabs (Lines 308-341)**: Switches between `Active`, `Archived`, and `Stats` views.
- **Control Bar (Lines 344-386)**:
  - Search input with magnifying glass.
  - Tag-cloud toggle button with a cyan selection count.
  - Expandable tag cloud for filtering.
- **Virtualized Lists (Lines 405-433)**: Custom row renderers for active and archived memories with distinct styling (archived is more transparent).
- **Stats Dashboard (Lines 434-476)**: 4-card grid showing high-level metrics and a complete tag cloud.

---

## Connection & Dependencies

- **react-window**: Core virtualization library.
- **apiFetch.ts**: For all bank operations.
- **ROAMPAL_CONFIG**: API endpoint source.
- **heroicons**: Standard UI iconography (Archive, Trash, Tag, Graph, Sparkles).
