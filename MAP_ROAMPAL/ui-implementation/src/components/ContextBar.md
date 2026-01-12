# ContextBar.tsx - Map

## Summary

`ContextBar.tsx` is an earlier implementation of the right sidebar (context/memory panel) in RoamPal. It provides a tabbed interface to view "Fragments" (individual memory snips), a simplified "Graph" overview, and external "References". It includes local filtering, sorting, and fetching logic, making it more autonomous than its successor `MemoryPanelV2.tsx`.

---

## Technical Map

### Component Props (`ContextBarProps`)

- `memories`: Initial array of `MemoryFragment` objects.
- `knowledgeGraph`: Metadata about concepts and relationships.
- `references`: List of external source links or snippets.
- `onMemoryClick`: Callback when a specific fragment is selected.
- `onRefresh`: (Optional) If provided, the component delegates data fetching to the parent.

### State management

- `activeTab`: Switches between `fragments`, `graph`, and `references`.
- `sortBy`: Toggles between `recent` (timestamp) and `score` (relevance).
- `fragments`: Local cache of memory fragments, allowing for internal updates.
- `searchQuery` / `showSearch`: Manages the local filtering UI for finding specific memories.
- `filterType`: Allows narrowing down fragments by their origin type (`memory`, `concept`, `relation`).

### Core Logic

#### Data Fetching (Lines 87-120)

- **Standalone Mode**: If NO `onRefresh` prop is passed, the component proactively calls `/api/memory/fragments` and `/api/memory/knowledge-graph` on mount.
- **Local Filtering (Lines 123-146)**: Implements a client-side filter that combines type matching and a case-insensitive search across content, tags, and session IDs.

#### Formatting Helpers

- **`formatTime` (Lines 148-159)**: Converts timestamps into relative strings (e.g., "now", "5m", "2h", "10d").
- **Encoding Status (Lines 161-179)**:
  - `getScoreColor`: Visual gradients for relevance scores (Emerald ≥ 0.9, Blue ≥ 0.7, Amber ≥ 0.5).
  - `getTypeColor`: Semantic colors for different object types in the memory store.

### UI Structure

- **Sidebar Header (Lines 184-263)**: Contains tab switches with counters and an action bar for refreshing, searching, and sorting.
- **Fragments Tab (Lines 268-365)**:
  - **Search Input**: Slide-down bar for real-time filtering.
  - **List**: Scrollable area of cards showing type, score, content (3-line clamp), tags, and metadata (session ID, time).
  - **Empty State**: Gradient-backed "Sparkles" illustration when no memories exist.
- **Graph Tab (Lines 368-431)**:
  - **Stats Grid**: Quick count of Concepts and Relations.
  - **Concept List**: Top 10 concepts with links count and strength indicators (Green/Yellow/Zinc).
- **References Tab (Lines 434-457)**: A simple list of hyperlinks with snippets.
- **Footer (Lines 461-467)**: Displays exact counts for the currently active tab.

---

## Connection & Dependencies

- **apiFetch.ts**: Used for direct API calls in standalone mode.
- **MemoryPanelV2.tsx**: This component is largely superseded by MemoryPanelV2 in newer versions of the app, but remains as the fallback or legacy context implementation.
- **heroicons**: Heavy use of outline icons for tabs and actions.
