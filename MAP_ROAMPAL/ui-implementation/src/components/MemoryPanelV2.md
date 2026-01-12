# MemoryPanelV2.tsx - Map

## Summary

`MemoryPanelV2.tsx` is the primary interface for the "Neural Memory" system. It occupies the right sidebar and provides two distinct ways to interact with stored knowledge: a searchable list of memory fragments and a dynamic "Knowledge Graph" (Concept Routing Map). It serves as an educational tool as well as a functional one, using modals to explain how RoamPal categorizes knowledge into working, history, pattern, and book collections.

---

## Technical Map

### Core Dependencies

- **Components**: `KnowledgeGraph.tsx` (Internal visualization).
- **Icons**: Custom SVG icons for Brain (Working), User (Conversation), Chip (Pattern), and Beaker (Book).

### State Management

- **Tab State**: `activeTab` switches between `all`, `books`, `working`, `conversations`, `patterns`, and `graph`.
- **Search & Filter**:
  - `searchQuery`: Literal string filtering.
  - `sortBy`: `recent` (timestamp) vs `score` (relevance).
  - `filterType`: Quick filtering by collection.
- **Detail state**: `selectedMemory` stores the fragment currently being viewed in the modal.

### Key Logic

#### Filtering & Sorting (Lines 242-299)

- **Multi-step Filter**:
  1. Filters based on the active tab (e.g., if on 'working' tab, strictly filter for 'working' collection).
  2. Applies the `filterType` dropdown.
  3. Performs case-insensitive search across the `text`/`content` fields.
- **Scoring Logic (Lines 270-299)**:
  - Items from `book` or `memory_bank` are excluded from score-based sorting (they use timestamp instead).
  - Other collections use `score` (0.0 to 1.0) derived from LLM effectiveness feedback.

#### Collection Icon Mapping (Lines 59-67)

- Maps backend collection names to visual indicators.
- **Books**: `BeakerIcon` (Static reference).
- **Patterns**: `ChipIcon` (Proven solutions).
- **Working**: `BrainIcon` (Current context).
- **Conversations**: `UserIcon` (Historical records).

### Memory Detail Modal (Lines 373-517)

- Displays full text and metadata for a specific fragment.
- **Visual Success/Failure History**: Parses `success_contexts` and `failure_reasons` JSON to show when and why a memory was (or wasn't) useful to the AI (Lines 430-479).
- **Persistent Flag**: Highlights memories marked as `persist_session`.

### UI Structure

- **Tab Bar (Lines 72-114)**: Toggle between List and Graph views with a refresh button.
- **Search & Filters (Lines 118-230)**: Search bar and collection dropdown.
- **Content Area (Lines 233-370)**:
  - **Graph View**: Renders the `KnowledgeGraph` component.
  - **List View**: Maps over filtered memories; each card shows a snippet, timestamp, collection badge, and a score progress bar (Lines 340-360).
- **Info Modals**:
  - `Understanding Memory Types`: Extensive guide on short-term vs long-term storage (Lines 520-692).
  - `Understanding Concept Routing Map`: Explains the Triple Knowledge Graph system (Routing, Content, Action) (Lines 695-866).

---

## Data Structures

- **Memory Fragment**:
  - `id`, `text`/`content`, `timestamp`.
  - `score`, `usefulness_score`, `sentiment_score`.
  - `type`/`collection_type`/`collection`.
  - `success_contexts`, `failure_reasons` (serialized JSON).

---

## Connection & Dependencies

- **ConnectedChat.tsx**: Passes the `memories` array and `knowledgeGraph` data.
- **KnowledgeGraph.tsx**: Embedded component for node-link visualization.
- **Backend API**: Data is refreshed via the `onRefresh` prop (linked to `/api/memory/*`).
