# Consolidated Pending Tasks (codespace_pending.md)

**Generated:** 2026-01-15
**Source:** `codespace_progress.md` (Status) + `codespace_gaps.md` (Original Gaps)
**Strategic Reference:** `codespace_gpt52.md` & `codespace_gemini.md`
**Execution Strategy:** Sorted by **Dependency & Criticality**. Execute from Top to Bottom.

---

## 🟥 Tier 1: System Stability & Core Architecture (Blockers)
> **Why First?** Prevents data corruption (Race Conditions) and establishes the code structure (Interfaces/Factory) needed for all subsequent features.

### Phase 10 (Original): Race Condition Prevention
> **Strategic Goal:** Implement robust concurrency control mimicking RoamPal's `asyncio.Lock` to ensure Knowledge Graph integrity.
> **Enterprise Evaluation:**
> - **Resilience:** Critical. Prevents graph corruption under concurrent write loads.
> - **Testing:** Integration tests must simulate concurrent `flush()` calls to verify strict serialization.

- [x] **10.1**: Install `async-mutex` (if not installed).
- [x] **10.2**: Modify `KgWriteBuffer.ts`.
  - File: `src/lib/server/memory/kg/KgWriteBuffer.ts`
  - **Modify**: Add `Mutex` property.
  - **Modify**: Wrap `flush` operations in `mutex.runExclusive()`.

### Phase 9 (Architecture): Interface Contracts & Dependency Injection
> **Strategic Goal:** Decouple services using Facade/Factory pattern to enable easier testing and future-proofing.
> **Enterprise Evaluation:**
> - **Maintainability:** High. Allows mocking services for unit tests and swapping implementations without refactoring consumers.
> - **Testing:** Unit tests should verify that the Factory returns the correct singleton instances.

- [x] **9.1**: Create `ISearchService.ts`.
  - **Create**: `src/lib/server/memory/interfaces/ISearchService.ts` (File does not exist).
  - Define `search(params)` and `healthCheck()`.
- [x] **9.2**: Create `ServiceFactory.ts`.
  - **Create**: `src/lib/server/memory/ServiceFactory.ts` (File does not exist).
  - Implement singleton/factory pattern for `SearchService`, `StoreService`, etc.
- [x] **9.3**: Modify `SearchServiceImpl.ts`.
  - File: `src/lib/server/memory/services/SearchServiceImpl.ts`
  - **Modify**: Update class to implement the new `ISearchService` interface.
- [x] **9.4**: Refactor Consumers.
  - **Modify**: Replace `new SearchServiceImpl()` with `ServiceFactory.getSearchService()`.

#### Tier 1 Log
- 2026-01-15 04:30: Added async-mutex + serialized KgWriteBuffer.flush() with snapshot swap; added concurrency/unit tests; introduced ISearchService + ServiceFactory; refactored hooks + search-service tests. Risk mitigation verified: flush serialization + no delta loss under concurrent flush/enqueue.

#### Tooling / Lint Fix Log
- 2026-01-15: Fixed TypeScript typing issues in `frontend-huggingface/src/lib/components/memory/KnowledgeGraph3D.svelte` (aligned 3d-force-graph node/link types, typed `cameraPosition()` getter/setter overloads). Verified with `npm run check` + `npm run lint`.

---

## 🟧 Tier 2: Model Reliability & Protocol (KIMI Mandatory)
> **Why Second?** Ensures the model's output is parsed correctly (Reasoning) and ingestion doesn't hang the chat (Async).

### K.6: Phase 24 Format Alignment
> **Strategic Goal:** Ensure robust handling of "Thinking" models by repairing malformed streams on the fly.
> **Enterprise Evaluation:**
> - **Resilience:** High. The system must never crash due to a model hallucinating an invalid XML tag.
> - **Testing:** Unit tests must cover edge cases: unclosed tags, interleaved JSON/Markdown, and empty streams.

- [x] **K.6.1**: Confirm parsing targets JSON `"tool_calls": [...]` format.
- [x] **K.6.4**: Modify `xmlUtils.ts`.
  - File: `src/lib/server/textGeneration/utils/xmlUtils.ts`
  - **Modify**: Implement `repairXmlStream()` for unclosed `<think>` tags (currently only `repairXmlTags` exists).
- [x] **K.6.5**: Modify `toolInvocation.ts`.
  - File: `src/lib/server/textGeneration/mcp/toolInvocation.ts`
  - **Modify**: Strip markdown code blocks from tool call JSON before parsing.
- [x] **K.6.6**: Write tests for malformed streams.

### K.2: Async Ingestion Protocol
> **Strategic Goal:** "Fire-and-forget" ingestion. The user should never wait for an embedding to be generated.
> **Enterprise Evaluation:**
> - **Performance:** Critical. User latency should depend only on inference, not database writes.
> - **Scalability:** Decouples ingestion throughput from query latency.
> - **Resilience:** Fail-open. If embedding fails, the chat continues, and the item is queued for retry.
> - **Testing:** Integration tests verifying that `store()` returns immediately while background tasks proceed.

- [x] **K.2.1**: Modify `StoreServiceImpl.ts`.
  - File: `src/lib/server/memory/services/StoreServiceImpl.ts`
  - **Modify**: Update `store()` method to add `needs_reindex: true` to all new items.
- [x] **K.2.2**: Modify `UnifiedMemoryFacade.ts` (Type Definition).
  - **Modify**: Add `embedding_status: 'pending'` field to `MemoryItem` interface.
- [x] **K.2.3**: Modify `StoreServiceImpl.ts`.
  - **Modify**: Implement `queueEmbeddingTask()` fire-and-forget method (call after storage).
- [x] **K.2.4**: Modify `embeddingClient.ts`.
  - File: `src/lib/server/textGeneration/mcp/services/embeddingClient.ts`
  - **Modify**: Remove synchronous `embed()` / `embedBatch()` from the hot path. Replace with queue submission.
- [x] **K.2.5**: Verify deferred reindex endpoint processes `needs_reindex` items.
- [x] **K.2.6**: Modify `StoreServiceImpl.ts`.
  - **Modify**: Add per-tier caps check (working: 1000, history: 10000) before storage.
- [x] **K.2.7**: Modify `StoreServiceImpl.ts`.
  - **Modify**: Implement `enforcePerTierCap()` cleanup method.

---

## 🟨 Tier 3: Critical Functional Gaps & Wiring
> **Why Third?** Adds the actual missing logic (Search Ingestion) and connects the brain components.

### Phase 2 (Original): Generic Tool Result Ingestion
> **Strategic Goal:** Transform every tool interaction into a permanent memory asset.
> **Enterprise Evaluation:**
> - **Scalability:** Must handle thousands of tool results without bloating the DB. (Requires Hash Dedup).
> - **Security:** Sanitize outputs. Do not store PII or secrets returned by tools.
> - **Maintainability:** Centralized service for all tool ingestion logic.
> - **Testing:** Unit tests for each tool category's extractor logic.

- [x] **2.1**: Modify `ToolResultIngestionService.ts`.
  - File: `src/lib/server/memory/services/ToolResultIngestionService.ts`
  - **Modify**: Add `source.tool_name` filter support (currently missing).
  - **Modify**: Ensure `ingestToolResult` handles `search`, `research`, `data` categories.
- [x] **2.2**: Modify `ToolIntelligenceRegistry.ts`.
  - File: `src/lib/server/textGeneration/mcp/toolIntelligenceRegistry.ts`
  - **Modify**: Add `INGESTIBLE_TOOL_CATEGORIES` constant (search, research, data, document).
- [x] **2.3**: Modify `toolInvocation.ts`.
  - File: `src/lib/server/textGeneration/mcp/toolInvocation.ts`
  - **Modify**: Hook into execution flow to bridge **ALL** ingestible tool results to memory (currently partial/docling only).

### 🔗 Orchestration Wiring (Technical Debt)
> **Strategic Goal:** Enforce "Memory-First" decision making. If memory has the answer, skip the tools.
> **Enterprise Evaluation:**
> - **Performance:** Fewer tool calls = faster response times.
> - **Scalability:** Reduces API costs (Perplexity/Tavily) at scale.
> - **Testing:**
>   - **Unit:** Intent override detection tests (e.g., "search for X" overrides memory).
>   - **Integration:** "High confidence memory" conversations should yield 0 tool calls.

- [x] **Wire**: `shouldAllowTool()` (Tool Gating).
- [x] **Wire**: `extractExplicitToolRequest()`.
- [x] **Wire**: `detectHebrewIntent()` (if not fully wired).
- [x] **Wire**: `getToolIntelligence()` metadata integration.
- [x] **Wire**: `getToolLabel()` for UI display.

---

## 🟦 Tier 4: User Experience & Real-time Feedback
> **Why Fourth?** Improves how the user interacts with the system (UI updates, upload handling).

### Phase 8 (Original): Real-Time Memory UI Updates
> **Strategic Goal:** Build user trust by making memory operations visible and transparent.
> **Enterprise Evaluation:**
> - **Performance:** Use reactive Svelte stores to update UI without page reloads.

- [x] **8.1**: Modify `memoryUi.ts`.
  - File: `src/lib/stores/memoryUi.ts`
  - **Modify**: Add `data.recentMemories` and `data.memoryStats` fields to the interface and default state.
- [x] **8.2**: Modify `StoreServiceImpl.ts`.
  - File: `src/lib/server/memory/services/StoreServiceImpl.ts`
  - **Modify**: Dispatch `stored` event with tier, memoryId, and preview upon successful storage.
- [x] **8.3**: Modify `MemoryPanel.svelte`.
  - File: `src/lib/components/memory/MemoryPanel.svelte`
  - **Modify**: Subscribe to `$memoryUi.data.recentMemories` for updates.

### Phase 3 (Uploads): Document Hash Dedup for Uploads
> **Strategic Goal:** Prevent redundant storage and embedding of the same files.
> **Enterprise Evaluation:**
> - **Scalability:** Essential for controlling vector index growth.
> - **Performance:** Instant response for previously uploaded documents.

- [x] **3.1**: Modify `UnifiedDocumentIngestionService.ts`.
  - File: `src/lib/server/documents/UnifiedDocumentIngestionService.ts`
  - **Modify**: Ensure `calculateHash` is exposed and used to check existence before processing.
- [x] **3.2**: Modify `toolInvocation.ts` (or Upload Handler).
  - **Modify**: Skip `docling` call if hash matches an existing document.
  - **Modify**: Return cached chunks for duplicate uploads immediately.

#### Tier 4 Log
- 2026-01-15: **8.2** completed. Working-memory store no longer blocks on entity extraction/counters; stored UI updates emitted with tier/id/preview. Risk mitigations verified (bounded wait, fail-open background tasks). Verified via `npm run check`, `npm run lint`, `npm run test`.
- 2026-01-15: **3.2** verified. Duplicate uploads short-circuit on file hash and return cached chunks via existing ingest/recognize paths; no redundant docling work for true duplicates. Verified via `npm run test`.

---

## 🟩 Tier 5: Observability, Security & Compliance
> **Why Fifth?** Essential for production hardening and debugging, but system runs without them.

### K.5: Raw Stream Debugging Protocol
> **Strategic Goal:** Provide deep visibility into the "Reasoning" process for developers.
> **Enterprise Evaluation:**
> - **Security:** **CRITICAL**. Must redact PII/Keys. Must be disabled by default in production.

- [x] **K.5.1**: Modify `endpointOai.ts`.
  - File: `src/lib/server/endpoints/openai/endpointOai.ts`
  - **Modify**: Add `DEBUG_RAW_STREAM` env var check (default: false).
- [x] **K.5.2**: Modify `endpointOai.ts`.
  - **Modify**: Add `DEBUG_RAW_STREAM_SAMPLE_RATE` check (default: 0.01).
- [x] **K.5.3**: Modify `endpointOai.ts`.
  - **Modify**: Implement `logRawChunk()` with sampling inside the stream loop.
- [x] **K.5.4**: Modify `endpointOai.ts`.
  - **Modify**: Add redaction for Bearer tokens, API keys, passwords in logs.
- [x] **K.5.5**: Modify `endpointOai.ts`.
  - **Modify**: Add request ID correlation to logs.
- [x] **K.5.7**: Document that this must NEVER be enabled in production.

#### Tier 5 Log
- 2026-01-15: **K.5** completed. Added sampled, tee-based stream logging behind DEBUG_RAW_STREAM with redaction and requestId correlation; defaults to off. Never enable DEBUG_RAW_STREAM in production (treat as sensitive, sampled dev-only diagnostics). Verified via `npm run check`, `npm run lint`, `npm run test`.
- 2026-01-15: **K.9** completed. Locked down diagnostics/ops/MCP scan+health endpoints to admin-only and strengthened tool-result sanitization to redact secrets/PII before storage. Verified via `npm run check`, `npm run lint`, `npm run test -- --run`.
- 2026-01-15: **K.4 + Phase 7 + K.8** completed. Wired MemoryMetrics into prefetch/search/store/embed (including stage-level search timings + ops/sec rates); added `/api/memory/prefetch` plus `scripts/k4Baseline.ts` capture/compare workflow; separated trace run IDs (memory_ vs tools_) and added `runType` for trace payloads; documented multi-instance readiness and Redis lock needs. Risk mitigations verified: bounded rolling windows, no sensitive logging, trace ID disambiguation. Verified via `npm run check`, `npm run lint`.

### K.9: Security Hardening
> **Strategic Goal:** Lock down the system against unauthorized access.
> **Enterprise Evaluation:**
> - **Security:** Admin-only access for dangerous operations (ingestion, diagnostics).

- [x] **K.9.1**: Verify all diagnostic endpoints are admin-only.
- [x] **K.9.2**: Verify pre-ingestion endpoints are admin-only.
- [x] **K.9.3**: Implement tool output sanitization before storage.

### K.4: Performance Baselines
> **Strategic Goal:** Data-driven optimization. You can't improve what you don't measure.

- [x] **K.4.1**: Capture memory prefetch P50/P95 latency baseline.
- [x] **K.4.2**: Capture search latency (vector, BM25, rerank) baseline.
- [x] **K.4.3**: Capture ingestion throughput baseline.
- [x] **K.4.4**: Capture embedding QPS baseline.
- [x] **K.4.6**: Create comparison script for post-implementation.

### Phase 7 (Original): Trace Event Robustness
> **Strategic Goal:** Clear, unambiguous logging for debugging and analytics.

- [x] **7.1**: Modify `runMcpFlow.ts`.
  - File: `src/lib/server/textGeneration/mcp/runMcpFlow.ts`
  - **Modify**: Explicitly generate and use `memoryRunId` (memory_...) distinct from `toolRunId` (tools_...).
- [x] **7.2**: Modify `runMcpFlow.ts` / `MessageUpdate.ts`.
  - **Modify**: Add `runType: "memory_prefetch" | "tool_execution"` to trace payload.

### K.8: Multi-Instance Readiness (Documentation)
- [x] **K.8.1**: Document current single-instance architecture in AGENTS.md.
- [x] **K.8.2**: Document future need for Redis distributed locks.
- [x] **K.8.3**: Identify components needing distributed locks: KG, dedup, circuit breaker.

---

## ⬜ Tier 6: Cleanup, Monitoring & Safeguards (Lowest Priority)
> **Why Last?** Housekeeping tasks, future-proofing, and non-blocking monitoring.

### Phase 1.4: Deprecate memoryBank Collection
> **Strategic Goal:** Reduce technical debt by removing legacy data structures.

- [x] **1.4.1**: Modify `database.ts`.
  - File: `src/lib/server/database.ts`
  - **Modify**: Remove `memoryBank` from `initDatabase` indexes.
- [x] **1.4.2**: Modify `+server.ts` (GET Endpoint).
  - **Modify**: Update GET endpoint to only read from `memory_items` (remove dual-read).

### Safeguards: Emergency Feature Flags
> **Strategic Goal:** Runtime control to disable risky features without redeployment.
> **Enterprise Evaluation:**
> - **Resilience:** Allows instant "kill switch" capability.

- [x] **S.1**: Modify `featureFlags.ts`.
  - **Modify**: Implement `MEMORY_CONSOLIDATION_ENABLED` flag.
- [x] **S.2**: Modify `featureFlags.ts`.
  - **Modify**: Implement `TOOL_RESULT_INGESTION_ENABLED` flag.
- [x] **S.3**: Modify `featureFlags.ts`.
  - **Modify**: Implement `MEMORY_FIRST_LOGIC_ENABLED` flag.

### Monitoring: Gaps-Defined Metrics
- [x] **M.1**: `memory.items.needs_reindex` (Gauge).
- [x] **M.2**: `memory.circuit_breaker.open` (Gauge).
- [x] **M.3**: `memory.tool_skip.count` (Counter).

> **Note:** Prometheus metric names are exported with underscores:
> `memory_items_needs_reindex`, `memory_circuit_breaker_open`, `memory_tool_skip_count`.

#### Tier 6 Log
- 2026-01-15: **Tier 6 (1.4 + Safeguards + Monitoring)** completed. Removed legacy memoryBank index creation and default dual-read; implemented emergency feature flags (memory consolidation, tool result ingestion, memory-first gating) and wired them to code paths; added Prometheus metrics for needs_reindex, circuit breaker open, and tool-skip events. Verified via `npm run check`, `npm run lint`.
