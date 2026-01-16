# Strategic Enhancement Blueprint (Kimi)
Source Plan: `\home\ilan\BricksLLM\codespace_gaps_enhanced.md`  
Cross-References: `\home\ilan\BricksLLM\codespace_priorities.md`, `\home\ilan\BricksLLM\codespace_progress.md`  
Date: 2026-01-14  

## 1) Executive Readout

### What the plan is fundamentally trying to achieve
The development plan in `\home\ilan\BricksLLM\codespace_gaps_enhanced.md` is a staged upgrade from a "memory-feature" to a "memory-native, learning" system that:
- Uses memory as the primary knowledge source (Memory-First).
- Learns what works via outcome tracking (Wilson score + action outcomes).
- Avoids redundant work (document/tool result deduplication).
- Improves user trust by making memory visible, timely, and resilient.
- Extends domain awareness with DataGov knowledge pre-ingestion.

### What is already implemented (important reality check)
Based on `\home\ilan\BricksLLM\STATUS.md` and code inspection:
- Several "plan gaps" are already addressed, at least partially:
  - Memory prefetch and injection are already active in `src/lib/server/textGeneration/mcp/runMcpFlow.ts` (memory tracing, contextual guidance, tool guidance, cold-start injection, attribution instructions, attribution parsing).
  - Document recognition endpoint exists: `src/routes/api/memory/books/recognize/+server.ts` (and `DocumentRecognitionService`).
  - Docling output is already bridged into memory (books tier) in `src/lib/server/textGeneration/mcp/toolInvocation.ts`, but **without hash-based dedup**.
  - Search service already implements strict end-to-end timeout and graceful fallback in `src/lib/server/memory/search/SearchService.ts`.
- A major portion of `\home\ilan\BricksLLM\codespace_progress.md` appears to be behind the current code state (it lists items as "to do" that already exist).

### Primary strategic gap remaining
The biggest remaining enterprise gap is not "missing functions," but **wiring + enforceability**:
- Memory-related guidance exists and is injected, but **tool gating is not enforced** at runtime (largely prompt-only).
- Tool result ingestion (non-docling tools) is not implemented as a robust, async pipeline.
- Dedup is implemented for uploads/recognition, but not consistently applied across tool ingestion (Docling bridge still creates timestamp IDs).
- Several "NEW FILE" steps in the plan would introduce extra surface area; enterprise standards favor reusing existing services and feature-flagging behavior changes.

## 2) Cross-Reference Analysis

### 2.1 Priority ordering (`\home\ilan\BricksLLM\codespace_priorities.md`)
The recommended execution order prioritizes safeguards and learning first:
1. Phase 23 - RoamPal v0.2.8 Critical Bug Fixes (safeguards)
2. Phase 22 - RoamPal v0.2.9 Natural Selection
3. Phase 1 - Consolidate Memory Collections
4. Phase 4 - Fix UI/Backend Memory Sync

Enterprise interpretation:
- This ordering is correct: it prevents "learning on corrupt stats" and stabilizes core scoring before adding scale (DataGov pre-ingestion).

### 2.2 Progress tracking (`\home\ilan\BricksLLM\codespace_progress.md`)
Observed issues:
- The document lists planned files like `src/lib/server/memory/services/ToolResultIngestionService.ts` that do not exist yet, but it also lists tasks like `src/routes/api/memory/books/recognize/+server.ts` as pending even though the endpoint exists in the codebase.
- This creates an execution risk: teams may repeat work or implement conflicting designs.

Required enterprise action:
- Treat `\home\ilan\BricksLLM\codespace_progress.md` as a backlog draft and update it to reflect current code reality before execution begins.

### 2.3 Referenced code context (what the plan claims vs what exists)
Key plan claims from `\home\ilan\BricksLLM\codespace_gaps_enhanced.md` and current reality:
- "Existing but unused" functions in `src/lib/server/textGeneration/mcp/memoryIntegration.ts`:
  - Some are already called in `src/lib/server/textGeneration/mcp/runMcpFlow.ts` (cold-start, contextual guidance, tool guidance, attribution instruction, attribution parsing).
  - The meaningful missing wiring is **enforced tool gating** (filterToolsByConfidence exists but not used to prune tool list) and **tool result ingestion** (non-docling).

## 3) Phase-by-Phase Analysis (from `\home\ilan\BricksLLM\codespace_gaps_enhanced.md`)

Notation used below:
- **Core problem**: what operational failure or enterprise risk the phase addresses.
- **Objectives / success criteria**: measurable "done" definition.
- **Requirements / constraints**: technical constraints already in the plan or implied by current architecture.
- **Dependencies**: prerequisites and ordering constraints.
- **Enterprise evaluation**: scalability, security, performance, maintainability, resilience, testing.
- **Status notes**: cross-reference with current code reality.

### Phase 1: Consolidate Memory Collections (HIGH PRIORITY)
**Core problem**
- Dual-collection pattern (`memoryBank` vs `memory_items` tier="memory_bank") creates divergence, inconsistent CRUD, and poor trust.

**Objectives / success criteria**
- Single source of truth: only `memory_items` remains authoritative for memory bank.
- Legacy read compatibility during migration; no UI regressions.
- All migrated items become searchable (embedding + Qdrant indexing).

**Requirements / constraints**
- Migration must be idempotent and resumable (batching, checkpoints).
- Embedding/Qdrant failures must not block entire migration (defer + reindex queue).
- Existing ID heterogeneity (ObjectId + UUID-style `memory_id`) must be handled.

**Dependencies**
- Phase 23 safeguards before altering scoring/outcomes for migrated data.
- Operational embedding pipeline (circuit breaker behavior is already present).

**Enterprise evaluation**
- Scalability: batch migration sizing, rate-limited embedding calls, controlled Qdrant upserts.
- Security: migration tooling must be admin-only; do not expose raw content in logs.
- Performance: avoid long blocking HTTP requests; run as background/admin job.
- Maintainability: minimize new code paths—prefer using existing facade/store.
- Resilience: "create-then-delete"; mark `migration_failed` / `needs_reindex`.
- Testing:
  - Unit: field mapping + ID conversion + idempotency.
  - Integration: Mongo + Qdrant + deferred reindex flow.

**Status notes (cross-reference)**
- UI display/stats were improved previously, but true "single source of truth" is not achieved yet (the dual-collection merge behavior exists today).

---

### Phase 2: Ingest Tool Results into Memory (HIGH PRIORITY)
**Core problem**
- Tool outputs are not persisted (except docling bridging), causing repeated research and lost value.

**Objectives / success criteria**
- Successful tool outputs are ingested into `memory_items` (tier="working" or a dedicated tier) with source metadata.
- Dedup by content hash prevents repetitive storage.
- Ingestion never blocks user response (async/fire-and-forget).

**Requirements / constraints**
- Must leverage tool intelligence metadata:
  - `getToolIntelligence(toolName)` (tool metadata / summarization guidance)
  - `TOOL_CATEGORIES` classification
  - User-facing bilingual label patterns
- Must respect token/size constraints: summarize large outputs before storage.

**Dependencies**
- Phase 21 logging standards (or minimally: structured logs for ingestion).
- Phase 18 graceful degradation patterns (ingestion must tolerate downstream failures).

**Enterprise evaluation**
- Scalability: ingestion queue pattern; backpressure; bulk upserts.
- Security: sanitize tool outputs (PII, secrets), store minimal needed; avoid persisting auth headers or raw fetched HTML with credentials.
- Performance: do not upsert vectors synchronously; consider "store now, embed later".
- Maintainability: centralized ingestion service; explicit tool allowlist.
- Resilience: circuit breaker + deferred embedding.
- Testing:
  - Unit: per-tool extractor + summarizer decision.
  - Integration: ingestion + retrieval + dedup + reindex.

**Status notes**
- There is no `src/lib/server/memory/services/ToolResultIngestionService.ts` currently; docling is the only "tool → memory" bridge.

---

### Phase 3: Memory-First Decision Logic (HIGH PRIORITY)
**Core problem**
- Tools are available even when memory confidence is high; decision is mostly prompt-level guidance, not enforced runtime gating.

**Objectives / success criteria**
- Memory confidence meaningfully reduces unnecessary tool calls unless user explicitly requests tools.
- Explicit override patterns ("חפש", "מחקר", "search the web", "use perplexity") always allow tools.
- Trace shows when tools were skipped due to sufficient memory.

**Requirements / constraints**
- Must account for Hebrew intent: `detectHebrewIntent(query)` already exists.
- Must be consistent with existing memory injection and trace architecture in `src/lib/server/textGeneration/mcp/runMcpFlow.ts`.

**Dependencies**
- Phase 23/22 scoring correctness improves confidence reliability.
- Phase 24 response integrity ensures gating changes don’t break streaming/parse.

**Enterprise evaluation**
- Scalability: reduce tool usage costs and latency at scale.
- Security: avoid tool calls that leak context externally when not needed.
- Performance: fewer tool calls => faster responses.
- Maintainability: implement gating centrally (one decision function).
- Resilience: fail-open if memory system degraded; never block user.
- Testing:
  - Unit: intent override detection; gating matrix tests.
  - Integration: "high confidence memory" conversations should yield 0 tool calls.

**Status notes**
- Memory is prefetched before tool prompt injection today, but tool gating is not enforced; tool list is still passed through.

---

### Phase 4: Document Deduplication for Tool Calls (MEDIUM PRIORITY)
**Core problem**
- Docling bridge uses timestamp-based document IDs; duplicates pollute books tier and vectors.

**Objectives / success criteria**
- Docling bridge uses SHA-256 hash-based document identity.
- If document exists, skip re-storage and optionally surface "already processed" guidance.

**Requirements / constraints**
- Must reuse existing `DocumentRecognitionService` and hashing utilities; avoid parallel implementations.

**Dependencies**
- Availability of Mongo queries by document hash (already implemented in recognition service/store).

**Enterprise evaluation**
- Scalability: prevents Qdrant growth and retrieval quality degradation.
- Security: hashing is safe; avoid logging full content.
- Performance: avoids heavy ingestion work; faster responses.
- Testing:
  - Unit: hash creation, existence checks.
  - Integration: docling tool run twice produces single stored document.

---

### Phase 5: Fix "0 Memories Found" Issue (HIGH PRIORITY)
**Core problem**
- User trust breaks when memory exists but UI/search returns zero due to indexing/degraded services/misalignment.

**Objectives / success criteria**
- UI clearly differentiates "no memories" vs "memory degraded" vs "index pending".
- Automatic or user-triggered reindex path exists and is observable.

**Requirements / constraints**
- Must leverage existing ops endpoints (circuit breaker, deferred reindex).
- Must not degrade UI performance; debugging UX must be non-intrusive.

**Dependencies**
- Phase 21 observability/logging improves diagnosis.

**Enterprise evaluation**
- Scalability: self-healing reduces support load.
- Security: diagnostics endpoints must be admin-only and redact internals.
- Resilience: searches should return empty gracefully (already does), but add "next actions".
- Testing:
  - Integration: simulate embedding outage => UI shows degraded, not "0 memories".

**Status notes**
- Significant UI feedback improvements exist (document processing updates, memory found/degraded events), but automated reindex-on-zero is not present in `src/lib/server/memory/search/SearchService.ts`.

---

### Phase 6: Fix Knowledge Graph 3D Node Names (MEDIUM PRIORITY)
**Core problem**
- KG visualization not rendering labels (font/size/label fallback).

**Objectives / success criteria**
- Node labels render for Hebrew and English; empty labels show safe fallback.
- Rendering remains responsive for target node counts.

**Requirements / constraints**
- Must support Hebrew fonts; avoid bundling heavy fonts unnecessarily.

**Dependencies**
- KG data population quality (Phase 25 may expand KG significantly).

**Enterprise evaluation**
- Performance: texture generation and label sprite scaling should be bounded.
- Security: KG UI must not render untrusted HTML.
- Testing:
  - Visual regression (snapshot) and basic UI tests.

---

### Phase 7: Fix Duplicate Trace Events (LOW PRIORITY)
**Core problem**
- Trace panel duplicates "document processed" events due to multiple emit sources.

**Objectives / success criteria**
- Each logical run has a distinct run ID and run type; UI dedups by ID.

**Requirements / constraints**
- Keep backwards compatibility with existing trace consumers.

**Dependencies**
- Trace event contract stability.

**Enterprise evaluation**
- Maintainability: tracing is diagnostic infrastructure; correctness matters for operations.
- Testing:
  - Unit: dedup logic in trace store.
  - Integration: single docling run emits exactly one completion.

---

### Phase 8: Real-Time Memory UI Updates (MEDIUM PRIORITY)
**Core problem**
- Memory panel requires manual refresh; stored/updated/deleted memories aren’t reflected immediately.

**Objectives / success criteria**
- UI updates after memory operations within a bounded latency.

**Requirements / constraints**
- Prefer existing event infrastructure (MessageMemoryUpdateType) before adding SSE.
- Avoid introducing a second "events transport" unless required.

**Dependencies**
- A consistent event contract emitted from store/facade operations.

**Enterprise evaluation**
- Performance: event bursts should be throttled/debounced.
- Security: memory event streams must not leak cross-conversation data.
- Testing:
  - Integration: store memory => UI updates without reload.

---

### Phase 9: Interface Contracts & Dependency Injection
**Core problem**
- Tight coupling reduces testability and increases refactor risk.

**Objectives / success criteria**
- Stable service contracts; easy mocking for tests; minimal circular dependencies.

**Requirements / constraints**
- The plan proposes new interfaces and a factory; enterprise constraint: keep changes minimal and consistent with existing patterns already present.

**Dependencies**
- None, but should precede large new services (e.g., ToolResultIngestion, DataGov ingestion).

**Enterprise evaluation**
- Maintainability: explicit contracts reduce regression risk.
- Testing: enables unit testing without real Mongo/Qdrant.

---

### Phase 10: Race Condition Prevention
**Core problem**
- Concurrent KG writes can corrupt KG state without serialization.

**Objectives / success criteria**
- Prevent concurrent flushes/saves from overlapping; ensure ordering.

**Requirements / constraints**
- Avoid heavy distributed locks if single-node; use minimal locking primitives.

**Dependencies**
- KG write architecture (buffer/flush) must be understood and consistently used.

**Enterprise evaluation**
- Current `KgWriteBuffer` already serializes flushes via in-process flags; the residual risk is multi-process concurrency (multiple app instances).
- Testing:
  - Concurrency test with parallel writes; verify stable counts.

---

### Phase 11: Atomic Operations & Write-Ahead Logging
**Core problem**
- Multi-step updates (promotion/outcomes) risk partial failure across Mongo/Qdrant.

**Objectives / success criteria**
- Atomicity or compensating transactions for multi-store updates.

**Requirements / constraints**
- Mongo transactions add complexity; enterprise constraint: apply only where needed (promotion/outcome updates).

**Dependencies**
- Phase 23 (atomic Wilson update) overlaps; avoid duplicate approaches.

**Enterprise evaluation**
- Maintainability: transaction manager is useful but adds operational overhead.
- Testing:
  - Integration tests for promotion under induced failures (Qdrant down).

---

### Phase 12: Outcome-Based Learning (Wilson Score Dominance)
**Core problem**
- Without feedback loops, memory quality degrades; bad memories accumulate.

**Objectives / success criteria**
- Wilson score is correctly computed and meaningfully impacts ranking/promotion.
- Time decay is applied as specified (or a validated alternative).
- Outcomes correlate with tool actions in `action_outcomes`.

**Requirements / constraints**
- Avoid incorrect statistical inference (10-use cap bug, unknown outcome semantics).
- Ensure outcomes update always increments uses.

**Dependencies**
- Phase 23 safeguards must be applied before relying on the numbers.

**Enterprise evaluation**
- Performance: outcome recording must be fast and non-blocking.
- Resilience: two-step updates can race; atomic update preferred where feasible.
- Testing:
  - Unit: scoring deltas, wilson formula correctness, time decay curve.
  - Integration: concurrent outcomes produce consistent stats.

---

### Phase 13: Memory-First Decision Logic (Tool Gating)
This phase duplicates Phase 3 in intent; treat Phase 13 as the "wiring validation" gate:
- Ensure guidance injection, cold-start, attribution, and tool guidance are correct and complete.
- Ensure any remaining gaps are only enforceability/gating.

---

### Phase 14: Cold-Start Injection
**Core problem**
- First message missing user profile context, causing low personalization.

**Status notes**
- Cold-start injection is already called from `src/lib/server/textGeneration/mcp/runMcpFlow.ts` via `isFirstMessage()` + `getColdStartContextForConversation()`.

Enterprise recommendation:
- Add measurable success criteria (e.g., cold-start injection coverage rate; max added tokens).

---

### Phase 15: Causal Attribution (Memory Marks)
**Core problem**
- LLM must indicate which memories helped so learning can be targeted.

**Status notes**
- Attribution instruction is already injected and attribution parsing is already applied in `src/lib/server/textGeneration/mcp/runMcpFlow.ts`.

Enterprise recommendation:
- Validate attribution robustness under malformed responses; ensure fail-open behavior.

---

### Phase 16: Tool Result Ingestion
This repeats Phase 2; treat as implementation detail:
- Consolidate into one "Tool Result Ingestion" phase with explicit tiers, dedup rules, and async behavior.

---

### Phase 17: Frontend Real-Time Updates
This overlaps Phase 8:
- Prefer one approach: existing message updates/events first; introduce SSE only if event fidelity requires it.

---

### Phase 18: Graceful Degradation
**Core problem**
- Prevent system lock-ups when dependencies fail (embedding, Qdrant, reranker, tools).

**Status notes**
- Search already provides timeout fallback behavior in `src/lib/server/memory/search/SearchService.ts`.

Enterprise recommendation:
- Ensure consistent "degraded" signals across memory, tool invocation, and UI.

---

### Phase 19: Hybrid Search with RRF
**Core problem**
- Improve relevance by combining lexical + vector retrieval, optionally reranking.

**Objectives / success criteria**
- BM25 and vector search both execute when available.
- RRF fusion weights are correct and stable.
- Reranker circuit breaker prevents cascading failures.

**Status notes**
- RRF architecture exists in `src/lib/server/memory/search/SearchService.ts`; ensure it matches plan expectations (including Wilson blending where required by Phase 22).

---

### Phase 20: Knowledge Graph Node Names Fix
Same as Phase 6; consolidate to avoid duplicated work.

---

### Phase 21: Comprehensive Logging Strategy
**Core problem**
- Without standardized logs, debugging enterprise failures is slow and expensive.

**Objectives / success criteria**
- Consistent structured logs for: memory prefetch/search, tool calls, ingestion, outcomes, reindex.
- Correlation IDs across the full request lifecycle.

**Requirements / constraints**
- Avoid logging sensitive data; use redaction and sampling for raw streams.

---

### Phase 22: RoamPal v0.2.9 Natural Selection Enhancements (HIGH PRIORITY)
**Core problem**
- Learning quality depends on correct scoring semantics and lifecycle policies.

**Objectives / success criteria**
- Correct update semantics (avoid archive-on-update pitfalls).
- Wilson impacts ranking/promotion meaningfully, with cold-start protections.
- "unknown" outcome semantics align with the intended evolutionary pressure.

**Requirements / constraints**
- Must not break existing stats schema.

**Dependencies**
- Phase 23 must land first.

---

### Phase 23: RoamPal v0.2.8 Critical Bug Fixes (Safeguards)
**Core problem**
- Incorrect outcome/stat handling corrupts learning and ranking.

**Objectives / success criteria**
- Outcome types are explicit and validated.
- Wilson score uses cumulative stats, not capped history.
- Failed outcomes always increment uses.
- Atomicity prevents concurrent outcome races.

**Code-context notes**
- In `src/lib/server/memory/stores/MemoryMongoStore.ts`, outcome recording increments uses, but Wilson calculation excludes `unknown_count` from total; this is a semantic decision that must match Phase 22/23 intent.
- Outcome recording is currently a two-step write (update stats, then update wilson) which can race; Phase 23.4 proposes atomic recalculation.

---

### Phase 24: DictaLM Response Integrity (CRITICAL)
**Core problem**
- Parsing fragility can cause silent failure (lost answers, tool calls ignored).

**Objectives / success criteria**
- When model output malforms tags/JSON, system fails-open with best-effort recovery.
- Raw stream visibility exists for debugging without leaking secrets.

**Requirements / constraints**
- Current tool calling format is JSON `"tool_calls": [...]` (not `<tool_call>` tags). The plan’s XML `<tool_call>` references should be reconciled with actual runtime format to avoid implementing the wrong fixes.

**Dependencies**
- None; should be treated as a platform hardening layer.

**Enterprise evaluation**
- Security: raw stream logging must be sampled, redacted, and disabled in production by default.
- Testing:
  - Unit: malformed `<think>` / partial JSON / fenced JSON cases.
  - Integration: simulated provider streaming anomalies.

---

### Phase 25: DataGov Knowledge Pre-Ingestion (CRITICAL)
**Core problem**
- DataGov "awareness" is tool-gated; without pre-ingestion, the assistant cannot proactively answer "what datasets exist?" without calling tools.

**Objectives / success criteria**
- All 1,190 schema files and 22 semantic domains become searchable knowledge in memory.
- KG includes a bounded DataGov representation.
- Hebrew queries about datasets route memory-first by default.

**Requirements / constraints**
- Storage and embedding cost: 1,190 schemas + expansions can create a large vector footprint.
- Must be idempotent, incremental, and recoverable (crash-safe).
- Must not slow startup beyond agreed targets; should be resumable and optionally deferred.
- Must preserve the source files table exactly as documented:
  - `/datagov/schemas/_index.json`
  - `/datagov/schemas/_category_index.json`
  - `/datagov/schemas/_field_index.json`
  - `/datagov/enterprise_expansions.py`
  - `/datagov/schemas/{category}/*.json`

**Dependencies**
- Phase 19 search correctness and Phase 23 scoring safety.
- Phase 21 logging/observability for monitoring ingestion.

**Enterprise evaluation**
- Scalability:
  - Prefer "store content + metadata, embed asynchronously" to keep ingestion bounded.
  - Use hashing/versioning per ingested record to support incremental updates.
  - Bound KG node counts (sampling/aggregation) to avoid UI collapse.
- Security:
  - Treat DataGov as public data, but still sanitize content and avoid storing external URLs with tokens.
  - Ensure ingestion cannot be triggered by untrusted users (admin-only, env-flag-only).
- Performance:
  - Batch embedding and Qdrant upserts; enforce hard timeouts.
  - Consider a dedicated tier for DataGov to control retrieval limits.
- Maintainability:
  - Avoid writing a parallel "DataGov memory schema" that diverges from existing `memory_items` schema unless absolutely necessary.
- Testing:
  - Unit: parsers for indexes, schema normalization, idempotency behavior.
  - Integration: ingestion on a small subset fixture.
  - Performance: ingestion time budgets and Qdrant point counts.

## 4) Enterprise-Grade Improvement Recommendations (Actionable)

### 4.1 Consolidate duplicated phases into an executable roadmap
Duplicates in `\home\ilan\BricksLLM\codespace_gaps_enhanced.md`:
- Phase 3 and Phase 13 (memory-first tool gating)
- Phase 2 and Phase 16 (tool result ingestion)
- Phase 6 and Phase 20 (KG label fix)
- Phase 8 and Phase 17 (real-time UI updates)

Recommendation:
- Collapse duplicates into single canonical epics with one set of success criteria and tests.

### 4.2 Make tool gating enforceable (not only prompt-guidance)
Recommendation:
- Introduce a single decision function that, given:
  - retrievalConfidence,
  - explicitToolRequest,
  - detectedHebrewIntent,
  - memory system degraded state,
returns an allowed tool set and a trace explanation.

### 4.3 Make ingestion async by default (store → embed later)
Recommendation:
- Standardize a deferred embedding path for all ingested memory types (tools, DataGov).
- Use `needs_reindex` style flags and existing reindex operations.

### 4.4 Align Phase 24 with actual runtime tool-call format
Recommendation:
- Treat `<think>` as the main structural token (already used).
- Treat `"tool_calls": [...]` JSON payload as the canonical "tool-call format", and harden parsing/recovery around that, rather than implementing `<tool_call>`-tag recovery.

### 4.5 Validate outcome semantics (unknown/partial/failed) against ranking and promotion
Recommendation:
- Define a single authoritative mapping table for:
  - how each outcome increments uses and success_count,
  - how it contributes to Wilson,
  - how it affects promotion/expiry.
- Ensure implementation in `src/lib/server/memory/stores/MemoryMongoStore.ts` matches Phase 22/23 expectations.

## 5) Risk Assessment Matrix

| Risk | Impact | Likelihood | Phase(s) | Mitigation |
|------|--------|------------|----------|------------|
| Corrupt stats → bad learning decisions | High | Medium | 22, 23 | Land safeguards first; add unit tests + migration/backfill |
| Tool gating blocks needed tools → user dissatisfaction | Medium | Medium | 3, 13 | Explicit override detection; fail-open on degraded memory |
| Tool ingestion bloats storage/vectors | High | High | 2, 16, 25 | Dedup by hash; async embedding; caps per tier |
| Docling duplicates degrade search | Medium | High | 4 | Hash-based doc ID; `DocumentRecognitionService.documentExists` |
| Raw stream logging leaks data | High | Low | 24 | Redaction + sampling + prod-off by default |
| DataGov pre-ingestion slows startup | High | Medium | 25 | Background/resumable ingestion; batch sizing; feature flag |
| KG visualization collapses with DataGov nodes | Medium | Medium | 6, 20, 25 | Sampling/aggregation; hard node caps; progressive rendering |
| Mongo/Qdrant partial failure causes drift | High | Medium | 1, 11, 23 | Create-then-delete; deferred reindex; targeted transactions |

## 6) Implementation Checklist (Enterprise "Definition of Ready" → "Definition of Done")

### Definition of Ready (before coding)
- [ ] Reconcile `\home\ilan\BricksLLM\codespace_progress.md` with current code reality.
- [ ] Confirm which phase set is canonical when duplicates exist (3 vs 13, 2 vs 16, etc.).
- [ ] Confirm operational SLO targets per phase (latency, timeouts, ingestion budgets).
- [ ] Define test scope per phase (unit/integration/E2E) and required fixtures.

### Recommended execution order (aligning priorities + dependencies)
- [ ] Phase 23: safeguards for outcomes/Wilson/atomicity.
- [ ] Phase 22: Natural Selection semantics (unknown outcome, promotion gates, ranking blend).
- [ ] Phase 3/13: enforceable memory-first tool gating.
- [ ] Phase 2/16: tool result ingestion pipeline (async + dedup + metadata).
- [ ] Phase 4: docling dedup (hash-based doc IDs).
- [ ] Phase 5: self-healing / diagnostics UX for "0 results".
- [ ] Phase 19: validate RRF fusion + reranking correctness and performance.
- [ ] Phase 25: DataGov pre-ingestion (after core reliability is proven).
- [ ] Phase 6/20, 7, 8/17: UI polish and observability.

### Definition of Done (per phase)
- [ ] Success criteria met and measurable (logs, counters, UI evidence).
- [ ] Unit tests added for all new logic; integration tests for data-path changes.
- [ ] Failure modes exercised (dependency down, timeouts, degraded state).
- [ ] Security review completed for persisted content and new endpoints.

## 7) Quality Assurance Guidelines

### Unit tests
- Outcome semantics: all outcomes update uses and scoring as intended (Phase 22/23).
- Tool gating matrix: confidence × explicit request × Hebrew intent (Phase 3/13).
- Dedup hashing and identity logic (Phase 4, 25).
- Parsing recovery: malformed `<think>`, partial JSON tool call payload (Phase 24).

### Integration tests
- Mongo + Qdrant:
  - Store → deferred embedding → reindex → searchable results.
  - Duplicate document ingestion produces a single canonical document identity.
- Tool execution to memory ingestion:
  - Successful tool result persisted and retrievable.
  - Failed tool result does not pollute memory tiers.

### E2E tests (minimal but high-value)
- "Save memory → search memory → see it in UI" (trust path).
- "Upload same document twice → no duplication → instant recognition message".
- "High-confidence memory answer → no external tool calls unless explicitly requested".

### Performance validation
- Establish baselines:
  - Memory prefetch latency distribution.
  - Search latency (vector, bm25, rerank) with timeouts.
  - Ingestion throughput (batch size, embedding QPS).

## 8) Architectural Considerations (Enterprise Hardening)

### Data model stability
- Avoid introducing new "parallel schemas" for DataGov and tool ingestion unless they fit within `memory_items` with tier + metadata patterns.

### Idempotency everywhere
- Migration, ingestion, and dedup should be safe to retry:
  - Use content hash, stable IDs, and upsert patterns.

### Controlled startup behavior (Phase 25)
- Pre-ingestion should be:
  - Feature-flagged (`DATAGOV_PRELOAD_ENABLED=true`),
  - resumable,
  - observable via logs/metrics,
  - safe to disable without breaking core chat.

### Multi-instance readiness
- If multiple frontend instances are ever run:
  - in-process locks are insufficient for KG and ingestion dedup.
  - plan should include a future "distributed locking" story, but not prematurely.

### Security baseline
- Any "diagnostics" or "pre-ingestion control" endpoints must be admin-only.
- Sanitize stored tool outputs and avoid storing secrets or raw headers.