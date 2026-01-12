# memory_visualization_enhanced.py (routers) - Map

## Summary

`memory_visualization_enhanced.py` serves as the primary diagnostic and observability gateway for RoamPal's complex memory architecture. It exposes the internal state of the multi-tier memory system, including the Knowledge Graph (KG), success-based routing patterns, and the "Outcome-Based" learning data. This router transforms raw vector data and relationship graphs into a format optimized for the "Memory Map" UI, allowing users to visually audit what the agent has learned.

---

## Technical Map

### Statistical Observability (Lines 23-74)

- **`get_memory_stats`**: Aggregates health metrics from four distinct subsystems:
  - **`memory_collections`**: Item counts per tier (Working, History, etc.).
  - **`outcome_tracker`**: Performance benchmarks for learned problem-solving patterns.
  - **`kg_router`**: Summary of concepts and relationship density.
  - **`decay_scheduler`**: Status and next-run timestamps for ephemeral memory pruning.

### Dual Knowledge Graph (Lines 179-316)

- **`get_kg_concepts` (Dual KG)**: Implements the "Dual-Graph" visualization logic:
  - **Routing Graph**: Shows how the system maps queries to specific memory tiers.
  - **Content Graph (v0.2.0)**: Shows semantic entity relationships extracted directly from memory fragments.
  - **Optimization (Lines 224-283)**: Uses a fast-path that accesses in-memory graph structures directly, reducing total visualization load time from ~20s to <1s compared to raw database polling.

### Concept Intelligence (Lines 348-510)

- **`get_concept_definition`**:
  - Dynamically generates human-readable definitions for abstract concepts by searching across all memory tiers.
  - **Heuristics (Lines 424-450)**: Falls back to rule-based contextual definitions (e.g., identifying "API" or "Bug" concepts) if a matching history entry isn't found.
  - Returns a full "Concept Card" including `outcome_breakdown` (how often this concept led to a successful answer) and `related_concepts_with_stats`.

### Memory Mechanics (Lines 548-729)

- **Decay Control**: exposes the state of the "forgetting" logic. Users can view the TTL (Time To Live) settings or manually `force_decay` to clear old working memory.
- **`record_memory_feedback`**: the primary endpoint for "Human-in-the-Loop" training. When a user reacts to an agent's memory retrieval (Worked/Failed), this endpoint updates the confidence score of the underlying fragment, influencing future routing decisions.

### Content Graph Migration (Lines 732-771)

- **`backfill_content_graph`**: A one-time utility endpoint used to migrate old-format memories into the new v0.2.0 entity-relationship system.

---

## Connection & Dependencies

- **UnifiedMemorySystem.py**: The backend source for all memory retrieval and outcome tracking.
- **DecayScheduler.py**: Managed by the `/decay` endpoints.
- **MemoryMap (Frontend)**: The high-end D3.js or Force-Graph visualization component that depends on the `/knowledge-graph/concepts` endpoint.
- **FeedbackButtons (Frontend)**: The "Worked/Failed" UI elements call `record_memory_feedback`.
