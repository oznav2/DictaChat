# KnowledgeGraph.tsx - Map

## Summary

`KnowledgeGraph.tsx` is an interactive, canvas-based force-directed graph component. It visualizes the "Concept Routing Map" of RoamPal's memory system. Unlike static graphs, it represents the system's _learning_ — showing which concepts consistently lead to successful memory retrieval. It handles real-time physics simulation, high-performance rendering for high-DPI displays, and provides deep analytical insights into individual concepts via an integrated detail modal.

---

## Technical Map

### Core Logic

#### Data Processing (Lines 103-240)

- **Hybrid Scoring (Line 113)**: Nodes are sized based on `√usage × √(quality + 0.1)`. This formula ensures that frequently used concepts _and_ highly successful ones both gain visual prominence.
- **Top-N Filtering (Line 173)**: Limits the display to the top 20 nodes to prevent visual clutter and maintain performance in the sidebar.
- **Search & Connectivity (Line 218)**: When searching, the system ensures that connected "neighbor" nodes are kept visible to maintain context.

#### Physics Engine (Lines 353-388)

- **Custom Simulation**: Implements manual velocity-based physics without external libraries (like d3-force).
- **Forces**:
  - **Damping (0.95)**: Reduces energy over time for stability.
  - **Repulsion (50)**: Prevents nodes from overlapping.
  - **Attraction (0.001)**: Gently pulls nodes towards the center of the canvas.

#### Rendering Engine (Lines 391-540)

- **High-DPI Scaling (Lines 554-568)**: Uses `window.devicePixelRatio` and `ctx.scale` to ensure sharp text and graphics on retina displays.
- **Canvas Draw Loop**:
  - **Edges**: Lines colored `zinc-800` with weight-based thickness and probability labels.
  - **Nodes**: Circles colored based on the "Triple KG" system (Query, Content, Action, or Both).
  - **Labels**: Rendered in monospace font above nodes; success rates rendered _inside_ node centers.
- **Responsive Layout**: Uses `ResizeObserver` to track the container's size (essential for sidebar dragging) and re-initializes the canvas buffer.

### Visual Encoding (Legend)

- **Blue (Routing)**: Learned from user queries.
- **Green (Content)**: Entities extracted from saved memories.
- **Purple (Both)**: Concepts corroborated by both queries and content.
- **Orange (Action)**: Patterns of action effectiveness (e.g., "Search worked for this").

### Interactive Features

- **Time Filtering (Line 140)**: Filter concepts by Today, This Week, or current Session (using `sessionStorage`).
- **Concept Detail Modal (Lines 742-945)**:
  - Fetches deep-dive data from `/api/memory/knowledge-graph/concept/[id]/definition`.
  - Shows outcome breakdowns (Worked vs Failed) and related concepts.

---

## Data Structures

- **GraphNode**: `id`, `label`, `source`, `hybridScore`, `success_rate`, `usage_count`, `best_collection`.
- **GraphEdge**: `source`, `target`, `weight`.
- **ConceptDefinition**: Detailed metadata including `outcome_breakdown` and `related_concepts_with_stats`.

---

## Connection & Dependencies

- **MemoryPanelV2.tsx**: Directly embeds this component.
- **Backend API**:
  - `/api/memory/knowledge-graph`: Primary data source.
  - `/api/memory/knowledge-graph/concept/[id]/definition`: Detailed analytics.
- **ResizeObserver**: Used for responsive canvas re-sizing.
