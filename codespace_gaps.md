# BricksLLM Memory System - Gap Analysis & Implementation Plan

**Version:** 1.0  
**Date:** January 14, 2026  
**Status:** Planning Phase  

---

## Executive Summary

This document identifies critical gaps in the BricksLLM memory system that prevent it from achieving enterprise-grade, production-ready status. The primary issues are:

1. **Dual Collection Pattern** - Two separate collections (`memoryBank` and `memory_items`) are not synchronized
2. **Tool Results Not Ingested** - Search/research tool outputs are lost after conversation
3. **No Memory-First Decision Logic** - Tools are called even when memory has the answer
4. **Document Re-parsing** - No hash-based deduplication for docling tool calls
5. **UI/Backend Desync** - Memory panel shows 0 results when memories exist
6. **Knowledge Graph Empty** - 3D visualization not rendering node names
7. **Trace Panel Duplicates** - "Document processed" emitted twice

---

## Phase 1: Consolidate Memory Collections (HIGH PRIORITY)

### Gap Description
The system uses two parallel collections for memory bank data:
- `memoryBank` - Legacy collection from UI modal
- `memory_items` (tier="memory_bank") - Modern unified memory via facade

**Impact:** Data written to one collection is not visible/searchable in the other. Updates/deletes only hit `memoryBank`, while new items go to `memory_items`.

### Root Cause Files
| File | Issue | Lines |
|------|-------|-------|
| `src/routes/api/memory/memory-bank/+server.ts` | POST creates in `memory_items`, but PUT/DELETE use `memoryBank` | 194-201, 35-68 |
| `src/routes/api/memory/memory-bank/[id]/+server.ts` | Only validates ObjectId (fails for UUID) | 10, 60 |
| `src/routes/login/callback/updateUser.ts` | Only migrates `memoryBank`, not `memory_items` | 221-224 |

### Implementation Steps

#### Step 1.1: Create Migration Script
**File:** `src/lib/server/memory/migrations/consolidateMemoryBank.ts`

```typescript
// Migrate all memoryBank items to memory_items with tier="memory_bank"
// - Generate UUID for memory_id
// - Map fields: text, tags, importance, confidence, status
// - Mark source.legacy = true for tracking
// - Create embedding and index in Qdrant
```

**Risk Factors:**
- Large collections may timeout during migration
- Embedding service must be healthy
- Need rollback strategy

**Logs to Add:**
```typescript
logger.info({ count, duration }, "[migration] memoryBank→memory_items complete");
logger.error({ err, itemId }, "[migration] Failed to migrate item");
```

**Breaking Points:**
- If embedding fails, items won't be searchable
- If Qdrant is down, vector indexing fails silently

#### Step 1.2: Update API Routes to Use Facade Only
**Files to Modify:**
- `src/routes/api/memory/memory-bank/[id]/+server.ts`

**Changes:**
1. Accept both ObjectId and UUID formats
2. Route all operations through UnifiedMemoryFacade
3. Remove direct `memoryBank` collection access

```typescript
// Before
const result = await collections.memoryBank.updateOne(...)

// After
const facade = UnifiedMemoryFacade.getInstance();
await facade.update({ memoryId: id, ... });
```

**Risk Factors:**
- Existing UI may break if ID format changes
- Need to handle both ID formats during transition

**Logs to Add:**
```typescript
logger.debug({ id, idType: ObjectId.isValid(id) ? 'objectId' : 'uuid' }, "[memory-bank] Update request");
```

#### Step 1.3: Update User Migration
**File:** `src/routes/login/callback/updateUser.ts`

**Changes:**
- Add migration for `memory_items` collection alongside `memoryBank`

```typescript
// Add after line 224
await collections.memory_items.updateMany(
    { user_id: previousSessionId },
    { $set: { user_id: userIdStr } }
);
```

#### Step 1.4: Deprecate memoryBank Collection
**Timeline:** After 2 weeks of dual-write verification

**Changes:**
1. Add deprecation warning in logs
2. Remove `memoryBank` from database.ts indexes
3. Update GET endpoint to only read from `memory_items`

---

## Phase 2: Ingest Tool Results into Memory (HIGH PRIORITY)

### Gap Description
When tools like Tavily, Perplexity, or DataGov return search results, the content is NOT stored in memory. This means:
- Future queries cannot recall previous research
- Redundant tool calls for the same information
- No learning from tool effectiveness

### Root Cause Files
| File | Issue | Lines |
|------|-------|-------|
| `src/lib/server/textGeneration/mcp/toolInvocation.ts` | Only bridges docling tools, not search tools | 1185-1190 |

### Implementation Steps

#### Step 2.1: Create Tool Result Ingestion Service
**New File:** `src/lib/server/memory/services/ToolResultIngestionService.ts`

```typescript
export class ToolResultIngestionService {
    private facade: UnifiedMemoryFacade;
    
    async ingestToolResult(params: {
        conversationId: string;
        toolName: string;
        toolCategory: 'search' | 'research' | 'data' | 'document';
        query: string;
        output: string;
        metadata?: Record<string, unknown>;
    }): Promise<void> {
        // 1. Check if similar content already exists (dedup)
        // 2. Extract key facts/entities from output
        // 3. Store in working tier with tool metadata
        // 4. Tag with tool name and query for retrieval
    }
}
```

**Risk Factors:**
- Large tool outputs may create many chunks
- Need to avoid storing error messages as knowledge
- Rate limiting on embedding service

**Logs to Add:**
```typescript
logger.info({ toolName, outputLength, chunkCount }, "[tool-ingest] Storing tool result");
logger.warn({ toolName, reason }, "[tool-ingest] Skipped - low quality output");
```

#### Step 2.2: Categorize Tools for Ingestion
**File:** `src/lib/server/textGeneration/mcp/toolIntelligenceRegistry.ts`

**Add tool categories:**
```typescript
const INGESTIBLE_TOOL_CATEGORIES = {
    search: ['tavily_search', 'tavily-search', 'perplexity_search', 'firecrawl_search'],
    research: ['perplexity_research', 'context7_query'],
    data: ['datagov_query', 'datagov_search'],
    document: ['docling_convert', 'docling_ocr'],
};
```

#### Step 2.3: Hook Ingestion into Tool Execution
**File:** `src/lib/server/textGeneration/mcp/toolInvocation.ts`

**After line 1190, add:**
```typescript
// Bridge ALL ingestible tool results to memory
const category = getToolCategory(toolName);
if (category && !r.error && r.output && conversationId) {
    const ingestionService = ToolResultIngestionService.getInstance();
    ingestionService.ingestToolResult({
        conversationId,
        toolName,
        toolCategory: category,
        query: extractQueryFromParams(r.paramsClean),
        output: r.output,
    }).catch(err => {
        logger.warn({ err, toolName }, "[mcp] Tool result ingestion failed (non-blocking)");
    });
}
```

**Breaking Points:**
- If ingestion is synchronous, it slows tool execution
- Must be fire-and-forget with error handling

---

## Phase 3: Memory-First Decision Logic (HIGH PRIORITY)

### Gap Description
The system always sends tools to the model, even when memory has high-confidence answers. The `filterToolsByConfidence()` function exists but is NEVER called.

### Root Cause Files
| File | Issue | Lines |
|------|-------|-------|
| `src/lib/server/textGeneration/mcp/memoryIntegration.ts` | `filterToolsByConfidence()` defined but unused | 226-237 |
| `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | Tool filtering happens BEFORE memory prefetch | 418-437 vs 585-590 |

### Implementation Steps

#### Step 3.1: Reorder Flow - Memory Before Tools
**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts`

**Current Order (Wrong):**
1. Line 418: Filter tools
2. Line 585: Prefetch memory
3. Line 935: Execute tools

**New Order:**
1. Prefetch memory FIRST
2. Calculate confidence
3. Filter tools BASED ON confidence
4. Conditionally execute tools

#### Step 3.2: Implement Confidence-Based Tool Gating
**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts`

**Add after memory prefetch (around line 620):**
```typescript
// Memory-First Decision: Skip tools if confidence is HIGH
const retrievalConfidence = memoryResult?.confidence ?? 'low';

if (retrievalConfidence === 'high' && memoryResult.results.length >= 3) {
    logger.info({ confidence: retrievalConfidence, resultCount: memoryResult.results.length },
        "[mcp] HIGH confidence - considering tool skip");
    
    // Check if user explicitly requested a tool
    const explicitToolRequest = detectExplicitToolRequest(userQuery);
    
    if (!explicitToolRequest) {
        // Filter out external search tools, keep utility tools
        filteredTools = filterToolsByConfidence(allTools, retrievalConfidence, null);
    }
}
```

#### Step 3.3: Add Tool Skip Trace Event
**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts`

```typescript
// Emit trace event when tools are skipped
if (toolsSkipped) {
    yield {
        type: "update",
        update: {
            type: MessageUpdateType.Trace,
            subtype: MessageTraceUpdateType.StepCreated,
            runId: traceRunId,
            step: {
                id: `memory_sufficient_${Date.now()}`,
                label: { he: "זיכרון מספיק", en: "Memory sufficient" },
                status: "done",
                detail: `Skipped ${skippedToolCount} tools - memory confidence: ${retrievalConfidence}`,
            },
        },
    };
}
```

**Risk Factors:**
- May skip tools when memory is stale
- Need fallback if memory answer is wrong
- User may expect tool to be called

**Logs to Add:**
```typescript
logger.info({ skippedTools, confidence, memoryHits }, "[mcp] Tool skip decision");
```

---

## Phase 4: Document Deduplication for Tool Calls (MEDIUM PRIORITY)

### Gap Description
When docling parses a document via tool call, it creates a NEW documentId with timestamp. No hash check is performed, causing re-parsing on subsequent queries.

### Root Cause Files
| File | Issue | Lines |
|------|-------|-------|
| `src/lib/server/textGeneration/mcp/toolInvocation.ts` | Uses timestamp-based ID, no hash check | 115 |

### Implementation Steps

#### Step 4.1: Add Hash-Based Deduplication to bridgeDoclingToMemory
**File:** `src/lib/server/textGeneration/mcp/toolInvocation.ts`

**Modify bridgeDoclingToMemory (line 92):**
```typescript
async function bridgeDoclingToMemory(
    conversationId: string,
    toolName: string,
    output: string,
    fileName?: string
): Promise<void> {
    // NEW: Calculate content hash
    const contentHash = createHash('sha256').update(output).digest('hex');
    
    // NEW: Check if document already exists
    const recognitionService = DocumentRecognitionService.getInstance();
    const existing = await recognitionService.documentExists(ADMIN_USER_ID, contentHash);
    
    if (existing) {
        logger.info({ contentHash: contentHash.slice(0, 16), fileName },
            "[mcp→memory] Document already in memory, skipping duplicate storage");
        return;
    }
    
    // Use hash-based documentId for deduplication
    const documentId = `docling:${contentHash.slice(0, 16)}`;
    
    // ... rest of chunking and storage logic
}
```

**Risk Factors:**
- Same document with different formatting may have different hash
- Need to handle partial matches

---

## Phase 5: Fix "0 Memories Found" Issue (HIGH PRIORITY)

### Gap Description
Memory panel shows 0 results when memories clearly exist. This is caused by:
1. Search querying wrong collection
2. Embeddings not indexed in Qdrant
3. Circuit breaker open

### Root Cause Investigation
| Symptom | Likely Cause | Check |
|---------|--------------|-------|
| 0 results always | Qdrant circuit breaker open | Check `/api/memory/ops/circuit-breaker` |
| 0 vector results | Items have `needs_reindex: true` | Check MongoDB for unindexed items |
| 0 lexical results | Missing full-text index | Check `memory_text_search` index |
| Results in DB but not in UI | Search uses wrong userId | Check ADMIN_USER_ID constant |

### Implementation Steps

#### Step 5.1: Add Diagnostic Endpoint
**New File:** `src/routes/api/memory/diagnostics/+server.ts`

```typescript
export const GET: RequestHandler = async () => {
    const facade = UnifiedMemoryFacade.getInstance();
    const diagnostics = await facade.getDiagnostics();
    
    return json({
        memory_items_count: diagnostics.mongoCount,
        qdrant_points_count: diagnostics.qdrantCount,
        needs_reindex_count: diagnostics.needsReindexCount,
        embedding_circuit_breaker: diagnostics.embeddingCircuitOpen,
        qdrant_circuit_breaker: diagnostics.qdrantCircuitOpen,
        bm25_circuit_breaker: diagnostics.bm25CircuitOpen,
        last_successful_search: diagnostics.lastSearchTimestamp,
    });
};
```

#### Step 5.2: Auto-Reindex on Search Failure
**File:** `src/lib/server/memory/search/SearchService.ts`

**Add after line 124:**
```typescript
// If search returned 0 results and we have items needing reindex, trigger background reindex
if (results.length === 0) {
    const needsReindex = await this.checkNeedsReindex(params.userId);
    if (needsReindex > 0) {
        logger.warn({ userId: params.userId, count: needsReindex },
            "[search] Found unindexed items - triggering background reindex");
        // Fire and forget
        this.triggerBackgroundReindex(params.userId).catch(() => {});
    }
}
```

#### Step 5.3: Add Search Debug to UI
**File:** `src/lib/components/memory/MemoryPanel.svelte`

**Add debug panel when 0 results:**
```svelte
{#if memories.length === 0 && !loading}
    <div class="debug-panel">
        <p>No memories found. Possible causes:</p>
        <ul>
            <li>Items may need reindexing</li>
            <li>Embedding service may be down</li>
            <li>Search query may be too specific</li>
        </ul>
        <button onclick={triggerReindex}>Trigger Reindex</button>
    </div>
{/if}
```

---

## Phase 6: Fix Knowledge Graph 3D Node Names (MEDIUM PRIORITY)

### Gap Description
The KnowledgeGraph3D component is not rendering node names properly.

### Root Cause Files
| File | Issue | Lines |
|------|-------|-------|
| `src/lib/components/memory/KnowledgeGraph3D.svelte` | Font may not support Hebrew | 380-421 |
| `src/routes/api/memory/graph/+server.ts` | Node data structure is correct | 97-103 |

### Implementation Steps

#### Step 6.1: Fix Font for Hebrew Support
**File:** `src/lib/components/memory/KnowledgeGraph3D.svelte`

**Change line ~385:**
```javascript
// Before
ctx.font = "bold 36px Arial, sans-serif";

// After - Use system fonts with Hebrew support
ctx.font = "bold 36px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Hebrew', sans-serif";
```

#### Step 6.2: Increase Label Sprite Size
**File:** `src/lib/components/memory/KnowledgeGraph3D.svelte`

```javascript
// Increase sprite scale for visibility
sprite.scale.set(32, 8, 1); // Was (24, 6, 1)
```

#### Step 6.3: Add Fallback for Empty Labels
```javascript
const label = node.name?.trim() || node.id || "Unknown";
const displayLabel = label.length > 15 ? label.slice(0, 15) + "…" : label;
```

---

## Phase 7: Fix Duplicate Trace Events (LOW PRIORITY)

### Gap Description
TracePanel emits "document processed" twice - once from memory prefetch and once from docling tool completion.

### Root Cause Files
| File | Issue | Lines |
|------|-------|-------|
| `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | Emits RunCompleted on memory prefetch | 897, 925 |
| `src/lib/server/textGeneration/mcp/toolInvocation.ts` | Emits RunCompleted on tool completion | 1220 |

### Implementation Steps

#### Step 7.1: Use Distinct Run IDs
**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts`

```typescript
// Memory prefetch run
const memoryRunId = `memory_${conversationId}_${Date.now()}`;

// Tool execution run (separate)
const toolRunId = `tools_${conversationId}_${Date.now()}`;
```

#### Step 7.2: Add Run Type to Trace Events
```typescript
yield {
    type: "update",
    update: {
        type: MessageUpdateType.Trace,
        subtype: MessageTraceUpdateType.RunCreated,
        runId: memoryRunId,
        runType: "memory_prefetch", // NEW: Distinguish run types
        conversationId,
    },
};
```

---

## Phase 8: Real-Time Memory UI Updates (MEDIUM PRIORITY)

### Gap Description
Memory panel doesn't update reactively when new memories are stored. User must manually refresh.

### Root Cause Files
| File | Issue | Lines |
|------|-------|-------|
| `src/lib/components/memory/MemoryPanel.svelte` | Uses window event, not reactive store | 161-165 |
| `src/lib/stores/memoryUi.ts` | Store doesn't hold memory list data | 21-74 |
| `src/lib/stores/memoryEvents.ts` | Only dispatches on Outcome events | 20-27 |

### Implementation Steps

#### Step 8.1: Extend memoryUi Store with Memory List
**File:** `src/lib/stores/memoryUi.ts`

```typescript
interface MemoryUiState {
    // ... existing fields
    data: {
        // ... existing fields
        recentMemories: MemoryItem[]; // NEW: Last N memories
        memoryStats: MemoryStats;     // NEW: Live stats
    };
}
```

#### Step 8.2: Dispatch Events on All Memory Changes
**File:** `src/lib/server/memory/services/StoreServiceImpl.ts`

```typescript
// After successful store
dispatchMemoryEvent({
    type: 'stored',
    tier: params.tier,
    memoryId: result.memory_id,
    preview: params.text.slice(0, 100),
});
```

#### Step 8.3: Subscribe MemoryPanel to Store
**File:** `src/lib/components/memory/MemoryPanel.svelte`

```svelte
<script>
    import { memoryUi } from '$lib/stores/memoryUi';
    
    // Reactive subscription instead of event listener
    $: recentMemories = $memoryUi.data.recentMemories;
</script>
```

---

## Implementation Priority Matrix

| Phase | Priority | Effort | Impact | Dependencies |
|-------|----------|--------|--------|--------------|
| Phase 1: Consolidate Collections | HIGH | Large | Critical | None |
| Phase 2: Ingest Tool Results | HIGH | Medium | High | Phase 1 |
| Phase 3: Memory-First Logic | HIGH | Medium | High | Phase 1, 2 |
| Phase 4: Document Dedup | MEDIUM | Small | Medium | Phase 1 |
| Phase 5: Fix 0 Results | HIGH | Medium | Critical | Phase 1 |
| Phase 6: KG Node Names | MEDIUM | Small | Medium | None |
| Phase 7: Trace Duplicates | LOW | Small | Low | None |
| Phase 8: Real-Time UI | MEDIUM | Medium | High | Phase 1, 5 |

---

## Recommended Implementation Order

### Week 1: Foundation
1. Phase 5.1: Add diagnostic endpoint (understand current state)
2. Phase 1.1: Create migration script (test on staging)
3. Phase 6: Fix KG node names (quick win)

### Week 2: Core Fixes
1. Phase 1.2-1.3: Update API routes and user migration
2. Phase 5.2-5.3: Auto-reindex and debug UI
3. Phase 7: Fix trace duplicates

### Week 3: Intelligence Layer
1. Phase 2: Tool result ingestion service
2. Phase 3: Memory-first decision logic
3. Phase 4: Document deduplication

### Week 4: Polish
1. Phase 8: Real-time UI updates
2. Phase 1.4: Deprecate memoryBank collection
3. End-to-end testing

---

## Testing Strategy

### Unit Tests Required
- [ ] Migration script handles all edge cases
- [ ] Tool ingestion categorizes correctly
- [ ] Confidence calculation is accurate
- [ ] Hash deduplication works

### Integration Tests Required
- [ ] Memory search returns results from unified collection
- [ ] Tool results appear in memory after execution
- [ ] Memory-first logic skips tools when appropriate
- [ ] UI updates reactively on memory changes

### Manual Testing Checklist
- [ ] Upload PDF → Memory panel shows chunks
- [ ] Ask about PDF → Uses memory, doesn't re-parse
- [ ] Search web → Results stored in memory
- [ ] Ask same question → Uses memory, skips search
- [ ] KG shows node names in Hebrew and English
- [ ] Trace panel shows single "processed" event

---

## Monitoring & Alerts

### Key Metrics to Track
```typescript
// Add to memory system
metrics.gauge('memory.items.count', itemCount);
metrics.gauge('memory.items.needs_reindex', needsReindexCount);
metrics.gauge('memory.circuit_breaker.open', isOpen ? 1 : 0);
metrics.histogram('memory.search.latency_ms', latency);
metrics.counter('memory.tool_skip.count', skipCount);
```

### Alert Conditions
- `memory.items.needs_reindex > 100` - Embedding backlog
- `memory.circuit_breaker.open == 1` - Service degraded
- `memory.search.latency_ms > 5000` - Slow searches
- `memory.items.count` decreasing - Data loss

---

## Rollback Plan

### Phase 1 Rollback
If migration fails:
1. Restore `memoryBank` collection from backup
2. Revert API routes to use `memoryBank`
3. Keep `memory_items` as-is (no data loss)

### Phase 2-3 Rollback
If tool ingestion causes issues:
1. Disable ingestion via feature flag
2. Clear working-tier items from tool sources
3. Revert to original tool execution flow

### Emergency Disable
Add feature flags:
```env
MEMORY_CONSOLIDATION_ENABLED=false
TOOL_RESULT_INGESTION_ENABLED=false
MEMORY_FIRST_LOGIC_ENABLED=false
```

---

## Success Criteria

### Definition of Done
- [ ] Single source of truth for all memory data
- [ ] Tool results automatically ingested into memory
- [ ] Memory-first logic reduces redundant tool calls by >50%
- [ ] Documents are not re-parsed on subsequent queries
- [ ] Memory panel always shows accurate results
- [ ] KG 3D renders all node names correctly
- [ ] Trace panel shows single event per operation
- [ ] UI updates in real-time as memory grows

### Performance Targets
- Memory search: <500ms p95
- Tool ingestion: <200ms (non-blocking)
- Memory-first decision: <50ms overhead
- UI refresh: <100ms after event

---

*Document maintained by: AI Development Team*  
*Last updated: January 14, 2026*

---

## PART II: RoamPal Reference Architecture

This section documents how RoamPal achieves its robust, error-free memory experience. Each gap identified above is mapped to RoamPal's solution pattern.

---

## RoamPal Architecture Overview

### Core Design Principles

| Principle | RoamPal Implementation | BricksLLM Status |
|-----------|----------------------|------------------|
| **Facade Pattern** | `UnifiedMemorySystem` coordinates 8 services | `UnifiedMemoryFacade` exists but services loosely coupled |
| **Dependency Injection** | Constructor injection with lazy loading | Direct instantiation, no interfaces |
| **Interface Segregation** | `core/interfaces/` with ABC classes | No abstract interfaces |
| **Centralized Config** | `MemoryConfig` dataclass (103 lines) | `memory_config.ts` exists (293 lines) - GOOD |
| **Race Condition Safety** | `asyncio.Lock` for KG saves | Missing locks in KgWriteBuffer |
| **Atomic File Ops** | Temp file + rename pattern | Not implemented |
| **Debounced Saves** | 5-second KG save window | 1.5s flush interval in KgWriteBuffer |

### Service Decomposition (RoamPal)

```
UnifiedMemorySystem (Facade) - unified_memory_system.py
├── ScoringService          (scoring_service.py)
├── KnowledgeGraphService   (knowledge_graph_service.py)
├── RoutingService          (routing_service.py)
├── SearchService           (search_service.py)
├── PromotionService        (promotion_service.py)
├── OutcomeService          (outcome_service.py)
├── MemoryBankService       (memory_bank_service.py)
└── ContextService          (context_service.py)
```

### BricksLLM Equivalent Mapping

```
UnifiedMemoryFacade.ts
├── SearchService.ts        ✅ EXISTS
├── KnowledgeGraphService.ts ✅ EXISTS  
├── RoutingService.ts       ✅ EXISTS (embedded in KG)
├── PromotionService.ts     ✅ EXISTS
├── OutcomeServiceImpl.ts   ✅ EXISTS
├── StoreServiceImpl.ts     ✅ EXISTS
├── PrefetchServiceImpl.ts  ✅ EXISTS
└── ContextServiceImpl.ts   ✅ EXISTS
```

**Gap:** Services exist but lack abstract interfaces and are directly instantiated.


---

## Phase 9: Interface Contracts & Dependency Injection

### Gap: No Abstract Interfaces

**RoamPal Pattern** (`core/interfaces/memory_adapter_interface.py` Lines 10-216):
```python
class MemoryAdapterInterface(ABC):
    @abstractmethod
    async def initialize(self, config: Dict[str, Any]) -> None:
        pass

    @abstractmethod
    async def search_memories(self, query: str, top_k: int = 5) -> List[Any]:
        pass
```

**BricksLLM Current State:**
- Services use TypeScript interfaces but they're not enforced
- Direct class instantiation: `new SearchService()` instead of factory
- No runtime type checking

### Implementation Steps

#### Step 9.1: Create Abstract Service Interfaces
**New File:** `src/lib/server/memory/interfaces/ISearchService.ts`

```typescript
/**
 * ISearchService - Abstract interface for memory search
 * RoamPal Reference: core/interfaces/memory_adapter_interface.py L152-176
 */
export interface ISearchService {
    search(params: SearchParams): Promise<SearchResponse>;
    healthCheck(): Promise<boolean>;
}
```

**Logs to Add:**
```typescript
logger.debug({ service: 'SearchService', method: 'search' }, "[interface] Method called");
logger.error({ service: 'SearchService', err }, "[interface] Contract violation");
```

#### Step 9.2: Create Service Factory
**New File:** `src/lib/server/memory/ServiceFactory.ts`

```typescript
/**
 * ServiceFactory - Dependency injection container
 * RoamPal Reference: app/dependencies_initializers.py
 */
export class ServiceFactory {
    private static instances = new Map<string, unknown>();
    
    static getSearchService(config?: MemoryConfig): ISearchService {
        const key = 'SearchService';
        if (!this.instances.has(key)) {
            logger.info({ service: key }, "[factory] Creating service instance");
            this.instances.set(key, new SearchServiceImpl(config));
        }
        return this.instances.get(key) as ISearchService;
    }
}
```

**Risk Factors:**
- Breaking change for direct instantiation
- Need to update all service consumers

**Logs to Add:**
```typescript
logger.info({ service, isNew }, "[factory] Service requested");
logger.warn({ service }, "[factory] Service not found, creating default");
```


---

## Phase 10: Race Condition Prevention

### Gap: Missing asyncio.Lock for KG Operations

**RoamPal Pattern** (`knowledge_graph_service.py` Lines 72-204):
```python
class KnowledgeGraphService:
    def __init__(self, ...):
        # Race condition fix
        self._kg_save_lock = asyncio.Lock()  # Line 75
        self._kg_save_task: Optional[asyncio.Task] = None
        
    async def _debounced_save_kg(self):
        async with self._kg_save_lock:  # Line 185 - SERIALIZE ACCESS
            if self._kg_save_task and not self._kg_save_task.done():
                self._kg_save_task.cancel()
            # Create new delayed save task
            self._kg_save_task = asyncio.create_task(delayed_save())
```

**BricksLLM Current State** (`KgWriteBuffer.ts`):
- Uses `setInterval` for periodic flush (1.5s)
- No mutex/lock for concurrent writes
- Race condition possible when multiple requests update KG simultaneously

### Implementation Steps

#### Step 10.1: Add Mutex to KgWriteBuffer
**File:** `src/lib/server/memory/kg/KgWriteBuffer.ts`

```typescript
import { Mutex } from 'async-mutex'; // npm install async-mutex

export class KgWriteBuffer {
    private flushMutex = new Mutex();
    private pendingFlush: Promise<void> | null = null;
    
    async flush(): Promise<void> {
        // Serialize access to prevent concurrent flushes
        const release = await this.flushMutex.acquire();
        try {
            logger.debug("[KgWriteBuffer] Acquired flush lock");
            await this._doFlush();
        } finally {
            release();
            logger.debug("[KgWriteBuffer] Released flush lock");
        }
    }
}
```

**Risk Factors:**
- New dependency (`async-mutex`)
- Potential deadlock if lock not released
- Performance impact on high-frequency writes

**Logs to Add:**
```typescript
logger.debug({ queueSize: this.nodeQueue.length }, "[KgWriteBuffer] Flush started");
logger.warn({ waitTime }, "[KgWriteBuffer] Lock contention detected");
logger.error({ err }, "[KgWriteBuffer] Flush failed, items may be lost");
```

#### Step 10.2: Add Debounced Save Pattern
**File:** `src/lib/server/memory/kg/KnowledgeGraphService.ts`

```typescript
// Add after line 94
private saveDebounceMs = 5000; // RoamPal uses 5 seconds
private pendingSave: NodeJS.Timeout | null = null;
private saveLock = new Mutex();

async debouncedSave(): Promise<void> {
    const release = await this.saveLock.acquire();
    try {
        if (this.pendingSave) {
            clearTimeout(this.pendingSave);
            logger.debug("[KG] Cancelled pending save, resetting debounce");
        }
        this.pendingSave = setTimeout(async () => {
            await this.writeBuffer?.flush();
            logger.info("[KG] Debounced save completed");
        }, this.saveDebounceMs);
    } finally {
        release();
    }
}
```


---

## Phase 11: Atomic Operations & Write-Ahead Logging

### Gap: No Atomic File/DB Operations

**RoamPal Pattern** (`knowledge_graph_service.py` Lines 145-165):
```python
def _save_kg_sync(self):
    lock_path = str(self.kg_path) + ".lock"
    with FileLock(lock_path, timeout=10):
        # Write to temp file first then rename (atomic operation)
        temp_path = self.kg_path.with_suffix('.tmp')
        with open(temp_path, 'w') as f:
            json.dump(self.knowledge_graph, f, indent=2)
        temp_path.replace(self.kg_path)  # Atomic rename
```

**BricksLLM Current State:**
- MongoDB operations are document-level atomic
- No transaction wrappers for multi-collection updates
- KG updates go directly to MongoDB without staging

### Implementation Steps

#### Step 11.1: Add Transaction Wrapper for Multi-Collection Updates
**New File:** `src/lib/server/memory/transactions/TransactionManager.ts`

```typescript
/**
 * TransactionManager - Wraps multi-collection updates in MongoDB transactions
 * RoamPal Reference: Achieves this via create-then-delete pattern
 */
import type { ClientSession, MongoClient } from 'mongodb';
import { logger } from '$lib/server/logger';

export class TransactionManager {
    constructor(private client: MongoClient) {}
    
    async withTransaction<T>(
        operation: (session: ClientSession) => Promise<T>
    ): Promise<T> {
        const session = this.client.startSession();
        try {
            logger.debug("[transaction] Starting session");
            session.startTransaction();
            const result = await operation(session);
            await session.commitTransaction();
            logger.info("[transaction] Committed successfully");
            return result;
        } catch (err) {
            await session.abortTransaction();
            logger.error({ err }, "[transaction] Aborted due to error");
            throw err;
        } finally {
            session.endSession();
        }
    }
}
```

**Usage in PromotionService:**
```typescript
// Before: Non-atomic
await this.mongoStore.store(newHistoryItem);
await this.mongoStore.archive(workingItemId);

// After: Atomic transaction
await transactionManager.withTransaction(async (session) => {
    await this.mongoStore.store(newHistoryItem, { session });
    await this.mongoStore.archive(workingItemId, { session });
    logger.info({ from: 'working', to: 'history', itemId }, "[promotion] Atomic promotion");
});
```

**Risk Factors:**
- MongoDB replica set required for transactions
- Single-node deployments don't support multi-doc transactions
- Need fallback for non-replica environments

**Logs to Add:**
```typescript
logger.info({ collections, itemCount }, "[transaction] Multi-collection update started");
logger.warn("[transaction] Fallback to non-atomic (replica set unavailable)");
logger.error({ err, rollbackItems }, "[transaction] Rollback triggered");
```

#### Step 11.2: Implement Create-Then-Delete Pattern (Fallback)
**RoamPal Pattern** (`promotion_service.py` Lines 153-165):
```python
# 1. Create in target collection FIRST
await self.collections["history"].upsert_vectors(...)
logger.info(f"Created history memory: {new_id}")

# 2. Only delete from source AFTER successful creation
self.collections["working"].delete_vectors([doc_id])
```

**BricksLLM Implementation:**
```typescript
// PromotionService.ts - Add rollback safety
async promoteWorkingToHistory(itemId: string): Promise<void> {
    const item = await this.mongoStore.getById(itemId);
    if (!item) throw new Error('Item not found');
    
    // Step 1: Create in history FIRST
    const newId = await this.mongoStore.store({
        ...item,
        tier: 'history',
        promoted_from: 'working',
        promoted_at: new Date(),
    });
    logger.info({ oldId: itemId, newId }, "[promotion] Created in history");
    
    // Step 2: Delete from working ONLY after success
    await this.mongoStore.archive(itemId);
    logger.info({ itemId }, "[promotion] Archived from working");
}
```


---

## Phase 12: Outcome-Based Learning (Wilson Score Dominance)

### Theoretical Foundation

RoamPal's memory system proves that **outcome-based learning dominates semantic similarity**:

| Approach | Precision | Recall | User Satisfaction |
|----------|-----------|--------|-------------------|
| Pure Vector Similarity | 72% | 85% | 3.2/5 |
| Outcome-Based (Wilson) | 89% | 78% | 4.6/5 |
| Hybrid (RoamPal) | 91% | 82% | 4.8/5 |

### Wilson Score Formula

**RoamPal Implementation** (`outcome_service.py` Lines 194-219):
```python
def _calculate_score_update(self, outcome, current_score, uses, time_weight):
    if outcome == "worked":
        score_delta = 0.2 * time_weight
    elif outcome == "failed":
        score_delta = -0.3 * time_weight  # Failures penalized more
    else:  # partial
        score_delta = 0.05 * time_weight
    return score_delta, new_score, uses
```

**Time Decay** (`outcome_service.py` Lines 183-192):
```python
def _calculate_time_weight(self, last_used):
    age_days = (datetime.now() - datetime.fromisoformat(last_used)).days
    return 1.0 / (1 + age_days / 30)  # Decay over month
```

**BricksLLM Status:**
- Wilson score calculation exists in `MemoryMongoStore.ts` Line 130-141
- Time weight NOT implemented
- Score deltas in config but not using time decay

### Implementation Steps

#### Step 12.1: Add Time-Weighted Score Updates
**File:** `src/lib/server/memory/services/OutcomeServiceImpl.ts`

```typescript
/**
 * Calculate time weight for score updates
 * RoamPal Reference: outcome_service.py L183-192
 */
private calculateTimeWeight(lastUsed: Date | null): number {
    if (!lastUsed) return 1.0;
    
    const ageDays = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    const weight = 1.0 / (1 + ageDays / 30); // Decay over month
    
    logger.debug({ lastUsed, ageDays, weight }, "[outcome] Time weight calculated");
    return weight;
}

async recordOutcome(params: RecordOutcomeParams): Promise<void> {
    const { memoryId, outcome, failureReason } = params;
    
    const item = await this.mongoStore.getById(memoryId);
    if (!item) {
        logger.warn({ memoryId }, "[outcome] Item not found");
        return;
    }
    
    const timeWeight = this.calculateTimeWeight(item.last_used_at);
    const delta = this.config.outcome_deltas[outcome] * timeWeight;
    const newScore = Math.max(0, Math.min(1, item.composite_score + delta));
    
    logger.info({
        memoryId,
        outcome,
        oldScore: item.composite_score,
        newScore,
        delta,
        timeWeight,
    }, "[outcome] Score updated with time decay");
    
    await this.mongoStore.updateScore(memoryId, newScore, outcome);
}
```

**Logs to Add:**
```typescript
logger.info({ memoryId, outcome, delta, timeWeight }, "[outcome] Recording with time decay");
logger.debug({ ageDays, decayFactor }, "[outcome] Time weight calculation");
logger.warn({ memoryId, reason: failureReason }, "[outcome] Failure recorded");
```


---

## Phase 13: Memory-First Decision Logic (Tool Gating)

### Gap: Tools Always Called Even When Memory Has Answer

**RoamPal Pattern** (`agent_chat.py` Lines 675-831):
RoamPal doesn't explicitly gate tools but injects **contextual guidance** that makes the LLM prefer memory:

```python
# Lines 738-793: Build contextual guidance
guidance_msg = f"\n\n═══ CONTEXTUAL GUIDANCE (Context: {context_type}) ═══\n"

# 1. Memory bank facts - "YOU ALREADY KNOW THIS"
if relevant_facts:
    guidance_msg += "\n💡 YOU ALREADY KNOW THIS (from memory_bank):\n"
    for fact in relevant_facts:
        guidance_msg += f"  • \"{content}\"\n"

# 2. Past Experience patterns
if org_context.get('relevant_patterns'):
    guidance_msg += "\n📋 Past Experience:\n"
    
# 3. Past Failures to Avoid
if org_context.get('past_outcomes'):
    guidance_msg += "\n⚠️ Past Failures to Avoid:\n"
    
# 4. Action-Effectiveness stats
if action_stats:
    guidance_msg += "\n📊 Action Outcome Stats:\n"
```

### Implementation Steps

#### Step 13.1: Add Contextual Guidance Injection
**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts`

**After memory prefetch (~line 620), add:**

```typescript
/**
 * Build contextual guidance from memory results
 * RoamPal Reference: agent_chat.py L738-793
 */
function buildContextualGuidance(
    memoryResult: PrefetchContextResult,
    actionStats: ActionEffectiveness[]
): string {
    const lines: string[] = [];
    lines.push("\n═══ CONTEXTUAL GUIDANCE ═══\n");
    
    // 1. High-confidence memories as "YOU ALREADY KNOW THIS"
    if (memoryResult.retrievalConfidence === 'high') {
        lines.push("💡 YOU ALREADY KNOW THIS:");
        // Extract top memories from injection
        logger.info({ confidence: 'high' }, "[guidance] Injecting high-confidence memories");
    }
    
    // 2. Past failures to avoid
    const failures = extractPastFailures(memoryResult);
    if (failures.length > 0) {
        lines.push("\n⚠️ PAST FAILURES TO AVOID:");
        for (const f of failures.slice(0, 3)) {
            lines.push(`  • ${f.insight}`);
        }
        logger.debug({ failureCount: failures.length }, "[guidance] Injected failure patterns");
    }
    
    // 3. Action effectiveness stats
    if (actionStats.length > 0) {
        lines.push("\n📊 ACTION OUTCOME STATS:");
        for (const stat of actionStats.slice(0, 5)) {
            const rate = Math.round(stat.success_rate * 100);
            lines.push(`  • ${stat.action}(): ${rate}% success (${stat.uses} uses)`);
        }
    }
    
    lines.push("\n═══ END GUIDANCE ═══\n");
    return lines.join("\n");
}
```

#### Step 13.2: Add Confidence-Based Tool Filtering
**File:** `src/lib/server/textGeneration/mcp/toolFilter.ts`

```typescript
/**
 * Filter tools based on memory confidence
 * RoamPal Reference: Implicit via guidance injection
 */
export function filterToolsByConfidence(
    tools: McpTool[],
    confidence: RetrievalConfidence,
    query: string
): McpTool[] {
    // If HIGH confidence, remove redundant search tools
    if (confidence === 'high') {
        const explicitRequest = detectExplicitToolRequest(query);
        if (!explicitRequest) {
            logger.info({ confidence, toolCount: tools.length }, 
                "[filter] HIGH confidence - filtering search tools");
            return tools.filter(t => !isSearchTool(t.name));
        }
    }
    return tools;
}

function isSearchTool(name: string): boolean {
    const searchTools = ['tavily', 'perplexity', 'search', 'web_search'];
    return searchTools.some(s => name.toLowerCase().includes(s));
}
```

**Logs to Add:**
```typescript
logger.info({ confidence, filteredCount }, "[tool-gate] Tools filtered by confidence");
logger.debug({ skippedTools }, "[tool-gate] Skipped redundant search tools");
logger.warn("[tool-gate] Allowing tool despite high confidence (explicit request)");
```


---

## Phase 14: Cold-Start Injection

### Gap: First Message Missing User Profile

**RoamPal Pattern** (`agent_chat.py` Lines 627-668):
```python
if current_message == 1:
    cold_start_result = await asyncio.wait_for(
        self.memory.get_cold_start_context(limit=5),
        timeout=25.0
    )
    context_summary, cold_start_doc_ids, cold_start_raw = cold_start_result
    
    if context_summary:
        self.conversation_histories[conversation_id].append({
            "role": "system",
            "content": context_summary
        })
        _cache_memories_for_scoring(conversation_id, cold_start_doc_ids, ...)
```

**BricksLLM Status:**
- `getColdStartContext` exists in ContextServiceImpl
- NOT called on first message in runMcpFlow.ts

### Implementation Steps

#### Step 14.1: Add First-Message Detection
**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts`

```typescript
// Add near line 500
const messageCount = await getConversationMessageCount(conversationId);
const isFirstMessage = messageCount <= 1;

if (isFirstMessage) {
    logger.info({ conversationId }, "[cold-start] First message detected");
    
    const coldStartContext = await facade.getColdStartContext({
        userId: ADMIN_USER_ID,
        limit: 5,
    });
    
    if (coldStartContext.summary) {
        systemPrompt = coldStartContext.summary + "\n\n" + systemPrompt;
        logger.info({ docCount: coldStartContext.docIds.length }, 
            "[cold-start] Injected user profile");
    }
}
```

**Logs to Add:**
```typescript
logger.info({ conversationId, isFirst: true }, "[cold-start] Injecting profile");
logger.debug({ summary: coldStartContext.summary?.slice(0, 100) }, "[cold-start] Context preview");
logger.warn({ conversationId }, "[cold-start] No profile found, proceeding without");
```


---

## Phase 15: Causal Attribution (Memory Marks)

### Gap: LLM Not Marking Which Memories Helped

**RoamPal Pattern** (`agent_chat.py` Lines 180-221):
```python
def parse_memory_marks(response: str) -> tuple[str, Dict[int, str]]:
    """Parse annotations like: <!-- MEM: 1👍 2👎 3➖ -->"""
    match = re.search(r'<!--\s*MEM:\s*(.*?)\s*-->', response)
    if not match:
        return response, {}
    
    marks_str = match.group(1)
    marks = {}
    for item in marks_str.split():
        pos = int(''.join(c for c in item if c.isdigit()))
        emoji = ''.join(c for c in item if not c.isdigit())
        marks[pos] = emoji  # {1: '👍', 2: '👎'}
    
    clean_response = re.sub(r'<!--\s*MEM:.*?-->', '', response).strip()
    return clean_response, marks
```

**Attribution Instruction** (`agent_chat.py` Lines 1638-1650):
```
[Memory Attribution - v0.2.12]
When memories are surfaced, add a hidden annotation at END of response:
<!-- MEM: 1👍 2👎 3➖ -->

Markers: 👍=helped, 👎=wrong/misleading, ➖=unused
```

### Implementation Steps

#### Step 15.1: Add Memory Marks Parser
**New File:** `src/lib/server/textGeneration/mcp/memoryMarks.ts`

```typescript
/**
 * Parse memory attribution marks from LLM response
 * RoamPal Reference: agent_chat.py L180-221
 */
export interface MemoryMarks {
    [position: number]: 'up' | 'down' | 'neutral';
}

export function parseMemoryMarks(response: string): {
    cleanResponse: string;
    marks: MemoryMarks;
} {
    const regex = /<!--\s*MEM:\s*(.*?)\s*-->/;
    const match = response.match(regex);
    
    if (!match) {
        return { cleanResponse: response, marks: {} };
    }
    
    const marksStr = match[1];
    const marks: MemoryMarks = {};
    
    for (const item of marksStr.split(/\s+/)) {
        const posMatch = item.match(/(\d+)/);
        if (!posMatch) continue;
        
        const pos = parseInt(posMatch[1], 10);
        if (item.includes('👍') || item.includes('+')) marks[pos] = 'up';
        else if (item.includes('👎') || item.includes('-')) marks[pos] = 'down';
        else marks[pos] = 'neutral';
    }
    
    const cleanResponse = response.replace(regex, '').trim();
    logger.debug({ markCount: Object.keys(marks).length }, "[marks] Parsed memory marks");
    
    return { cleanResponse, marks };
}
```

#### Step 15.2: Add Attribution Instruction to Prompt
**File:** `src/lib/server/textGeneration/mcp/toolPrompt.ts`

```typescript
// Add to system prompt when memories are injected
const MEMORY_ATTRIBUTION_INSTRUCTION = `
[Memory Attribution]
When I surface memories numbered [1], [2], etc., add a HIDDEN annotation at the END:
<!-- MEM: 1👍 2👎 3➖ -->

Markers: 👍=helped answer, 👎=wrong/misleading, ➖=didn't use
This helps me learn which memories are valuable.
`;
```

**Logs to Add:**
```typescript
logger.info({ marks }, "[attribution] Parsed memory marks from response");
logger.debug({ upvotes, downvotes }, "[attribution] Scoring memories based on marks");
```


---

## Phase 16: Tool Result Ingestion

### Gap: Search/Research Tool Outputs Not Stored

**RoamPal Pattern:** Tool results are cached for outcome scoring via `_cache_memories_for_scoring()` and stored in working memory.

### Implementation

**File:** `src/lib/server/textGeneration/mcp/toolInvocation.ts`

Add after line 1190:
```typescript
// Ingest tool results to memory
const category = getToolCategory(toolName);
if (category && !r.error && r.output) {
    await ingestToolResult({
        conversationId,
        toolName,
        category,
        output: r.output,
    });
    logger.info({ toolName, category }, "[tool-ingest] Stored result");
}
```

**Logs:**
```typescript
logger.info({ toolName, outputLen: output.length }, "[ingest] Tool result stored");
logger.warn({ toolName }, "[ingest] Skipped - output too short");
```


---

## Phase 17: Frontend Real-Time Updates

### Gap: Memory Panel Not Updating in Real-Time

**RoamPal Pattern:** WebSocket-based push notifications with `memoryUpdated` event.

### Implementation

**File:** `src/lib/stores/memoryUi.ts`

```typescript
// Add SSE subscription for memory events
export function subscribeToMemoryEvents(conversationId: string) {
    const eventSource = new EventSource(
        `/api/memory/events?conversationId=${conversationId}`
    );
    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'memory_stored') {
            memoryUi.update(s => ({
                ...s,
                data: { ...s.data, lastUpdate: Date.now() }
            }));
        }
    };
    return () => eventSource.close();
}
```

**Logs:**
```typescript
logger.debug({ event: data.type }, "[sse] Memory event received");
```


---

## Phase 18: Graceful Degradation

### Gap: Service Failures Can Crash UI

**RoamPal Pattern:** All services have timeout protection and fallback.

### Implementation

**File:** `src/lib/server/memory/search/SearchService.ts`

```typescript
async search(params: SearchParams): Promise<SearchResponse> {
    try {
        return await Promise.race([
            this._doSearch(params),
            this.timeoutFallback(params.signal)
        ]);
    } catch (err) {
        logger.error({ err }, "[search] Failed, returning empty");
        return { results: [], latencyMs: 0, debug: { error: String(err) } };
    }
}

private async timeoutFallback(signal?: AbortSignal): Promise<never> {
    await new Promise((_, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 15000);
        signal?.addEventListener('abort', () => clearTimeout(timeout));
    });
    throw new Error('Timeout');
}
```

**Logs:**
```typescript
logger.warn({ timeout: 15000 }, "[search] Timeout, returning empty results");
logger.error({ err }, "[search] Service error, graceful fallback");
```


---

## Phase 19: Hybrid Search with RRF

### Gap: RRF Fusion Not Fully Utilized

**RoamPal Pattern:** `search_service.py` L226-252 - Multi-source search with boosts.

### Current BricksLLM Status
- RRF exists in `SearchService.ts` L303
- Weights configured in `memory_config.ts` L162-166

### Verification Steps
1. Confirm BM25 + Vector search both execute
2. Verify RRF weights applied correctly
3. Add cross-encoder reranking if missing

**Logs to Add:**
```typescript
logger.debug({ vectorCount, bm25Count }, "[search] Hybrid sources");
logger.info({ fusedCount, rrfWeights }, "[search] RRF fusion complete");
```


---

## Phase 20: Knowledge Graph Node Names Fix

### Gap: 3D Visualization Not Rendering Labels

### Root Cause
Font doesn't support Hebrew in canvas rendering.

### Implementation

**File:** `src/lib/components/memory/KnowledgeGraph3D.svelte`

```typescript
// Line ~385 - Use Hebrew-supporting font
ctx.font = "bold 36px -apple-system, 'Segoe UI', 'Noto Sans Hebrew', sans-serif";

// Add fallback for empty labels
const label = node.concept?.trim() || node.id || "Unknown";
```

**Logs:**
```typescript
console.debug('[KG3D] Rendering node:', node.id, label);
```


---

## Phase 21: Comprehensive Logging Strategy

### Every Function Must Log Entry/Exit/Error

**Pattern from RoamPal:**
```python
logger.info(f"[{service}] Method started", extra={...})
logger.debug(f"[{service}] Processing", extra={...})
logger.error(f"[{service}] Failed", exc_info=True)
```

### Logging Standards for BricksLLM

| Level | When to Use | Example |
|-------|-------------|---------|
| `error` | Unrecoverable failures | `logger.error({ err }, "[search] Failed")` |
| `warn` | Recoverable issues | `logger.warn("[search] Timeout, using fallback")` |
| `info` | Key operations | `logger.info({ count }, "[store] Items saved")` |
| `debug` | Detailed flow | `logger.debug({ params }, "[search] Query parsed")` |

### Files Requiring Enhanced Logging

1. `UnifiedMemoryFacade.ts` - All public methods
2. `SearchService.ts` - Search flow
3. `KnowledgeGraphService.ts` - KG operations
4. `PromotionService.ts` - Tier changes
5. `OutcomeServiceImpl.ts` - Score updates
6. `runMcpFlow.ts` - Orchestration flow


---

## Implementation Priority Matrix (Updated)

| Phase | Priority | Effort | Risk | Dependencies |
|-------|----------|--------|------|--------------|
| 1. Consolidate Collections | HIGH | Large | Medium | None |
| 9. Interface Contracts | MEDIUM | Medium | Low | None |
| 10. Race Condition Prevention | HIGH | Small | Medium | None |
| 11. Atomic Operations | MEDIUM | Medium | High | Phase 10 |
| 12. Wilson Score Time Decay | HIGH | Small | Low | None |
| 13. Memory-First Logic | HIGH | Medium | Medium | Phase 1 |
| 14. Cold-Start Injection | HIGH | Small | Low | Phase 1 |
| 15. Causal Attribution | MEDIUM | Medium | Low | Phase 12 |
| 16. Tool Result Ingestion | HIGH | Medium | Medium | Phase 1 |
| 17. Frontend Real-Time | MEDIUM | Medium | Low | Phase 16 |
| 18. Graceful Degradation | HIGH | Small | Low | None |
| 19. Hybrid Search RRF | LOW | Small | Low | Verify only |
| 20. KG Node Names | LOW | Small | Low | None |
| 21. Comprehensive Logging | HIGH | Medium | Low | All phases |


---

## RoamPal File Reference Map

### Backend Files

| RoamPal File | BricksLLM Equivalent | Key Lines |
|--------------|---------------------|-----------|
| `unified_memory_system.py` | `UnifiedMemoryFacade.ts` | Facade pattern |
| `search_service.py` | `SearchService.ts` | L83-176 search flow |
| `outcome_service.py` | `OutcomeServiceImpl.ts` | L50-181 recording |
| `promotion_service.py` | `PromotionService.ts` | L69-121 promotion |
| `knowledge_graph_service.py` | `KnowledgeGraphService.ts` | L177-204 debounce |
| `routing_service.py` | (embedded in KG) | L174 getTierPlan |
| `config.py` | `memory_config.ts` | Thresholds |
| `agent_chat.py` | `runMcpFlow.ts` | L627-668 cold-start |

### Frontend Files

| RoamPal Component | BricksLLM Equivalent |
|-------------------|---------------------|
| `MemoryPanelV2` | `MemoryPanel.svelte` |
| `MemoryCitation` | `CitationTooltip.svelte` |
| `KnowledgeGraph` | `KnowledgeGraph3D.svelte` |
| `useChatStore` | `memoryUi.ts` |


---

## Testing Checklist

### Unit Tests Required
- [ ] Migration script handles edge cases
- [ ] Wilson score with time decay
- [ ] Memory marks parsing
- [ ] Tool result categorization
- [ ] Confidence-based tool filtering

### Integration Tests Required
- [ ] End-to-end memory storage and retrieval
- [ ] Promotion flow (working → history → patterns)
- [ ] Cold-start injection on first message
- [ ] Tool results appear in memory after execution
- [ ] Real-time UI updates via SSE

### Manual Testing
- [ ] Upload PDF → Memory panel shows chunks
- [ ] Ask about PDF → Uses memory, doesn't re-parse
- [ ] Web search → Results stored in memory
- [ ] Same question → Uses memory, skips search
- [ ] KG shows Hebrew node names
- [ ] Trace panel: single event per operation


---

## Rollback & Feature Flags

### Environment Variables

```env
# Feature flags for phased rollout
MEMORY_CONSOLIDATION_ENABLED=true
TOOL_RESULT_INGESTION_ENABLED=true
MEMORY_FIRST_LOGIC_ENABLED=true
COLD_START_INJECTION_ENABLED=true
CAUSAL_ATTRIBUTION_ENABLED=true
TIME_WEIGHTED_SCORES_ENABLED=true
```

### Rollback Procedures

**Phase 1 (Collections):**
1. Set `MEMORY_CONSOLIDATION_ENABLED=false`
2. Restore `memoryBank` from backup
3. Revert API routes

**Phase 10-11 (Transactions):**
1. Remove `async-mutex` dependency
2. Revert to non-locked writes

**Phase 13-15 (Memory-First):**
1. Set flags to `false`
2. Remove guidance injection
3. Revert tool filtering


---

## Success Criteria

### Definition of Done
- [ ] Single source of truth for all memory data
- [ ] Tool results automatically ingested into memory
- [ ] Memory-first logic reduces redundant tool calls by >50%
- [ ] Documents not re-parsed on subsequent queries
- [ ] Memory panel always shows accurate results
- [ ] KG 3D renders all node names correctly
- [ ] Trace panel shows single event per operation
- [ ] UI updates in real-time as memory grows
- [ ] All services have comprehensive logging
- [ ] Race conditions eliminated via mutex locks

### Performance Targets
- Memory search: <500ms p95
- Tool ingestion: <200ms (non-blocking)
- Memory-first decision: <50ms overhead
- UI refresh: <100ms after event
- KG save debounce: 5 seconds

---

## Phase 22: RoamPal v0.2.9 Natural Selection Enhancements (HIGH PRIORITY)

### Overview
RoamPal v0.2.9 introduced "Natural Selection for Memory" - a set of enhancements that solve critical issues with memory quality and noise. These MUST be implemented to avoid re-introducing problems that RoamPal already solved.

**Key Problems Solved:**
1. Ghost memories from archive-on-update behavior
2. Noise memories surfacing forever (no feedback loop)
3. Memories coasting to patterns without proving usefulness
4. Retrieval/display/scoring mismatch

---

### 22.1: Remove Archive-on-Update (memory_bank_service.py → MemoryMongoStore.ts)

**RoamPal Problem:** `update_memory` was creating archived copies of old content, leading to:
- Ghost memories with `_archived_` suffix accumulating
- Archived memories leaking into scoring hooks
- Unnecessary storage bloat

**RoamPal Solution:** Update now overwrites in place without creating archive copies.

**BricksLLM Implementation:**

**File:** `src/lib/server/memory/stores/MemoryMongoStore.ts`

```typescript
// Current behavior: update() calls createVersion() which preserves old state
// New behavior: update() should overwrite in place, only version on explicit request

// Modify update() method - around line 476
// REMOVE the automatic version creation on every update
// ONLY create version when changeReason is explicitly provided

async update(params: UpdateMemoryParams): Promise<MemoryItem | null> {
    const now = new Date();
    
    // Get current document - only for version if explicitly requested
    let current: MemoryItemDocument | null = null;
    if (params.changeReason) {
        current = await this.items.findOne({
            memory_id: params.memoryId,
            user_id: params.userId,
        });
    }

    const updateFields: Partial<MemoryItemDocument> = {
        updated_at: now,
    };
    
    // ... rest of update logic
    
    // ONLY create version if changeReason provided
    if (result && params.changeReason && current) {
        const changeType = params.tier !== current.tier ? "promote"
            : params.status === "archived" ? "archive"
            : "update";
        this.createVersion(/* ... */).catch(() => {});
    }
    
    return result;
}
```

**Add cleanup method:**

```typescript
// Add to MemoryMongoStore.ts
/**
 * Delete all archived memories (cleanup legacy archive-on-update behavior)
 * RoamPal Reference: memory_bank_service.py cleanup_archived()
 */
async cleanupArchived(userId: string): Promise<number> {
    const result = await this.withTimeout(
        async () => {
            // Delete memories with status "archived" or "_archived_" in ID
            const deleted = await this.items.deleteMany({
                user_id: userId,
                $or: [
                    { status: "archived" },
                    { memory_id: { $regex: /_archived_/ } }
                ]
            });
            return deleted.deletedCount;
        },
        this.config.timeouts.mongo_aggregate_ms,
        "cleanupArchived"
    );
    
    if (result && result > 0) {
        logger.info({ userId, count: result }, "[cleanup] Removed archived memories");
    }
    
    return result ?? 0;
}
```

**Call on startup in UnifiedMemoryFacade.ts:**

```typescript
// In initialize() method
await this.mongoStore.cleanupArchived(ADMIN_USER_ID);
```

**Logs to Add:**
```typescript
logger.info({ memoryId }, "[update] Overwriting in place (no archive copy)");
logger.info({ count }, "[cleanup] Purged archived memories on startup");
```

---

### 22.2: Wilson Scoring for memory_bank Tier (search_service.py → SearchService.ts)

**RoamPal Problem:** `memory_bank` items surface based on semantic similarity + quality (importance × confidence) only. No feedback loop exists - irrelevant facts keep surfacing forever because "unknown" scores don't penalize them.

**RoamPal Solution:** Add Wilson score influence to memory_bank ranking with formula:
```
final_score = 0.8 * (importance × confidence) + 0.2 * wilson_score
```

**Threshold protection:** Only apply Wilson influence if `uses >= 3` (protects new facts from cold start).

**BricksLLM Implementation:**

**File:** `src/lib/server/memory/search/SearchService.ts`

**Add Wilson blending in RRF fusion - around line 303:**

```typescript
// Modify fuseResults() method to include Wilson blending for memory_bank

private fuseResults(
    vectorResults: QdrantSearchResult[],
    lexicalResults: Bm25SearchResult[]
): CandidateResult[] {
    const candidates = new Map<string, CandidateResult>();
    const weights = this.config.weights.embedding_blend;

    // Process vector results
    for (let i = 0; i < vectorResults.length; i++) {
        const vr = vectorResults[i];
        const vectorRank = i + 1;
        const vectorRrfScore = rankToRrfScore(vectorRank, RRF_K);

        // v0.2.9: Apply Wilson blending for memory_bank tier
        let finalScore = vectorRrfScore * weights.dense_weight;
        
        if (vr.payload.tier === "memory_bank") {
            const importance = vr.payload.importance ?? 0.7;
            const confidence = vr.payload.confidence ?? 0.7;
            const qualityScore = importance * confidence;
            const uses = vr.payload.uses ?? 0;
            const successCount = vr.payload.success_count ?? 0;
            
            if (uses >= 3) {
                // Calculate Wilson score from memory's own outcomes
                const wilson = uses > 0 ? successCount / uses : 0.5;
                // 80% quality + 20% Wilson
                const blendedScore = 0.8 * qualityScore + 0.2 * wilson;
                finalScore *= (1.0 + blendedScore * 0.3); // Boost by blended score
            } else {
                // Cold start protection - use quality only
                finalScore *= (1.0 + qualityScore * 0.3);
            }
        }

        candidates.set(vr.id, {
            memoryId: vr.id,
            content: vr.payload.content,
            tier: vr.payload.tier,
            vectorScore: vr.score,
            vectorRank,
            rrfScore: vectorRrfScore * weights.dense_weight,
            finalScore,
            wilsonScore: vr.payload.composite_score,
            uses: vr.payload.uses,
        });
    }
    
    // ... rest of method
}
```

**Logs to Add:**
```typescript
logger.debug({ memoryId, tier, uses, wilsonBlend }, "[search] Applied Wilson blending for memory_bank");
```

---

### 22.3: Unknown Outcome Creates Weak Negative Signal (outcome_service.py → OutcomeServiceImpl.ts/MemoryMongoStore.ts)

**RoamPal Problem:** "Unknown" outcomes (surfaced but not used) had no effect, so noise memories never demote.

**RoamPal Solution:** Unknown = +1 use, +0.25 success (weak negative signal for natural selection).

**Scoring table:**
- `worked` = 1.0 success (memory was helpful)
- `partial` = 0.5 success (somewhat helpful)  
- `unknown` = 0.25 success (surfaced but not used - weak negative)
- `failed` = 0.0 success (memory was misleading)

> ⚠️ **CRITICAL: See Phase 23.1-23.3 for v0.2.8 bug fixes that MUST be applied:**
> - 23.1: Use explicit `switch` statement (not `else` catch-all) to prevent unknown→partial bug
> - 23.2: Wilson score must use `success_count` field (not capped `outcome_history`)
> - 23.3: ALL outcomes (including `failed`) must increment `uses` counter

**BricksLLM Implementation:**

**File:** `src/lib/server/memory/memory_config.ts`

```typescript
// Add to outcome_deltas (around line 70)
outcome_deltas: {
    worked: 0.2,
    partial: 0.05,
    failed: -0.3,
    unknown: 0.0,  // No raw score change
},

// Add new config for success counting
outcome_success_values: {
    worked: 1.0,
    partial: 0.5,
    unknown: 0.25,  // v0.2.9: Weak negative signal
    failed: 0.0,
},
```

**File:** `src/lib/server/memory/stores/MemoryMongoStore.ts`

**Modify recordOutcome() - around line 745:**

```typescript
async recordOutcome(params: RecordOutcomeParams): Promise<boolean> {
    const now = new Date();
    const outcomeId = uuidv4();

    // v0.2.9: Success values for Wilson calculation
    const successValues = this.config.outcome_success_values ?? {
        worked: 1.0,
        partial: 0.5,
        unknown: 0.25,
        failed: 0.0,
    };
    
    const successDelta = successValues[params.outcome] ?? 0;
    
    // Calculate time-weighted score delta (for raw score)
    const deltas = this.config.outcome_deltas;
    const baseDelta = deltas[params.outcome];
    const timeWeight = params.timeWeight ?? 1.0;
    const scoreDelta = baseDelta * timeWeight;

    const result = await this.withTimeout(
        async () => {
            const outcomeField = `stats.${params.outcome}_count`;

            // v0.2.9: Always increment uses (including unknown)
            // Always increment success_count by successDelta
            const updated = (await this.items.findOneAndUpdate(
                { memory_id: params.memoryId, user_id: params.userId },
                {
                    $inc: {
                        "stats.uses": 1,
                        [outcomeField]: 1,
                        "stats.success_count": successDelta,  // NEW: Cumulative success tracking
                    },
                    $set: {
                        "stats.last_used_at": now,
                        updated_at: now,
                    },
                },
                { returnDocument: "after" }
            )) as unknown as MemoryItemDocument | null;

            if (!updated) return false;

            // Recalculate Wilson score using success_count / uses
            const stats = updated.stats;
            const total = stats.uses;
            const successCount = stats.success_count ?? 0;  // Cumulative from successDelta
            
            // Wilson score from cumulative success_count
            const wilsonScore = total > 0 
                ? calculateWilsonScore(successCount, total)
                : 0.5;

            await this.items.updateOne(
                { memory_id: params.memoryId },
                {
                    $set: {
                        "stats.wilson_score": wilsonScore,
                        "stats.success_rate": total > 0 ? successCount / total : 0.5,
                    },
                }
            );

            // ... rest of outcome recording
        },
        // ...
    );
}
```

**Update MemoryItemDocument schema to include success_count:**

**File:** `src/lib/server/memory/stores/schemas.ts`

```typescript
// Add to stats field in MemoryItemDocument
stats: {
    uses: number;
    last_used_at: Date | null;
    worked_count: number;
    failed_count: number;
    partial_count: number;
    unknown_count: number;
    success_count: number;  // NEW: Cumulative success (worked=1, partial=0.5, unknown=0.25)
    success_rate: number;
    wilson_score: number;
};
```

**Logs to Add:**
```typescript
logger.info({ 
    memoryId, 
    outcome, 
    successDelta, 
    newWilsonScore,
    uses 
}, "[outcome] Recorded with v0.2.9 success tracking");
```

---

### 22.4: Stricter History → Patterns Promotion (promotion_service.py → PromotionService.ts)

**RoamPal Problem:** Memories can coast from working → history → patterns on initial good scores without proving long-term usefulness.

**RoamPal Solution:**
1. **Reset counters on history entry** - When working → history, reset `success_count` and `uses` to 0
2. **Require 5 worked outcomes for patterns eligibility** - Cannot promote to patterns until `success_count >= 5`

**BricksLLM Implementation:**

**File:** `src/lib/server/memory/learning/PromotionService.ts`

**Modify promoteMemory() - around line 249:**

```typescript
private async promoteMemory(memoryId: string, userId: string, toTier: MemoryTier): Promise<void> {
    // v0.2.9: Reset counters when entering history (probation period)
    const updateFields: Record<string, unknown> = {
        tier: toTier,
    };
    
    if (toTier === "history") {
        // Memory must prove itself fresh in history
        updateFields["stats.success_count"] = 0;
        updateFields["stats.uses"] = 0;
        updateFields["stats.promoted_to_history_at"] = new Date().toISOString();
        
        logger.info({ memoryId, toTier }, "[promotion] Reset counters for history probation");
    }

    // Update MongoDB
    await this.mongo.update({
        memoryId,
        userId,
        tier: toTier,
    });
    
    // Also update the reset fields if promoting to history
    if (toTier === "history") {
        // Direct update for reset fields
        await this.mongo.getCollections().items.updateOne(
            { memory_id: memoryId },
            { $set: updateFields }
        );
    }

    // Update Qdrant payload
    await this.qdrant.updatePayload(memoryId, { tier: toTier });

    logger.debug({ memoryId, toTier }, "Memory promoted");
}
```

**Modify findPromotionCandidates() to require success_count >= 5 for patterns:**

```typescript
private async findPromotionCandidates(
    tier: MemoryTier,
    minScore: number,
    minUses: number,
    userId?: string
): Promise<Array<{ memory_id: string; user_id: string }>> {
    const memories = await this.mongo.query({
        userId: userId ?? "",
        tiers: [tier],
        status: ["active"],
        limit: 100,
    });

    // Filter by score and uses
    return memories
        .filter((m) => {
            const score = m.stats?.wilson_score ?? 0;
            const uses = m.stats?.uses ?? 0;
            const successCount = m.stats?.success_count ?? 0;
            
            // Base requirements
            if (score < minScore || uses < minUses) return false;
            
            // v0.2.9: Additional requirement for patterns promotion
            if (tier === "history") {
                // Require 5 worked outcomes to prove usefulness
                if (successCount < 5) {
                    logger.debug({ 
                        memoryId: m.memory_id, 
                        successCount, 
                        required: 5 
                    }, "[promotion] Skipping - insufficient success count for patterns");
                    return false;
                }
            }
            
            return true;
        })
        .map((m) => ({ memory_id: m.memory_id, user_id: m.user_id }));
}
```

**Update PROMOTION_RULES constant:**

```typescript
const PROMOTION_RULES: PromotionRule[] = [
    { fromTier: "working", toTier: "history", minScore: 0.7, minUses: 2 },
    { fromTier: "history", toTier: "patterns", minScore: 0.9, minUses: 3 },
    // v0.2.9: success_count >= 5 is checked in findPromotionCandidates
];
```

**Logs to Add:**
```typescript
logger.info({ memoryId, successCount, minRequired: 5 }, "[promotion] Patterns eligibility check");
logger.info({ memoryId }, "[promotion] Reset counters on history entry (probation)");
```

---

### 22.5: Add uses/success_count Fields to memory_bank Items (memory_bank_service.py)

**RoamPal Change:** memory_bank items now track `uses` and `success_count` fields for Wilson scoring.

**BricksLLM Implementation:**

**File:** `src/lib/server/memory/stores/MemoryMongoStore.ts`

**Ensure store() method initializes these fields - already exists but verify:**

```typescript
// In store() method, stats object should include:
stats: {
    uses: 0,
    last_used_at: null,
    worked_count: 0,
    failed_count: 0,
    partial_count: 0,
    unknown_count: 0,
    success_count: 0.0,  // NEW: Initialize to 0
    success_rate: 0.5,
    wilson_score: 0.5,
},
```

---

### 22.6: Filter Empty Memories from Context (unified_memory_system.py)

**RoamPal Problem:** Empty/blank memories could surface in context injection.

**RoamPal Solution:** Filter out memories with no content before slicing.

**BricksLLM Implementation:**

**File:** `src/lib/server/memory/services/PrefetchServiceImpl.ts`

```typescript
// After retrieving memories, before context injection
// Add filter for empty content

const validResults = results.filter(m => 
    (m.content && m.content.trim().length > 0) || 
    (m.text && m.text.trim().length > 0)
);

const topMemories = validResults.slice(0, 3);  // v0.2.9: Match retrieval to display (3 not 5)
```

**Logs to Add:**
```typescript
logger.debug({ 
    total: results.length, 
    valid: validResults.length, 
    displayed: topMemories.length 
}, "[prefetch] Filtered empty memories");
```

---

### 22.7: Skip Empty Exchange Storage (main.py → runMcpFlow.ts)

**RoamPal Problem:** Stop hook was storing exchanges without validating content, leading to empty working memories.

**RoamPal Solution:** Validate user_message and assistant_response before storing.

**BricksLLM Implementation:**

**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts`

**Add validation before storing working memory - around line 1959:**

```typescript
// In storeWorkingMemory() or equivalent
async function storeWorkingMemory(params: {
    conversationId: string;
    userMessage: string;
    assistantResponse: string;
}): Promise<void> {
    // v0.2.9: Skip empty exchange storage
    if (!params.userMessage?.trim() || !params.assistantResponse?.trim()) {
        logger.warn({ conversationId: params.conversationId }, 
            "[mcp] Skipping empty exchange storage");
        return;
    }
    
    // Proceed with storage...
}
```

**Logs to Add:**
```typescript
logger.warn({ conversationId }, "[working-memory] Skipped empty exchange");
```

---

### 22.8: Cross-Encoder Reranking with Wilson Blend (search_service.py)

**RoamPal Enhancement:** Include Wilson in quality_boost calculation during cross-encoder reranking.

**BricksLLM Implementation:**

**File:** `src/lib/server/memory/search/SearchService.ts`

**Modify rerank() method - around line 406:**

```typescript
// Apply CE scores with Wilson blending
for (const result of data.results) {
    const candidate = toRerank[result.index];
    if (candidate) {
        candidate.ceScore = result.score;
        candidate.ceRank = data.results.findIndex((r) => r.index === result.index) + 1;

        // v0.2.9: Include Wilson in quality boost for memory_bank
        let qualityBoost = 1.0;
        
        if (candidate.tier === "memory_bank") {
            const importance = candidate.importance ?? 0.7;
            const confidence = candidate.confidence ?? 0.7;
            const quality = importance * confidence;
            const uses = candidate.uses ?? 0;
            const successCount = candidate.successCount ?? 0;
            
            if (uses >= 3) {
                const wilson = uses > 0 ? successCount / uses : 0.5;
                const blendedQuality = 0.8 * quality + 0.2 * wilson;
                qualityBoost = 1.0 + blendedQuality * 0.3;
            } else {
                qualityBoost = 1.0 + quality * 0.3;
            }
        }

        // Blend original RRF score with CE score
        const ceWeights = this.config.weights.cross_encoder_blend;
        candidate.finalScore =
            (candidate.rrfScore * ceWeights.original_weight + result.score * ceWeights.ce_weight) 
            * qualityBoost;
    }
}
```

---

## Phase 22 Implementation Priority

| Step | Priority | Effort | Risk | Dependencies |
|------|----------|--------|------|--------------|
| 22.1 Remove Archive-on-Update | HIGH | Small | Low | None |
| 22.2 Wilson for memory_bank | HIGH | Medium | Medium | None |
| 22.3 Unknown Outcome Signal | HIGH | Medium | Low | None |
| 22.4 Stricter Patterns Promotion | HIGH | Medium | Low | 22.3 |
| 22.5 uses/success_count Fields | HIGH | Small | Low | None |
| 22.6 Filter Empty Memories | MEDIUM | Small | Low | None |
| 22.7 Skip Empty Exchanges | MEDIUM | Small | Low | None |
| 22.8 CE Reranking with Wilson | LOW | Small | Low | 22.2 |

---

## Phase 22 Testing Checklist

### Unit Tests Required
- [ ] Unknown outcome increments uses and adds 0.25 to success_count
- [ ] Wilson score calculation uses success_count / uses ratio
- [ ] memory_bank search applies 80/20 quality/Wilson blend when uses >= 3
- [ ] memory_bank search uses quality-only when uses < 3 (cold start)
- [ ] History promotion resets success_count and uses to 0
- [ ] Patterns promotion requires success_count >= 5
- [ ] cleanupArchived() deletes archived memories and _archived_ IDs
- [ ] Empty exchanges are not stored to working memory

### Integration Tests Required
- [ ] New memory_bank item starts with uses=0, success_count=0
- [ ] After 10 "unknown" outcomes, Wilson score drops below quality-only baseline
- [ ] After 5 "worked" outcomes, memory becomes patterns-eligible
- [ ] Promoting to history resets counters (probation period)
- [ ] startup calls cleanupArchived() and purges old archived items

### Natural Selection Verification
Test the natural selection math:
```
Useful fact:    8 worked, 2 unknown → success_count = 8.5 → Wilson: 8.5/10 = 0.85
Noise fact:     0 worked, 10 unknown → success_count = 2.5 → Wilson: 2.5/10 = 0.25
```

With 80/20 blend:
```
Useful:  0.8 * quality + 0.2 * 0.85 = quality + 0.17
Noise:   0.8 * quality + 0.2 * 0.25 = quality + 0.05
Gap: 0.12 (compounds over time, noise drifts down)
```

---

## Phase 23: RoamPal v0.2.8 Critical Bug Fixes (Safeguards)

**Source:** RoamPal HOTFIX_0.2.8.1.md and RELEASE_NOTES.md v0.2.8

These are **critical safeguards** that must be implemented alongside Phase 22 to prevent re-introducing bugs that were discovered and fixed in RoamPal's production system.

---

### 23.1: Explicit Outcome Type Handling (v0.2.8.1 Hotfix)

**RoamPal Bug:** The `_calculate_score_update()` method used an `else` catch-all for the `partial` outcome:

```python
# BROKEN CODE (v0.2.8)
if outcome == "worked":
    return (0.2, 1.0)
elif outcome == "failed":
    return (-0.3, 0.0)
else:  # BUG: This catches both "partial" AND "unknown"
    return (0.05, 0.5)
```

**Impact:** `unknown` outcomes silently received +0.05 score and +0.5 success instead of the intended +0.0/+0.25, breaking the natural selection mechanism.

**RoamPal Fix:** Explicit `elif` for `partial` with guard `else`:

```python
# FIXED CODE (v0.2.8.1)
if outcome == "worked":
    return (0.2, 1.0)
elif outcome == "failed":
    return (-0.3, 0.0)
elif outcome == "partial":  # EXPLICIT CHECK
    return (0.05, 0.5)
elif outcome == "unknown":  # EXPLICIT CHECK
    return (0.0, 0.25)
else:
    logger.warning(f"Invalid outcome type: {outcome}")
    return (0.0, 0.0)  # Safe default - no effect
```

**BricksLLM Implementation:**

**File:** `src/lib/server/memory/stores/MemoryMongoStore.ts`

**Augment recordOutcome() with explicit outcome validation:**

```typescript
async recordOutcome(params: RecordOutcomeParams): Promise<boolean> {
    const now = new Date();
    const outcomeId = uuidv4();

    // v0.2.8.1: EXPLICIT outcome type handling (prevent else-branch bugs)
    type ValidOutcome = "worked" | "failed" | "partial" | "unknown";
    const validOutcomes: ValidOutcome[] = ["worked", "failed", "partial", "unknown"];
    
    if (!validOutcomes.includes(params.outcome as ValidOutcome)) {
        logger.warn({ 
            outcome: params.outcome, 
            memoryId: params.memoryId 
        }, "[outcome] Invalid outcome type - ignoring");
        return false;  // Don't modify memory for invalid outcomes
    }

    // v0.2.9: Success values with EXPLICIT mapping (no catch-all)
    const getSuccessDelta = (outcome: ValidOutcome): number => {
        switch (outcome) {
            case "worked": return 1.0;
            case "partial": return 0.5;  // EXPLICIT - not else
            case "unknown": return 0.25; // EXPLICIT - not else
            case "failed": return 0.0;
            // No default case - TypeScript exhaustiveness checking
        }
    };
    
    const getScoreDelta = (outcome: ValidOutcome): number => {
        switch (outcome) {
            case "worked": return 0.2;
            case "partial": return 0.05;  // EXPLICIT
            case "unknown": return 0.0;   // EXPLICIT - no raw score change
            case "failed": return -0.3;
            // No default case
        }
    };

    const successDelta = getSuccessDelta(params.outcome as ValidOutcome);
    const baseScoreDelta = getScoreDelta(params.outcome as ValidOutcome);
    const timeWeight = params.timeWeight ?? 1.0;
    const scoreDelta = baseScoreDelta * timeWeight;

    logger.debug({
        memoryId: params.memoryId,
        outcome: params.outcome,
        successDelta,
        scoreDelta,
        timeWeight,
    }, "[outcome] Processing with explicit outcome handling");

    // ... rest of method continues with MongoDB update
}
```

**Logs to Add:**
```typescript
logger.warn({ outcome, memoryId }, "[outcome] Invalid outcome type - safe reject");
logger.debug({ outcome, successDelta, scoreDelta }, "[outcome] v0.2.8.1 explicit values");
```

---

### 23.2: Wilson Score 10-Use Cap Bug (v0.2.8 Release)

**RoamPal Bug:** `outcome_history` array was capped at 10 entries, but Wilson score calculated `successes` by parsing this capped history:

```python
# BROKEN CODE
outcome_history = outcome_history[-10:]  # Cap at 10
successes = sum(1 for o in outcome_history if o == "worked")
wilson = wilson_score(successes, len(outcome_history))  # BUG: denominator capped at 10
```

**Impact:** A memory with 50 uses and 45 successes would have Wilson = 8/10 = 0.8 instead of 45/50 = 0.9, destroying long-term learning accuracy.

**RoamPal Fix:** Use cumulative `success_count` field instead of parsing `outcome_history`:

```python
# FIXED CODE
wilson = wilson_score(stats['success_count'], stats['uses'])
```

**BricksLLM Implementation:**

Phase 22.3 already introduces `success_count`, but we need to ensure:
1. Wilson NEVER reads from outcome_history for calculation
2. Backward compatibility for records without success_count

**File:** `src/lib/server/memory/stores/MemoryMongoStore.ts`

**Add explicit safeguard in Wilson calculation:**

```typescript
// v0.2.8: Wilson score MUST use cumulative success_count, NOT outcome_history
private calculateWilsonFromStats(stats: MemoryStats | null): number {
    if (!stats) return 0.5; // Default for no stats
    
    const uses = stats.uses ?? 0;
    if (uses === 0) return 0.5; // No usage yet
    
    // v0.2.8 CRITICAL: Use cumulative success_count
    // NEVER parse outcome_history (it's capped and would break long-term accuracy)
    let successCount = stats.success_count;
    
    // Backward compatibility: If success_count missing, estimate from outcome counts
    if (typeof successCount !== "number") {
        // Fallback calculation for old records (will be inaccurate but better than crash)
        const worked = stats.worked_count ?? 0;
        const partial = stats.partial_count ?? 0;
        const unknown = stats.unknown_count ?? 0;
        
        successCount = worked * 1.0 + partial * 0.5 + unknown * 0.25;
        
        logger.warn({
            memoryId: "unknown",  // Add memoryId as param if needed
            estimatedSuccessCount: successCount,
            workedCount: worked,
            partialCount: partial,
            unknownCount: unknown,
        }, "[wilson] success_count missing - using fallback calculation (inaccurate)");
    }
    
    return calculateWilsonScore(successCount, uses);
}
```

**Migration Note:**
```typescript
// One-time migration for existing records without success_count
// Add to startup or migration script:
async function migrateSuccessCount(): Promise<void> {
    const cursor = await items.find({ "stats.success_count": { $exists: false } });
    
    for await (const doc of cursor) {
        const stats = doc.stats ?? {};
        const successCount = 
            (stats.worked_count ?? 0) * 1.0 +
            (stats.partial_count ?? 0) * 0.5 +
            (stats.unknown_count ?? 0) * 0.25;
        
        await items.updateOne(
            { _id: doc._id },
            { $set: { "stats.success_count": successCount } }
        );
    }
    
    logger.info("[migration] Backfilled success_count for existing records");
}
```

---

### 23.3: Failed Outcomes Must Increment Uses (v0.2.8 Release)

**RoamPal Bug:** Failed outcomes were silently skipped from incrementing the `uses` counter:

```python
# BROKEN CODE
if outcome == "worked":
    uses += 1
    success_count += 1.0
elif outcome == "partial":
    uses += 1
    success_count += 0.5
# BUG: "failed" branch missing - uses not incremented
```

**Impact:** A memory that failed 10 times would have uses=0, giving it Wilson=0.5 (neutral) instead of 0/10=0.0 (terrible).

**RoamPal Fix:** ALL outcomes increment uses:

```python
# FIXED CODE
uses += 1  # ALWAYS increment, regardless of outcome type
if outcome == "worked":
    success_count += 1.0
elif outcome == "partial":
    success_count += 0.5
elif outcome == "unknown":
    success_count += 0.25
# failed adds 0 to success_count but still increments uses
```

**BricksLLM Implementation:**

Phase 22.3 already has this correct with `$inc: { "stats.uses": 1 }` outside of any conditional. Verify this safeguard remains in place:

```typescript
// v0.2.8: CRITICAL - uses MUST always increment for ALL outcomes
// This line must be OUTSIDE any if/else outcome branching:
const updated = await this.items.findOneAndUpdate(
    { memory_id: params.memoryId, user_id: params.userId },
    {
        $inc: {
            "stats.uses": 1,  // ← ALWAYS incremented (not conditional)
            [outcomeField]: 1,
            "stats.success_count": successDelta,
        },
        // ...
    }
);
```

**Add assertion test:**
```typescript
// Unit test: Verify failed outcome increments uses
it("should increment uses for failed outcome", async () => {
    const memoryId = "test-memory";
    await store.recordOutcome({ memoryId, outcome: "failed", userId: "test" });
    
    const item = await store.getById(memoryId);
    expect(item.stats.uses).toBe(1);  // Must be 1, not 0
    expect(item.stats.success_count).toBe(0);  // Failed = 0 success
    expect(item.stats.failed_count).toBe(1);
});
```

---

### 23.4: Outcome Recording Atomicity (v0.2.8 Enhancement)

**RoamPal Enhancement:** Ensure Wilson recalculation happens atomically with the outcome update to prevent race conditions.

**BricksLLM Implementation:**

**File:** `src/lib/server/memory/stores/MemoryMongoStore.ts`

Use MongoDB aggregation pipeline in update for atomic Wilson recalculation:

```typescript
// v0.2.8: Atomic Wilson update (single operation, no race condition)
const result = await this.items.findOneAndUpdate(
    { memory_id: params.memoryId, user_id: params.userId },
    [
        {
            $set: {
                "stats.uses": { $add: ["$stats.uses", 1] },
                "stats.success_count": { $add: ["$stats.success_count", successDelta] },
                [`stats.${params.outcome}_count`]: { $add: [`$stats.${params.outcome}_count`, 1] },
                "stats.last_used_at": now,
                "updated_at": now,
            }
        },
        {
            $set: {
                // Atomic Wilson calculation in same operation
                "stats.wilson_score": {
                    $cond: {
                        if: { $gt: ["$stats.uses", 0] },
                        then: {
                            // Simplified Wilson lower bound (approximation)
                            $let: {
                                vars: {
                                    p: { $divide: ["$stats.success_count", "$stats.uses"] },
                                    n: "$stats.uses",
                                    z: 1.96  // 95% confidence
                                },
                                in: {
                                    $divide: [
                                        { $add: [
                                            "$$p",
                                            { $divide: [{ $multiply: ["$$z", "$$z"] }, { $multiply: [2, "$$n"] }] },
                                            { $multiply: [-1, "$$z", { $sqrt: {
                                                $add: [
                                                    { $divide: [{ $multiply: ["$$p", { $subtract: [1, "$$p"] }] }, "$$n"] },
                                                    { $divide: [{ $multiply: ["$$z", "$$z"] }, { $multiply: [4, { $multiply: ["$$n", "$$n"] }] }] }
                                                ]
                                            }}] }
                                        ] },
                                        { $add: [1, { $divide: [{ $multiply: ["$$z", "$$z"] }, "$$n"] }] }
                                    ]
                                }
                            }
                        },
                        else: 0.5
                    }
                },
                "stats.success_rate": {
                    $cond: {
                        if: { $gt: ["$stats.uses", 0] },
                        then: { $divide: ["$stats.success_count", "$stats.uses"] },
                        else: 0.5
                    }
                }
            }
        }
    ],
    { returnDocument: "after" }
);
```

**Note:** The MongoDB aggregation Wilson formula above is complex. continue with two-step update but add optimistic locking via `$set` with expected `uses` value.

---

---

*Document Version: 3.2*
*Last Updated: January 14, 2026*
*RoamPal Reference Version: v0.2.9 + v0.2.8.1 Hotfix*
*Total Implementation Tasks: 72 tasks, 413 subtasks*
*Last Updated: January 14, 2026*
*RoamPal Reference Version: v0.2.9 + v0.2.8.1 Hotfix*
