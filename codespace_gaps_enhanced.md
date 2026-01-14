# BricksLLM Memory System - Enterprise Gap Analysis & Implementation Plan (Enhanced)

**Version:** 1.1 (Enterprise Enhanced)
**Date:** January 14, 2026
**Status:** Strategic Execution
**Reference:** `codespace_gaps.md` + `codespace_gemini.md`

---

## 0. Enterprise Standards & Architectural Principles (NEW)

### Architectural Pillars
1.  **Memory-First Paradigm:** Memory is not a fallback; it is the primary knowledge source. Check memory *before* tools.
2.  **Active Learning:** The system optimizes itself via Wilson Score outcomes. Static databases are dead; living memory evolves.
3.  **RoamPal Parity:** Do not reinvent the wheel. Port the proven Facade, DI, and Race Condition patterns from RoamPal.
4.  **Simplicity:** Use local Mutex before Redis. Use Monolith (Facade) before Microservices.
5.  **Orchestration Integration:** Memory system MUST harness the 30+ smart orchestration methods already in the codebase.

### Quality Assurance Standards
-   **Unit Tests:** >80% coverage for all new Service classes.
-   **Integration Tests:** Mandatory for Migration (Phase 1) and Search Fusion (Phase 15).
-   **Performance:** Memory search <50ms. Tool ingestion <200ms (async).

---

## 0.1 Smart Orchestration Methods Integration (CRITICAL)

> **WARNING:** The codebase contains 30+ smart methods for intelligent tool orchestration that the memory system MUST integrate with. Implementing memory in isolation creates "parallel worlds" that don't leverage existing capabilities.

### Orchestration Methods Inventory

| Layer | File | Method/Feature | Memory Integration Point |
|-------|------|----------------|--------------------------|
| **Selection** | `toolFilter.ts` | Hebrew Intent Detection (`detectHebrewIntent`) | Use for memory query language detection |
| **Selection** | `toolFilter.ts` | Best-in-Class Selection (`TOOL_PRIORITIES`) | Apply similar scoring to memory sources |
| **Selection** | `toolFilter.ts` | Category Filtering (`TOOL_CATEGORIES`) | Map to memory tier selection |
| **Preparation** | `toolParameterRegistry.ts` | Parameter Normalization | Normalize memory search params |
| **Execution** | `toolInvocation.ts` | Cascade Fallback (`getFallbackChain`) | Implement memory fallback chain |
| **Execution** | `toolIntelligenceRegistry.ts` | Smart Timeouts (latency tiers) | Apply to memory retrieval operations |
| **Response** | `toolInvocation.ts` | Graceful Errors (`toGracefulError`) | Hebrew memory error messages |
| **Response** | `toolIntelligenceRegistry.ts` | Capability Awareness | Memory can describe available knowledge |
| **Integration** | `memoryIntegration.ts` | `shouldAllowTool()` | Memory confidence gates tools |
| **Learning** | `memoryIntegration.ts` | `recordResponseOutcome()` | Tool outcomes feed Wilson scores |

### Required Integrations Per Phase

#### Phase 2 (Tool Result Ingestion) - MUST integrate:
- **`getToolIntelligence(toolName)`**: Get tool metadata before ingestion
- **`getToolLabel(toolName)`**: Use bilingual labels in stored memory
- **Tool categories**: Tag ingested results with `TOOL_CATEGORIES` classification

#### Phase 3 (Memory-First Decision Logic) - MUST integrate:
- **`detectHebrewIntent(query)`**: Route Hebrew queries through memory first
- **`TOOL_PRIORITIES`**: Memory confidence should influence tool priority scoring
- **`shouldAllowTool()`**: Already exists but must be CALLED in runMcpFlow.ts

#### Phase 8 (Outcome Detection) - MUST integrate:
- **Hebrew signal patterns**: Reuse `hebrewIntentDetector.ts` patterns for outcome detection
- **`recordToolActionsInBatch()`**: Already exists for tool outcomes, extend to memory

#### Phase 13 (Memory-First Decision) - MUST integrate:
- **`getContextualGuidance()`**: Already exists, ensure it's wired to prompt
- **`getToolGuidance()`**: Memory should inform tool effectiveness stats
- **`getColdStartContextForConversation()`**: Must be called for first messages

#### Phase 19 (Action Outcomes) - MUST integrate:
- **`recordToolActionsInBatch()`**: Extend to include memory-surfaced vs tool-retrieved
- **Tool fallback chain**: If memory fails, record this for action_outcomes

### Cross-Reference Checklist

For EVERY phase implementation, verify:
- [ ] Does this phase use existing Hebrew detection? (`detectHebrewIntent`)
- [ ] Does this phase leverage tool intelligence? (`getToolIntelligence`)
- [ ] Does this phase emit graceful Hebrew errors? (`toGracefulError` patterns)
- [ ] Does this phase record outcomes to the learning system?
- [ ] Does this phase support the cascade fallback pattern?
- [ ] Does this phase respect smart timeouts?

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

## 0.2 Executive Reality Check (GPT-5.2 Analysis)

> **Source:** Strategic Enhancement Blueprint analysis dated 2026-01-14

### What is Already Implemented (Important Reality Check)

Based on `STATUS.md` and code inspection, several "plan gaps" are already addressed:

| Capability | Status | Location |
|------------|--------|----------|
| Memory prefetch & injection | ✅ Active | `runMcpFlow.ts` L526-933 |
| Cold-start injection | ✅ Active | `runMcpFlow.ts` via `getColdStartContextForConversation()` |
| Contextual guidance | ✅ Active | `runMcpFlow.ts` L776-817 |
| Tool guidance | ✅ Active | `runMcpFlow.ts` L825-875 |
| Attribution instruction | ✅ Active | `runMcpFlow.ts` L759-769 |
| Attribution parsing | ✅ Active | `runMcpFlow.ts` via `processResponseWithAttribution()` |
| Document recognition endpoint | ✅ Exists | `src/routes/api/memory/books/recognize/+server.ts` |
| Docling → memory bridge | ✅ Exists | `toolInvocation.ts` (but **without hash-based dedup**) |
| Search timeout fallback | ✅ Exists | `SearchService.ts` graceful degradation |

### Primary Strategic Gap Remaining

The biggest remaining enterprise gap is **not "missing functions"** but **wiring + enforceability**:

1. **Tool gating is not enforced at runtime** - Memory guidance exists but tools are still passed through
2. **Tool result ingestion (non-docling)** - Not implemented as a robust async pipeline
3. **Dedup not consistent** - Docling bridge uses timestamp IDs, not hash-based identity
4. **"NEW FILE" proliferation** - Plan proposes many new files; prefer reusing existing services with feature flags

### Phase Consolidation Required

The plan contains duplicate phases that should be consolidated:

| Duplicate Phases | Canonical Phase | Reason |
|------------------|-----------------|--------|
| Phase 3 + Phase 13 | **Phase 3** | Both address memory-first tool gating |
| Phase 2 + Phase 16 | **Phase 2** | Both address tool result ingestion |
| Phase 6 + Phase 20 | **Phase 6** | Both address KG label rendering |
| Phase 8 + Phase 17 | **Phase 8** | Both address real-time UI updates |

### Recommended Execution Order (Risk-Aware)

Based on dependencies and risk analysis:

```
1. Phase 23 (Safeguards)     ← Prevents "learning on corrupt stats"
2. Phase 22 (Natural Selection) ← Correct scoring semantics
3. Phase 1 (Collection Consolidation) ← Single source of truth
4. Phase 3/13 (Tool Gating)  ← Enforced memory-first
5. Phase 2/16 (Tool Ingestion) ← Async + dedup pipeline
6. Phase 4 (Document Dedup)  ← Hash-based docling identity
7. Phase 5 (0-Results Fix)   ← Self-healing diagnostics
8. Phase 19 (RRF Validation) ← Search correctness
9. Phase 25 (DataGov)        ← After core reliability proven
10. Phase 6/20, 7, 8/17      ← UI polish and observability
```

---

## 0.3 Enforceable Tool Gating Decision Function (KIMI REQUIREMENT)

> **MANDATORY:** Tool gating must be **enforced at runtime**, not just prompt-level guidance. A single decision function must control which tools are passed to the model.

### Decision Function Specification

**File:** `src/lib/server/textGeneration/mcp/toolGatingDecision.ts`

```typescript
/**
 * Enforceable Tool Gating Decision Function
 * 
 * This function MUST be called in runMcpFlow.ts BEFORE the tool list
 * is passed to the model. It is the single point of enforcement.
 * 
 * @returns Filtered tool list and trace explanation for debugging
 */
export interface ToolGatingInput {
    /** Memory retrieval confidence: 'high' | 'medium' | 'low' */
    retrievalConfidence: 'high' | 'medium' | 'low';
    
    /** Explicit tool request detected in user query (e.g., "search for", "חפש") */
    explicitToolRequest: string | null;
    
    /** Hebrew intent classification from detectHebrewIntent() */
    detectedHebrewIntent: 'research' | 'search' | 'general' | null;
    
    /** Memory system is in degraded state (circuit breaker open, etc.) */
    memoryDegraded: boolean;
    
    /** Number of high-quality memory results found */
    memoryResultCount: number;
    
    /** All available tools before filtering */
    availableTools: Tool[];
}

export interface ToolGatingOutput {
    /** Filtered list of allowed tools */
    allowedTools: Tool[];
    
    /** Human-readable explanation for trace panel */
    traceExplanation: string;
    
    /** Whether tools were reduced due to memory confidence */
    toolsReduced: boolean;
    
    /** Reason code for logging/metrics */
    reasonCode: 'high_confidence' | 'explicit_request' | 'degraded' | 'default';
}

export function decideToolGating(input: ToolGatingInput): ToolGatingOutput {
    // RULE 1: Always allow tools if memory system is degraded (fail-open)
    if (input.memoryDegraded) {
        return {
            allowedTools: input.availableTools,
            traceExplanation: "Memory system degraded - all tools allowed",
            toolsReduced: false,
            reasonCode: 'degraded'
        };
    }
    
    // RULE 2: Always allow tools if explicit request detected
    if (input.explicitToolRequest) {
        return {
            allowedTools: input.availableTools,
            traceExplanation: `Explicit tool request: "${input.explicitToolRequest}"`,
            toolsReduced: false,
            reasonCode: 'explicit_request'
        };
    }
    
    // RULE 3: Hebrew "מחקר" (research) intent always gets tools
    if (input.detectedHebrewIntent === 'research') {
        return {
            allowedTools: input.availableTools,
            traceExplanation: "Hebrew research intent detected - tools allowed",
            toolsReduced: false,
            reasonCode: 'explicit_request'
        };
    }
    
    // RULE 4: High confidence + sufficient results = reduce tools
    if (input.retrievalConfidence === 'high' && input.memoryResultCount >= 3) {
        const reducedTools = input.availableTools.filter(t => 
            // Keep only essential tools (time, memory management)
            ['get_current_time', 'memory_bank'].includes(t.function.name)
        );
        return {
            allowedTools: reducedTools,
            traceExplanation: `High confidence (${input.memoryResultCount} results) - reduced to ${reducedTools.length} essential tools`,
            toolsReduced: true,
            reasonCode: 'high_confidence'
        };
    }
    
    // RULE 5: Default - allow all tools
    return {
        allowedTools: input.availableTools,
        traceExplanation: "Default - all tools allowed",
        toolsReduced: false,
        reasonCode: 'default'
    };
}
```

### Wiring Point in runMcpFlow.ts

**Location:** After memory prefetch, before tool prompt construction (~line 620)

```typescript
// 🔗 KIMI REQUIREMENT: Enforceable tool gating (not just prompt guidance)
import { decideToolGating } from "./toolGatingDecision";

// After memory prefetch completes:
const gatingResult = decideToolGating({
    retrievalConfidence: memoryResult?.confidence ?? 'low',
    explicitToolRequest: extractExplicitToolRequest(userQuery),
    detectedHebrewIntent: detectHebrewIntent(userQuery),
    memoryDegraded: memoryCircuitBreaker.isOpen(),
    memoryResultCount: memoryResult?.results?.length ?? 0,
    availableTools: filteredTools,
});

// Replace tool list with gated list
filteredTools = gatingResult.allowedTools;

// Emit trace event for visibility
if (gatingResult.toolsReduced) {
    yield createTraceEvent("tool_gating", gatingResult.traceExplanation);
}

logger.info({ 
    reason: gatingResult.reasonCode,
    originalCount: availableTools.length,
    allowedCount: gatingResult.allowedTools.length 
}, "[mcp] Tool gating decision");
```

### Testing Requirements

- [ ] **Unit Test:** `decideToolGating()` returns all tools when `memoryDegraded=true`
- [ ] **Unit Test:** `decideToolGating()` returns all tools when `explicitToolRequest` is set
- [ ] **Unit Test:** `decideToolGating()` reduces tools when `retrievalConfidence='high'` and `memoryResultCount>=3`
- [ ] **Integration Test:** High-confidence memory query results in 0 external tool calls

---

## 0.4 Async Ingestion Protocol (KIMI REQUIREMENT)

> **MANDATORY:** All memory ingestion MUST be asynchronous. Synchronous embedding upserts are **forbidden** on the user request path.

### Store-Then-Embed Pattern

All ingested memory types (tool results, DataGov, documents) MUST follow this pattern:

```
1. STORE immediately (MongoDB) with `needs_reindex: true`
2. RETURN to user (non-blocking)
3. EMBED asynchronously (background worker or deferred endpoint)
4. UPSERT to Qdrant (after embedding completes)
5. CLEAR `needs_reindex` flag
```

### Implementation Requirements

#### 1. Store with Deferred Embedding Flag

**File:** `src/lib/server/memory/stores/MemoryMongoStore.ts`

```typescript
async store(params: StoreParams): Promise<StoreResult> {
    const item: MemoryItemDocument = {
        ...params,
        // KIMI REQUIREMENT: Mark for deferred embedding
        needs_reindex: true,
        embedding_status: 'pending',
        created_at: new Date(),
    };
    
    // Store immediately - do NOT wait for embedding
    await this.items.insertOne(item);
    
    // Fire-and-forget: Queue embedding task
    this.queueEmbeddingTask(item.memory_id).catch(err => 
        logger.warn({ err, memoryId: item.memory_id }, "[store] Embedding queue failed")
    );
    
    return { memoryId: item.memory_id, indexed: false };
}
```

#### 2. Deferred Reindex Endpoint

**Existing Endpoint:** `POST /api/memory/ops/reindex/deferred`

This endpoint MUST be called periodically (cron or manual) to process items with `needs_reindex: true`.

```typescript
// Already exists - ensure it's wired to a scheduler or health check
async function reindexDeferred(): Promise<ReindexResult> {
    const pending = await this.items.find({ needs_reindex: true }).limit(100).toArray();
    
    for (const item of pending) {
        try {
            const embedding = await embeddingClient.embed(item.content);
            await qdrantAdapter.upsert(item.memory_id, embedding);
            await this.items.updateOne(
                { memory_id: item.memory_id },
                { $set: { needs_reindex: false, embedding_status: 'indexed' } }
            );
        } catch (err) {
            await this.items.updateOne(
                { memory_id: item.memory_id },
                { $set: { embedding_status: 'failed', embedding_error: err.message } }
            );
        }
    }
}
```

#### 3. Forbidden Patterns

❌ **NEVER DO THIS:**
```typescript
// FORBIDDEN: Synchronous embedding on user path
const embedding = await embeddingClient.embed(content);  // BLOCKING
await qdrantAdapter.upsert(memoryId, embedding);         // BLOCKING
return { success: true };  // User waits for all of this
```

✅ **ALWAYS DO THIS:**
```typescript
// CORRECT: Store now, embed later
await mongoStore.insertOne({ ...item, needs_reindex: true });
queueEmbeddingTask(item.memory_id);  // Fire-and-forget
return { success: true, indexed: false };  // User gets immediate response
```

### Per-Tier Ingestion Caps

To prevent storage bloat, enforce caps per tier:

| Tier | Max Items | Cleanup Policy |
|------|-----------|----------------|
| `working` | 1,000 per conversation | Delete oldest when exceeded |
| `history` | 10,000 per user | Promote or archive low-score items |
| `tool_results` | 500 per conversation | Delete on conversation close |
| `datagov_schema` | 2,000 total | Static, no growth |
| `datagov_expansion` | 50 total | Static, no growth |

---

## 0.5 Authoritative Outcome Semantics Mapping (KIMI REQUIREMENT)

> **MANDATORY:** This is the single source of truth for outcome handling. `MemoryMongoStore.ts` MUST match this table exactly.

### Outcome Type Definitions

| Outcome Type | Description | When to Use |
|--------------|-------------|-------------|
| `worked` | Memory was helpful and led to correct answer | User confirms, thanks, or continues productively |
| `partial` | Memory was somewhat helpful but incomplete | User needed clarification or additional info |
| `unknown` | Cannot determine if memory helped | No clear signal from user follow-up |
| `failed` | Memory was wrong or misleading | User corrects, complains, or re-asks |

### Numeric Deltas (Authoritative)

| Outcome | `uses` Δ | `success_count` Δ | `worked_count` Δ | `partial_count` Δ | `unknown_count` Δ | `failed_count` Δ |
|---------|----------|-------------------|------------------|-------------------|-------------------|------------------|
| `worked` | **+1** | **+1.0** | +1 | 0 | 0 | 0 |
| `partial` | **+1** | **+0.5** | 0 | +1 | 0 | 0 |
| `unknown` | **+1** | **+0.25** | 0 | 0 | +1 | 0 |
| `failed` | **+1** | **+0.0** | 0 | 0 | 0 | +1 |

### Wilson Score Contribution

```typescript
// Wilson score formula (95% confidence interval lower bound)
function calculateWilsonScore(successCount: number, uses: number): number {
    if (uses === 0) return 0.5;  // Cold-start default
    
    const p = successCount / uses;
    const z = 1.96;  // 95% confidence
    const n = uses;
    
    const numerator = p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
    const denominator = 1 + (z * z) / n;
    
    return Math.max(0, Math.min(1, numerator / denominator));
}
```

### Promotion/Expiry Effects

| Outcome | Promotion Eligibility | Expiry Effect |
|---------|----------------------|---------------|
| `worked` | +1 toward threshold | Extends TTL by 7 days |
| `partial` | +0.5 toward threshold | Extends TTL by 3 days |
| `unknown` | No change | No TTL change |
| `failed` | -1 (blocks if repeated) | Accelerates expiry by 7 days |

### Promotion Thresholds

| Transition | Required `wilson_score` | Required `uses` | Required `success_count` |
|------------|------------------------|-----------------|-------------------------|
| working → history | ≥ 0.70 | ≥ 2 | ≥ 1 |
| history → patterns | ≥ 0.85 | ≥ 5 | ≥ 3 |

### Implementation Verification

**File:** `src/lib/server/memory/stores/MemoryMongoStore.ts`

```typescript
async recordOutcome(params: OutcomeParams): Promise<void> {
    const { memoryId, outcome, userId } = params;
    
    // KIMI REQUIREMENT: Explicit outcome handling with exact deltas
    let successDelta: number;
    switch (outcome) {
        case 'worked':
            successDelta = 1.0;
            break;
        case 'partial':
            successDelta = 0.5;
            break;
        case 'unknown':
            successDelta = 0.25;
            break;
        case 'failed':
            successDelta = 0.0;
            break;
        default:
            // TypeScript exhaustiveness check - no default case!
            const _exhaustive: never = outcome;
            throw new Error(`Invalid outcome type: ${outcome}`);
    }
    
    // Atomic update with Wilson recalculation
    await this.items.findOneAndUpdate(
        { memory_id: memoryId, user_id: userId },
        [
            {
                $set: {
                    "stats.uses": { $add: ["$stats.uses", 1] },
                    "stats.success_count": { $add: ["$stats.success_count", successDelta] },
                    [`stats.${outcome}_count`]: { $add: [`$stats.${outcome}_count`, 1] },
                    "stats.last_used_at": new Date(),
                }
            },
            // ... Wilson recalculation in same operation
        ]
    );
}
```

---

## 0.6 Performance & QA Baselines (KIMI REQUIREMENT)

> **MANDATORY:** Establish baseline metrics BEFORE making changes. All performance claims must be verifiable.

### Baseline Metrics to Capture

Before implementing any phase, capture these metrics:

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Memory prefetch latency P50 | <30ms | `logger.info` with timing |
| Memory prefetch latency P95 | <50ms | Histogram aggregation |
| Search latency (vector) | <40ms | SearchService timing |
| Search latency (BM25) | <20ms | SearchService timing |
| Search latency (rerank) | <100ms | Reranker timing |
| Ingestion throughput | >50 items/sec | Batch ingestion test |
| Embedding QPS | >10 req/sec | DictaEmbeddingClient metrics |

### Test Coverage Requirements

| Component | Coverage Target | Test Type |
|-----------|----------------|-----------|
| New Service classes | >80% | Unit tests |
| Migration scripts (Phase 1) | 100% critical paths | Integration tests |
| Search Fusion (Phase 15) | 100% fusion logic | Integration tests |
| Outcome recording (Phase 23) | 100% outcome types | Unit tests |
| Tool gating (Phase 3) | 100% decision matrix | Unit tests |

### QA Checkpoints

Before merging any phase:

- [ ] **Baseline captured:** Pre-change metrics recorded
- [ ] **No regression:** P95 latency not degraded by >10%
- [ ] **Coverage met:** New code has >80% test coverage
- [ ] **Failure modes tested:** Tested with dependency down/timeout

---

## Phase 1: Consolidate Memory Collections (HIGH PRIORITY)

### Enterprise Insight (Gemini)
> **Risk: Data Integrity.** The dual-write period is the highest risk moment. Data divergence here corrupts the entire future state.
> **Mitigation:** Implement strictly atomic migration scripts. Use the "Create-then-Delete" pattern: never delete the source until the target is verified.

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

### Enterprise Evaluation (GPT-5.2)

| Dimension | Assessment | Mitigation |
|-----------|------------|------------|
| **Scalability** | Batch migration sizing, rate-limited embedding calls | Use configurable batch size (default 50), implement backpressure |
| **Security** | Migration tooling must be admin-only | Do not expose raw content in logs; redact PII |
| **Performance** | Avoid long blocking HTTP requests | Run as background/admin job, not on user request path |
| **Maintainability** | Minimize new code paths | Prefer using existing facade/store methods |
| **Resilience** | Partial failure risk | "Create-then-delete" pattern; mark `migration_failed` / `needs_reindex` |
| **Testing** | Unit: field mapping, ID conversion, idempotency | Integration: Mongo + Qdrant + deferred reindex flow |

**Success Criteria:**
- [ ] Single source of truth: only `memory_items` remains authoritative
- [ ] Legacy read compatibility during migration; no UI regressions
- [ ] All migrated items become searchable (embedding + Qdrant indexing)
- [ ] Migration is idempotent and resumable

**Dependencies:**
- Phase 23 safeguards must be complete before altering scoring for migrated data
- Embedding pipeline must be operational (circuit breaker behavior)

---

## Phase 2: Ingest Tool Results into Memory (HIGH PRIORITY)

### Enterprise Insight (Gemini)
> **Risk: Performance.** Synchronous ingestion will slow down the chat experience.
> **Mitigation:** Ingestion must be **strictly asynchronous** (fire-and-forget). Use a message queue or background task pattern. The user response must not wait for Qdrant indexing.

### 🔗 Orchestration Integration Required
> **CRITICAL:** This phase MUST leverage existing tool intelligence infrastructure:
> - Use `getToolIntelligence(toolName)` from `toolIntelligenceRegistry.ts` for tool metadata
> - Use `getToolLabel(toolName)` from `toolInvocation.ts` for bilingual labels
> - Map tools to `TOOL_CATEGORIES` from `toolFilter.ts` for classification
> - Apply `ToolResponse.requiresSummarization` flag before storing

### Gap Description
When the model uses tools (Tavily, Perplexity, Datagov), the valuable results are used for the immediate answer but NEVER stored in memory. This forces the model to re-research the same topic next time.

### Root Cause Files
| File | Issue | Lines |
|------|-------|-------|
| `src/lib/server/textGeneration/mcp/toolInvocation.ts` | Tool output is returned but not persisted | 1190-1200 |

### Implementation Steps

#### Step 2.1: Create ToolResultIngestionService
**File:** `src/lib/server/memory/services/ToolResultIngestionService.ts`

```typescript
import { getToolIntelligence, type ToolIntelligence } from "../../textGeneration/mcp/toolIntelligenceRegistry";
import { getToolLabel } from "../../textGeneration/mcp/toolInvocation";
import { TOOL_CATEGORIES } from "../../textGeneration/mcp/toolFilter";

export class ToolResultIngestionService {
    private facade: UnifiedMemoryFacade;
    
    async ingestToolResult(params: {
        conversationId: string;
        toolName: string;
        query: string;
        output: string;
        metadata?: Record<string, unknown>;
    }): Promise<void> {
        // 🔗 ORCHESTRATION: Get tool intelligence for smart ingestion
        const toolInfo = getToolIntelligence(params.toolName);
        const toolLabel = getToolLabel(params.toolName);
        const toolCategory = this.mapToCategory(params.toolName);
        
        // 🔗 ORCHESTRATION: Check if summarization needed (from toolIntelligenceRegistry)
        const needsSummarization = toolInfo?.response.requiresSummarization ?? false;
        const maxTokens = toolInfo?.response.maxTokens ?? 5000;
        
        // 1. Check if similar content already exists (dedup)
        // 2. Summarize if requiresSummarization=true and output exceeds maxTokens
        // 3. Store in working tier with tool metadata including:
        //    - toolInfo.mcpServer (source MCP)
        //    - toolInfo.priority (for ranking)
        //    - toolLabel (bilingual display name)
        //    - toolCategory (from TOOL_CATEGORIES)
        // 4. Tag with tool name and query for retrieval
    }
    
    private mapToCategory(toolName: string): string {
        for (const [category, config] of Object.entries(TOOL_CATEGORIES)) {
            if (config.tools.includes(toolName)) return category;
        }
        return 'unknown';
    }
}
```

#### Step 2.2: Hook into Tool Execution
**File:** `src/lib/server/textGeneration/mcp/toolInvocation.ts`

**Add after line 1190:**
```typescript
// Fire and forget ingestion
ingestionService.ingestToolResult({
    conversationId,
    toolName,
    toolCategory: getToolCategory(toolName),
    query: args.query || args.prompt,
    output: result.content
}).catch(err => {
    logger.error({ err, toolName }, "[mcp] Failed to ingest tool result");
});
```

**Breaking Points:**
- If ingestion is synchronous, it slows tool execution
- Must be fire-and-forget with error handling

### Enterprise Evaluation (GPT-5.2)

| Dimension | Assessment | Mitigation |
|-----------|------------|------------|
| **Scalability** | Ingestion queue pattern needed | Implement backpressure; bulk upserts for batching |
| **Security** | Sanitize tool outputs (PII, secrets) | Store minimal needed; avoid persisting auth headers or raw HTML with credentials |
| **Performance** | Don't upsert vectors synchronously | "Store now, embed later" pattern using `needs_reindex` flag |
| **Maintainability** | Centralized ingestion service | Explicit tool allowlist; avoid per-tool special cases |
| **Resilience** | Circuit breaker + deferred embedding | Queue failed embeddings for retry on circuit close |
| **Testing** | Unit: per-tool extractor + summarizer | Integration: ingestion + retrieval + dedup + reindex |

**Success Criteria:**
- [ ] Successful tool outputs ingested into `memory_items` (tier="working") with source metadata
- [ ] Dedup by content hash prevents repetitive storage
- [ ] Ingestion NEVER blocks user response (async/fire-and-forget)
- [ ] Large outputs summarized before storage (respecting `maxTokens` from tool intelligence)

**Dependencies:**
- Phase 21 logging standards for structured ingestion logs
- Phase 18 graceful degradation patterns (ingestion tolerates downstream failures)

**Status Notes:**
- No `ToolResultIngestionService.ts` exists currently
- Docling is the only "tool → memory" bridge today

---

## Phase 3: Memory-First Decision Logic (HIGH PRIORITY)

> **📌 CONSOLIDATION NOTE:** This phase consolidates with Phase 13. Phase 13 items are merged here.

### Enterprise Insight (Gemini)
> **Risk: Model Behavior.** The model may become "stubborn" or "stale" if it relies too heavily on memory.
> **Mitigation:** Implement **High Confidence Thresholds** (e.g., >0.85). Always allow an explicit user override (e.g., "Search the web for the latest X").

### 🔗 Orchestration Integration Required
> **CRITICAL:** This phase MUST wire into existing orchestration:
> - Use `detectHebrewIntent(query)` from `hebrewIntentDetector.ts` - Hebrew "מחקר" vs "חפש" affects tool gating
> - Use `shouldAllowTool()` from `memoryIntegration.ts` - ALREADY EXISTS but not called!
> - Use `extractExplicitToolRequest()` from `memoryIntegration.ts` - detect user tool requests
> - Apply `TOOL_PRIORITIES` weighting based on memory confidence
> - Use `getContextualGuidance()` - ALREADY EXISTS, injects memory context into prompt

### Gap Description
The system always sends tools to the model, even when memory has high-confidence answers. The `filterToolsByConfidence()` function exists but is NEVER called.

**Existing but UNUSED methods in memoryIntegration.ts:**
- `shouldAllowTool()` (line 194) - confidence-based tool gating
- `extractExplicitToolRequest()` (line ~280) - detects "search for", "חפש" 
- `getContextualGuidance()` (line ~350) - builds "YOU ALREADY KNOW THIS" prompt

### Root Cause Files
| File | Issue | Lines |
|------|-------|-------|
| `src/lib/server/textGeneration/mcp/memoryIntegration.ts` | `filterToolsByConfidence()` defined but unused | 226-237 |
| `src/lib/server/textGeneration/mcp/memoryIntegration.ts` | `shouldAllowTool()` defined but NOT CALLED | 194-220 |
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
// 🔗 ORCHESTRATION: Wire existing methods that are currently UNUSED
import { 
    shouldAllowTool,           // EXISTS but not called!
    extractExplicitToolRequest, // EXISTS but not called!
    getContextualGuidance,     // EXISTS but not called!
} from "./memoryIntegration";
import { detectHebrewIntent } from "../utils/hebrewIntentDetector";

// Memory-First Decision: Skip tools if confidence is HIGH
const retrievalConfidence = memoryResult?.confidence ?? 'low';

// 🔗 ORCHESTRATION: Use Hebrew intent detection for query analysis
const hebrewIntent = detectHebrewIntent(userQuery);
const isResearchIntent = hebrewIntent === 'research'; // מחקר - user wants deep research

if (retrievalConfidence === 'high' && memoryResult.results.length >= 3 && !isResearchIntent) {
    logger.info({ confidence: retrievalConfidence, resultCount: memoryResult.results.length, hebrewIntent },
        "[mcp] HIGH confidence - considering tool skip");
    
    // 🔗 ORCHESTRATION: Use EXISTING extractExplicitToolRequest (currently unused!)
    const explicitToolRequest = extractExplicitToolRequest(userQuery);
    
    if (!explicitToolRequest) {
        // 🔗 ORCHESTRATION: Use EXISTING shouldAllowTool for each tool (currently unused!)
        filteredTools = filteredTools.filter(tool => 
            shouldAllowTool(tool.function.name, retrievalConfidence, explicitToolRequest)
        );
    }
}

// 🔗 ORCHESTRATION: Use EXISTING getContextualGuidance (currently unused in prompt!)
const contextualGuidance = await getContextualGuidance(userId, userQuery, memoryResult.results);
// Inject into system prompt (see Step 3.4)
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

### Enterprise Evaluation (GPT-5.2)

| Dimension | Assessment | Mitigation |
|-----------|------------|------------|
| **Scalability** | Reduce tool usage costs and latency | Fewer external API calls at scale |
| **Security** | Avoid tool calls that leak context externally | High-confidence memory prevents unnecessary data exposure |
| **Performance** | Fewer tool calls = faster responses | Skip tools in <50ms decision |
| **Maintainability** | Implement gating centrally | Single decision function with trace explanation |
| **Resilience** | Fail-open if memory system degraded | Never block user; fall back to full tool list |
| **Testing** | Unit: intent override detection, gating matrix | Integration: high-confidence = 0 tool calls |

**Success Criteria:**
- [ ] Memory confidence meaningfully reduces unnecessary tool calls
- [ ] Explicit override patterns ("חפש", "מחקר", "search the web") always allow tools
- [ ] Trace shows when tools were skipped due to sufficient memory
- [ ] Tool skip rate trackable in metrics

**Implementation Pattern - Tool Gating Decision Function:**
```typescript
function decideToolGating(params: {
    retrievalConfidence: 'high' | 'medium' | 'low';
    explicitToolRequest: string | null;
    detectedHebrewIntent: 'research' | 'search' | 'general';
    memoryDegraded: boolean;
}): { allowedTools: Tool[]; traceExplanation: string } {
    // Centralized decision logic
    // Returns filtered tool list and explanation for trace
}
```

**Status Notes:**
- Memory is prefetched before tool prompt injection today
- Tool gating is NOT enforced; tool list is still passed through
- `shouldAllowTool()` exists but is never called

---

## Phase 4: Document Deduplication for Tool Calls (MEDIUM PRIORITY)

### Enterprise Insight (Gemini)
> **Risk: Storage Bloat.** Repeatedly parsing the same PDF creates duplicate vectors, degrading search quality.
> **Mitigation:** Use **SHA-256 Hash** of the content as the deduplication key. Do not rely on filenames or timestamps.

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

### Enterprise Evaluation (GPT-5.2)

| Dimension | Assessment | Mitigation |
|-----------|------------|------------|
| **Scalability** | Prevents Qdrant growth and retrieval quality degradation | Dedup saves storage and improves search |
| **Security** | Hashing is safe | Avoid logging full content; hash is sufficient for identity |
| **Performance** | Avoids heavy ingestion work | Faster responses when document already exists |
| **Testing** | Unit: hash creation, existence checks | Integration: docling run twice = single stored document |

**Success Criteria:**
- [ ] Docling bridge uses SHA-256 hash-based document identity
- [ ] If document exists, skip re-storage and surface "already processed" guidance
- [ ] `DocumentRecognitionService.documentExists()` is called before ingestion

**Status Notes:**
- `DocumentRecognitionService` and hashing utilities already exist
- Docling bridge currently uses timestamp-based IDs
- Must reuse existing recognition service; avoid parallel implementations

---

## Phase 5: Fix "0 Memories Found" Issue (HIGH PRIORITY)

### Enterprise Insight (Gemini)
> **Risk: User Trust.** If the user saves a memory and can't find it, they lose trust in the system.
> **Mitigation:** Implement **Auto-Reindexing**. If a search returns 0 results but items exist in MongoDB, automatically trigger a background Qdrant re-index.

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

## PART II: RoamPal Reference Architecture (Enterprise Parity)

This section ensures BricksLLM matches the robust, production-hardened architecture of RoamPal.

---

## Phase 9: Interface Contracts & Dependency Injection

### Enterprise Insight (Gemini)
> **Risk: Maintainability.** Direct class instantiation (coupling) makes testing impossible and refactoring dangerous.
> **Mitigation:** Adopt **Dependency Injection (DI)**. Use a `ServiceFactory` to manage singletons. Define strict `IInterface` contracts.

### Gap: No Abstract Interfaces

**RoamPal Pattern** (`core/interfaces/memory_adapter_interface.py` Lines 10-216):
```python
class MemoryAdapterInterface(ABC):
    @abstractmethod
    async def initialize(self, config: Dict[str, Any]) -> None:
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

---

## Phase 10: Race Condition Prevention

### Enterprise Insight (Gemini)
> **Risk: Concurrency.** The Knowledge Graph is a shared resource. Without locks, concurrent writes will corrupt the graph structure.
> **Mitigation:** Use `async-mutex` immediately. Distributed locking (Redis) is overkill for now, but local Mutex is mandatory.

### Gap: Missing asyncio.Lock for KG Operations

**RoamPal Pattern** (`knowledge_graph_service.py` Lines 72-204):
```python
async with self._kg_save_lock:  # Line 185 - SERIALIZE ACCESS
    # ...
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

#### Step 10.2: Add Debounced Save Pattern
**File:** `src/lib/server/memory/kg/KnowledgeGraphService.ts`

```typescript
// Add after line 94
private saveDebounceMs = 5000; // RoamPal uses 5 seconds
private saveLock = new Mutex();

async debouncedSave(): Promise<void> {
    const release = await this.saveLock.acquire();
    try {
        if (this.pendingSave) clearTimeout(this.pendingSave);
        this.pendingSave = setTimeout(async () => {
            await this.writeBuffer?.flush();
        }, this.saveDebounceMs);
    } finally {
        release();
    }
}
```

---

## Phase 11: Atomic Operations & Write-Ahead Logging

### Enterprise Insight (Gemini)
> **Risk: Data Loss.** Partial failures during complex updates (like Promotion) leave the DB in an invalid state.
> **Mitigation:** Wrap multi-collection updates in **Transactions**.

### Gap: No Atomic File/DB Operations

### Implementation Steps

#### Step 11.1: Add Transaction Wrapper for Multi-Collection Updates
**New File:** `src/lib/server/memory/transactions/TransactionManager.ts`

```typescript
export class TransactionManager {
    constructor(private client: MongoClient) {}
    
    async withTransaction<T>(
        operation: (session: ClientSession) => Promise<T>
    ): Promise<T> {
        const session = this.client.startSession();
        try {
            session.startTransaction();
            const result = await operation(session);
            await session.commitTransaction();
            return result;
        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }
    }
}
```

#### Step 11.2: Implement Create-Then-Delete Pattern (Fallback)
**RoamPal Pattern** (`promotion_service.py` Lines 153-165):
1. Create in target collection FIRST
2. Only delete from source AFTER successful creation

**BricksLLM Implementation:**
```typescript
// PromotionService.ts - Add rollback safety
async promoteWorkingToHistory(itemId: string): Promise<void> {
    // Step 1: Create in history FIRST
    const newId = await this.mongoStore.store({ ...item, tier: 'history' });
    
    // Step 2: Delete from working ONLY after success
    await this.mongoStore.archive(itemId);
}
```

---

## Phase 12: Outcome-Based Learning (Wilson Score Dominance)

### Enterprise Insight (Gemini)
> **Risk: Noise.** Without feedback, bad memories accumulate and pollute search results.
> **Mitigation:** Implement **Wilson Score** with Time Decay. This "Natural Selection" ensures only useful memories survive.

### 🔗 Orchestration Integration Required
> **CRITICAL:** Outcome learning MUST integrate with existing tool outcome tracking:
> - Extend `recordToolActionsInBatch()` from `memoryIntegration.ts` to include memory outcomes
> - Reuse Hebrew signal patterns from `hebrewIntentDetector.ts` for outcome detection
> - Wire to `action_outcomes` collection for tool-memory correlation
> - Use `toGracefulError()` patterns for Hebrew outcome feedback messages

### Implementation Steps

#### Step 12.1: Add Time-Weighted Score Updates
**File:** `src/lib/server/memory/services/OutcomeServiceImpl.ts`

```typescript
import { recordToolActionsInBatch } from "../../textGeneration/mcp/memoryIntegration";

private calculateTimeWeight(lastUsed: Date | null): number {
    if (!lastUsed) return 1.0;
    const ageDays = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    return 1.0 / (1 + ageDays / 30); // Decay over month
}

// 🔗 ORCHESTRATION: Record to action_outcomes for tool-memory correlation
async recordMemoryOutcome(params: OutcomeParams): Promise<void> {
    // Record individual memory outcome
    await this.updateWilsonScore(params);
    
    // 🔗 ORCHESTRATION: Also record to action_outcomes for global learning
    if (params.toolName) {
        await recordToolActionsInBatch([{
            name: params.toolName,
            success: params.outcome === 'worked',
            memoryId: params.memoryId, // NEW: Correlate tool to memory
            latencyMs: params.latencyMs,
        }]);
    }
}
```

---

## Phase 13: Memory-First Decision Logic (Tool Gating)

### Gap: Tools Always Called Even When Memory Has Answer

### 🔗 Orchestration Integration Required
> **CRITICAL:** This phase has EXISTING but UNUSED infrastructure in `memoryIntegration.ts`:
> - `getContextualGuidance()` (line ~350) - ALREADY BUILDS the guidance, but NOT INJECTED into prompt!
> - `getToolGuidance()` (line ~400) - returns action effectiveness stats, NOT USED!
> - `getColdStartContextForConversation()` - user profile injection, NOT CALLED!
> - `hasMemoryBankTool()` - checks if memory_bank tool available, NOT USED!

### Implementation Steps

#### Step 13.1: WIRE EXISTING getContextualGuidance (NOT build new one!)
**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts`

```typescript
// 🔗 ORCHESTRATION: USE EXISTING FUNCTION - DO NOT REWRITE!
import { 
    getContextualGuidance,         // EXISTS at memoryIntegration.ts ~L350
    getToolGuidance,               // EXISTS at memoryIntegration.ts ~L400
    formatContextualGuidancePrompt // EXISTS - formats for injection
} from "./memoryIntegration";

// After memory prefetch (around line 620)
const contextualGuidance = await getContextualGuidance(userId, userQuery, memoryResult.results);
const toolGuidance = await getToolGuidance(userId, filteredTools.map(t => t.function.name));

// 🔗 ORCHESTRATION: Inject into system prompt (currently NOT DONE!)
const guidancePrompt = formatContextualGuidancePrompt(contextualGuidance, toolGuidance);
systemPrompt = systemPrompt + "\n\n" + guidancePrompt;
```

#### Step 13.2: Add Confidence-Based Tool Filtering using EXISTING shouldAllowTool
**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts`

```typescript
// 🔗 ORCHESTRATION: USE EXISTING shouldAllowTool - DO NOT REWRITE!
import { shouldAllowTool } from "./memoryIntegration"; // EXISTS at line 194!

// Filter tools based on confidence
if (retrievalConfidence === 'high') {
    filteredTools = filteredTools.filter(tool => 
        shouldAllowTool(tool.function.name, retrievalConfidence, explicitToolRequest)
    );
}
```

---

## Phase 14: Cold-Start Injection

### Gap: First Message Missing User Profile

### 🔗 Orchestration Integration Required
> **CRITICAL:** Cold-start functions ALREADY EXIST in `memoryIntegration.ts`:
> - `isFirstMessage()` (line ~310) - detects first message, NOT CALLED!
> - `getColdStartContextForConversation()` (line ~320) - loads user profile, NOT CALLED!

### Implementation Steps

#### Step 14.1: WIRE EXISTING Cold-Start Functions (NOT create new ones!)
**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts`

```typescript
// 🔗 ORCHESTRATION: USE EXISTING FUNCTIONS - DO NOT REWRITE!
import { 
    isFirstMessage,                      // EXISTS at memoryIntegration.ts ~L310
    getColdStartContextForConversation   // EXISTS at memoryIntegration.ts ~L320
} from "./memoryIntegration";

// Early in runMcpFlow (around line 500)
const firstMessage = isFirstMessage(messages);
if (firstMessage) {
    // 🔗 ORCHESTRATION: Use EXISTING function (currently NOT CALLED!)
    const coldStartContext = await getColdStartContextForConversation(
        conv._id.toString(), 
        userId
    );
    
    if (coldStartContext.summary) {
        logger.info({ userId, memoryCount: coldStartContext.memoryCount }, 
            "[mcp] Cold-start injection applied");
        systemPrompt = coldStartContext.summary + "\n\n" + systemPrompt;
    }
}
```

---

## Phase 15: Causal Attribution (Memory Marks)

### Gap: LLM Not Marking Which Memories Helped

### 🔗 Orchestration Integration Required
> **CRITICAL:** Attribution functions ALREADY EXIST in `memoryIntegration.ts`:
> - `getAttributionInstruction()` (line ~450) - returns the instruction, NOT INJECTED!
> - `processResponseWithAttribution()` (line ~480) - parses marks, NOT CALLED!
> These are imported in runMcpFlow.ts but NEVER USED!

### Implementation Steps

#### Step 15.1: WIRE EXISTING Attribution Functions (NOT create new ones!)
**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts`

```typescript
// 🔗 ORCHESTRATION: These are ALREADY IMPORTED but NOT USED!
// See imports around line 59-61 in runMcpFlow.ts:
import {
    // Phase 3 Gap 9: Memory Attribution
    getAttributionInstruction,        // EXISTS but NOT CALLED!
    processResponseWithAttribution,   // EXISTS but NOT CALLED!
} from "./memoryIntegration";

// When building system prompt, ADD the attribution instruction:
const attributionInstruction = getAttributionInstruction(searchPositionMap);
if (attributionInstruction) {
    systemPrompt = systemPrompt + "\n\n" + attributionInstruction;
}

// When processing final response, PARSE the marks:
const { cleanResponse, attributions } = processResponseWithAttribution(
    finalAnswer, 
    searchPositionMap
);

// Record outcomes based on attributions
for (const attr of attributions) {
    await recordResponseOutcome({
        memoryId: attr.memoryId,
        outcome: attr.feedback, // 👍 = worked, 👎 = failed, ➖ = unknown
        userId,
    });
}
```

#### Step 15.2: Verify Attribution Instruction is in toolPrompt.ts
**File:** `src/lib/server/textGeneration/mcp/toolPrompt.ts`

```typescript
// The instruction MAY exist but not be included in final prompt
// Verify buildToolPreprompt() includes memory attribution section
```

---

## Phase 16: Tool Result Ingestion

### Implementation
**File:** `src/lib/server/textGeneration/mcp/toolInvocation.ts`

```typescript
// Ingest tool results to memory
const category = getToolCategory(toolName);
if (category && !r.error && r.output) {
    await ingestToolResult({ ... });
}
```

---

## Phase 17: Frontend Real-Time Updates

### Implementation
**File:** `src/lib/stores/memoryUi.ts`

```typescript
// Add SSE subscription for memory events
export function subscribeToMemoryEvents(conversationId: string) {
    const eventSource = new EventSource(`/api/memory/events?conversationId=${conversationId}`);
    eventSource.onmessage = (event) => { /* update store */ };
}
```

---

## Phase 18: Graceful Degradation

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
        return { results: [], latencyMs: 0 }; // Fail safe
    }
}
```

---

## Phase 19: Hybrid Search with RRF

### Verification Steps
1. Confirm BM25 + Vector search both execute
2. Verify RRF weights applied correctly
3. Add cross-encoder reranking if missing

---

## Phase 20: Knowledge Graph Node Names Fix

### Implementation
**File:** `src/lib/components/memory/KnowledgeGraph3D.svelte`

```typescript
// Use Hebrew-supporting font
ctx.font = "bold 36px -apple-system, 'Segoe UI', 'Noto Sans Hebrew', sans-serif";
```

---

## Phase 21: Comprehensive Logging Strategy

### Logging Standards
- **error**: Unrecoverable failures
- **warn**: Recoverable issues (timeouts, fallbacks)
- **info**: Key operations (store, search, ingest)
- **debug**: Detailed flow (parsing, scoring)

---

## Phase 22: RoamPal v0.2.9 Natural Selection Enhancements (HIGH PRIORITY)

### Enterprise Insight (Gemini)
> **Strategic Pivot.** This is the most critical phase for long-term intelligence. Without Natural Selection, the system is just a database. With it, it is a learning engine.

### 22.1: Remove Archive-on-Update
**File:** `src/lib/server/memory/stores/MemoryMongoStore.ts`
- Modify `update()` to overwrite in place.
- Implement `cleanupArchived()` to purge legacy ghost memories.

### 22.2: Wilson Scoring for memory_bank Tier
**File:** `src/lib/server/memory/search/SearchService.ts`
- Blend Wilson score (20%) into RRF score for `memory_bank` items.
- Only apply if `uses >= 3` (cold start protection).

### 22.3: Unknown Outcome Creates Weak Negative Signal
**File:** `src/lib/server/memory/stores/MemoryMongoStore.ts`
- `unknown` outcome = 0.25 success (weak negative).
- `failed` = 0.0 success (strong negative).

### 22.4: Stricter History → Patterns Promotion
**File:** `src/lib/server/memory/learning/PromotionService.ts`
- Reset `success_count` to 0 when promoting to History (probation).
- Require `success_count >= 5` to promote to Patterns.

### Enterprise Evaluation (GPT-5.2)

| Dimension | Assessment | Mitigation |
|-----------|------------|------------|
| **Scalability** | Learning quality scales with data | Correct semantics prevent garbage accumulation |
| **Security** | N/A | No external exposure |
| **Performance** | Wilson calculation adds minimal overhead | ~1ms per outcome recording |
| **Maintainability** | Must not break existing stats schema | Additive changes only |
| **Resilience** | Score corruption = bad learning | Phase 23 safeguards must land first |
| **Testing** | Unit: scoring deltas, wilson formula | Integration: ranking reflects outcomes |

**Success Criteria:**
- [ ] Correct update semantics (no archive-on-update)
- [ ] Wilson impacts ranking/promotion meaningfully with cold-start protections
- [ ] "unknown" outcome semantics align with evolutionary pressure (0.25 success)
- [ ] Counter reset on promotion to history creates probation period

**Dependencies:**
- **MUST WAIT FOR Phase 23** to land first (safeguards prevent learning on corrupt stats)

**Outcome Semantics Mapping Table (Authoritative):**

| Outcome | `success_count` Delta | `uses` Increment | Wilson Impact | Promotion Effect |
|---------|----------------------|------------------|---------------|------------------|
| `worked` | +1.0 | +1 | Positive | Increases eligibility |
| `partial` | +0.5 | +1 | Neutral | Weak positive |
| `unknown` | +0.25 | +1 | Weak negative | Signals "not helpful" |
| `failed` | +0.0 | +1 | Strong negative | Blocks promotion |

---

## Phase 23: RoamPal v0.2.8 Critical Bug Fixes (Safeguards)

### Enterprise Insight (Gemini)
> **Safety Check.** These bugs caused major data quality issues in RoamPal. We must pre-empt them.

### 23.1: Explicit Outcome Type Handling
**File:** `src/lib/server/memory/stores/MemoryMongoStore.ts`
- Use `switch` or explicit `if/else` for outcomes.
- **NEVER** use a generic `else` block for scoring logic.

### 23.2: Wilson Score 10-Use Cap Bug
- **NEVER** calculate Wilson score from `outcome_history` array (it is capped at 10).
- **ALWAYS** use cumulative `stats.success_count` and `stats.uses`.

### 23.3: Failed Outcomes Must Increment Uses
- Ensure `uses` increments for **ALL** outcomes, including `failed`.
- If `failed` doesn't increment uses, the memory never "learns" it is bad.

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

### Enterprise Evaluation (GPT-5.2)

| Dimension | Assessment | Mitigation |
|-----------|------------|------------|
| **Scalability** | Bug fixes prevent data quality degradation at scale | Learning gets better, not worse, over time |
| **Security** | N/A | No external exposure |
| **Performance** | Atomic updates prevent race conditions | No performance penalty |
| **Maintainability** | Explicit switch statements prevent drift | No default blocks in scoring |
| **Resilience** | Atomicity prevents concurrent outcome races | MongoDB aggregation pipeline for single-op update |
| **Testing** | Unit: 50 uses + 45 worked → Wilson ~0.87 | Integration: concurrent outcomes = consistent stats |

**Success Criteria:**
- [ ] Outcome types are explicit and validated (switch with no default)
- [ ] Wilson score uses cumulative `stats.success_count` and `stats.uses` (NOT capped history)
- [ ] Failed outcomes always increment uses (essential for learning)
- [ ] Atomicity prevents concurrent outcome races

**Code-Context Notes (from current implementation):**
- In `MemoryMongoStore.ts`, outcome recording increments uses
- Wilson calculation currently excludes `unknown_count` from total - verify this matches Phase 22 intent
- Two-step update (update stats, then update wilson) can race - Phase 23.4 proposes atomic recalculation

**THIS PHASE MUST BE IMPLEMENTED FIRST** - it establishes safeguards that prevent all subsequent phases from learning on corrupt statistics.

---

## Phase 24: DictaLM Response Integrity (CRITICAL)

### Enterprise Insight (Debug Context)
> **Risk: Silent Failure.** DictaLM-3.0 uses custom XML tags (`<think>`, `<tool_call>`). If the model malforms these tags or the frontend regex misses them, the answer is lost.
> **Mitigation:** "Trust but Verify." Log the raw stream. Enforce strict tagging in system prompt. Fail-open if parsing breaks.

### Gap Description
The frontend relies on strict Regex matching for `<think>` and `<tool_call>`.
- If `<think>` is unclosed, the UI hangs.
- If `<tool_call>` is wrapped in markdown (```json), it is ignored.

### Root Cause Files
| File | Issue | Lines |
|------|-------|-------|
| `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | Regex fragility; no raw logging | ~1200 |
| `src/lib/server/textGeneration/utils/toolPrompt.ts` | Weak enforcement of XML syntax | ~50 |

### Implementation Steps

#### Step 24.1: Enable Raw Stream Logging
**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts`

**Add raw debug logger:**
```typescript
// Inside the stream loop
const chunkText = chunk.text || "";
logger.trace({ chunk: chunkText }, "[raw_stream] Received chunk"); // Use TRACE level
```

#### Step 24.2: Harden System Prompt
**File:** `src/lib/server/textGeneration/utils/toolPrompt.ts`

**Add critical constraints:**
```typescript
export const TOOL_SYSTEM_PROMPT = `
...
CRITICAL SYNTAX RULES:
1. ALWAYS start with <think> tag.
2. ALWAYS close with </think> tag before using tools or answering.
3. NEVER wrap <tool_call> in markdown code blocks (no \`\`\`json).
4. Output raw <tool_call> JSON immediately after </think>.
...
`;
```

#### Step 24.3: Robust Tag Recovery
**File:** `src/lib/server/textGeneration/utils/xmlUtils.ts`

**Implement `repairXmlStream`:**
```typescript
export function repairXmlStream(text: string): string {
    // 1. Auto-close <think> if missing and <tool_call> appears
    if (text.includes('<think>') && !text.includes('</think>') && text.includes('<tool_call>')) {
        return text.replace('<tool_call>', '</think><tool_call>');
    }
    // 2. Strip markdown code blocks from tool calls
    if (text.match(/```json\s*<tool_call>/)) {
        return text.replace(/```json\s*(<tool_call>[\s\S]*?<\/tool_call>)\s*```/g, '$1');
    }
    return text;
}
```

### Enterprise Evaluation (GPT-5.2)

| Dimension | Assessment | Mitigation |
|-----------|------------|------------|
| **Scalability** | Platform hardening improves reliability | Prevents silent failures at scale |
| **Security** | Raw stream logging must be controlled | Sampling + redaction + prod-off by default |
| **Performance** | Tag repair adds negligible overhead | <1ms per response |
| **Maintainability** | Single repair function, not per-model hacks | xmlUtils.ts is the canonical repair location |
| **Resilience** | Fail-open with best-effort recovery | Never lose user answer due to parsing |
| **Testing** | Unit: malformed `<think>`, partial JSON, fenced JSON | Integration: simulated streaming anomalies |

**Success Criteria:**
- [ ] When model output malforms tags/JSON, system fails-open with best-effort recovery
- [ ] Raw stream visibility exists for debugging without leaking secrets
- [ ] `<think>` tag is auto-closed if missing before tool call
- [ ] Markdown code blocks stripped from tool call JSON

**IMPORTANT - Format Reconciliation:**
The plan references `<tool_call>` XML tags, but the actual runtime format is JSON `"tool_calls": [...]`. Ensure fixes target the ACTUAL format:
- Treat `<think>` as the main structural token (already used)
- Treat `"tool_calls": [...]` JSON payload as canonical tool-call format
- Harden parsing/recovery around actual runtime behavior

---

## Phase 25: DataGov Knowledge Pre-Ingestion (CRITICAL)

### Enterprise Insight (Strategic)
> **Paradigm Shift:** This phase transforms the assistant from "tool-dependent" to "knowledge-native". The DataGov intelligence (1,190 schemas, 22 semantic domains, 9,500+ searchable terms) will be **pre-installed** at application launch. The assistant will already "know" what government data exists before the user asks.
>
> **Business Value:** Users asking "מה אני יכול לשאול על תחבורה?" get instant answers from memory, not tool calls.

### Gap Description

Currently, DataGov knowledge is only accessible via MCP tool calls:
- User asks about government data → tool call → search → return results
- No "awareness" of available datasets until asked
- Hebrew intent detection routes to tools, not pre-loaded knowledge
- 3D Knowledge Graph doesn't show DataGov categories

**Target State:**
- All 1,190 dataset schemas **pre-loaded** into `memory_items` collection
- All 22 semantic domains from `enterprise_expansions.py` **indexed** for retrieval
- 9,500+ Hebrew↔English terms **embedded** for semantic search
- Knowledge Graph shows DataGov category nodes connected to dataset nodes
- Memory Panel displays DataGov knowledge with category filters

### Source Files

| File | Content | Records |
|------|---------|---------|
| `/datagov/schemas/_index.json` | All resources with category, format, record counts | 1,960 |
| `/datagov/schemas/_category_index.json` | Categories → dataset_ids mapping | 21 categories |
| `/datagov/schemas/_field_index.json` | Field availability (has_phone, has_address) | All resources |
| `/datagov/enterprise_expansions.py` | Bidirectional Hebrew↔English terms | 22 domains, ~9,500 terms |
| `/datagov/schemas/{category}/*.json` | Individual schema files | 1,190 files |

### Implementation Steps

#### Step 25.1: Create DataGov Pre-Ingestion Script
**New File:** `src/lib/server/memory/datagov/DataGovIngestionService.ts`

```typescript
/**
 * DataGovIngestionService - Pre-loads Israeli government data knowledge
 * 
 * This service runs at application startup to ensure the assistant
 * has complete awareness of available DataGov datasets.
 * 
 * Source: /datagov/schemas/ (1,190 datasets, 21 categories)
 */
export class DataGovIngestionService {
    private static instance: DataGovIngestionService;
    private ingestionComplete = false;
    
    constructor(
        private memoryFacade: UnifiedMemoryFacade,
        private kgService: KnowledgeGraphService,
        private embeddingClient: DictaEmbeddingClient
    ) {}
    
    /**
     * Run at application startup
     * @param force Re-ingest even if already done
     */
    async ingestAll(force = false): Promise<DataGovIngestionResult> {
        if (this.ingestionComplete && !force) {
            logger.info("[DataGov] Already ingested, skipping");
            return { skipped: true };
        }
        
        const result: DataGovIngestionResult = {
            categories: 0,
            datasets: 0,
            expansions: 0,
            kgNodes: 0,
            kgEdges: 0,
            errors: []
        };
        
        // 1. Ingest category index (21 categories)
        await this.ingestCategories(result);
        
        // 2. Ingest dataset schemas (1,190 files)
        await this.ingestDatasetSchemas(result);
        
        // 3. Ingest semantic expansions (22 domains, ~9,500 terms)
        await this.ingestSemanticExpansions(result);
        
        // 4. Create KG structure
        await this.createKnowledgeGraphStructure(result);
        
        this.ingestionComplete = true;
        logger.info({ result }, "[DataGov] Ingestion complete");
        return result;
    }
}
```

#### Step 25.2: Define DataGov Memory Schema
**File:** `src/lib/server/memory/types/DataGovTypes.ts`

```typescript
export interface DataGovMemoryItem {
    // Memory fields
    memory_id: string;
    tier: "datagov_schema" | "datagov_expansion";  // New tiers
    content: string;  // Searchable description
    
    // DataGov-specific metadata
    source: {
        type: "datagov";
        category: string;      // e.g., "transportation"
        dataset_id?: string;   // UUID from data.gov.il
        resource_id?: string;  // For individual resources
        file_path?: string;    // e.g., "transportation/רכבים.json"
    };
    
    // Schema metadata
    schema_meta?: {
        title_he: string;      // Hebrew title
        title_en?: string;     // English title
        format: string;        // CSV, JSON, XLSX
        total_records: number;
        fields: string[];      // Field names
        has_phone: boolean;
        has_address: boolean;
        has_date: boolean;
    };
    
    // Expansion metadata (for semantic terms)
    expansion_meta?: {
        domain: string;        // e.g., "TRANSPORTATION"
        terms_he: string[];    // Hebrew expansions
        terms_en: string[];    // English terms
    };
    
    // Vector embedding
    embedding?: number[];      // 1024-dim BGE-M3
}
```

#### Step 25.3: Implement Category Ingestion
**File:** `src/lib/server/memory/datagov/DataGovIngestionService.ts`

```typescript
private async ingestCategories(result: DataGovIngestionResult): Promise<void> {
    const categoryIndex = await this.loadCategoryIndex();
    
    for (const [category, data] of Object.entries(categoryIndex.categories)) {
        const content = this.buildCategoryDescription(category, data);
        
        await this.memoryFacade.store({
            tier: "datagov_schema",
            content,
            source: {
                type: "datagov",
                category,
            },
            schema_meta: {
                title_he: CATEGORY_HEBREW_NAMES[category],
                title_en: category,
                format: "category",
                total_records: data.count,
                fields: [],
                has_phone: false,
                has_address: false,
                has_date: false,
            },
            tags: ["datagov", "category", category],
            importance: 0.9,  // Categories are high importance
        });
        
        result.categories++;
    }
}

private buildCategoryDescription(category: string, data: CategoryData): string {
    const hebrewName = CATEGORY_HEBREW_NAMES[category] || category;
    return `
קטגוריה: ${hebrewName} (${category})
מספר מאגרי מידע: ${data.count}
Category: ${category}
Number of datasets: ${data.count}
מאגרי מידע ממשלתיים בתחום ${hebrewName} מכילים ${data.count} מאגרים זמינים.
Israeli government datasets in ${category} category contain ${data.count} available datasets.
    `.trim();
}
```

#### Step 25.4: Implement Schema Ingestion (Batch)
**File:** `src/lib/server/memory/datagov/DataGovIngestionService.ts`

```typescript
private async ingestDatasetSchemas(result: DataGovIngestionResult): Promise<void> {
    const index = await this.loadResourceIndex();
    const BATCH_SIZE = 50;  // Process in batches for performance
    
    const resources = Object.values(index.resources);
    
    for (let i = 0; i < resources.length; i += BATCH_SIZE) {
        const batch = resources.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (resource) => {
            try {
                const content = this.buildResourceDescription(resource);
                
                await this.memoryFacade.store({
                    tier: "datagov_schema",
                    content,
                    source: {
                        type: "datagov",
                        category: resource.category,
                        dataset_id: resource.dataset_id,
                        resource_id: resource.resource_id,
                        file_path: resource.file,
                    },
                    schema_meta: {
                        title_he: resource.title,
                        format: resource.format,
                        total_records: resource.total_records,
                        fields: resource.fields || [],
                        has_phone: resource.has_phone || false,
                        has_address: resource.has_address || false,
                        has_date: resource.has_date || false,
                    },
                    tags: ["datagov", "dataset", resource.category],
                    importance: 0.7,
                });
                
                result.datasets++;
            } catch (err) {
                result.errors.push(`Failed to ingest ${resource.title}: ${err.message}`);
            }
        }));
        
        logger.debug({ progress: i + batch.length, total: resources.length }, "[DataGov] Schema batch processed");
    }
}
```

#### Step 25.5: Implement Semantic Expansion Ingestion
**File:** `src/lib/server/memory/datagov/DataGovIngestionService.ts`

```typescript
private async ingestSemanticExpansions(result: DataGovIngestionResult): Promise<void> {
    // Load expansions from enterprise_expansions.py (pre-converted to JSON)
    const expansions = await this.loadSemanticExpansions();
    
    for (const [domain, termMap] of Object.entries(expansions)) {
        const content = this.buildExpansionDescription(domain, termMap);
        const allTermsHe = this.extractHebrewTerms(termMap);
        const allTermsEn = this.extractEnglishTerms(termMap);
        
        await this.memoryFacade.store({
            tier: "datagov_expansion",
            content,
            source: {
                type: "datagov",
                category: this.domainToCategory(domain),
            },
            expansion_meta: {
                domain,
                terms_he: allTermsHe,
                terms_en: allTermsEn,
            },
            tags: ["datagov", "expansion", domain.toLowerCase()],
            importance: 0.85,
        });
        
        result.expansions++;
    }
}

private buildExpansionDescription(domain: string, termMap: Record<string, string[]>): string {
    const termPairs = Object.entries(termMap)
        .map(([key, values]) => `${key}: ${values.join(', ')}`)
        .slice(0, 20);  // Limit to avoid huge content
    
    return `
מילון מונחים: ${domain}
Semantic Domain: ${domain}

מיפוי מונחים (חלקי):
${termPairs.join('\n')}

This domain maps bidirectional Hebrew↔English terms for ${domain.toLowerCase()} queries.
    `.trim();
}
```

#### Step 25.6: Create Knowledge Graph Structure
**File:** `src/lib/server/memory/datagov/DataGovIngestionService.ts`

```typescript
private async createKnowledgeGraphStructure(result: DataGovIngestionResult): Promise<void> {
    // 1. Create root node for DataGov
    const rootNode = await this.kgService.createNode({
        name: "DataGov Israel",
        type: "root",
        label_he: "מאגרי מידע ממשלתיים",
        label_en: "Israeli Government Data",
        metadata: {
            total_datasets: 1960,
            source: "data.gov.il",
        },
    });
    result.kgNodes++;
    
    // 2. Create category nodes (21)
    const categoryIndex = await this.loadCategoryIndex();
    const categoryNodes: Map<string, string> = new Map();
    
    for (const [category, data] of Object.entries(categoryIndex.categories)) {
        const node = await this.kgService.createNode({
            name: category,
            type: "category",
            label_he: CATEGORY_HEBREW_NAMES[category],
            label_en: category,
            metadata: {
                dataset_count: data.count,
            },
        });
        categoryNodes.set(category, node.id);
        result.kgNodes++;
        
        // Edge: root → category
        await this.kgService.createEdge({
            source: rootNode.id,
            target: node.id,
            relationship: "HAS_CATEGORY",
            weight: 1.0,
        });
        result.kgEdges++;
    }
    
    // 3. Create dataset nodes (sample: top 5 per category for performance)
    const index = await this.loadResourceIndex();
    const resourcesByCategory = this.groupByCategory(index.resources);
    
    for (const [category, resources] of resourcesByCategory) {
        const categoryNodeId = categoryNodes.get(category);
        if (!categoryNodeId) continue;
        
        // Limit to prevent KG explosion
        const topResources = resources.slice(0, 5);
        
        for (const resource of topResources) {
            const node = await this.kgService.createNode({
                name: resource.title,
                type: "dataset",
                label_he: resource.title,
                metadata: {
                    dataset_id: resource.dataset_id,
                    format: resource.format,
                    record_count: resource.total_records,
                },
            });
            result.kgNodes++;
            
            // Edge: category → dataset
            await this.kgService.createEdge({
                source: categoryNodeId,
                target: node.id,
                relationship: "CONTAINS_DATASET",
                weight: 0.8,
            });
            result.kgEdges++;
        }
    }
}
```

#### Step 25.7: Integrate with Application Startup
**File:** `src/lib/server/memory/index.ts`

```typescript
// Add to memory system initialization
export async function initializeMemorySystem(): Promise<void> {
    // ... existing initialization ...
    
    // DataGov pre-ingestion (runs once on first startup)
    if (env.DATAGOV_PRELOAD_ENABLED) {
        const datagovService = ServiceFactory.getDataGovIngestionService();
        
        try {
            const result = await datagovService.ingestAll();
            logger.info({ result }, "[Memory] DataGov knowledge pre-loaded");
        } catch (err) {
            logger.error({ err }, "[Memory] DataGov pre-load failed - continuing without");
        }
    }
}
```

#### Step 25.8: Add Memory Panel DataGov Filter
**File:** `src/lib/components/memory/MemoryPanel.svelte`

```typescript
// Add DataGov category filter
let selectedCategories: string[] = [];

const DATAGOV_CATEGORIES = [
    { id: "transportation", label: "תחבורה", icon: "🚗" },
    { id: "health", label: "בריאות", icon: "🏥" },
    { id: "finance", label: "כספים", icon: "💰" },
    { id: "education", label: "חינוך", icon: "📚" },
    { id: "environment", label: "סביבה", icon: "🌿" },
    // ... 16 more categories
];

async function searchWithDataGovFilter() {
    const params = {
        query: searchQuery,
        tiers: ["datagov_schema", "datagov_expansion", ...selectedTiers],
        filters: selectedCategories.length > 0 ? {
            "source.category": { $in: selectedCategories }
        } : undefined,
    };
    
    const results = await memorySearch(params);
    displayResults(results);
}
```

#### Step 25.9: Wire to Hebrew Intent Detection
**File:** `src/lib/server/textGeneration/mcp/toolFilter.ts`

```typescript
// Add DataGov intent patterns
const DATAGOV_INTENT_PATTERNS = [
    // Hebrew patterns
    /מאגרי?\s*מידע\s*(ממשלתי|ציבורי)/i,         // government data
    /מה\s+יש\s+(ב)?data\.gov/i,                   // what's in data.gov
    /אילו\s+מאגרים/i,                             // which datasets
    /נתונים\s+(ממשלתי|ציבורי)/i,                  // government/public data
    /רשימת?\s+(מאגרי?|נתונ)/i,                   // list of datasets/data
    
    // Category-specific
    /(מידע|נתונים)\s+על\s+(תחבורה|בריאות|חינוך)/i,
    /מאגרי\s+(רכב|בתי\s*חולים|בתי\s*ספר)/i,
];

export function detectDataGovIntent(query: string): DataGovIntent | null {
    for (const pattern of DATAGOV_INTENT_PATTERNS) {
        if (pattern.test(query)) {
            return {
                detected: true,
                suggestMemoryFirst: true,
                confidence: 0.85,
            };
        }
    }
    return null;
}

// In toolFilter.ts filterToolsForQuery()
export async function filterToolsForQuery(query: string, tools: Tool[]): Promise<Tool[]> {
    // 🔗 ORCHESTRATION: Check if query is about DataGov knowledge
    const datagovIntent = detectDataGovIntent(query);
    
    if (datagovIntent?.suggestMemoryFirst) {
        logger.info({ query }, "[ToolFilter] DataGov intent detected - suggesting memory-first");
        // Memory system will handle this query before tools
        // Return reduced tool set or empty to let memory answer first
    }
    
    // ... existing filtering logic ...
}
```

#### Step 25.10: Add Environment Configuration
**File:** `.env`

```bash
# DataGov Pre-Ingestion Configuration
DATAGOV_PRELOAD_ENABLED=true          # Enable pre-loading at startup
DATAGOV_SCHEMAS_PATH=/datagov/schemas  # Path to schema files
DATAGOV_EXPANSION_PATH=/datagov/enterprise_expansions.json  # Pre-converted JSON
DATAGOV_KG_SAMPLE_SIZE=5              # Datasets per category in KG
DATAGOV_BATCH_SIZE=50                 # Batch size for ingestion
```

### 🔗 Orchestration Integration Required

This phase MUST integrate with existing orchestration:

| Integration | Method | Purpose |
|-------------|--------|---------|
| Hebrew Intent | `detectHebrewIntent()` | Route "מאגרי מידע ממשלתיים" to pre-loaded knowledge |
| Tool Filtering | `detectDataGovIntent()` | Suggest memory-first for DataGov queries |
| Memory Search | `prefetchContext()` | Include `datagov_schema` tier in prefetch |
| KG Visualization | `KnowledgeGraph3D.svelte` | Render DataGov category nodes |
| Contextual Guidance | `getContextualGuidance()` | Include DataGov availability in "YOU ALREADY KNOW" |

### Success Criteria

1. **Pre-Loaded at Startup:** `docker logs frontend-UI` shows DataGov ingestion on first boot
2. **Memory Search Works:** Query "רכבים" returns DataGov transportation schemas from memory
3. **KG Visualization:** 3D graph shows "DataGov Israel" root with 21 category children
4. **Memory Panel Filter:** Users can filter by DataGov category
5. **Hebrew Routing:** Queries like "אילו מאגרים יש על בריאות" use memory-first, not tool calls

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Startup Ingestion | <60s | 1,190 schemas in batches of 50 |
| Memory Search | <100ms | Query DataGov schemas with embeddings |
| KG Render | <2s | ~150 nodes (21 categories + 5 datasets each) |

### Enterprise Evaluation (GPT-5.2)

| Dimension | Assessment | Mitigation |
|-----------|------------|------------|
| **Scalability** | 1,190 schemas + expansions create large vector footprint | "Store now, embed later" pattern; use `needs_reindex` flag |
| **Security** | Treat DataGov as public data | Sanitize content; avoid storing external URLs with tokens; admin-only ingestion control |
| **Performance** | Must not slow startup beyond targets | Background/resumable ingestion; batch sizing; feature flag |
| **Maintainability** | Avoid parallel schema that diverges from `memory_items` | Use same schema with `tier: "datagov_schema"` and `tier: "datagov_expansion"` |
| **Resilience** | Crash-safe ingestion | Idempotent, incremental, and recoverable; hash/version per record |
| **Testing** | Unit: parsers, schema normalization, idempotency | Integration: small subset fixture; Performance: time budgets |

**Critical Requirements:**
- [ ] Ingestion must be **idempotent** - safe to re-run
- [ ] Ingestion must be **incremental** - supports updates
- [ ] Ingestion must be **recoverable** - crash-safe with checkpoints
- [ ] Ingestion must be **resumable** - can continue from failure point
- [ ] Ingestion must be **feature-flagged** - `DATAGOV_PRELOAD_ENABLED=true`
- [ ] Ingestion must be **observable** - logs and metrics for monitoring

**Data Model Stability:**
- Use existing `memory_items` collection with new tiers
- Do NOT create parallel "datagov_memories" collection
- Do NOT diverge from existing schema patterns

**KG Node Limits:**
- Bound KG node counts to prevent UI collapse
- Use sampling/aggregation (5 datasets per category)
- Hard cap ~150 nodes total

**Dependencies:**
- Phase 19 search correctness and Phase 23 scoring safety
- Phase 21 logging/observability for monitoring ingestion

---

## Success Criteria (Definition of Done)

1.  **Single Source of Truth:** `memoryBank` collection is gone; `memory_items` is the master.
2.  **Active Learning:** Memories sort by usefulness (Wilson Score), not just similarity.
3.  **Self-Healing:** 0-result searches trigger auto-reindex.
4.  **Performance:** No blocking operations on the user critical path.
5.  **Robustness:** No race conditions in KG; no data loss in Promotion.
6.  **DataGov Native:** All 1,190 government data schemas are pre-loaded and searchable from memory.

---

## APPENDIX A: Orchestration Integration Audit

### EXISTING BUT UNUSED Functions in memoryIntegration.ts

These functions are **already implemented** but **never called** in runMcpFlow.ts. The memory system is running in a "parallel world" disconnected from these capabilities.

| Function | Location | Purpose | Current Status |
|----------|----------|---------|----------------|
| `shouldAllowTool()` | L194-220 | Confidence-based tool gating | **IMPORTED but NEVER CALLED** |
| `extractExplicitToolRequest()` | L~280 | Detects "search for", "חפש" | **DEFINED but NEVER CALLED** |
| `isFirstMessage()` | L~310 | Detects first message in conv | **DEFINED but NEVER CALLED** |
| `getColdStartContextForConversation()` | L~320 | Loads user profile for first msg | **DEFINED but NEVER CALLED** |
| `getContextualGuidance()` | L~350 | Builds "YOU ALREADY KNOW THIS" | **DEFINED but NEVER CALLED** |
| `getToolGuidance()` | L~400 | Returns action effectiveness stats | **DEFINED but NEVER CALLED** |
| `getAttributionInstruction()` | L~450 | Returns `<!-- MEM: ... -->` instruction | **IMPORTED but NEVER INJECTED** |
| `processResponseWithAttribution()` | L~480 | Parses memory marks from response | **IMPORTED but NEVER CALLED** |
| `hasMemoryBankTool()` | L~520 | Checks if memory_bank tool available | **DEFINED but NEVER USED** |
| `getMemoryBankPhilosophy()` | L~540 | Returns memory philosophy prompt | **IMPORTED but NEVER INJECTED** |

### EXISTING BUT UNUSED Functions in toolIntelligenceRegistry.ts

| Function | Purpose | Memory Integration |
|----------|---------|-------------------|
| `getToolIntelligence(toolName)` | Get tool metadata | Should inform memory ingestion |
| `getFallbackChain(toolName)` | Get fallback tools | Memory should track fallback usage |
| `getGracefulFailureMessage(toolName)` | Hebrew error message | Memory errors should use this |
| `getQuerySuggestion(toolName)` | Suggest better query | Memory 0-results should suggest |
| `getProgressMessage(toolName)` | Progress indicator | Memory search should show progress |

### EXISTING BUT UNUSED Functions in toolFilter.ts

| Function | Purpose | Memory Integration |
|----------|---------|-------------------|
| `detectHebrewIntent(query)` | Detect מחקר/חפש/מאגרים רשמיים | Route memory search by intent |
| `TOOL_CATEGORIES` | Category→tools mapping | Classify memory by source tool |
| `TOOL_PRIORITIES` | Quality scores per tool | Weight memory by source quality |
| `identifyToolMcp(toolName)` | Get MCP server name | Tag memory with source MCP |

### Wiring Checklist

Before marking ANY phase as complete, verify:

- [ ] **Phase 2**: Uses `getToolIntelligence()` and `getToolLabel()` for ingestion metadata
- [ ] **Phase 3**: CALLS `shouldAllowTool()` (not just imports it)
- [ ] **Phase 3**: INJECTS `getContextualGuidance()` output into prompt
- [ ] **Phase 12**: Records to `action_outcomes` for tool-memory correlation
- [ ] **Phase 13**: Uses `getToolGuidance()` for effectiveness stats in prompt
- [ ] **Phase 14**: CALLS `getColdStartContextForConversation()` for first messages
- [ ] **Phase 15**: CALLS `processResponseWithAttribution()` after response
- [ ] **Phase 15**: INJECTS `getAttributionInstruction()` into prompt
- [ ] **All Phases**: Hebrew errors use `toGracefulError()` patterns

---

## APPENDIX B: Risk Assessment Matrix (GPT-5.2)

| Risk | Impact | Likelihood | Phase(s) | Mitigation |
|------|--------|------------|----------|------------|
| Corrupt stats → bad learning decisions | **High** | Medium | 22, 23 | Land safeguards first; add unit tests + migration/backfill |
| Tool gating blocks needed tools → user dissatisfaction | Medium | Medium | 3, 13 | Explicit override detection; fail-open on degraded memory |
| Tool ingestion bloats storage/vectors | **High** | **High** | 2, 16, 25 | Dedup by hash; async embedding; caps per tier |
| Docling duplicates degrade search | Medium | **High** | 4 | Hash-based doc ID; `DocumentRecognitionService.documentExists` |
| Raw stream logging leaks data | **High** | Low | 24 | Redaction + sampling + prod-off by default |
| DataGov pre-ingestion slows startup | **High** | Medium | 25 | Background/resumable ingestion; batch sizing; feature flag |
| KG visualization collapses with DataGov nodes | Medium | Medium | 6, 20, 25 | Sampling/aggregation; hard node caps; progressive rendering |
| Mongo/Qdrant partial failure causes drift | **High** | Medium | 1, 11, 23 | Create-then-delete; deferred reindex; targeted transactions |
| Memory-first skips when stale data | Medium | Medium | 3, 13 | Time decay; explicit tool override patterns |
| Wilson score calculated from capped history | **High** | Low | 23 | Use cumulative `stats.success_count` and `stats.uses` only |

---

## APPENDIX C: Implementation Checklist (Enterprise "Definition of Ready" → "Definition of Done")

### Definition of Ready (Before Coding)

- [ ] Reconcile `codespace_progress.md` with current code reality
- [ ] Confirm which phase set is canonical when duplicates exist (3 vs 13, 2 vs 16, etc.)
- [ ] Confirm operational SLO targets per phase (latency, timeouts, ingestion budgets)
- [ ] Define test scope per phase (unit/integration/E2E) and required fixtures
- [ ] Verify no parallel implementation planned when existing code suffices

### Definition of Done (Per Phase)

- [ ] Success criteria met and measurable (logs, counters, UI evidence)
- [ ] Unit tests added for all new logic; integration tests for data-path changes
- [ ] Failure modes exercised (dependency down, timeouts, degraded state)
- [ ] Security review completed for persisted content and new endpoints
- [ ] Orchestration integration verified (existing methods used, not bypassed)
- [ ] Hebrew support verified (RTL, bilingual labels, Hebrew patterns)
- [ ] Performance baseline maintained (no regressions in P95 latency)

### Quality Assurance Guidelines

**Unit Tests (Required):**
- Outcome semantics: all outcomes update uses and scoring as intended (Phase 22/23)
- Tool gating matrix: confidence × explicit request × Hebrew intent (Phase 3/13)
- Dedup hashing and identity logic (Phase 4, 25)
- Parsing recovery: malformed `<think>`, partial JSON tool call payload (Phase 24)

**Integration Tests (Required):**
- Mongo + Qdrant: Store → deferred embedding → reindex → searchable results
- Duplicate document ingestion produces a single canonical document identity
- Tool execution to memory ingestion: successful result persisted and retrievable

**E2E Tests (High-Value):**
- "Save memory → search memory → see it in UI" (trust path)
- "Upload same document twice → no duplication → instant recognition message"
- "High-confidence memory answer → no external tool calls unless explicitly requested"

**Performance Validation:**
- Memory prefetch latency distribution (target: <50ms P95)
- Search latency with timeouts (vector, bm25, rerank)
- Ingestion throughput (batch size, embedding QPS)

---

## APPENDIX D: Architectural Hardening Notes (GPT-5.2)

### Data Model Stability
- Avoid introducing new "parallel schemas" for DataGov and tool ingestion
- Fit within `memory_items` using tier + metadata patterns
- Use existing `MemoryItemDocument` interface

### Idempotency Everywhere
- Migration, ingestion, and dedup should be safe to retry
- Use content hash, stable IDs, and upsert patterns
- Never create duplicate records on re-run

### Controlled Startup Behavior (Phase 25)
- Pre-ingestion must be:
  - Feature-flagged (`DATAGOV_PRELOAD_ENABLED=true`)
  - Resumable (checkpoint progress)
  - Observable (logs/metrics)
  - Safe to disable without breaking core chat

### Multi-Instance Readiness
- Current architecture is single-instance
- In-process locks are sufficient for KG and ingestion dedup
- Future: distributed locking story (Redis) if multi-instance needed

### Security Baseline
- "Diagnostics" and "pre-ingestion control" endpoints must be admin-only
- Sanitize stored tool outputs; avoid storing secrets or raw headers
- Raw stream logging: sampled, redacted, disabled in production by default

### Multi-Instance Considerations (KIMI REQUIREMENT)

> **Current state:** Single-instance architecture. In-process locks are sufficient.
> **Future state:** If multi-instance deployment is needed, implement Redis-based distributed locks.

| Component | Current Lock | Future Lock |
|-----------|--------------|-------------|
| KG write buffer | In-process mutex | Redis SETNX |
| Ingestion dedup | In-process Set | Redis Set with TTL |
| Circuit breaker state | In-process | Redis counter |

**Do NOT implement distributed locks prematurely.** Document the need and revisit when scaling.

---

## APPENDIX E: Raw Stream Debugging Protocol (KIMI REQUIREMENT)

> **CRITICAL:** Raw LLM stream logging is dangerous in production. This protocol defines safe debugging practices.

### Production Rules (MANDATORY)

1. **NEVER enable raw stream logging in production by default**
2. **ALWAYS use feature flag:** `DEBUG_RAW_STREAM=true` (default: false)
3. **ALWAYS sample:** Log only 1% of streams in production debugging
4. **ALWAYS redact:** Strip PII, API keys, auth headers before logging
5. **ALWAYS correlate:** Include request ID for cross-referencing

### Environment Configuration

```bash
# .env - Production defaults
DEBUG_RAW_STREAM=false           # NEVER true in production
DEBUG_RAW_STREAM_SAMPLE_RATE=0.01  # 1% sampling when enabled
DEBUG_RAW_STREAM_REDACT=true     # Always redact sensitive data
```

### Implementation Pattern

**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts`

```typescript
import { env } from "$env/dynamic/private";

const DEBUG_RAW_STREAM = env.DEBUG_RAW_STREAM === 'true';
const SAMPLE_RATE = parseFloat(env.DEBUG_RAW_STREAM_SAMPLE_RATE || '0.01');

// Inside stream processing loop
function logRawChunk(chunk: string, requestId: string): void {
    if (!DEBUG_RAW_STREAM) return;
    if (Math.random() > SAMPLE_RATE) return;  // Sampling
    
    // Redaction patterns
    const redacted = chunk
        .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]')
        .replace(/api[_-]?key[=:]\s*["']?[^"'\s]+["']?/gi, 'api_key=[REDACTED]')
        .replace(/password[=:]\s*["']?[^"'\s]+["']?/gi, 'password=[REDACTED]');
    
    logger.trace({ 
        requestId, 
        chunkLength: chunk.length,
        chunk: redacted.slice(0, 500)  // Truncate to 500 chars
    }, "[raw_stream] Debug chunk");
}
```

### Phase 24 Alignment: JSON Tool Calls (KIMI REQUIREMENT)

> **CRITICAL FORMAT CLARIFICATION:** The actual runtime format uses JSON `"tool_calls": [...]`, NOT XML `<tool_call>` tags.

**Correct Format (Runtime):**
```json
{
    "tool_calls": [
        {
            "id": "call_123",
            "type": "function",
            "function": {
                "name": "tavily_search",
                "arguments": "{\"query\": \"latest news\"}"
            }
        }
    ]
}
```

**XML Format (`<think>`) - Still Used:**
```xml
<think>
I need to search for the latest news about this topic.
Let me use the Tavily search tool.
</think>
```

**Parsing Priority:**
1. Parse `<think>...</think>` wrapper (XML)
2. Parse `"tool_calls": [...]` JSON payload (NOT XML tags)
3. Repair unclosed `<think>` tags if streaming interrupted
4. IGNORE any `<tool_call>` XML references in legacy code

### Debugging Checklist

When debugging stream issues:

- [ ] Confirm `<think>` tags are properly opened and closed
- [ ] Confirm `</think>` appears before any tool call JSON
- [ ] Confirm tool calls are valid JSON (not XML)
- [ ] Check for markdown code blocks wrapping JSON (must strip)
- [ ] Verify request ID correlation in logs

---

## APPENDIX F: DataGov Pre-Ingestion Controls (KIMI REQUIREMENT)

> **MANDATORY:** DataGov ingestion must be controlled, resumable, and non-blocking.

### Feature Flag (Default OFF)

```bash
# .env
DATAGOV_PRELOAD_ENABLED=false    # Default: OFF - must explicitly enable
DATAGOV_PRELOAD_BACKGROUND=true  # Run in background, don't block startup
DATAGOV_PRELOAD_BATCH_SIZE=50    # Items per batch
DATAGOV_PRELOAD_RESUME=true      # Resume from last checkpoint on restart
```

### Startup Behavior

```typescript
// src/lib/server/memory/index.ts
async function initializeMemorySystem(): Promise<void> {
    // ... existing initialization ...
    
    if (env.DATAGOV_PRELOAD_ENABLED === 'true') {
        if (env.DATAGOV_PRELOAD_BACKGROUND === 'true') {
            // Non-blocking: Start in background
            logger.info("[Memory] Starting DataGov pre-ingestion in background");
            datagovService.ingestAll().catch(err => 
                logger.error({ err }, "[Memory] DataGov background ingestion failed")
            );
        } else {
            // Blocking: Wait for completion (use only in dev/test)
            logger.info("[Memory] Starting DataGov pre-ingestion (blocking)");
            await datagovService.ingestAll();
        }
    }
}
```

### Resumable Ingestion

**Checkpoint Storage:**
```typescript
interface IngestionCheckpoint {
    last_category: string;
    last_dataset_index: number;
    last_expansion_domain: string;
    completed_at: Date | null;
    error_count: number;
}

// Store checkpoint in MongoDB
const CHECKPOINT_COLLECTION = 'datagov_ingestion_checkpoint';
```

**Resume Logic:**
```typescript
async ingestAll(force = false): Promise<DataGovIngestionResult> {
    const checkpoint = await this.loadCheckpoint();
    
    if (checkpoint?.completed_at && !force) {
        logger.info("[DataGov] Already completed, skipping");
        return { skipped: true };
    }
    
    // Resume from checkpoint
    const startCategory = checkpoint?.last_category || null;
    const startIndex = checkpoint?.last_dataset_index || 0;
    
    // ... continue ingestion from checkpoint ...
}
```

### KG Node Caps

To prevent UI collapse with too many DataGov nodes:

| Node Type | Max Count | Sampling Strategy |
|-----------|-----------|-------------------|
| Category nodes | 21 (all) | No sampling |
| Dataset nodes per category | 5 | Top 5 by record count |
| Total KG nodes | ~150 | Hard cap enforced |

---

*Document Version: 3.6 (Enterprise Enhanced + GPT-5.2 Analysis + Kimi Requirements)*
*Last Updated: January 14, 2026*
*RoamPal Reference Version: v0.2.9 + v0.2.8.1 Hotfix*
*Total Implementation Tasks: 87 tasks, 494 subtasks*
*Orchestration Integration Points: 18 functions to wire*
*DataGov Knowledge: 1,190 schemas, 22 domains, ~9,500 searchable terms*
*Risk Assessment: 10 identified risks with mitigations*
*Kimi Requirements: 12 enterprise controls integrated*
*Last Updated: January 14, 2026*
*RoamPal Reference Version: v0.2.9 + v0.2.8.1 Hotfix*
*Total Implementation Tasks: 87 tasks, 494 subtasks*
*Orchestration Integration Points: 18 functions to wire*
*DataGov Knowledge: 1,190 schemas, 22 domains, ~9,500 searchable terms*
*Risk Assessment: 10 identified risks with mitigations*

