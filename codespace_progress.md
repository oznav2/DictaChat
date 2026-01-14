# Memory System Implementation Progress

**Version:** 2.1 (GPT-5.2 + Kimi Enterprise Requirements)
**Date:** January 14, 2026
**Reference:** `codespace_gaps_enhanced.md` v3.6, `codespace_priorities.md` v2.1

> **Enterprise-Grade Production Implementation**
> 
> All phases are HIGH PRIORITY and will be implemented end-to-end consecutively.
> Each task is atomic and testable. No steps are omitted.
> 
> **Kimi Requirements:** 12 enterprise controls integrated (see Section 0.K below)

---

## 0. Executive Reality Check (GPT-5.2 Analysis)

### What's Already Implemented (Important Reality Check)

Several plan items are already active in the codebase:

| Capability | Status | Location |
|------------|--------|----------|
| Memory prefetch & injection | ✅ Active | `runMcpFlow.ts` L526-933 |
| Cold-start injection | ✅ Active | `runMcpFlow.ts` via `getColdStartContextForConversation()` |
| Contextual guidance | ✅ Active | `runMcpFlow.ts` L776-817 |
| Tool guidance | ✅ Active | `runMcpFlow.ts` L825-875 |
| Attribution instruction | ✅ Active | `runMcpFlow.ts` L759-769 |
| Document recognition endpoint | ✅ Exists | `src/routes/api/memory/books/recognize/+server.ts` |
| Docling → memory bridge | ✅ Exists | `toolInvocation.ts` (but **without hash-based dedup**) |
| Search timeout fallback | ✅ Exists | `SearchService.ts` graceful degradation |

### Primary Strategic Gap

The biggest remaining gap is **wiring + enforceability**, not missing functions:
- Tool gating is **not enforced at runtime** (prompt-only guidance)
- Tool result ingestion (non-docling) **not implemented**
- Dedup **not consistent** (timestamp IDs, not hash-based)

### Phase Consolidation Required

> **WARNING:** Mark these as "CONSOLIDATED" - do NOT implement duplicate phases!

| Duplicate Phases | Canonical Phase | Status |
|------------------|-----------------|--------|
| Phase 3 + Phase 13 | **Phase 3** (Tool Gating) | Phase 13 tasks → merge into Phase 3 |
| Phase 2 + Phase 16 | **Phase 2** (Tool Ingestion) | Phase 16 tasks → merge into Phase 2 |
| Phase 6 + Phase 20 | **Phase 6** (KG Labels) | Phase 20 tasks → merge into Phase 6 |
| Phase 8 + Phase 17 | **Phase 8** (UI Updates) | Phase 17 tasks → merge into Phase 8 |

### Risk-Aware Execution Order

```
TIER 1 - SAFEGUARDS (FIRST):
  1. Phase 23 (v0.2.8 Bug Fixes) ← Prevents corrupt stats ✅ COMPLETE
  2. Phase 22 (v0.2.9 Natural Selection) ✅ COMPLETE

TIER 2 - CORE DATA INTEGRITY:
  3. Phase 1 (Collection Consolidation) ✅ COMPLETE
  4. Phase 4 (Document Deduplication) ✅ COMPLETE (2026-01-14)

TIER 3 - MEMORY-FIRST INTELLIGENCE:
  5. Phase 3 (+13) (Tool Gating) ← NEXT
  6. Phase 2 (+16) (Tool Ingestion)
  7. Phase 5 (0-Results Fix)

TIER 4 - LEARNING:
  8. Phase 7 (Attribution)
  9. Phase 8 (+17) (Outcome Detection + UI)
  10. Phase 12 (Time Decay)

TIER 5 - SEARCH QUALITY:
  11. Phase 15 (RRF Fusion)
  12. Phase 19 (Action Outcomes)

TIER 6 - PLATFORM HARDENING:
  13. Phase 24 (Response Integrity)
  14. Phase 14 (Circuit Breaker)

TIER 7 - KNOWLEDGE EXPANSION:
  15. Phase 25 (DataGov) ← After core stability

TIER 8 - POLISH:
  16. Phase 6 (+20) (KG Visualization)
  17. Phase 21 (Observability)
  18. Phases 9-11, 18 (Optimization)
```

---

## 0.K Kimi Enterprise Requirements (NEW)

> **MANDATORY:** These 12 enterprise controls must be implemented alongside the relevant phases.

### K.1: Enforceable Tool Gating (Phase 3)

- **File**: `src/lib/server/textGeneration/mcp/toolGatingDecision.ts`
- **Subtasks**:
  - [ ] K.1.1: Create `ToolGatingInput` interface with 6 parameters
  - [ ] K.1.2: Create `ToolGatingOutput` interface with 4 fields
  - [ ] K.1.3: Implement `decideToolGating()` function with 5 rules
  - [ ] K.1.4: Rule 1: Fail-open when `memoryDegraded=true`
  - [ ] K.1.5: Rule 2: Allow all tools when `explicitToolRequest` detected
  - [ ] K.1.6: Rule 3: Allow all tools for Hebrew "מחקר" (research) intent
  - [ ] K.1.7: Rule 4: Reduce tools when `retrievalConfidence='high'` + 3+ results
  - [ ] K.1.8: Rule 5: Default allow all tools
  - [ ] K.1.9: Wire into `runMcpFlow.ts` after memory prefetch (~line 620)
  - [ ] K.1.10: Emit trace event when tools are reduced
  - [ ] K.1.11: Add logging with reason code
  - [ ] K.1.12: Write unit tests for all 5 rules

### K.2: Async Ingestion Protocol (Phase 2, 25)

- **File**: `src/lib/server/memory/stores/MemoryMongoStore.ts`
- **Subtasks**:
  - [ ] K.2.1: Add `needs_reindex: true` to all new items in `store()`
  - [ ] K.2.2: Add `embedding_status: 'pending'` field
  - [ ] K.2.3: Implement `queueEmbeddingTask()` fire-and-forget method
  - [ ] K.2.4: Remove any synchronous `embeddingClient.embed()` on user path
  - [ ] K.2.5: Verify deferred reindex endpoint processes `needs_reindex` items
  - [ ] K.2.6: Add per-tier caps (working: 1000, history: 10000)
  - [ ] K.2.7: Implement `enforcePerTierCap()` cleanup method
  - [ ] K.2.8: Write tests verifying no blocking on user path

### K.3: Authoritative Outcome Semantics (Phase 23) ✅ COMPLETED

- **File**: `src/lib/server/memory/stores/MemoryMongoStore.ts`
- **Subtasks**:
  - [x] K.3.1: Verify `worked` → +1.0 success_count, +1 uses
  - [x] K.3.2: Verify `partial` → +0.5 success_count, +1 uses
  - [x] K.3.3: Verify `unknown` → +0.25 success_count, +1 uses
  - [x] K.3.4: Verify `failed` → +0.0 success_count, +1 uses
  - [x] K.3.5: Remove any default case in outcome switch statement
  - [x] K.3.6: Add TypeScript exhaustiveness check (`never` type)
  - [x] K.3.7: Verify Wilson uses cumulative stats (not capped history)
  - [x] K.3.8: Write test: 50 uses + 45 worked → Wilson ~0.78-0.80 (lower CI bound)

### K.4: Performance Baselines (Before Any Phase)

- **Subtasks**:
  - [ ] K.4.1: Capture memory prefetch P50/P95 latency baseline
  - [ ] K.4.2: Capture search latency (vector, BM25, rerank) baseline
  - [ ] K.4.3: Capture ingestion throughput baseline
  - [ ] K.4.4: Capture embedding QPS baseline
  - [ ] K.4.5: Document baselines in `STATUS.md`
  - [ ] K.4.6: Create comparison script for post-implementation

### K.5: Raw Stream Debugging Protocol (Phase 24)

- **File**: `src/lib/server/textGeneration/mcp/runMcpFlow.ts`
- **Subtasks**:
  - [ ] K.5.1: Add `DEBUG_RAW_STREAM` env var (default: false)
  - [ ] K.5.2: Add `DEBUG_RAW_STREAM_SAMPLE_RATE` (default: 0.01)
  - [ ] K.5.3: Implement `logRawChunk()` with sampling
  - [ ] K.5.4: Add redaction for Bearer tokens, API keys, passwords
  - [ ] K.5.5: Add request ID correlation
  - [ ] K.5.6: Truncate logged chunks to 500 chars
  - [ ] K.5.7: Document that this must NEVER be enabled in production

### K.6: Phase 24 Format Alignment

- **File**: `src/lib/server/textGeneration/utils/xmlUtils.ts`
- **Subtasks**:
  - [ ] K.6.1: Confirm parsing targets JSON `"tool_calls": [...]` format
  - [ ] K.6.2: Remove any `<tool_call>` XML parsing if present
  - [ ] K.6.3: Keep `<think>` as only XML token
  - [ ] K.6.4: Implement `repairXmlStream()` for unclosed `<think>` tags
  - [ ] K.6.5: Strip markdown code blocks from tool call JSON
  - [ ] K.6.6: Write tests for malformed streams

### K.7: DataGov Controls (Phase 25)

- **File**: `.env` and `src/lib/server/memory/datagov/DataGovIngestionService.ts`
- **Subtasks**:
  - [ ] K.7.1: Add `DATAGOV_PRELOAD_ENABLED=false` (default OFF)
  - [ ] K.7.2: Add `DATAGOV_PRELOAD_BACKGROUND=true` (non-blocking)
  - [ ] K.7.3: Implement checkpoint storage for resumable ingestion
  - [ ] K.7.4: Implement `loadCheckpoint()` and `saveCheckpoint()`
  - [ ] K.7.5: Add resume logic in `ingestAll()`
  - [ ] K.7.6: Enforce KG node cap: 150 max
  - [ ] K.7.7: Implement background ingestion (don't block startup)
  - [ ] K.7.8: Write tests for resume from checkpoint

### K.8: Multi-Instance Readiness (Documentation Only)

- **Subtasks**:
  - [ ] K.8.1: Document current single-instance architecture in AGENTS.md
  - [ ] K.8.2: Document future need for Redis distributed locks
  - [ ] K.8.3: Identify components needing distributed locks: KG, dedup, circuit breaker
  - [ ] K.8.4: Do NOT implement distributed locks prematurely

### K.9: Security Hardening

- **Subtasks**:
  - [ ] K.9.1: Verify all diagnostic endpoints are admin-only
  - [ ] K.9.2: Verify pre-ingestion endpoints are admin-only
  - [ ] K.9.3: Implement tool output sanitization before storage
  - [ ] K.9.4: Never log secrets, raw headers, or API keys
  - [ ] K.9.5: Add security review to Definition of Done

---

## Phase 1: Consolidate Memory Collections

### Task 1.1: Create Migration Script ✅
- **File**: `src/lib/server/memory/migrations/consolidateMemoryBank.ts`
- **Subtasks**:
  - [x] 1.1.1: Create migration file with TypeScript types
  - [x] 1.1.2: Implement `migrateMemoryBankToUnified()` function
  - [x] 1.1.3: Add UUID generation for `memory_id` field
  - [x] 1.1.4: Map fields: `text`, `tags`, `importance`, `confidence`, `status`
  - [x] 1.1.5: Add `source.legacy = true` marker for tracking
  - [x] 1.1.6: Integrate embedding generation via `DictaEmbeddingClient` (optional)
  - [x] 1.1.7: Add Qdrant vector indexing for each migrated item (optional)
  - [x] 1.1.8: Implement batch processing with configurable batch size
  - [x] 1.1.9: Add progress logging with count/duration metrics
  - [x] 1.1.10: Implement rollback strategy (items marked `needs_reindex=true`)
  - [x] 1.1.11: Add error handling for embedding/Qdrant failures
  - [ ] 1.1.12: Write unit tests for migration logic (deferred)

**Implementation Notes (2026-01-14)**:
- Created migration script with full TypeScript types
- `migrateMemoryBankToUnified()` processes items in batches (default 50)
- Deduplication by text content to avoid duplicates
- `source.legacy=true` and `source.legacy_id` markers for tracking
- Default: `needs_reindex=true` for deferred embedding via reindex service
- Optional: Real-time embedding and Qdrant indexing if clients provided
- Progress logging every batch with percentage complete
- Error handling: Failed items logged but don't stop migration
- Verification: `verifyMigration()` checks all legacy items exist in unified

**API Endpoint**: `POST /api/memory/ops/migrate`
- `GET`: Get migration status (pending count)
- `POST`: Trigger migration with options (batchSize, dryRun, etc.)
- `PUT`: Verify migration integrity

### Task 1.2: Update Memory Bank API Routes ✅
- **File**: `src/routes/api/memory/memory-bank/[id]/+server.ts`
- **Subtasks**:
  - [x] 1.2.1: Add UUID validation alongside ObjectId
  - [x] 1.2.2: Create `isValidMemoryId()` helper function
  - [x] 1.2.3: Route GET through `UnifiedMemoryFacade.getById()`
  - [x] 1.2.4: Route PUT through `UnifiedMemoryFacade.update()`
  - [x] 1.2.5: Route DELETE through `UnifiedMemoryFacade.delete()`
  - [x] 1.2.6: Primary route through facade (legacy fallback preserved)
  - [x] 1.2.7: Add backward compatibility for legacy ObjectId lookups
  - [x] 1.2.8: Update response format to match existing API contract
  - [ ] 1.2.9: Add integration tests for both ID formats (deferred)

**Implementation Notes (2026-01-14)**:
- Added `isValidUUID()` and `isValidMemoryId()` helper functions
- Extended `UnifiedMemoryFacade` with `getById()`, `update()`, `deleteMemory()` methods
- Extended `StoreService` interface with optional CRUD methods
- Implemented methods in `StoreServiceImpl` delegating to `MemoryMongoStore`
- Legacy fallback: If facade returns null, checks `memoryBank` collection for ObjectId format
- Response includes `source: "legacy"` marker for legacy collection hits

### Task 1.3: Update Memory Bank List API ✅ TRANSITION COMPLETE
- **File**: `src/routes/api/memory/memory-bank/+server.ts`
- **Subtasks**:
  - [x] 1.3.1: Route POST through `UnifiedMemoryFacade.store()` - ALREADY DONE
  - [x] 1.3.2: GET queries BOTH collections with deduplication - TRANSITION APPROACH
  - [x] 1.3.3: Direct queries preserved for transition (legacy + unified)
  - [x] 1.3.4: Ensure response format matches UI expectations - DONE
  - [x] 1.3.5: Add pagination support via facade - DONE (offset/limit)
  - [ ] 1.3.6: Write integration tests (deferred)

**Implementation Notes (2026-01-14)**:
- POST already routes through facade (creates in memory_items)
- GET queries BOTH memoryBank AND memory_items, deduplicates by text
- This is the correct transition approach - ensures all data visible during migration
- After migration completes, can simplify to facade-only queries

### Task 1.4: Update User Migration ✅
- **File**: `src/routes/login/callback/updateUser.ts`
- **Subtasks**:
  - [x] 1.4.1: Add migration call for `memory_items` (user_id field)
  - [x] 1.4.2: Ensure both collections are migrated on user update
  - [x] 1.4.3: Add logging for migration status

**Implementation Notes (2026-01-14)**:
- Added migration for `memory_items` collection alongside `memoryBank`
- Uses `user_id` field (snake_case) matching unified schema
- Non-blocking: Errors logged but don't fail login flow
- Logs count of migrated items for debugging

---

## Phase 2: Tool Result Memory Ingestion

### Task 2.1: Create Tool Result Ingestion Service
- **File**: `src/lib/server/memory/services/ToolResultIngestionService.ts`
- **Subtasks**:
  - [ ] 2.1.1: Create service class with dependency injection
  - [ ] 2.1.2: Define `ToolResultIngestionParams` interface
  - [ ] 2.1.3: Implement `shouldIngest(toolName, result)` filter logic
  - [ ] 2.1.4: Implement `extractMemorableContent(result)` parser
  - [ ] 2.1.5: Add tool-specific extractors (web search, fetch, etc.)
  - [ ] 2.1.6: Implement `ingestToolResult()` main method
  - [ ] 2.1.7: Store results as `tier="working"` with tool metadata
  - [ ] 2.1.8: Add deduplication by content hash
  - [ ] 2.1.9: Implement quality filtering (skip empty/error results)
  - [ ] 2.1.10: Add logging for ingestion decisions
  - [ ] 2.1.11: Write unit tests for each extractor

### Task 2.2: Integrate with runMcpFlow.ts
- **File**: `src/lib/server/textGeneration/mcp/runMcpFlow.ts`
- **Subtasks**:
  - [ ] 2.2.1: Import `ToolResultIngestionService`
  - [ ] 2.2.2: Add ingestion call after successful tool execution
  - [ ] 2.2.3: Pass conversation context to ingestion service
  - [ ] 2.2.4: Handle ingestion errors gracefully (don't block flow)
  - [ ] 2.2.5: Add feature flag for tool result ingestion
  - [ ] 2.2.6: Write integration tests

### Task 2.3: Add Tool Result Search
- **Subtasks**:
  - [ ] 2.3.1: Add `source.tool_name` filter to search queries
  - [ ] 2.3.2: Implement "What did the search find?" query support
  - [ ] 2.3.3: Add tool result attribution in responses

---

## Phase 4: Document Deduplication for Tool Calls ✅ COMPLETED (per codespace_priorities.md TIER 2)

> **Reference**: `codespace_gaps_enhanced.md` Phase 4, `codespace_priorities.md` TIER 2 Order 4

### Task 4.1: Hash-Based Deduplication in bridgeDoclingToMemory ✅
- **File**: `src/lib/server/textGeneration/mcp/toolInvocation.ts`
- **Subtasks**:
  - [x] 4.1.1: Calculate SHA-256 content hash before storage
  - [x] 4.1.2: Check document existence via `MemoryMongoStore.documentExists()`
  - [x] 4.1.3: Skip storage if duplicate document detected (fail-open on check error)
  - [x] 4.1.4: Use hash-based documentId (`docling:${shortHash}`)
  - [x] 4.1.5: Persist `document_hash` in metadata for future queries

**Implementation Notes (2026-01-14)**:
- SHA-256 hash calculated on `output.trim()` for consistent identity
- Short hash (16 chars) used for documentId and logging
- `documentExists()` checks `source.book.document_hash` in MongoDB
- Fail-open: If existence check fails, proceeds with storage (logs warning)
- Hash stored in metadata flows through `StoreServiceImpl` to `source.book.document_hash`
- Prevents Qdrant growth and retrieval quality degradation from duplicate vectors

**Success Criteria Met**:
- ✅ Docling bridge uses SHA-256 hash-based document identity
- ✅ If document exists, skips re-storage with "already processed" log
- ✅ `documentExists()` is called before ingestion
- ✅ `document_hash` persisted for later queries

---

## Phase 3 (progress.md): Document Hash Deduplication for Document Uploads

> **Note**: This extends Phase 4 to cover document upload flow (distinct from tool call dedup above)

### Task 3.1: Implement Hash-Based Recognition (Document Upload Path)
- **File**: `src/lib/server/documents/UnifiedDocumentIngestionService.ts`
- **Subtasks**:
  - [ ] 3.1.1: Add SHA-256 hash calculation for uploaded files
  - [ ] 3.1.2: Store hash in `document_hash` field
  - [ ] 3.1.3: Implement `checkExistingDocument(hash)` lookup
  - [ ] 3.1.4: Return existing chunks if document already processed
  - [ ] 3.1.5: Add cross-chat recognition (same doc in different chats)
  - [ ] 3.1.6: Implement cache TTL for hash lookups
  - [ ] 3.1.7: Add logging for cache hits/misses

### Task 3.2: Update Document Upload Flow
- **File**: `src/routes/api/conversations/[id]/documents/+server.ts`
- **Subtasks**:
  - [ ] 3.2.1: Calculate hash before sending to docling
  - [ ] 3.2.2: Check for existing document before processing
  - [ ] 3.2.3: Skip docling call if hash matches
  - [ ] 3.2.4: Return cached chunks for duplicate uploads
  - [ ] 3.2.5: Add UI feedback for "Document already processed"
  - [ ] 3.2.6: Write integration tests

### Task 3.3: Recognition Endpoint ✅ EXISTS
- **File**: `src/routes/api/memory/books/recognize/+server.ts`
- **Status**: Already implemented (uses `DocumentRecognitionService`)
- **Subtasks**:
  - [x] 3.3.1: POST endpoint accepting file hash
  - [x] 3.3.2: Return existing document metadata if found
  - [x] 3.3.3: Include chunk count and original filename
  - [ ] 3.3.4: Add rate limiting

---

## Phase X: Fix UI/Backend Memory Sync (Renumbered from original Phase 4)

### Task 4.1: Fix Memory Search Response Format
- **File**: `src/routes/api/memory/search/+server.ts`
- **Subtasks**:
  - [ ] 4.1.1: Audit current response schema
  - [ ] 4.1.2: Ensure `results` array matches UI expectations
  - [ ] 4.1.3: Add `total_count` field for pagination
  - [ ] 4.1.4: Include `tier` in each result
  - [ ] 4.1.5: Add debug logging for empty results
  - [ ] 4.1.6: Write tests for response format

### Task 4.2: Fix Memory Panel Component
- **File**: `src/lib/components/memory/MemoryPanel.svelte`
- **Subtasks**:
  - [ ] 4.2.1: Debug why results show as 0
  - [ ] 4.2.2: Verify API response parsing
  - [ ] 4.2.3: Add error state display
  - [ ] 4.2.4: Add loading state
  - [ ] 4.2.5: Fix result count display

### Task 4.3: Add Memory Event Dispatching
- **File**: `src/lib/stores/memoryUi.ts`
- **Subtasks**:
  - [ ] 4.3.1: Implement `dispatchMemoryEvent()` for real-time updates
  - [ ] 4.3.2: Add event types: `memory_stored`, `memory_updated`, `memory_deleted`
  - [ ] 4.3.3: Connect to UI refresh mechanism
  - [ ] 4.3.4: Write unit tests

---

## Phase 5: Knowledge Graph Visualization Fix

### Task 5.1: Fix Node Name Rendering
- **File**: `src/lib/components/memory/KnowledgeGraph3D.svelte`
- **Subtasks**:
  - [ ] 5.1.1: Debug why node names are empty
  - [ ] 5.1.2: Verify `kg_nodes` collection has `name` field populated
  - [ ] 5.1.3: Fix node label rendering in Three.js
  - [ ] 5.1.4: Add fallback for missing names
  - [ ] 5.1.5: Test with sample data

### Task 5.2: Fix Edge Rendering
- **Subtasks**:
  - [ ] 5.2.1: Verify `kg_edges` collection structure
  - [ ] 5.2.2: Fix edge connection logic
  - [ ] 5.2.3: Add edge labels for relationship types
  - [ ] 5.2.4: Test bidirectional edges

### Task 5.3: Add KG Data Population
- **File**: `src/lib/server/memory/kg/KnowledgeGraphService.ts`
- **Subtasks**:
  - [ ] 5.3.1: Implement entity extraction from memories
  - [ ] 5.3.2: Create node for each unique entity
  - [ ] 5.3.3: Create edges for entity relationships
  - [ ] 5.3.4: Add incremental update on new memories
  - [ ] 5.3.5: Write tests for extraction logic

---

## Phase 6: Trace Panel Deduplication

### Task 6.1: Fix Duplicate Event Emission
- **File**: `src/lib/server/documents/UnifiedDocumentIngestionService.ts`
- **Subtasks**:
  - [ ] 6.1.1: Audit all `emit()` calls for "Document processed"
  - [ ] 6.1.2: Add deduplication flag to prevent double emission
  - [ ] 6.1.3: Use event ID to track already-emitted events
  - [ ] 6.1.4: Write tests to verify single emission

### Task 6.2: Add Trace Event Deduplication
- **File**: `src/lib/stores/traceEvents.ts`
- **Subtasks**:
  - [ ] 6.2.1: Add event deduplication by ID
  - [ ] 6.2.2: Implement sliding window for recent events
  - [ ] 6.2.3: Ignore duplicate events within window
  - [ ] 6.2.4: Write unit tests

---

## Phase 7: Memory Attribution in Responses

### Task 7.1: Implement Attribution Parsing
- **File**: `src/lib/server/textGeneration/mcp/runMcpFlow.ts`
- **Subtasks**:
  - [ ] 7.1.1: Parse `<!-- MEM: 1👍 2👎 -->` comments from LLM output
  - [ ] 7.1.2: Extract memory IDs and feedback signals
  - [ ] 7.1.3: Create `parseAttributions(response)` function
  - [ ] 7.1.4: Write unit tests for parsing

### Task 7.2: Record Attribution Outcomes
- **Subtasks**:
  - [ ] 7.2.1: Call `recordOutcome()` for each attributed memory
  - [ ] 7.2.2: Map 👍 to "worked", 👎 to "failed"
  - [ ] 7.2.3: Handle partial attribution
  - [ ] 7.2.4: Add logging for attribution recording

### Task 7.3: Add Attribution Instruction to Prompt
- **File**: `src/lib/server/textGeneration/mcp/toolPrompt.ts`
- **Subtasks**:
  - [ ] 7.3.1: Add attribution instruction to system prompt
  - [ ] 7.3.2: Explain format: `<!-- MEM: id👍 id👎 -->`
  - [ ] 7.3.3: Make instruction conditional on memory injection
  - [ ] 7.3.4: Test with various LLM responses

---

## Phase 8: Outcome Detection from User Follow-up

### Task 8.1: Implement Follow-up Analyzer
- **File**: `src/lib/server/memory/learning/OutcomeDetectionService.ts`
- **Subtasks**:
  - [ ] 8.1.1: Create service class with dependency injection
  - [ ] 8.1.2: Define outcome detection patterns (positive/negative signals)
  - [ ] 8.1.3: Implement `analyzeFollowUp(userMessage, context)` method
  - [ ] 8.1.4: Detect positive signals: "thanks", "perfect", "that worked"
  - [ ] 8.1.5: Detect negative signals: "that's wrong", "not what I meant", "try again"
  - [ ] 8.1.6: Detect partial signals: "almost", "close but", "also"
  - [ ] 8.1.7: Add Hebrew signal detection (תודה, מעולה, לא נכון, etc.)
  - [ ] 8.1.8: Return confidence score with detected outcome
  - [ ] 8.1.9: Add logging for detection decisions
  - [ ] 8.1.10: Write unit tests for each signal type

### Task 8.2: Integrate with runMcpFlow.ts
- **File**: `src/lib/server/textGeneration/mcp/runMcpFlow.ts`
- **Subtasks**:
  - [ ] 8.2.1: Import `OutcomeDetectionService`
  - [ ] 8.2.2: Analyze user message at start of each turn
  - [ ] 8.2.3: Retrieve memories surfaced in previous turn
  - [ ] 8.2.4: Record outcomes for surfaced memories based on detection
  - [ ] 8.2.5: Add feature flag for outcome detection
  - [ ] 8.2.6: Write integration tests

### Task 8.3: Store Surfaced Memory Context
- **Subtasks**:
  - [ ] 8.3.1: Track which memories were surfaced in each turn
  - [ ] 8.3.2: Store in conversation context for follow-up analysis
  - [ ] 8.3.3: Clear after outcome recorded or timeout
  - [ ] 8.3.4: Add TTL for surfaced memory tracking

---

## Phase 9: Memory Prefetch Optimization

### Task 9.1: Implement Parallel Prefetch
- **File**: `src/lib/server/memory/services/PrefetchServiceImpl.ts`
- **Subtasks**:
  - [ ] 9.1.1: Audit current prefetch implementation
  - [ ] 9.1.2: Implement parallel search across all tiers
  - [ ] 9.1.3: Use `Promise.all()` for concurrent queries
  - [ ] 9.1.4: Add tier-specific result limits
  - [ ] 9.1.5: Implement RRF fusion for cross-tier results
  - [ ] 9.1.6: Add timeout handling for slow tiers
  - [ ] 9.1.7: Measure and log prefetch latency
  - [ ] 9.1.8: Write performance tests

### Task 9.2: Implement Cold-Start Injection
- **File**: `src/lib/server/memory/services/PrefetchServiceImpl.ts`
- **Subtasks**:
  - [ ] 9.2.1: Detect first message in conversation
  - [ ] 9.2.2: Load user profile from `memory_bank` tier
  - [ ] 9.2.3: Inject profile context at conversation start
  - [ ] 9.2.4: Add `is_cold_start` flag to prefetch result
  - [ ] 9.2.5: Write tests for cold-start detection

### Task 9.3: Implement Context Window Management
- **Subtasks**:
  - [ ] 9.3.1: Calculate token budget for memory injection
  - [ ] 9.3.2: Prioritize memories by relevance score
  - [ ] 9.3.3: Truncate low-priority memories if budget exceeded
  - [ ] 9.3.4: Add logging for budget decisions

---

## Phase 10: Working Memory Lifecycle

### Task 10.1: Implement Auto-Expiration
- **File**: `src/lib/server/memory/services/CleanupService.ts`
- **Subtasks**:
  - [ ] 10.1.1: Create cleanup service with scheduled execution
  - [ ] 10.1.2: Query working memories older than TTL (24h default)
  - [ ] 10.1.3: Check promotion eligibility before expiration
  - [ ] 10.1.4: Delete expired non-promoted memories
  - [ ] 10.1.5: Remove from Qdrant index
  - [ ] 10.1.6: Add logging for cleanup decisions
  - [ ] 10.1.7: Implement configurable TTL per tier
  - [ ] 10.1.8: Write tests for expiration logic

### Task 10.2: Implement Promotion Check on Expiration
- **Subtasks**:
  - [ ] 10.2.1: Before deletion, check if memory meets promotion criteria
  - [ ] 10.2.2: Promote eligible memories to history tier
  - [ ] 10.2.3: Log promotion decisions
  - [ ] 10.2.4: Update tier in both MongoDB and Qdrant

### Task 10.3: Add Startup Cleanup
- **File**: `src/lib/server/memory/index.ts`
- **Subtasks**:
  - [ ] 10.3.1: Run cleanup on service initialization
  - [ ] 10.3.2: Process backlog of expired memories
  - [ ] 10.3.3: Add startup logging for cleanup stats

---

## Phase 11: History Tier Management

### Task 11.1: Implement History TTL
- **Subtasks**:
  - [ ] 11.1.1: Add 30-day TTL for history tier
  - [ ] 11.1.2: Query expired history memories
  - [ ] 11.1.3: Check patterns promotion eligibility
  - [ ] 11.1.4: Delete non-promoted expired history

### Task 11.2: Implement History → Patterns Promotion
- **File**: `src/lib/server/memory/learning/PromotionService.ts`
- **Subtasks**:
  - [ ] 11.2.1: Define promotion criteria (score >= 0.9, uses >= 3)
  - [ ] 11.2.2: Add `success_count >= 5` requirement (v0.2.9)
  - [ ] 11.2.3: Implement `promoteToPatterns()` method
  - [ ] 11.2.4: Update tier in MongoDB and Qdrant
  - [ ] 11.2.5: Log promotion with metrics
  - [ ] 11.2.6: Write tests for promotion criteria

### Task 11.3: Implement Counter Reset on History Entry
- **Subtasks**:
  - [ ] 11.3.1: Reset `success_count` to 0 on working → history
  - [ ] 11.3.2: Reset `uses` to 0 on working → history
  - [ ] 11.3.3: Add `promoted_to_history_at` timestamp
  - [ ] 11.3.4: Log reset for debugging

---

## Phase 12: Wilson Score Time Decay

### Task 12.1: Implement Time Weight Calculation
- **File**: `src/lib/server/memory/services/OutcomeServiceImpl.ts`
- **Subtasks**:
  - [ ] 12.1.1: Create `calculateTimeWeight(lastUsed)` function
  - [ ] 12.1.2: Implement decay formula: `1 / (1 + ageDays / 30)`
  - [ ] 12.1.3: Handle null `lastUsed` (return 1.0)
  - [ ] 12.1.4: Add logging for time weight
  - [ ] 12.1.5: Write unit tests for decay curve

### Task 12.2: Apply Time Weight to Score Updates
- **Subtasks**:
  - [ ] 12.2.1: Multiply score delta by time weight
  - [ ] 12.2.2: Update `recordOutcome()` to use time weight
  - [ ] 12.2.3: Log weighted vs unweighted delta
  - [ ] 12.2.4: Write integration tests

### Task 12.3: Add Time Decay to Promotion Criteria
- **Subtasks**:
  - [ ] 12.3.1: Consider recency in promotion decisions
  - [ ] 12.3.2: Prefer recently-used memories for promotion
  - [ ] 12.3.3: Add `last_used_at` to promotion query

---

## Phase 13: Memory-First Decision Logic

### Task 13.1: Implement Contextual Guidance Injection
- **File**: `src/lib/server/textGeneration/mcp/runMcpFlow.ts`
- **Subtasks**:
  - [ ] 13.1.1: Build contextual guidance message from memories
  - [ ] 13.1.2: Add "YOU ALREADY KNOW THIS" section for memory_bank
  - [ ] 13.1.3: Add "Past Experience" section for patterns
  - [ ] 13.1.4: Add "Past Failures to Avoid" section
  - [ ] 13.1.5: Add "Action Outcome Stats" from KG
  - [ ] 13.1.6: Inject guidance before tool prompt
  - [ ] 13.1.7: Write tests for guidance format

### Task 13.2: Implement High-Confidence Skip
- **Subtasks**:
  - [ ] 13.2.1: Define confidence threshold for tool skip
  - [ ] 13.2.2: If memory confidence >= 0.9, suggest no tool needed
  - [ ] 13.2.3: Add hint to prompt: "HIGH CONFIDENCE - answer from memory"
  - [ ] 13.2.4: Track tool skip rate in metrics

### Task 13.3: Implement Action-Effectiveness Stats
- **File**: `src/lib/server/memory/kg/KnowledgeGraphService.ts`
- **Subtasks**:
  - [ ] 13.3.1: Query action_outcomes collection for tool stats
  - [ ] 13.3.2: Calculate success rate per tool per context type
  - [ ] 13.3.3: Format stats for prompt injection
  - [ ] 13.3.4: Update stats on tool execution outcome

---

## Phase 14: Embedding Circuit Breaker Improvements

### Task 14.1: Implement Graceful Degradation
- **File**: `src/lib/server/memory/embedding/DictaEmbeddingClient.ts`
- **Subtasks**:
  - [ ] 14.1.1: Return empty results when circuit open (don't throw)
  - [ ] 14.1.2: Add `isDegraded()` method for UI feedback
  - [ ] 14.1.3: Log degradation state changes
  - [ ] 14.1.4: Implement automatic recovery probe
  - [ ] 14.1.5: Write tests for degraded mode

### Task 14.2: Implement Deferred Indexing Queue
- **File**: `src/lib/server/memory/services/DeferredIndexingService.ts`
- **Subtasks**:
  - [ ] 14.2.1: Create service for deferred indexing
  - [ ] 14.2.2: Queue items that fail embedding
  - [ ] 14.2.3: Retry on circuit breaker close
  - [ ] 14.2.4: Mark items with `needs_reindex: true`
  - [ ] 14.2.5: Implement batch reindex endpoint
  - [ ] 14.2.6: Add queue size metrics
  - [ ] 14.2.7: Write tests for queue processing

### Task 14.3: Add Circuit Breaker Management Endpoint
- **File**: `src/routes/api/memory/ops/circuit-breaker/+server.ts`
- **Subtasks**:
  - [ ] 14.3.1: Create GET endpoint for circuit status
  - [ ] 14.3.2: Create POST endpoint to reset circuit
  - [ ] 14.3.3: Add authentication check
  - [ ] 14.3.4: Return diagnostics info
  - [ ] 14.3.5: Write integration tests

---

## Phase 15: Search Service RRF Fusion Enhancement

### Task 15.1: Implement Proper RRF Weights
- **File**: `src/lib/server/memory/search/SearchService.ts`
- **Subtasks**:
  - [ ] 15.1.1: Audit current RRF implementation
  - [ ] 15.1.2: Add configurable weights for dense vs sparse
  - [ ] 15.1.3: Implement `dense_weight` and `sparse_weight` config
  - [ ] 15.1.4: Apply weights to RRF score calculation
  - [ ] 15.1.5: Add `k` parameter for RRF (default 60)
  - [ ] 15.1.6: Log RRF calculation details
  - [ ] 15.1.7: Write unit tests for RRF math

### Task 15.2: Add BM25 Sparse Search
- **Subtasks**:
  - [ ] 15.2.1: Verify MongoDB text index exists on `content` field
  - [ ] 15.2.2: Implement `sparseSearch()` using MongoDB text search
  - [ ] 15.2.3: Return results with text scores
  - [ ] 15.2.4: Handle Hebrew text search (language: "none")
  - [ ] 15.2.5: Add fallback if text index missing
  - [ ] 15.2.6: Write tests for sparse search

### Task 15.3: Implement Cross-Encoder Reranking
- **Subtasks**:
  - [ ] 15.3.1: Integrate with dicta-retrieval rerank endpoint
  - [ ] 15.3.2: Implement `rerankResults()` method
  - [ ] 15.3.3: Blend CE score with RRF score
  - [ ] 15.3.4: Add configurable CE weight
  - [ ] 15.3.5: Handle CE service failures gracefully
  - [ ] 15.3.6: Add latency logging for rerank step
  - [ ] 15.3.7: Write integration tests

---

## Phase 16: Qdrant Adapter Improvements

### Task 16.1: Implement Batch Operations
- **File**: `src/lib/server/memory/adapters/QdrantAdapter.ts`
- **Subtasks**:
  - [ ] 16.1.1: Implement `batchUpsert(items[])` method
  - [ ] 16.1.2: Use Qdrant batch API for efficiency
  - [ ] 16.1.3: Add configurable batch size (default 100)
  - [ ] 16.1.4: Implement retry logic for failed batches
  - [ ] 16.1.5: Add progress logging for large batches
  - [ ] 16.1.6: Write tests for batch operations

### Task 16.2: Implement Payload Update
- **Subtasks**:
  - [ ] 16.2.1: Implement `updatePayload(id, payload)` method
  - [ ] 16.2.2: Use Qdrant set_payload API
  - [ ] 16.2.3: Support partial payload updates
  - [ ] 16.2.4: Add tier update specifically
  - [ ] 16.2.5: Write tests for payload updates

### Task 16.3: Add Collection Health Check
- **Subtasks**:
  - [ ] 16.3.1: Implement `healthCheck()` method
  - [ ] 16.3.2: Verify collection exists and dimensions match
  - [ ] 16.3.3: Return collection stats
  - [ ] 16.3.4: Integrate with startup validation
  - [ ] 16.3.5: Add to diagnostics endpoint

---

## Phase 17: MongoDB Store Improvements

### Task 17.1: Implement Optimized Queries
- **File**: `src/lib/server/memory/stores/MemoryMongoStore.ts`
- **Subtasks**:
  - [ ] 17.1.1: Add compound indexes for common query patterns
  - [ ] 17.1.2: Index: `{user_id: 1, tier: 1, status: 1}`
  - [ ] 17.1.3: Index: `{memory_id: 1}` (unique)
  - [ ] 17.1.4: Index: `{conversation_id: 1, created_at: -1}`
  - [ ] 17.1.5: Add index creation on startup
  - [ ] 17.1.6: Log slow queries (>100ms)
  - [ ] 17.1.7: Write index verification tests

### Task 17.2: Implement Bulk Operations
- **Subtasks**:
  - [ ] 17.2.1: Implement `bulkStore(items[])` method
  - [ ] 17.2.2: Use MongoDB bulkWrite for efficiency
  - [ ] 17.2.3: Return success/failure counts
  - [ ] 17.2.4: Handle partial failures
  - [ ] 17.2.5: Write tests for bulk store

### Task 17.3: Add Query Timeout Handling
- **Subtasks**:
  - [ ] 17.3.1: Add `maxTimeMS` to all queries
  - [ ] 17.3.2: Implement configurable timeout (default 5000ms)
  - [ ] 17.3.3: Return partial results on timeout
  - [ ] 17.3.4: Log timeout occurrences
  - [ ] 17.3.5: Write timeout handling tests

---

## Phase 18: Prompt Template System

### Task 18.1: Implement Handlebars Templates
- **File**: `src/lib/server/memory/templates/`
- **Subtasks**:
  - [ ] 18.1.1: Create `personality-prompt.hbs` template
  - [ ] 18.1.2: Create `memory-injection.hbs` template
  - [ ] 18.1.3: Create `book-context.hbs` template
  - [ ] 18.1.4: Create `failure-prevention.hbs` template
  - [ ] 18.1.5: Create `organic-recall.hbs` template
  - [ ] 18.1.6: Implement template loading service
  - [ ] 18.1.7: Add Handlebars helper functions
  - [ ] 18.1.8: Write tests for template rendering

### Task 18.2: Integrate Templates with runMcpFlow
- **File**: `src/lib/server/textGeneration/mcp/runMcpFlow.ts`
- **Subtasks**:
  - [ ] 18.2.1: Import template service
  - [ ] 18.2.2: Replace inline prompt strings with templates
  - [ ] 18.2.3: Pass context data to templates
  - [ ] 18.2.4: Handle template rendering errors
  - [ ] 18.2.5: Add template caching
  - [ ] 18.2.6: Write integration tests

### Task 18.3: Add Language-Aware Templates
- **Subtasks**:
  - [ ] 18.3.1: Detect user language preference
  - [ ] 18.3.2: Create Hebrew variants of templates
  - [ ] 18.3.3: Implement template fallback chain
  - [ ] 18.3.4: Add RTL support in template output

---

## Phase 19: Action Outcomes Tracking

### Task 19.1: Implement Action Outcome Recording
- **File**: `src/lib/server/memory/services/ActionOutcomeService.ts`
- **Subtasks**:
  - [ ] 19.1.1: Create service class
  - [ ] 19.1.2: Define `ActionOutcome` interface
  - [ ] 19.1.3: Implement `recordAction(toolName, contextType, outcome)` method
  - [ ] 19.1.4: Store in `action_outcomes` collection
  - [ ] 19.1.5: Calculate running success rate per tool
  - [ ] 19.1.6: Add Wilson score for action effectiveness
  - [ ] 19.1.7: Write unit tests

### Task 19.2: Integrate with Tool Execution
- **File**: `src/lib/server/textGeneration/mcp/toolInvocation.ts`
- **Subtasks**:
  - [ ] 19.2.1: Import `ActionOutcomeService`
  - [ ] 19.2.2: Record outcome after tool execution
  - [ ] 19.2.3: Classify outcome: success, error, timeout, empty
  - [ ] 19.2.4: Include context type from query analysis
  - [ ] 19.2.5: Write integration tests

### Task 19.3: Add Action Stats to Prompt
- **Subtasks**:
  - [ ] 19.3.1: Query action_outcomes for relevant context
  - [ ] 19.3.2: Format stats: "Tool X: 80% success for weather queries"
  - [ ] 19.3.3: Inject into contextual guidance section
  - [ ] 19.3.4: Test with various context types

---

## Phase 20: Known Solutions Cache

### Task 20.1: Implement Solution Caching
- **File**: `src/lib/server/memory/services/KnownSolutionsService.ts`
- **Subtasks**:
  - [ ] 20.1.1: Create service class
  - [ ] 20.1.2: Define `KnownSolution` interface
  - [ ] 20.1.3: Implement `cacheSolution(query, solution, score)` method
  - [ ] 20.1.4: Implement `findSolution(query)` method
  - [ ] 20.1.5: Use semantic similarity for matching
  - [ ] 20.1.6: Set TTL for solutions (default 7 days)
  - [ ] 20.1.7: Store in `known_solutions` collection
  - [ ] 20.1.8: Write unit tests

### Task 20.2: Integrate Solution Lookup
- **File**: `src/lib/server/textGeneration/mcp/runMcpFlow.ts`
- **Subtasks**:
  - [ ] 20.2.1: Check known_solutions before inference
  - [ ] 20.2.2: Return cached solution if score >= threshold
  - [ ] 20.2.3: Add cache hit metrics
  - [ ] 20.2.4: Log cache decisions
  - [ ] 20.2.5: Write integration tests

### Task 20.3: Implement Solution Promotion
- **Subtasks**:
  - [ ] 20.3.1: Promote high-score responses to known_solutions
  - [ ] 20.3.2: Define promotion criteria (score >= 0.95)
  - [ ] 20.3.3: Deduplicate similar solutions
  - [ ] 20.3.4: Add manual curation endpoint

---

## Phase 21: Memory System Observability

### Task 21.1: Implement Comprehensive Logging
- **File**: `src/lib/server/memory/observability/MemoryLogger.ts`
- **Subtasks**:
  - [ ] 21.1.1: Create structured logging wrapper
  - [ ] 21.1.2: Define log levels: debug, info, warn, error
  - [ ] 21.1.3: Add correlation ID to all logs
  - [ ] 21.1.4: Include memory_id, tier, operation in logs
  - [ ] 21.1.5: Add latency logging for all operations
  - [ ] 21.1.6: Implement log sampling for high-volume ops

### Task 21.2: Implement Metrics Collection
- **File**: `src/lib/server/memory/observability/MemoryMetrics.ts`
- **Subtasks**:
  - [ ] 21.2.1: Define key metrics: search_latency, store_latency, hit_rate
  - [ ] 21.2.2: Implement counter for operations by tier
  - [ ] 21.2.3: Implement histogram for latencies
  - [ ] 21.2.4: Add circuit breaker state metric
  - [ ] 21.2.5: Add queue depth metrics
  - [ ] 21.2.6: Expose metrics endpoint

### Task 21.3: Implement Health Check Endpoint
- **File**: `src/routes/api/memory/health/+server.ts`
- **Subtasks**:
  - [ ] 21.3.1: Create GET endpoint for health status
  - [ ] 21.3.2: Check MongoDB connectivity
  - [ ] 21.3.3: Check Qdrant connectivity
  - [ ] 21.3.4: Check embedding service status
  - [ ] 21.3.5: Check reranking service status
  - [ ] 21.3.6: Return aggregated health status
  - [ ] 21.3.7: Add to container health check

### Task 21.4: Implement Diagnostics Endpoint
- **File**: `src/routes/api/memory/diagnostics/+server.ts`
- **Subtasks**:
  - [ ] 21.4.1: Create GET endpoint for diagnostics
  - [ ] 21.4.2: Return collection counts by tier
  - [ ] 21.4.3: Return Qdrant collection stats
  - [ ] 21.4.4: Return circuit breaker states
  - [ ] 21.4.5: Return deferred indexing queue size
  - [ ] 21.4.6: Include embedding dimension config
  - [ ] 21.4.7: Add authentication requirement
  - [ ] 21.4.8: Write integration tests

---

## Phase 22: RoamPal v0.2.9 Natural Selection Enhancements ✅ COMPLETED

> **Completed:** January 14, 2026
> **Files Modified:** SearchService.ts, PromotionService.ts, PrefetchServiceImpl.ts, runMcpFlow.ts
> **Risk Mitigation Verified:** Cold-start protection (uses >= 3), counter reset on promotion

### Task 22.1: Remove Archive-on-Update ✅ ALREADY CLEAN
- **File**: `src/lib/server/memory/stores/MemoryMongoStore.ts`
- **Status**: The `update()` method already performs clean in-place updates without archive creation
- **Subtasks**:
  - [x] 22.1.1: Verified `update()` method does not create archives
  - [x] 22.1.2-22.1.7: Not needed - no archive logic exists

### Task 22.2: Wilson Scoring for memory_bank Tier ✅
- **File**: `src/lib/server/memory/search/SearchService.ts`
- **Subtasks**:
  - [x] 22.2.1: Added `applyWilsonBlend()` method after Step 4 (reranking)
  - [x] 22.2.2: Checks `tier === "memory_bank"`
  - [x] 22.2.3: Cold-start protection: `WILSON_COLD_START_USES = 3`
  - [x] 22.2.4: 80/20 blend: `WILSON_BLEND_WEIGHTS = { quality: 0.8, wilson: 0.2 }`
  - [x] 22.2.5: `uses` and `wilson_score` already in CandidateResult
  - [x] 22.2.6: Logging added for blend application
  - [ ] 22.2.7: Tests deferred (integration testing)

### Task 22.3: Unknown Outcome Creates Weak Negative Signal ✅ DONE IN PHASE 23
- **Status**: Already implemented in Phase 23 via `OUTCOME_SUCCESS_VALUES`
- **Subtasks**:
  - [x] 22.3.1-22.3.10: All completed in Phase 23 with `unknown = 0.25`

### Task 22.4: Stricter History → Patterns Promotion ✅
- **File**: `src/lib/server/memory/learning/PromotionService.ts`
- **Subtasks**:
  - [x] 22.4.1: Modified `promoteMemory()` to check fromTier
  - [x] 22.4.2: Added `resetPromotionCounters()` for `success_count = 0`
  - [x] 22.4.3: Resets `uses = 0` on working → history
  - [x] 22.4.4: Added `promoted_to_history_at` timestamp
  - [x] 22.4.5: Modified `findPromotionCandidates()` with toTier parameter
  - [x] 22.4.6: Added `MIN_SUCCESS_COUNT_FOR_PATTERNS = 5` check
  - [x] 22.4.7: Updated PROMOTION_RULES with Phase 22.4 comments
  - [x] 22.4.8: Logging added for eligibility checks
  - [ ] 22.4.9-22.4.10: Tests deferred (integration testing)

### Task 22.5: Add uses/success_count Fields to memory_bank Items ✅ ALREADY DONE
- **Status**: `store()` method already initializes all fields correctly
- **Subtasks**:
  - [x] 22.5.1: Verified `uses: 0` initialization
  - [x] 22.5.2: Verified `success_count: 0` initialization
  - [x] 22.5.3: Verified `wilson_score: 0.5` initialization
  - [x] 22.5.4-22.5.5: Field validation via TypeScript types

### Task 22.6: Filter Empty Memories from Context ✅
- **File**: `src/lib/server/memory/services/PrefetchServiceImpl.ts`
- **Subtasks**:
  - [x] 22.6.1: Added `isEmptyContent()` helper method
  - [x] 22.6.2: Checks content for null/undefined/whitespace
  - [x] 22.6.3: Filters whitespace-only memories
  - [x] 22.6.4: Added `MAX_CONTEXT_MEMORIES = 3` limit
  - [x] 22.6.5: Logging added for filtered count
  - [ ] 22.6.6: Tests deferred (integration testing)

### Task 22.7: Skip Empty Exchange Storage ✅
- **File**: `src/lib/server/textGeneration/mcp/runMcpFlow.ts`
- **Subtasks**:
  - [x] 22.7.1: Located `storeWorkingMemory()` call
  - [x] 22.7.2: Added userQuery validation (>10 chars)
  - [x] 22.7.3: Added assistantResponse validation (>50 chars)
  - [x] 22.7.4: Added `shouldStoreExchange` boolean guard
  - [x] 22.7.5: Logging added for skipped exchanges
  - [ ] 22.7.6: Tests deferred (integration testing)

### Task 22.8: Cross-Encoder Reranking with Wilson Blend ✅
- **File**: `src/lib/server/memory/search/SearchService.ts`
- **Subtasks**:
  - [x] 22.8.1: Located `rerank()` method
  - [x] 22.8.2: Added Wilson quality boost for memory_bank in CE blend
  - [x] 22.8.3: Uses same `WILSON_COLD_START_USES = 3` constant
  - [x] 22.8.4: Quality boost formula: `1 + wilson * 0.2`
  - [x] 22.8.5: Applied to finalScore after CE blend
  - [x] 22.8.6: Logging added for boost calculation
  - [ ] 22.8.7: Tests deferred (integration testing)

### Implementation Log
- **2026-01-14**: Phase 22 implemented
  - Added Wilson blending for memory_bank tier (80/20 quality/wilson)
  - Cold-start protection: requires uses >= 3 before Wilson affects ranking
  - Stricter promotion: history→patterns requires success_count >= 5
  - Counter reset on working→history creates probation period
  - Empty memory filtering: whitespace-only memories excluded from context
  - Context limit: max 3 memories displayed (matches RoamPal)
  - Empty exchange storage skip: requires >10 char query AND >50 char response

---

## Phase 23: RoamPal v0.2.8 Critical Bug Fixes (Safeguards) ✅ COMPLETED

> **Completed:** January 14, 2026
> **Risk Mitigation Verified:** All 24 unit tests passing
> **Files Modified:** MemoryMongoStore.ts, schemas.ts, types.ts

### Task 23.1: Explicit Outcome Type Handling (v0.2.8.1 Hotfix) ✅
- **File**: `src/lib/server/memory/stores/MemoryMongoStore.ts`
- **Subtasks**:
  - [x] 23.1.1: Define `ValidOutcome` type: `"worked" | "failed" | "partial" | "unknown"`
  - [x] 23.1.2: Create `VALID_OUTCOMES` array for validation
  - [x] 23.1.3: Add validation check at start of `recordOutcome()` via `isValidOutcome()`
  - [x] 23.1.4: Return false and log warning for invalid outcomes
  - [x] 23.1.5: Implement `getSuccessDelta()` with explicit switch statement
  - [x] 23.1.6: (Merged with 23.1.5) `OUTCOME_SUCCESS_VALUES` constant defined
  - [x] 23.1.7: NO default case (TypeScript exhaustiveness checking with `never`)
  - [x] 23.1.8: Log processing with explicit outcome handling (debug + info logs)
  - [x] 23.1.9: Write test: invalid outcome returns false (via isValidOutcome tests)
  - [x] 23.1.10: Write test: unknown gets 0.25 success (not 0.5)
  - [x] 23.1.11: Write test: partial gets 0.5 success
  - [x] 23.1.12: Write test: switch has no default case (TypeScript exhaustiveness)

### Task 23.2: Wilson Score 10-Use Cap Fix ✅
- **File**: `src/lib/server/memory/stores/MemoryMongoStore.ts`
- **Subtasks**:
  - [x] 23.2.1: Create `calculateWilsonFromStats()` function
  - [x] 23.2.2: Use `success_count` field (NOT `outcome_history`)
  - [x] 23.2.3: Add backward compatibility for missing `success_count`
  - [x] 23.2.4: Fallback: calculate from `worked_count`, `partial_count`, `unknown_count`
  - [x] 23.2.5: Log warning when using fallback calculation
  - [ ] 23.2.6: Create migration script for existing records (DEFERRED - not critical for new records)
  - [x] 23.2.7: Write test: 50 uses, 45 worked → Wilson ~0.78-0.80 (lower CI bound)
  - [x] 23.2.8: Write test: fallback calculation behavior verified
  - [ ] 23.2.9: Write test: migration backfills success_count (DEFERRED with 23.2.6)

### Task 23.3: Failed Outcomes Must Increment Uses ✅
- **File**: `src/lib/server/memory/stores/MemoryMongoStore.ts`
- **Subtasks**:
  - [x] 23.3.1: Verify `$inc: { "stats.uses": 1 }` via aggregation pipeline (always executes)
  - [x] 23.3.2: Ensure failed outcome increments uses
  - [x] 23.3.3: Ensure failed outcome increments `failed_count`
  - [x] 23.3.4: Ensure failed outcome adds 0 to `success_count`
  - [x] 23.3.5: Write test: failed increments uses by 1
  - [x] 23.3.6: Write test: failed increments failed_count by 1
  - [x] 23.3.7: Write test: failed adds 0 to success_count
  - [x] 23.3.8: Write test: 10 failures → Wilson ~0.0

### Task 23.4: Outcome Recording Atomicity ✅
- **File**: `src/lib/server/memory/stores/MemoryMongoStore.ts`
- **Subtasks**:
  - [x] 23.4.1: Review current two-step update pattern
  - [x] 23.4.2: Option A: Use MongoDB aggregation pipeline for atomic update ✅ CHOSEN
  - [ ] 23.4.3: Option B: Add optimistic locking (not needed - using aggregation pipeline)
  - [x] 23.4.4: Implement Wilson calculation within same operation
  - [x] 23.4.5: Handle concurrent update conflicts (aggregation pipeline is atomic)
  - [x] 23.4.6: Log atomicity decisions (debug logs added)
  - [ ] 23.4.7: Write test: concurrent outcomes (DEFERRED - requires integration test)
  - [ ] 23.4.8: Write test: 10 parallel outcomes = uses=10 (DEFERRED - requires integration test)

### Implementation Log
- **2026-01-14**: Phase 23 implemented
  - Added `VALID_OUTCOMES` constant and `isValidOutcome()` function
  - Added `OUTCOME_SUCCESS_VALUES` with authoritative semantics (worked=1.0, partial=0.5, unknown=0.25, failed=0.0)
  - Added `getSuccessDelta()` with explicit switch and TypeScript exhaustiveness check
  - Added `calculateWilsonFromStats()` with backward compatibility
  - Refactored `recordOutcome()` to use MongoDB aggregation pipeline for atomic updates
  - Added `success_count` field to stats schema (MemoryItemDocument, MemoryStats)
  - Created comprehensive test suite: `phase23-outcome-safeguards.test.ts` (24 tests, all passing)

---

## Phase 24: DictaLM Response Integrity

### Task 24.1: Enable Raw Stream Logging
- **File**: `src/lib/server/textGeneration/mcp/runMcpFlow.ts`
- **Subtasks**:
  - [ ] 24.1.1: Add TRACE level logging for raw stream chunks
  - [ ] 24.1.2: Log chunk content before parsing
  - [ ] 24.1.3: Add correlation ID to stream logs
  - [ ] 24.1.4: Implement log sampling for high-volume streams

### Task 24.2: Harden System Prompt
- **File**: `src/lib/server/textGeneration/utils/toolPrompt.ts`
- **Subtasks**:
  - [ ] 24.2.1: Add explicit `<think>` tag requirement
  - [ ] 24.2.2: Add `</think>` closing tag requirement
  - [ ] 24.2.3: Add "no markdown code blocks" constraint for tool_call
  - [ ] 24.2.4: Test with various DictaLM outputs

### Task 24.3: Robust Tag Recovery
- **File**: `src/lib/server/textGeneration/utils/xmlUtils.ts`
- **Subtasks**:
  - [ ] 24.3.1: Implement `repairXmlStream()` function
  - [ ] 24.3.2: Auto-close unclosed `<think>` tags
  - [ ] 24.3.3: Strip markdown code blocks from tool calls
  - [ ] 24.3.4: Handle nested/malformed XML gracefully
  - [ ] 24.3.5: Write unit tests for repair logic

---

## Phase 25: DataGov Knowledge Pre-Ingestion (NEW)

> **Strategic Goal:** Pre-load all Israeli government data knowledge (1,190 schemas, 22 semantic domains, ~9,500 terms) at application startup so the assistant "knows" what data exists before being asked.

### Task 25.1: Create DataGov Ingestion Service
- **File**: `src/lib/server/memory/datagov/DataGovIngestionService.ts`
- **Subtasks**:
  - [ ] 25.1.1: Create service class with dependency injection
  - [ ] 25.1.2: Define `DataGovIngestionResult` interface
  - [ ] 25.1.3: Implement `ingestAll(force)` main method
  - [ ] 25.1.4: Add singleton pattern with `getInstance()`
  - [ ] 25.1.5: Add `ingestionComplete` flag to prevent re-runs
  - [ ] 25.1.6: Implement error aggregation in result object
  - [ ] 25.1.7: Add progress logging with batch counts
  - [ ] 25.1.8: Write unit tests for service initialization

### Task 25.2: Define DataGov Memory Types
- **File**: `src/lib/server/memory/types/DataGovTypes.ts`
- **Subtasks**:
  - [ ] 25.2.1: Define `DataGovMemoryItem` interface
  - [ ] 25.2.2: Add `tier: "datagov_schema" | "datagov_expansion"` support
  - [ ] 25.2.3: Define `source.type: "datagov"` structure
  - [ ] 25.2.4: Define `schema_meta` with title_he, format, fields
  - [ ] 25.2.5: Define `expansion_meta` with domain, terms_he, terms_en
  - [ ] 25.2.6: Export CATEGORY_HEBREW_NAMES mapping
  - [ ] 25.2.7: Write type validation tests

### Task 25.3: Implement Category Ingestion
- **File**: `src/lib/server/memory/datagov/DataGovIngestionService.ts`
- **Subtasks**:
  - [ ] 25.3.1: Implement `loadCategoryIndex()` from `_category_index.json`
  - [ ] 25.3.2: Implement `ingestCategories()` method
  - [ ] 25.3.3: Create `buildCategoryDescription()` bilingual content
  - [ ] 25.3.4: Store with `tier: "datagov_schema"` and `tags: ["category"]`
  - [ ] 25.3.5: Set `importance: 0.9` for category items
  - [ ] 25.3.6: Increment `result.categories` counter
  - [ ] 25.3.7: Write tests for category ingestion

### Task 25.4: Implement Schema Ingestion (Batch)
- **File**: `src/lib/server/memory/datagov/DataGovIngestionService.ts`
- **Subtasks**:
  - [ ] 25.4.1: Implement `loadResourceIndex()` from `_index.json`
  - [ ] 25.4.2: Implement `ingestDatasetSchemas()` with BATCH_SIZE=50
  - [ ] 25.4.3: Create `buildResourceDescription()` bilingual content
  - [ ] 25.4.4: Map resource fields to `schema_meta` structure
  - [ ] 25.4.5: Handle field availability (has_phone, has_address, has_date)
  - [ ] 25.4.6: Store with `tier: "datagov_schema"` and category tag
  - [ ] 25.4.7: Set `importance: 0.7` for dataset items
  - [ ] 25.4.8: Add try-catch per item with error aggregation
  - [ ] 25.4.9: Log progress every batch
  - [ ] 25.4.10: Write tests for batch processing

### Task 25.5: Implement Semantic Expansion Ingestion
- **File**: `src/lib/server/memory/datagov/DataGovIngestionService.ts`
- **Subtasks**:
  - [ ] 25.5.1: Create JSON export from `enterprise_expansions.py`
  - [ ] 25.5.2: Implement `loadSemanticExpansions()` loader
  - [ ] 25.5.3: Implement `ingestSemanticExpansions()` method
  - [ ] 25.5.4: Create `buildExpansionDescription()` content
  - [ ] 25.5.5: Extract Hebrew terms with `extractHebrewTerms()`
  - [ ] 25.5.6: Extract English terms with `extractEnglishTerms()`
  - [ ] 25.5.7: Map domain to category with `domainToCategory()`
  - [ ] 25.5.8: Store with `tier: "datagov_expansion"` and domain tag
  - [ ] 25.5.9: Set `importance: 0.85` for expansion items
  - [ ] 25.5.10: Write tests for 22 domains

### Task 25.6: Create Knowledge Graph Structure
- **File**: `src/lib/server/memory/datagov/DataGovIngestionService.ts`
- **Subtasks**:
  - [ ] 25.6.1: Implement `createKnowledgeGraphStructure()` method
  - [ ] 25.6.2: Create "DataGov Israel" root node with metadata
  - [ ] 25.6.3: Create 21 category nodes with Hebrew labels
  - [ ] 25.6.4: Create HAS_CATEGORY edges (root → category)
  - [ ] 25.6.5: Implement `groupByCategory()` for resources
  - [ ] 25.6.6: Create sample dataset nodes (5 per category)
  - [ ] 25.6.7: Create CONTAINS_DATASET edges (category → dataset)
  - [ ] 25.6.8: Increment `result.kgNodes` and `result.kgEdges`
  - [ ] 25.6.9: Write tests for KG structure creation

### Task 25.7: Integrate with Application Startup
- **File**: `src/lib/server/memory/index.ts`
- **Subtasks**:
  - [ ] 25.7.1: Import `DataGovIngestionService`
  - [ ] 25.7.2: Check `DATAGOV_PRELOAD_ENABLED` env var
  - [ ] 25.7.3: Call `datagovService.ingestAll()` in `initializeMemorySystem()`
  - [ ] 25.7.4: Log ingestion result summary
  - [ ] 25.7.5: Handle errors gracefully (continue without DataGov)
  - [ ] 25.7.6: Add to ServiceFactory for DI
  - [ ] 25.7.7: Write integration tests

### Task 25.8: Add Memory Panel DataGov Filter
- **File**: `src/lib/components/memory/MemoryPanel.svelte`
- **Subtasks**:
  - [ ] 25.8.1: Define `DATAGOV_CATEGORIES` array with Hebrew labels
  - [ ] 25.8.2: Add `selectedCategories` state variable
  - [ ] 25.8.3: Create category filter UI component
  - [ ] 25.8.4: Implement `searchWithDataGovFilter()` function
  - [ ] 25.8.5: Add `source.category` filter to search params
  - [ ] 25.8.6: Display DataGov items with category badges
  - [ ] 25.8.7: Add "DataGov" tier checkbox
  - [ ] 25.8.8: Write tests for filter UI

### Task 25.9: Wire to Hebrew Intent Detection
- **File**: `src/lib/server/textGeneration/mcp/toolFilter.ts`
- **Subtasks**:
  - [ ] 25.9.1: Define `DATAGOV_INTENT_PATTERNS` regex array
  - [ ] 25.9.2: Add Hebrew patterns: "מאגרי מידע ממשלתי", "נתונים ציבוריים"
  - [ ] 25.9.3: Add category-specific patterns: "מידע על תחבורה"
  - [ ] 25.9.4: Implement `detectDataGovIntent()` function
  - [ ] 25.9.5: Return `suggestMemoryFirst: true` for DataGov queries
  - [ ] 25.9.6: Integrate with `filterToolsForQuery()` flow
  - [ ] 25.9.7: Log DataGov intent detection
  - [ ] 25.9.8: Write tests for Hebrew patterns

### Task 25.10: Add Environment Configuration
- **File**: `.env` and `src/lib/server/memory/memory_config.ts`
- **Subtasks**:
  - [ ] 25.10.1: Add `DATAGOV_PRELOAD_ENABLED=true` env var
  - [ ] 25.10.2: Add `DATAGOV_SCHEMAS_PATH=/datagov/schemas` env var
  - [ ] 25.10.3: Add `DATAGOV_KG_SAMPLE_SIZE=5` env var
  - [ ] 25.10.4: Add `DATAGOV_BATCH_SIZE=50` env var
  - [ ] 25.10.5: Update memory_config.ts with DataGov section
  - [ ] 25.10.6: Add to Docker Compose environment
  - [ ] 25.10.7: Document env vars in AGENTS.md

### Task 25.11: Update Memory Search for DataGov Tiers
- **File**: `src/lib/server/memory/search/SearchService.ts`
- **Subtasks**:
  - [ ] 25.11.1: Add "datagov_schema" to valid tier list
  - [ ] 25.11.2: Add "datagov_expansion" to valid tier list
  - [ ] 25.11.3: Include DataGov tiers in default search
  - [ ] 25.11.4: Apply category filter from search params
  - [ ] 25.11.5: Boost DataGov results for DataGov intent queries
  - [ ] 25.11.6: Write tests for tier filtering

### Task 25.12: Create Expansions JSON Export Script
- **File**: `datagov/export_expansions.py`
- **Subtasks**:
  - [ ] 25.12.1: Create Python script to export expansions to JSON
  - [ ] 25.12.2: Combine all 22 domain dictionaries
  - [ ] 25.12.3: Output to `enterprise_expansions.json`
  - [ ] 25.12.4: Add to build process or run manually
  - [ ] 25.12.5: Verify output format matches TypeScript loader

---

## Implementation Summary

### Total Task Count by Phase

| Phase | Description | Tasks | Subtasks | Status |
|-------|-------------|-------|----------|--------|
| K | **Kimi Enterprise Requirements** | 9 | 53 | **NEW - Cross-cutting** |
| 1 | Consolidate Memory Collections | 4 | 34 | Pending |
| 2 | Tool Result Memory Ingestion (+16) | 3 | 20 | Pending |
| 3 | Document Hash Deduplication + Tool Gating | 3 | 17 | Pending |
| 4 | Fix UI/Backend Memory Sync | 3 | 15 | Pending |
| 5 | Knowledge Graph Visualization Fix (+20) | 3 | 14 | Pending |
| 6 | Trace Panel Deduplication | 2 | 8 | Pending |
| 7 | Memory Attribution in Responses | 3 | 12 | Pending |
| 8 | Outcome Detection + UI Updates (+17) | 3 | 17 | Pending |
| 9 | Memory Prefetch Optimization | 3 | 17 | Pending |
| 10 | Working Memory Lifecycle | 3 | 14 | Pending |
| 11 | History Tier Management | 3 | 12 | Pending |
| 12 | Wilson Score Time Decay | 3 | 12 | Pending |
| 13 | ~~Memory-First Decision Logic~~ | - | - | **CONSOLIDATED → Phase 3** |
| 14 | Embedding Circuit Breaker Improvements | 3 | 17 | Pending |
| 15 | Search Service RRF Fusion Enhancement | 3 | 18 | Pending |
| 16 | ~~Qdrant Adapter Improvements~~ | - | - | **CONSOLIDATED → Phase 2** |
| 17 | ~~MongoDB Store Improvements~~ | - | - | **CONSOLIDATED → Phase 8** |
| 18 | Prompt Template System | 3 | 18 | Pending |
| 19 | Action Outcomes Tracking | 3 | 14 | Pending |
| 20 | ~~Known Solutions Cache~~ | - | - | **CONSOLIDATED → Phase 5** |
| 21 | Memory System Observability | 4 | 22 | Pending |
| 22 | RoamPal v0.2.9 Natural Selection | 8 | 52 | **Priority 2** |
| 23 | RoamPal v0.2.8 Bug Fixes | 4 | 30 | **Priority 1 (FIRST)** |
| 24 | DictaLM Response Integrity | 3 | 14 | Pending |
| 25 | DataGov Knowledge Pre-Ingestion | 12 | 67 | Pending (Tier 7) |
| **TOTAL (Canonical)** | | **82** | **480** | |

### Kimi Requirements Summary

| Kimi Task | Related Phase | Subtasks | Description |
|-----------|---------------|----------|-------------|
| K.1 | Phase 3 | 12 | Enforceable Tool Gating Decision Function |
| K.2 | Phase 2, 25 | 8 | Async Ingestion Protocol |
| K.3 | Phase 23 | 8 | Authoritative Outcome Semantics |
| K.4 | Pre-work | 6 | Performance Baselines |
| K.5 | Phase 24 | 7 | Raw Stream Debugging Protocol |
| K.6 | Phase 24 | 6 | Phase 24 Format Alignment (JSON not XML) |
| K.7 | Phase 25 | 8 | DataGov Controls |
| K.8 | Documentation | 4 | Multi-Instance Readiness |
| K.9 | All | 5 | Security Hardening |

### Phase Consolidation Summary

| Canonical Phase | Merged From | Effective Tasks |
|-----------------|-------------|-----------------|
| Phase 2 | Phase 2 + Phase 16 | Tool Ingestion + Qdrant Improvements |
| Phase 3 | Phase 3 + Phase 13 | Document Dedup + Memory-First Gating |
| Phase 5 | Phase 5 + Phase 20 | KG Visualization + Known Solutions |
| Phase 8 | Phase 8 + Phase 17 | Outcome Detection + MongoDB Improvements + UI Updates |

---

## 🔗 Orchestration Integration Tasks (NEW - January 14, 2026)

> **CRITICAL DISCOVERY:** The codebase contains 30+ smart orchestration methods that the memory system is NOT using. These exist but are NEVER CALLED:

### Orchestration Wiring Checklist (ADD to every Phase)

| Phase | Function to Wire | File | Status |
|-------|------------------|------|--------|
| 2 | `getToolIntelligence()` | toolIntelligenceRegistry.ts | [ ] Pending |
| 2 | `getToolLabel()` | toolInvocation.ts | [ ] Pending |
| 3 | `shouldAllowTool()` | memoryIntegration.ts | [ ] **IMPORTED BUT NOT CALLED** |
| 3 | `extractExplicitToolRequest()` | memoryIntegration.ts | [ ] Pending |
| 3 | `detectHebrewIntent()` | hebrewIntentDetector.ts | [ ] Pending |
| 12 | `recordToolActionsInBatch()` | memoryIntegration.ts | [ ] Pending |
| 13 | `getContextualGuidance()` | memoryIntegration.ts | [ ] **DEFINED BUT NOT CALLED** |
| 13 | `getToolGuidance()` | memoryIntegration.ts | [ ] **DEFINED BUT NOT CALLED** |
| 14 | `isFirstMessage()` | memoryIntegration.ts | [ ] **DEFINED BUT NOT CALLED** |
| 14 | `getColdStartContextForConversation()` | memoryIntegration.ts | [ ] **DEFINED BUT NOT CALLED** |
| 15 | `getAttributionInstruction()` | memoryIntegration.ts | [ ] **IMPORTED BUT NOT INJECTED** |
| 15 | `processResponseWithAttribution()` | memoryIntegration.ts | [ ] **IMPORTED BUT NOT CALLED** |
| ALL | `toGracefulError()` patterns | toolInvocation.ts | [ ] Memory errors need Hebrew |

### Reference: Smart Orchestration Methods Available

| Layer | Feature | File | Description |
|-------|---------|------|-------------|
| Selection | Hebrew Intent Detection | hebrewIntentDetector.ts | 3,972 bidirectional terms |
| Selection | Best-in-Class Selection | toolFilter.ts | `TOOL_PRIORITIES` scoring |
| Preparation | Parameter Normalization | toolParameterRegistry.ts | Auto-fix model mistakes |
| Execution | Cascade Fallback | toolIntelligenceRegistry.ts | Try alternatives before fail |
| Execution | Smart Timeouts | toolIntelligenceRegistry.ts | 5min research, 1min quick |
| Response | Graceful Hebrew Errors | toolInvocation.ts | Actionable guidance |
| Response | Capability Awareness | toolIntelligenceRegistry.ts | Model can describe tools |

---

## Risk Assessment Summary

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Corrupt stats → bad learning | **High** | Medium | Phase 23 FIRST |
| Tool gating blocks needed tools | Medium | Medium | Explicit override detection |
| Tool ingestion bloats storage | **High** | **High** | Dedup by hash; async embedding |
| DataGov slows startup | **High** | Medium | Background/resumable; feature flag |

---

## Definition of Ready (Per Phase)

- [ ] Phase dependencies are complete
- [ ] Test fixtures defined
- [ ] Success criteria measurable
- [ ] Orchestration integration points identified

## Definition of Done (Per Phase)

- [ ] Success criteria met with evidence
- [ ] Unit tests passing (>80% coverage for new code)
- [ ] Integration tests for data-path changes
- [ ] Hebrew support verified
- [ ] Orchestration functions wired (not just imported)
- [ ] **Async ingestion pattern followed** (no sync embedding on user path) - KIMI
- [ ] **Tool gating enforced at runtime** (not just prompt guidance) - KIMI
- [ ] **Performance baselines compared** (no P95 regression >10%) - KIMI

---

## Pre-Implementation Checklist (KIMI REQUIREMENT)

Before starting ANY phase implementation:

- [ ] **K.4 Complete:** Performance baselines captured and documented
- [ ] **Phase 23 Complete:** Safeguards in place (if implementing Phase 22+)
- [ ] **Test fixtures defined:** Mock data, expected outcomes documented
- [ ] **Security review scheduled:** For any phase adding endpoints or storage

---

*Document Version: 2.1 (GPT-5.2 + Kimi Enterprise Requirements)*
*Updated: January 14, 2026*
*Orchestration Integration Discovery: 18 functions need wiring*
*Phase Consolidation: 4 duplicate pairs merged*
*Kimi Enterprise Requirements: 9 task groups, 53 subtasks*
*Canonical Phases: 21 (after consolidation) + Kimi cross-cutting*
*DataGov Pre-Ingestion: 1,190 schemas, 22 domains, ~9,500 terms*
*See `codespace_gaps_enhanced.md` v3.6 for full details*
