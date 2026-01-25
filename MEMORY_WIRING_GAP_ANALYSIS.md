# Memory System Backend-to-Frontend Wiring Gap Analysis

**Date**: January 13, 2026  
**Branch**: `genspark`  
**Status**: DRAFT - Awaiting Review

---

## Executive Summary

This document identifies the **wiring gaps** between your BricksLLM memory system implementation and RoamPal's fully functional memory visualization architecture. While your backend memory services are largely implemented (100% according to STATUS.md), the **observability gateway** that exposes the internal state of the multi-tier memory system to the UI is not properly wired.

### Key Finding
**The backend has the data. The frontend has the UI components. The wiring between them is incomplete or broken.**

---

## Architecture Comparison

### RoamPal Architecture (Working)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ROAMPAL MEMORY FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [agent_chat.py] ─────────────────────────────────────────────────────► │
│       │                                                                  │
│       ├── Cold-Start Auto-Trigger (msg #1)                              │
│       │   └── Injects user profile from Content KG                      │
│       │                                                                  │
│       ├── Contextual Guidance (every msg)                               │
│       │   ├── Proactive Insights (Content KG)                           │
│       │   ├── Action Stats (Action-Effectiveness KG)                    │
│       │   └── Failure Patterns (failure_patterns graph)                 │
│       │                                                                  │
│       ├── Tool Execution + Memory Caching                               │
│       │   └── _cache_memories_for_scoring()                             │
│       │                                                                  │
│       ├── Outcome Detection + Scoring                                   │
│       │   ├── detect_conversation_outcome()                             │
│       │   ├── Causal Scoring (upvote/downvote)                          │
│       │   └── Action KG Recording                                       │
│       │                                                                  │
│       └── WebSocket Streaming                                           │
│           ├── tool_start / tool_complete events                         │
│           ├── citations with doc_ids                                    │
│           └── memory_updated flag                                       │
│                                                                          │
│  [memory_visualization_enhanced.py] ──────────────────────────────────► │
│       │                                                                  │
│       ├── /stats → Aggregated health metrics                            │
│       ├── /knowledge-graph/concepts → Dual KG (Routing + Content)       │
│       ├── /knowledge-graph/concept/{id}/definition → Concept cards      │
│       ├── /patterns/performance → Pattern success rates                 │
│       ├── /decay/schedule → TTL and next-run                            │
│       ├── /search → Cross-tier semantic search                          │
│       └── /feedback → Human-in-the-loop scoring                         │
│                                                                          │
│  [Tauri UI - ChatWindow, MemoryMap, FeedbackButtons]                    │
│       │                                                                  │
│       ├── WebSocket listener for streaming events                       │
│       ├── useChatStore → citations, toolsUsed, memoryUpdated           │
│       ├── D3.js Force Graph for KG visualization                        │
│       └── Transparency Modal for memory audit                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Your BricksLLM Architecture (Current State)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      BRICKSLLM MEMORY FLOW (CURRENT)                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [runMcpFlow.ts] ─────────────────────────────────────────────────────► │
│       │                                                                  │
│       ├── prefetchMemoryContext() ✅                                    │
│       │   └── Returns MemoryContextResult with personality + context    │
│       │                                                                  │
│       ├── formatMemoryPromptSections() ✅                               │
│       │   └── Injects into system prompt                                │
│       │                                                                  │
│       ├── Tool Execution via MCP ✅                                     │
│       │   └── search_memory, add_to_memory_bank, etc.                   │
│       │                                                                  │
│       ├── storeWorkingMemory() ✅                                       │
│       │   └── Stores exchange in working tier                           │
│       │                                                                  │
│       └── recordResponseOutcome() ✅                                    │
│           └── Records outcome for retrieved memories                    │
│                                                                          │
│  [memoryIntegration.ts] ✅ (Backend Integration Points)                 │
│       │                                                                  │
│       ├── buildSearchPositionMap() ✅                                   │
│       ├── shouldAllowTool() ✅                                          │
│       └── filterToolsByConfidence() ✅                                  │
│                                                                          │
│  [UnifiedMemoryFacade.ts] ✅ (All 11 methods implemented)               │
│       │                                                                  │
│       ├── prefetchContext() ✅                                          │
│       ├── store() / search() ✅                                         │
│       ├── recordOutcome() / recordActionOutcome() ✅                    │
│       └── getGoals() / getValues() / etc. ✅                            │
│                                                                          │
│  [API Routes: 32 endpoints] ✅                                          │
│       │                                                                  │
│       ├── /api/memory/kg ✅                                             │
│       ├── /api/memory/stats ✅                                          │
│       ├── /api/memory/search ✅                                         │
│       └── /api/memory/feedback ✅                                       │
│                                                                          │
│  [Svelte UI Components] ✅ (Components exist)                           │
│       │                                                                  │
│       ├── KnowledgeGraphPanel.svelte ✅                                 │
│       ├── MemoryHealthPanel.svelte ✅                                   │
│       ├── MemoryPanel.svelte ✅                                         │
│       └── SearchPanel.svelte ✅                                         │
│                                                                          │
│  ❌ WIRING GAPS (Where data flow breaks)                                │
│       │                                                                  │
│       ├── ❌ Cold-Start NOT wired to runMcpFlow                         │
│       ├── ❌ Contextual Guidance NOT injected                           │
│       ├── ❌ Citations NOT flowing from backend to ChatMessage          │
│       ├── ❌ memoryUpdated events NOT triggering UI refresh             │
│       ├── ❌ TracePanel NOT showing memory steps                        │
│       ├── ❌ Action KG NOT recording tool outcomes                      │
│       └── ❌ Content KG NOT extracting entities from chat               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Gap Analysis

### Gap 1: Cold-Start Context Injection (CRITICAL)

**RoamPal Behavior** (agent_chat.py lines 627-668):
- On message #1 of every conversation, auto-injects user profile from Content KG
- Uses `get_cold_start_context()` which returns `(formatted_context, doc_ids, raw_context)`
- Caches doc_ids for selective outcome scoring

**Your Current State**:
- `prefetchMemoryContext()` exists in `memoryIntegration.ts`
- `UnifiedMemoryFacade.prefetchContext()` exists
- **BUT**: runMcpFlow does NOT call cold-start on first message
- **BUT**: Conversation message counter is not tracked

**Missing Code Location**: `runMcpFlow.ts` 

**Fix Required**:
```typescript
// In runMcpFlow.ts, add conversation message tracking
const messageCount = await getConversationMessageCount(conversationId);
if (messageCount === 1) {
  const coldStart = await facade.getColdStartContext({ userId, limit: 5 });
  if (coldStart.formattedContext) {
    // Inject as system message before user's first message
  }
}
```

---

### Gap 2: Contextual Guidance (Organic Recall + Action Stats)

**RoamPal Behavior** (agent_chat.py lines 675-794):
- BEFORE LLM sees user message, injects:
  - `📋 Past Experience` from Content KG
  - `⚠️ Past Failures` from failure_patterns
  - `📊 Action Stats` from Action-Effectiveness KG
  - `💡 Search Recommendations` from proactive insights

**Your Current State**:
- `getConfidencePromptHint()` exists but only adds generic hints
- `KnowledgeGraphService` has `getContextInsights()` method
- **BUT**: These are NOT wired into runMcpFlow before LLM call

**Missing Code Location**: `runMcpFlow.ts` around line ~200 (before calling endpointOai)

**Fix Required**:
```typescript
// Before LLM inference, inject contextual guidance
const contextInsights = await facade.getContextInsights({
  userId,
  query: userMessage,
  conversationId,
  recentMessages,
});

if (contextInsights.hasGuidance) {
  const guidanceBlock = formatContextualGuidance(contextInsights);
  prepromptPieces.push(guidanceBlock);
}
```

---

### Gap 3: Citation Flow from Backend to UI (CRITICAL)

**RoamPal Behavior**:
- `stream_message()` yields citations with `doc_id`, `collection`, `confidence`
- Session file stores citations alongside response
- UI's `useChatStore` extracts citations from `complete` event
- `EnhancedChatMessage.tsx` renders citation badges

**Your Current State**:
- `FinalAnswer` type has `memoryMeta` field (from roampal_gaps.md fix)
- API endpoints return citation data
- **BUT**: runMcpFlow final answer does NOT include `memoryMeta`
- **BUT**: ChatMessage.svelte does NOT render citations from memory

**Evidence from STATUS.md**:
> "Fixed P0 memory citation wiring - FinalAnswer now carries `memoryMeta`; UI calls `memoryMetaUpdated`"

But the actual wiring is incomplete.

**Missing Code Location**: 
1. `runMcpFlow.ts` - Final answer emission
2. `ChatMessage.svelte` - Citation rendering

**Fix Required**:
```typescript
// In runMcpFlow.ts when yielding final answer
yield {
  type: "finalAnswer",
  text: cleanedText,
  memoryMeta: {
    citations: searchPositionMap ? formatCitationsFromMap(searchPositionMap) : [],
    memoryIds: Object.keys(searchPositionMap),
    retrievalConfidence,
  },
};
```

---

### Gap 4: Memory Update Events to UI

**RoamPal Behavior**:
- `stream_complete` event includes `memory_updated: true`
- Frontend dispatches `window.dispatchEvent(new CustomEvent('memoryUpdated'))`
- All memory panels listen and refresh

**Your Current State**:
- `memoryUpdated` event listener exists in `KnowledgeGraphPanel.svelte` (line 413-418)
- **BUT**: runMcpFlow does NOT emit `memory_updated` flag
- **BUT**: No component dispatches the `memoryUpdated` event

**Missing Code Location**: 
1. `runMcpFlow.ts` - After storing working memory
2. Some central location to dispatch event

**Fix Required**:
```typescript
// After storeWorkingMemory() succeeds
if (browser) {
  window.dispatchEvent(new CustomEvent('memoryUpdated'));
}
```

---

### Gap 5: TracePanel Memory Steps

**RoamPal Behavior**:
- Tool execution events include memory operations
- UI shows "Searching memory...", "Found 3 relevant memories", etc.
- Citations are linked to trace steps

**Your Current State**:
- `TracePanel.svelte` exists
- `traceEmitter.ts` exists
- **BUT**: Memory prefetch/search NOT emitted as trace steps
- **BUT**: Memory tool results NOT shown in trace

**Missing Code Location**: `traceEmitter.ts`, `runMcpFlow.ts`

**Fix Required**:
```typescript
// In runMcpFlow.ts after memory prefetch
traceEmitter.emit({
  step: 'memory_prefetch',
  status: 'success',
  detail: `Retrieved ${results.length} memories (confidence: ${confidence})`,
  timing: timingMs,
});
```

---

### Gap 6: Action KG Recording

**RoamPal Behavior** (agent_chat.py lines 1276-1290):
- After outcome detection, scores cached actions
- `record_action_outcome()` updates Action-Effectiveness KG
- Stats surface in contextual guidance

**Your Current State**:
- `ActionKgServiceImpl.ts` exists
- `recordActionOutcome()` method exists in UnifiedMemoryFacade
- **BUT**: runMcpFlow does NOT call `recordActionOutcome()` after tool execution
- **BUT**: Action cache is NOT maintained across the request lifecycle

**Missing Code Location**: `runMcpFlow.ts` tool execution handler

**Fix Required**:
```typescript
// After tool execution completes
await facade.recordActionOutcome({
  action_id: `${conversationId}_${toolName}_${Date.now()}`,
  action_type: toolName,
  context_type: detectedContextType,
  outcome: toolSuccess ? 'worked' : 'failed',
  conversation_id: conversationId,
  latency_ms: toolLatencyMs,
});
```

---

### Gap 7: Content KG Entity Extraction

**RoamPal Behavior**:
- On memory storage, extracts entities from text
- Builds Content Graph with entity relationships
- Used for cold-start and organic recall

**Your Current State**:
- `KnowledgeGraphService.extractEntities()` exists
- **BUT**: Entity extraction NOT called during `storeWorkingMemory()`
- **BUT**: Content graph NOT being populated

**Missing Code Location**: `StoreServiceImpl.ts` or `UnifiedMemoryFacade.store()`

**Fix Required**:
```typescript
// In store() after successful storage
const entities = await kgService.extractEntities(text);
if (entities.length > 0) {
  await kgService.addToContentGraph(memoryId, entities);
}
```

---

### Gap 8: Dual KG Visualization

**RoamPal Behavior** (memory_visualization_enhanced.py lines 179-316):
- `/knowledge-graph/concepts` returns merged entities from:
  - Routing KG (query → collection patterns)
  - Content KG (entity relationships)
- Nodes include `source: 'routing' | 'content' | 'both'`
- Optimization: Direct in-memory graph access (<1s vs ~20s)

**Your Current State**:
- `/api/memory/kg` exists and returns concepts
- `/api/memory/graph` exists for D3 visualization
- **BUT**: Only returns routing concepts, NOT content KG
- **BUT**: No edge data from Content KG relationships

**Missing Code Location**: `/api/memory/kg/+server.ts`, `/api/memory/graph/+server.ts`

**Fix Required**:
```typescript
// In /api/memory/kg GET handler
// Add content KG entities
const contentEntities = await db.collection('kg_content_entities').find({}).toArray();
// Merge with routing concepts
// Add source: 'content' | 'routing' | 'both' field
```

---

### Gap 9: Memory Attribution (v0.2.12 Causal Scoring)

**RoamPal Behavior** (agent_chat.py lines 180-220):
- LLM adds hidden annotation: `<!-- MEM: 1👍 2👎 3➖ -->`
- `parse_memory_marks()` extracts and strips annotation
- Upvote/downvote arrays drive selective scoring

**Your Current State**:
- This feature does NOT exist in your codebase
- Outcome scoring is all-or-nothing

**Missing Code Location**: Needs new implementation

**Fix Required**:
1. Add memory attribution instruction to system prompt
2. Add `parseMemoryMarks()` function
3. Wire into outcome detection flow

---

## Implementation Priority

### P0 - Critical (Blocks Core Functionality)

| # | Gap | Effort | Impact |
|---|-----|--------|--------|
| 1 | Citation Flow | 4h | Users can't see where answers come from |
| 2 | Memory Update Events | 2h | UI never refreshes after memory changes |
| 3 | Cold-Start Injection | 4h | Agent "forgets" user on every conversation |

### P1 - High (Degrades Experience)

| # | Gap | Effort | Impact |
|---|-----|--------|--------|
| 4 | Contextual Guidance | 6h | Agent doesn't use past success/failure patterns |
| 5 | TracePanel Steps | 4h | Users can't audit memory operations |
| 6 | Action KG Recording | 4h | Tool effectiveness not tracked |

### P2 - Medium (Polish)

| # | Gap | Effort | Impact |
|---|-----|--------|--------|
| 7 | Content KG Extraction | 6h | Entity relationships not built |
| 8 | Dual KG Visualization | 4h | Graph shows incomplete data |
| 9 | Memory Attribution | 8h | Scoring is imprecise |

**Total Estimated Effort**: ~42 hours

---

## Recommended Implementation Order

### Phase 1: Core Wiring (P0) - 10 hours

1. **Citation Flow Fix** (4h)
   - Modify `runMcpFlow.ts` to include `memoryMeta` in final answer
   - Update `ChatMessage.svelte` to render citation badges
   - Test with actual memory search

2. **Memory Update Events** (2h)
   - Add `memory_updated` flag to stream completion
   - Dispatch `memoryUpdated` event from central location
   - Verify all panels refresh

3. **Cold-Start Injection** (4h)
   - Add conversation message counter
   - Call `getColdStartContext()` on message #1
   - Cache doc_ids for outcome scoring

### Phase 2: Intelligence (P1) - 14 hours

4. **Contextual Guidance** (6h)
   - Wire `getContextInsights()` into runMcpFlow
   - Format guidance block with Hebrew support
   - Test action stats display

5. **TracePanel Integration** (4h)
   - Emit memory steps via traceEmitter
   - Show prefetch, search, store operations
   - Link citations to trace steps

6. **Action KG Recording** (4h)
   - Track tool executions in request lifecycle
   - Call `recordActionOutcome()` on completion
   - Verify stats update in KG panel

### Phase 3: Polish (P2) - 18 hours

7. **Content KG Extraction** (6h)
   - Add entity extraction to store flow
   - Build Content Graph relationships
   - Test with Hebrew text

8. **Dual KG Visualization** (4h)
   - Merge Content KG into `/api/memory/kg`
   - Add edge data to `/api/memory/graph`
   - Update D3 graph colors by source

9. **Memory Attribution** (8h)
   - Add attribution instruction to prompt
   - Implement `parseMemoryMarks()`
   - Wire selective scoring

---

## Questions for Review

Before proceeding with implementation, please clarify:

1. **Cold-Start Scope**: Should cold-start inject on every new conversation, or only when the memory_bank has data?

2. **TracePanel Visibility**: Should memory trace steps be visible by default, or only in a "debug mode"?

3. **Citation UI**: How should citations be displayed in ChatMessage? Inline badges, expandable section, or separate panel?

4. **Action KG Granularity**: Should we track action outcomes per-tier (like RoamPal), or just per-action?

5. **Content KG Entity Extraction**: Should we use the existing `extractEntities()` method, or integrate with DictaLM for Hebrew-aware NER?

---

## File Reference

### Key Files to Modify

| File | Purpose | Gaps Addressed |
|------|---------|----------------|
| `runMcpFlow.ts` | Main orchestrator | 1, 2, 3, 4, 5, 6 |
| `memoryIntegration.ts` | Memory helpers | 3, 4 |
| `ChatMessage.svelte` | Message rendering | 1 |
| `TracePanel.svelte` | Operation tracing | 5 |
| `traceEmitter.ts` | Trace events | 5 |
| `StoreServiceImpl.ts` | Memory storage | 7 |
| `/api/memory/kg/+server.ts` | KG API | 8 |
| `/api/memory/graph/+server.ts` | Graph API | 8 |
| `UnifiedMemoryFacade.ts` | Facade | 6, 7 |

### RoamPal Reference Files

| File | Key Lines | What to Study |
|------|-----------|---------------|
| `agent_chat.py` | 627-668 | Cold-start injection |
| `agent_chat.py` | 675-794 | Contextual guidance |
| `agent_chat.py` | 1146-1294 | Outcome scoring |
| `agent_chat.py` | 180-220 | Memory attribution |
| `memory_visualization_enhanced.py` | 179-316 | Dual KG |
| `unified_memory_system.py` | 875-939 | Cold-start context |
| `chatStoreEnhancement.ts` | 40-95 | UI event handling |

---

## Next Steps

1. **Review this document** and provide feedback on priorities
2. **Clarify questions** above
3. **Approve Phase 1** implementation
4. Begin coding with smallest change per commit

---

## APPENDIX A: Per-File Systematic Analysis (109 MAP_ROAMPAL Files)

### A.1 Backend Router Analysis

#### agent_chat.py → runMcpFlow.ts
| RoamPal Feature | RoamPal Lines | BricksLLM Equivalent | Status |
|-----------------|---------------|---------------------|--------|
| Session management (OrderedDict, 100 histories) | 466-584 | MongoDB conversations | ✅ Different impl |
| Cold-start auto-trigger on msg #1 | 627-668 | NOT WIRED | ❌ Gap |
| Contextual guidance injection | 675-794 | getConfidencePromptHint() | ⚠️ Partial |
| Recursive tool execution (max_depth=3) | 2433-2851 | MCP tool loop | ⚠️ Different impl |
| Causal scoring (v0.2.12) | 180-220 | NOT IMPLEMENTED | ❌ Gap |
| WebSocket streaming | 3401-4089 | SSE streaming | ✅ Different impl |
| _cache_memories_for_scoring() | 1146-1294 | buildSearchPositionMap() | ✅ Equivalent |

**Critical Missing**: Cold-start injection, contextual guidance before LLM call

#### memory_bank.py → /api/memory/[tier]/+server.ts
| RoamPal Feature | RoamPal Lines | BricksLLM Equivalent | Status |
|-----------------|---------------|---------------------|--------|
| Listing & filtering (up to 1000) | 37-96 | /api/memory/[tier] GET | ✅ Implemented |
| Soft delete/archive | 408-445 | archive/restore endpoints | ✅ Implemented |
| Update with history tracking | 357-405 | PARTIAL - no history | ⚠️ Gap |
| Semantic search | 218-271 | /api/memory/search | ✅ Implemented |
| Authoritative creation (importance 0.7) | 316-355 | store() with importance | ✅ Implemented |

**Minor Gap**: Memory update history tracking not implemented

#### memory_visualization_enhanced.py → /api/memory/kg/+server.ts
| RoamPal Feature | RoamPal Lines | BricksLLM Equivalent | Status |
|-----------------|---------------|---------------------|--------|
| get_memory_stats() | 23-74 | /api/memory/stats | ✅ Implemented |
| Dual KG visualization (Routing + Content) | 179-316 | /api/memory/kg | ⚠️ Routing only |
| get_concept_definition() | 348-510 | /api/memory/kg/concept/[id]/definition | ✅ Implemented |
| Decay control | 548-729 | /api/memory/decay | ✅ Implemented |
| record_memory_feedback() | Lines ~700 | /api/memory/feedback | ✅ Implemented |
| backfill_content_graph() | 732-771 | /api/memory/content-graph/backfill | ✅ Implemented |

**Major Gap**: Content KG not being populated, so Dual KG shows only routing data

### A.2 Backend Config Analysis

#### settings.py → memory_config.ts + env
| RoamPal Setting | BricksLLM Equivalent | Status |
|-----------------|---------------------|--------|
| Platform-aware DATA_PATH | MONGODB_URL env | ✅ Different |
| token_budget_memory_context (1200) | contextLimit in config | ✅ Equivalent |
| Dedup threshold (cosine > 0.95) | NOT IMPLEMENTED | ❌ Gap |
| Score decay (1% daily) | WilsonScoreService | ✅ Implemented |
| ToneSettings (build/vision/burnout/vent) | PersonalityLoader | ✅ Implemented |

#### feature_flags.py → featureFlags.ts
| RoamPal Flag | BricksLLM Equivalent | Status |
|--------------|---------------------|--------|
| ENABLE_MEMORY | MEMORY_SYSTEM_ENABLED | ✅ Equivalent |
| ENABLE_OUTCOME_TRACKING | OUTCOME_TRACKING_ENABLED | ✅ Equivalent |
| ENABLE_WEBSOCKET_STREAMING | Always SSE | ✅ Different impl |
| MAX_AUTONOMOUS_ACTIONS | NOT IMPLEMENTED | ❌ Gap |
| REQUIRE_CONFIRMATION | NOT IMPLEMENTED | ❌ Gap |

#### embedding_config.py → DictaEmbeddingClient.ts
| RoamPal Config | BricksLLM Equivalent | Status |
|----------------|---------------------|--------|
| all-MiniLM-L6-v2 (384 dim) | dicta-retrieval | ✅ Better (768 dim) |
| In-memory cache (5000, 30min TTL) | RedisEmbeddingCache | ✅ Better |
| ALLOW_FALLBACK = False | Circuit breaker | ✅ Equivalent |

### A.3 Backend Utils Analysis

#### circuit_breaker.py → No equivalent
| RoamPal Feature | BricksLLM Equivalent | Status |
|-----------------|---------------------|--------|
| CLOSED/OPEN/HALF_OPEN states | NOT IMPLEMENTED | ⚠️ Gap |
| embedding_service (3 failures, 30s) | Timeout only | ⚠️ Partial |
| chromadb (5 failures, 60s) | MongoDB retry logic | ⚠️ Different |
| /api/circuit-status endpoint | NOT IMPLEMENTED | ❌ Gap |

**Recommendation**: Add circuit breaker for Qdrant/embedding service

#### correction_utils.py → No direct equivalent
| RoamPal Feature | BricksLLM Equivalent | Status |
|-----------------|---------------------|--------|
| log_correction() to JSONL | Feedback endpoint | ✅ Different impl |
| get_penalized_chunks() blacklist | NOT IMPLEMENTED | ❌ Gap |

**Gap**: Negative feedback doesn't exclude memories from future searches

#### tool_definitions.py → toolDefinitions.ts
| RoamPal Tool | BricksLLM Equivalent | Status |
|--------------|---------------------|--------|
| search_memory (5 collections) | search_memory | ✅ Implemented |
| create_memory (3-layer) | add_to_memory_bank | ✅ Implemented |
| update_memory / archive_memory | update/archive endpoints | ✅ Implemented |
| Cold-start instruction | NOT IN PROMPT | ❌ Gap |

### A.4 Frontend Component Analysis

#### MemoryPanelV2.tsx → MemoryPanel.svelte
| RoamPal Feature | RoamPal Lines | BricksLLM Equivalent | Status |
|-----------------|---------------|---------------------|--------|
| Tab switching (all/books/working/etc) | 72-114 | tier dropdown | ✅ Different UI |
| Search & filter | 118-230 | VirtualList + filter | ✅ Implemented |
| Scoring logic (exclude book/memory_bank) | 270-299 | scoreToBgColor() | ✅ Implemented |
| Memory detail modal | 373-517 | MemoryDetailModal.svelte | ✅ Implemented |
| "Understanding Memory Types" modal | 520-692 | MemoryEducationModal.svelte | ✅ Implemented |
| KnowledgeGraph embedded | Lines 233 | KnowledgeGraphPanel.svelte | ✅ Implemented |

**Status**: UI feature parity achieved, different styling

#### ConnectedChat.tsx → chat/ChatWindow.svelte (+ layout)
| RoamPal Feature | RoamPal Lines | BricksLLM Equivalent | Status |
|-----------------|---------------|---------------------|--------|
| Left sidebar (sessions) | 1864-1895 | NavMenu.svelte | ✅ Implemented |
| Right sidebar (memory) | 2248-2274 | RightMemoryDock.svelte | ✅ Implemented |
| Parallel memory collection fetches | 1568 | Prefetch API | ✅ Implemented |
| Session title generation | 1506-1552 | Generate title endpoint | ✅ Implemented |
| memoryUpdated event listener | 1469-1708 | memoryUi store events | ✅ Implemented |
| Model selector dropdowns | 242-458 | NOT IMPLEMENTED | ❌ Gap (not needed) |

#### MemoryCitation.tsx → CitationTooltip.svelte
| RoamPal Feature | RoamPal Lines | BricksLLM Equivalent | Status |
|-----------------|---------------|---------------------|--------|
| Inline citation parsing [1][2] | 57-71 | ChatMessage.svelte effect | ✅ Implemented |
| Hover tooltips with metadata | 73-94 | CitationTooltip.svelte | ✅ Implemented |
| Color-coded confidence | 109-139 | getConfidenceColor() | ✅ Implemented |
| "Used X memories" footer | 142-195 | NOT IMPLEMENTED | ⚠️ Gap |

**Minor Gap**: No collapsible "Used X memories" summary section

#### KnowledgeGraph.tsx → KnowledgeGraphPanel.svelte
| RoamPal Feature | RoamPal Lines | BricksLLM Equivalent | Status |
|-----------------|---------------|---------------------|--------|
| Hybrid scoring (√usage × √quality) | 113 | score-based sizing | ✅ Similar |
| Top-N filtering (20 nodes) | 173 | limit=50 in API | ✅ Implemented |
| Custom physics engine | 353-388 | D3 force simulation | ✅ Different impl |
| High-DPI canvas rendering | 554-568 | SVG-based | ✅ Different impl |
| Time filtering (Today/Week/Session) | 140 | time_filter param | ✅ Implemented |
| Concept detail modal | 742-945 | Inline expansion | ✅ Different UI |
| Triple KG colors (Blue/Green/Purple/Orange) | Legend | getTypeColor() | ✅ Implemented |

#### ToolExecutionDisplay.tsx → ToolUpdate.svelte
| RoamPal Feature | BricksLLM Equivalent | Status |
|-----------------|---------------------|--------|
| Running/Completed/Failed status | status icons | ✅ Implemented |
| Tool description + detail | title + args | ✅ Implemented |
| CSS spinner for running | IconLoading | ✅ Implemented |

### A.5 Frontend State Management

#### useChatStore.ts → SvelteKit + stores
| RoamPal Feature | RoamPal Lines | BricksLLM Equivalent | Status |
|-----------------|---------------|---------------------|--------|
| conversationId persistence | localStorage | page.params.id | ✅ URL-based |
| isProcessing / isStreaming | Zustand state | loading derived state | ✅ Different |
| processingStage enum | 360-918 | memoryUi.processing.status | ✅ Implemented |
| WebSocket message handling | token/tool_start/tool_complete | SSE + traceStore | ✅ Different impl |
| Citations from complete event | Lines 701-731 | memoryMetaUpdated() | ✅ Implemented |
| Lazy conversation creation | 973-1186 | POST /conversation | ✅ Implemented |
| getQuickIntent() heuristics | 96-141 | NOT IMPLEMENTED | ⚠️ Minor gap |

#### RoampalClient.ts → fetch + API routes
| RoamPal Feature | BricksLLM Equivalent | Status |
|-----------------|---------------------|--------|
| Idempotency keys | NOT IMPLEMENTED | ⚠️ Gap |
| Retry with exponential backoff | Timeout only | ⚠️ Gap |
| Mock mode for offline | NOT IMPLEMENTED | ❌ Gap |
| Zod schema validation | TypeScript types | ✅ Different |

#### schemas.ts → $lib/types/*.ts
| RoamPal Schema | BricksLLM Equivalent | Status |
|----------------|---------------------|--------|
| MessageSchema | Message.ts | ✅ Implemented |
| SendMessageResponseSchema | Response types | ✅ Implemented |
| MemorySearchResponseSchema | SearchResponse | ✅ Implemented |
| WSMessageSchema | MessageUpdate.ts | ✅ Implemented |
| ProcessingStateSchema | memoryUi.processing | ✅ Implemented |

### A.6 Utility Analysis

#### chatStoreChunkHandler.ts → SSE parsing in routes
| RoamPal Feature | BricksLLM Equivalent | Status |
|-----------------|---------------------|--------|
| ChunkedMessage tracking | SSE stream handling | ✅ Different impl |
| handleChunkedResponse() | textGenerationStream | ✅ Implemented |

#### chatStoreEnhancement.ts → memoryUi store
| RoamPal Feature | BricksLLM Equivalent | Status |
|-----------------|---------------------|--------|
| EnhancedMessage interface | Message + MemoryMeta | ✅ Implemented |
| ToolExecution tracking | traceStore | ✅ Implemented |
| handleEnhancedStreamingEvent() | memoryMetaUpdated() | ✅ Implemented |

### A.7 Authentication Consideration

**RoamPal**: Uses authenticated users with user-specific data paths
**BricksLLM**: Default admin user (ADMIN_USER_ID constant)

| RoamPal Pattern | BricksLLM Adaptation |
|-----------------|---------------------|
| Per-user data directories | Single user, all data in shared MongoDB collections |
| User profile in memory_bank | Admin profile in memory_bank |
| Session-specific shards | Single conversation namespace |

**Adaptation Strategy**: All methods that take `userId` in RoamPal should use `ADMIN_USER_ID` in BricksLLM. This is already implemented correctly.

---

## APPENDIX B: Revised Gap Summary (Post-Analysis)

After systematic analysis of all 109 MAP_ROAMPAL files, the gaps are:

### CRITICAL GAPS (Blocks Core Functionality)
1. **Cold-Start Injection** - NOT WIRED to runMcpFlow
2. **Content KG Population** - Entity extraction not called, so Dual KG is routing-only

### SIGNIFICANT GAPS (Degrades Experience)
3. **Deduplication Threshold** - No cosine similarity check before storage
4. **Negative Feedback Blacklist** - Downvoted memories still returned
5. **Circuit Breaker** - No protection against cascading failures
6. **Memory Update History** - Updates don't preserve previous versions

### MINOR GAPS (Polish Items)
7. **"Used X memories" Summary** - Citation footer not implemented
8. **getQuickIntent() Heuristics** - No immediate UI feedback
9. **Idempotency Keys** - No duplicate prevention for retries
10. **Mock Mode** - No offline fallback

### PARITY ACHIEVED ✅
- MemoryPanel UI components
- Citation tooltip with hover
- KnowledgeGraph visualization
- Memory tiers and storage
- Outcome tracking
- Action KG recording (interface exists)
- Personality loader
- TracePanel structure
- Session management

---

*Document updated: January 13, 2026*
*Analysis scope: 109 MAP_ROAMPAL files, cross-referenced with BricksLLM frontend-huggingface*
*Document generated as part of RoamPal Parity Protocol*
