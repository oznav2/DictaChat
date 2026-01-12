# MemoryStatsPanel.tsx - Map

## Summary

`MemoryStatsPanel.tsx` is a real-time monitoring dashboard for RoamPal's memory system. It displays granular counts for various memory collections (Books, Working, History, Patterns) and tracks the evolution of the Knowledge Graph, including routing and solution patterns. It uses a polling mechanism to provide up-to-date metrics on learning status and memory relationships.

---

## Technical Map

### Component Props (`MemoryStatsPanelProps`)

- `isOpen`: Controls visibility.
- `onClose`: Callback to dismiss the panel.

### State & Workflows

#### Real-time Polling (Lines 50-78)

- **Mechanism**: Uses `setInterval` to hit `GET /api/chat/stats` every 5 seconds while the panel is open.
- **Error Handling**: Captures and displays HTTP errors or connectivity issues in a dedicated red banner.

#### Data Overview (`MemoryStats` interface)

- **Collections**:
  - `books`: Static reference documents.
  - `working`: RAM-like context for the last 24 hours.
  - `history`: Long-term archival for past conversations.
  - `patterns`: Verified solution templates.
- **Knowledge Graph**: Tracks specialized pedagogical nodes like `routing_patterns`, `problem_solutions`, and `failure_patterns`.
- **System Status**: Monitors whether `outcome_detection` and `knowledge_graph` optimization are currently active.

### UI Structure

#### Side Panel Layout (Line 91)

- A 320px (80 rem) wide sidebar anchored to the right side of the screen (`fixed inset-y-0 right-0`).

#### Sectioned Dashboard

- **Collections Card (Lines 123-162)**: Displays raw counts for each memory type with a semantic color dot (Blue/Green/Amber/Purple) and a total aggregator.
- **Knowledge Graph Card (Lines 165-195)**: Tracks the "intelligence" of the system through learned patterns.
- **Learning Status Card (Lines 198-214)**: Shows binary "Active/Inactive" status for background optimization processes.
- **Relationship Stats (Lines 217-231)**: Displays internal counts for `Related`, `Evolution`, and `Conflicts` (shown only if > 0).

---

## Connection & Dependencies

- **apiFetch.ts**: Standard backend communication.
- **ROAMPAL_CONFIG**: API endpoint source.
- **heroicons**: Icon provider for semantic headers (ChartBar, CircleStack, Sparkles).
- Usually triggered from a link or button in the `MemoryPanelV2` or settings area.
