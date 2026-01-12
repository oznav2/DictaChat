# FragmentBadges.tsx - Map

## Summary

`FragmentBadges.tsx` is an alternative memory management view. It lists "Memory Fragments" (individual context snips) in a separate sidebar panel, focusing on relevance scoring and categorization between `global` (system-wide) and `private` (user-specific) memories.

---

## Technical Map

### Component Props (`FragmentBadgesProps`)

- `onFragmentClick`: Callback triggered when a user selects a specific memory card.

### State & Logic

#### Sorting (Lines 89-95)

- **Recent**: Sorts by `timestamp` descending.
- **Score**: Sorts by `score` descending (relevance to the current conversation).

#### Formatting Helpers

- **`formatTime` (Lines 97-109)**: Relative time formatting (e.g., "10m ago", "5h ago").
- **`getScoreColor` (Lines 111-116)**: Dynamic CSS class assignment based on score threshold (Green ≥ 90%, Blue ≥ 70%, Yellow ≥ 50%).

#### Data Fetching (Lines 32-87)

- Queries `GET /api/memory/fragments`.
- **Mock Data**: Provides a rich set of fallback fragments (API Optimization, Caching, indexing, etc.) for testing without a backend.

### UI Structure

- **Global Inset (Line 119)**: 320px wide fixed-height column with a `zinc-950` background.
- **Header (Lines 121-152)**:
  - Metadata display with "Sparkles" icon.
  - Sorting toggle buttons for `Recent` vs `Score`.
- **List Area (Lines 155-222)**:
  - **Fragment Card**: Scalable cards (`hover:scale-[1.02]`) with multiple metadata layers.
  - **Header Row**: Type Badge (Global/Private) and Score Percentage.
  - **Content**: 2-line clamped summary of the memory text.
  - **Tags Row**: Displays up to 3 hashtags (e.g., `#database`, `#performance`) with an overflow counter.
  - **Footer Row**: Clock icon and relative time string.
- **Footer Stats (Lines 225-233)**: Bottom bar showing counts of Global vs Private vs Total fragments.

---

## Connection & Dependencies

- **apiFetch.ts**: Used for memory retrieval.
- **heroicons**: Icon package.
- **ContextBar.tsx**: Similar in purpose; this component serves as a more "badge-heavy" alternative UI for the same underlying data.
