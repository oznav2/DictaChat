<!-- rompal_implementation_plan.md: Initial concrete integration plan for Roampal-style 5-tier memory + Mongo truth + Qdrant index + deterministic promotion + outcome learning in BricksLLM. -->

# Roampal-Style 5-Tier Memory + Qdrant Integration Plan (DictaChat)

## 0) Goals / Constraints

### Goals

- Add a **Roampal-style 5-tier memory system** with:
  - working (24h), history (30d), patterns (permanent), books (permanent), memory_bank (permanent, max 1000)
- Achieve **high-throughput, low-latency** retrieval suitable for **millions of memories locally**, using:
  - Hybrid retrieval: **BM25 + Vector + Cross-Encoder reranking**
  - Outcome learning (worked/failed/partial) that compounds over time
- Materialize design rules:
  - **Mongo truth + Qdrant index**
  - **Promotion is a single deterministic service**
  - **Hard timeouts + fallback** for vector search, BM25, reranker
  - **Reindex capability** (rebuild Qdrant from Mongo truth)
  - **Consistency checks** (Mongo⇄Qdrant drift detection + repair)
  - **Metrics** (latency per stage, hit rates per tier, reranker usage %, tool-call savings, outcome update counts)

### Non-goals (for first iteration)

- No rewrite of BricksLLM gateway (Go) and no replacement of existing MCP tool orchestration.
- No UI rewrite; add memory/graph/personality features as incremental panels/routes in `frontend-huggingface`.
- No claim of “enterprise benchmark parity” until we implement and run a reproducible harness.

### Key integration principle

- The memory system must **never block streaming** or crash the UI: it must degrade gracefully (empty retrieval results + log + continue).

### Maintainability + parity constraints (Roampal v0.2.7 lesson)

- Preserve a facade boundary (`UnifiedMemoryFacade`) so `runMcpFlow` stays minimally coupled.
- Decompose logic into small, testable services (search, routing, KG, outcomes, promotion, memory bank, context) with dependency injection.
- Add characterization tests for the public facade API (search/store/record_outcome/tools) to preserve behavior across refactors.

---

## 1) Target Architecture (High-Level)

### “Mongo Truth + Qdrant Index” split

- **MongoDB** is the source of truth for:
  - memory objects (text, tier, status, versions)
  - outcome events + aggregated scoring
  - KG nodes/edges and provenance
  - audit log / reindex checkpoints
- **Qdrant** is the fast vector index for retrieval:
  - dense vectors (and optionally sparse vectors later)
  - filterable payload fields (tier, userId, status, tags, timestamps, score buckets)

### Hybrid retrieval components

- **BM25 Engine** (separate, optional but recommended for true BM25 at scale)
  - Use a local search engine that supports fast BM25 + filters (e.g., Meilisearch/Typesense/OpenSearch/Tantivy service).
- **Cross-Encoder Reranker**
  - Reuse existing `dicta-retrieval` reranker endpoint if feasible
  - Cap rerank K tightly to protect latency and GPU contention

### Deterministic promotion service

- A single promotion scheduler/process owns:
  - working→history promotion
  - history→patterns promotion
  - cleanup (TTL expiration)
- No other code path deletes/promotes entries.

---

## 2) Repo Touchpoints (Where This Fits Today)

### Existing “brain”

- MCP orchestration and streaming:
  - `frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts`
  - `frontend-huggingface/src/lib/server/textGeneration/index.ts`
- Document RAG (books-like per-conversation today):
  - `frontend-huggingface/src/lib/server/textGeneration/mcp/services/documentRAG.ts`
  - `frontend-huggingface/src/lib/server/textGeneration/mcp/stores/documentContextStore.ts`
- Existing performance instrumentation hooks:
  - `startTimer`, `timeAsync`, `logPerformanceSummary` in `runMcpFlow.ts`

### Exact flow points in `runMcpFlow.ts` (retrieval-first gating + outcome updates)

- Tool filtering / query extraction:
  - Document detection + intent-based tool filtering:
    - [runMcpFlow.ts:L330-L368](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L330-L368)
  - User query extraction:
    - [runMcpFlow.ts:L344-L348](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L344-L348)
- Preprompt assembly (inject memory context here):
  - Preprompt pieces and system message merge:
    - [runMcpFlow.ts:L433-L538](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L433-L538)
- Tool execution completion (record tool outcomes here):
  - Tool execution loop and summaries:
    - [runMcpFlow.ts:L1148-L1252](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1148-L1252)
- Final answer emission (store working memory + emit metadata for feedback):
  - FinalAnswer update + return:
    - [runMcpFlow.ts:L1313-L1326](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1313-L1326)

---

## 3) Components & Responsibilities (Concrete)

### 3.1 Memory Facade (TypeScript)

**Name:** `UnifiedMemoryFacade`  
**Location:** `frontend-huggingface/src/lib/server/memory/` (new module directory)

**Responsibilities**

- Stable API for orchestration layer:
  - `prefetchContext(...)`
  - `search(...)`
  - `store(...)`
  - `recordOutcome(...)`
  - `recordActionOutcome(...)`
  - `getActionEffectiveness(...)`
  - `getColdStartContext(...)`
  - `getStats(...)`
  - `promoteNow(...)` (manual trigger)
  - `exportBackup(...) / importBackup(...)`
  - `reindexFromMongo(...)`
  - `consistencyCheck(...)`
  - `removeBook(...)` (non-destructive delete semantics; see Section 3.11)
  - **Core Interface Parity (from `backend/core/interfaces`):**
    - `getGoals()`, `addGoal()`, `removeGoal()` (maps to `MemoryAdapterInterface`)
    - `getValues()`, `addValue()`, `removeValue()` (maps to `MemoryAdapterInterface`)
    - `storeArbitraryData()`, `retrieveArbitraryData()` (maps to `MemoryAdapterInterface`)
    - `listBooks()` (maps to `BookProcessorInterface`)
    - `retrieveFromBooks(...)` (maps to `BookProcessorInterface` with `content_types` support)

**Why**

- Mirrors Roampal’s post-refactor facade. Keeps `runMcpFlow` integration minimal and reversible.
- **Ensures full parity with `roampal/backend/core` interfaces**, preventing logic gaps during the TS port.

**API compatibility targets (Roampal architecture parity)**

- Facade methods must remain stable even if internals change (service refactors must not touch `runMcpFlow`):
  - Retrieval: `search(...)`, `prefetchContext(...)`
  - Storage: `store(...)`, `removeBook(...)`, `delete_memory/archive_memory` equivalents (status-based)
  - Outcomes: `recordOutcome(...)`, `recordActionOutcome(...)`, `record_response(...)` tool handler
  - Context: `getColdStartContext(...)`, `detectContextType(...)`, `get_context_insights(...)` tool handler
  - Intelligence: `getActionEffectiveness(...)`, `getTierRecommendations(...)`, `getFactsForEntities(...)`
  - Operations: `promoteNow(...)`, `getStats(...)`, `consistencyCheck(...)`, `reindexFromMongo(...)`
  - Persistence: `exportBackup(...) / importBackup(...)`
  - **Core Data:** `getGoals`, `addGoal`, `getValues`, `addValue`, `storeArbitraryData`
- The facade must delegate to internal services (below) using dependency injection so each service is unit-testable in isolation.

**Internal service split (Roampal v0.2.7+ structure, adapted to this stack)**

- `memory_config.ts`: centralized config object (timeouts, caps, weights, thresholds, defaults) used by all services.
  - **Must port feature flags from `feature_flags.json`**:
    - `memory_consolidation`: interval, max fragments.
    - `knowledge_graph`: update interval, max concepts.
    - `embedding_optimization`: batch sizes, cache TTL.
    - `performance`: lazy loading, max memories per query.
- `types.ts`: shared types:
  - `Outcome = "worked" | "failed" | "partial" | "unknown"`
  - `Tier = "working" | "history" | "patterns" | "books" | "memory_bank"`
  - `ActionOutcome` record (action_type, context_type, outcome, tier?, doc_id?, timestamps, params)
  - **Core Types (from `backend/core/types/common_types.py`):**
    - `ActionType`: `ADD_GOAL`, `RESPOND_WITH_STRUCTURED_SUMMARY`, `SOUL_BOOK_LOOKUP`, etc.
    - `InteractionType`: `USER_CHAT`, `OG_CHAT`, etc.
    - `Action` & `Message` schemas.
  - Tool result types (`SearchResult`, `ContextInsights`, `StatsSnapshot`) to keep tool schemas stable.
- `ScoringService`: Wilson score, deterministic score deltas, cross-encoder score blending, and explainability fields for ranking.
  - Respect `scoring` strategy from `default_config.yaml`.
  - **Implements `ScoringEngineInterface` logic**: `record_interaction`, `get_score`.
- `RoutingService`: query normalization + acronym expansion + tier-plan decisions using Routing KG signals.
  - **Implements `IntentRouterInterface` logic**: `determine_action` using `ActionType` enum.
- `KnowledgeGraphService`: triple KGs (Routing, Content, Action) + dead-reference cleanup.
- `SearchService`: hybrid search orchestration (Qdrant + lexical + fusion + rerank) and stable tool formatting.
- `OutcomeService`: score updates + routing/action KG updates (fast path + deferred learning).
- `PromotionService`: deterministic lifecycle (startup-run then scheduled) and single-owner cleanup/promotion.
- `ContextService`: `detectContextType`, conversation analysis, `getColdStartContext`, and “You Already Know This” fact selection.
  - **Must port logic from `model_limits.py`**:
    - `detect_task_complexity(user_message)`: determines token budget multipliers.
    - `calculate_token_budget(...)`: dynamic context sizing based on model tiers.
    - `smart_truncate(...)`: coherence-aware truncation.
- `MemoryBankService`: CRUD, dedup/versioning, always_inject handling, quality enforcement.
- `BookIngestionService` (SmartBookProcessor equivalent): multi-format conversion, metadata extraction, chunking, contextual embedding, batch upsert with rollback.
  - **Implements `BookProcessorInterface` logic**: `retrieve_from_ingested_books` (with `content_types`), `list_books`.
- `EmbeddingService`:
  - **Implements `EmbeddingServiceInterface` logic**: `embed_batch`, `validate_embedding` (768 dims), `get_similarity`.
  - **Constraint:** Must use `DictaEmbeddingClient` (see 3.1.2) exclusively.

### 3.1.2 Embedding & Reranking Strategy (Dicta Container Integration)

**Goal:** Utilize the user's `dicta-container` as the **single source of truth** for all embedding and reranking operations, ensuring consistency and offloading compute from the app server.

**Critical Policy:**

- **No Local Models:** DO NOT use `sentence-transformers` locally. The application must not load model weights into the Node/TS process.
- **Fail Fast:** If the dicta-container is unreachable, the memory system must log an error and return empty results/graceful degradation, NOT attempt to download/load a local model.

**Components:**

1.  **DictaEmbeddingClient (`src/lib/server/memory/embedding/dictaClient.ts`)**

    - **Endpoint:** `POST /embed` (or the specific container path provided in env).
    - **Model:** `paraphrase-multilingual-mpnet-base-v2` (768 dimensions).
    - **Batching:** Enforce max batch size (e.g., 32 items) before sending to container to prevent timeouts.
    - **Timeouts:** Strict 10s timeout for batch operations.

2.  **Redis Caching Layer (`src/lib/server/memory/embedding/cache.ts`)**

    - **Replacing:** In-memory dictionary cache from Roampal.
    - **Storage:** Redis `SET` with TTL.
    - **Key Format:** `embedding:v1:{model_version}:{md5_hash_of_normalized_text}`.
    - **Value:** Binary packed float32 array (Buffer) or JSON array (measure perf; Buffer preferred for size).
    - **TTL:** 7 days (refresh on hit).
    - **Logic:**
      1. Check Redis for all requested texts.
      2. Identify misses.
      3. Send misses to Dicta Container.
      4. Store results in Redis (pipeline set).
      5. Return merged list.

3.  **DictaReranker (`src/lib/server/memory/reranking/dictaReranker.ts`)**
    - **Endpoint:** `POST /rerank` (dicta-container endpoint).
    - **Logic:**
      - Accepts `(query, [documents])`.
      - Returns sorted list with scores.
    - **Fallback:** If container lacks `/rerank`, log warning and fall back to "recency + vector score" only. **Do not load local cross-encoder.**

**Configuration (`memory_config.ts` updates):**

```typescript
embedding: {
  endpoint: process.env.DICTA_EMBEDDING_ENDPOINT || "http://localhost:8080/embed", // adjust to actual container URI
  rerankEndpoint: process.env.DICTA_RERANK_ENDPOINT || "http://localhost:8080/rerank",
  batchSize: 32,
  dimensions: 768,
  timeoutMs: 10000,
  cacheTtlSeconds: 604800 // 7 days
}
```

---

### 3.2 Mongo Truth Store

**Name:** `MemoryMongoStore`  
**Responsibilities**

- CRUD for:
  - memory items (all tiers)
  - memory versions (archival)
  - outcomes/events
  - KG nodes/edges
- Aggregations:
  - per-item success rate, Wilson score, usage counts
  - per-tier stats
  - “top concepts” for KG UI

**Hang / lock safety (Roampal v0.2.10 lesson, adapted)**

- Every Mongo operation on the request path must be bounded:
  - use server-side time limits (`maxTimeMS`) for reads/aggregations
  - propagate a request deadline so the caller can fail-open
- Never allow any Mongo call to block streaming:
  - timeouts must return empty results or partial debug data, not throw into `runMcpFlow`

---

### 3.3 Qdrant Adapter (Vector Index)

**Name:** `QdrantAdapter`  
**Responsibilities**

- Collection creation / payload index management
- Upsert points, delete points, query vectors
- Enforce **timeouts** and **fail-open behavior** (return empty on timeout/error, never throw to UI path)

**Roampal Adaptation Strategy (ChromaDB → Qdrant Mapping)**

1.  **Collection Strategy:**

    - Use a **single collection** named `roampal_memories`.
    - Do NOT use separate collections per tier or user.
    - **Filtering:** All queries MUST apply a payload filter for:
      - `user_id` (mandatory isolation)
      - `tier` (optional scoping: working/history/etc)

2.  **Schema Mapping (Chroma Metadata → Qdrant Payload):**

    - `id` → Point ID (UUID)
    - `embedding` → Vector (768d dense)
    - `document` → Payload field `content`
    - `metadata` → Payload fields (flattened or nested `metadata` object, verify Qdrant indexing depth).
      - **Critical Payload Fields:**
        - `tier`: keyword (indexed)
        - `status`: keyword (indexed)
        - `user_id`: keyword (indexed)
        - `tags`: keyword array (indexed)
        - `timestamp`: integer/float (indexed for sorting)
        - `composite_score`: float (indexed for sorting)
        - `uses`: integer

3.  **Metadata-Only Updates (Optimization):**
    - `outcome_service` updates scores/usage frequently.
    - **Do NOT re-embed:** Utilize Qdrant's `SetPayload` / `UpdatePoint` API to update `composite_score`, `uses`, `last_used` without touching the vector.
    - This matches Roampal's `update_fragment_metadata` logic.

**Hang / corruption safety (Roampal v0.2.10 lesson, adapted)**

- All Qdrant calls must support cancellation and hard timeouts (AbortSignal/deadline).
- The adapter must treat “vector DB unhealthy” as a normal state:
  - return empty results quickly when Qdrant is slow/unreachable
  - surface structured diagnostics/metrics for later repair (Section 12)

**Vector schema compatibility (Roampal v0.2.9 lesson, adapted)**

- Prevent “silent empty results” caused by vector-dimension mismatch or wrong vector name:
  - On startup (and periodically), validate:
    - embedding model dims == Qdrant collection vector dims (Validate **768 dimensions** for `paraphrase-multilingual-mpnet-base-v2`).
    - correct vector name is used for query/upsert (e.g., `dense` or default unnamed)
    - distance metric matches assumptions in scoring conversion (Cosine)
  - On mismatch:
    - fail-open by disabling the vector stage (open Qdrant breaker) and continue with lexical-only
    - emit a high-signal diagnostic event instructing reindex/collection rebuild

---

### 3.3.1 Contextual Embedding Service (Contextual Retrieval)

**Name:** `ContextualEmbeddingService`

**Purpose**

- Improve embedding quality by ensuring every stored chunk has enough situational context to retrieve correctly later.

**Responsibilities**

- Generate a short, LLM-produced context prefix per chunk at **store time**.
- Prepend the context prefix to the original text before calling the embeddings endpoint.
- Cache contextual prefixes by `vector_hash` (text + tier + model + optional book metadata) to avoid re-generation.
- Enforce strict timeout and fallback:
  - 5s timeout on context generation
  - If LLM unavailable/timeout/error: use original text (or a deterministic minimal prefix for books) and continue.

**Context generation contract**

- Input: `{ tier, tags, provenance, userQuery?, documentTitle?, section?, rawText }`
- Output: `context_prefix` (1–3 sentences, no markdown, no code, no private secrets)

---

### 3.4 BM25 Adapter

**Name:** `Bm25Adapter`

**Responsibilities**

- Provide the lexical retrieval stage for hybrid search.
- v1 default: use Mongo full-text as a BM25-like lexical retrieval source.
- Optional v1 enhancement (recommended for memory_bank/patterns where the corpus is small and frequently queried): maintain a cached in-process BM25 index built from Mongo truth.
- Always accept an expanded/normalized query (see AcronymExpansionService) so lexical matching benefits from acronym/full-form variants.

**Interface**

- `search({ userId, tiers, status, query, limit, timeoutMs }) -> { rankedIds: string[], debug }`

**Mongo full-text mode**

- Query with filters (userId, tier, status, tags) and return a ranked list.
- Normalize lexical score to a rank-based similarity (monotonic by rank, not by raw textScore).

**Cached BM25 mode (rank-bm25-like behavior, without Chroma)**

- Purpose: match Roampal’s BM25+Vector+RRF behavior and ensure instant reflection of UI edits without restart.
- Build an in-memory BM25 index per tier (especially `memory_bank`, max 1000 items).
- Cached + background rebuild (CRITICAL: must not block chat request path):
  - Requests must never wait for a rebuild.
  - If an index is missing, fall back to Mongo full-text for that request and enqueue an async build.
  - If an index is stale, use the last-built index for that request and enqueue an async rebuild.
  - Cache key includes `{ userId, tier, status }`.

**Request-path lexical computation (when cache missing/stale)**

- Goal: ensure the user sees up-to-date lexical recall immediately, even while the cached BM25 index rebuilds in the background.
- Strategy:
  - Always run Mongo full-text for the current request when:
    - cache is missing, or
    - cache is flagged `needs_rebuild` due to invalidation.
  - Use the last-built cached BM25 results only as an optional supplement (never as the sole lexical source when stale).
- Ranking normalization (stable and fast):
  - Do not rely on Mongo `textScore` magnitude (it can be noisy across languages/content).
  - Convert Mongo full-text results to a rank-based similarity:
    - `text_similarity(rank) = 1 / (rank + 1)` or `1 / (rank + 60)` (choose one and keep consistent with RRF constants).
  - Feed these ranks/similarities into RRF fusion (Section 6.1.2).
- Consistency behavior:
  - The cached BM25 index is an optimization; Mongo full-text defines “freshness”.
  - Background rebuild completion only improves ranking quality/latency; it must not change correctness expectations.

**BM25 cache invalidation (Roampal v0.2.9 method, adapted)**

- On each lexical query for a tier:
  - `current_count = memory_items.countDocuments({ user_id, tier, status:"active" })`
  - If `current_count != cached_count` then set `_bm25_needs_rebuild = true`.
  - If same, reuse cached index (near-zero overhead).
- Optional stronger invalidation (if count can stay equal but content changes):
  - Track `max(updated_at)` for the same filter and invalidate if it changes.

**Redis coordination for BM25 cached rebuilds (robustness + no rebuild storms)**

- Goal: prevent multiple rebuild workers from running concurrently for the same `{tier,status}` and avoid rebuild storms during bursts of writes.
- Redis is used as a lightweight coordination plane (locks + invalidation/versioning flags). The BM25 index itself stays in-process memory.
- Note: if/when multi-user is enabled, include `user_id` in all keys.

**Key naming (include `status` to match rebuild scope)**

- Lock:
  - `bm25:lock:{tier}:{status}`
- Versioning / invalidation flags:
  - `bm25:count:{tier}:{status}`
  - `bm25:max_updated_at:{tier}:{status}`
  - `bm25:needs_rebuild:{tier}:{status}` (value `1` means enqueue/attempt rebuild)

**Lock acquisition (dedup / single in-flight rebuild)**

- Acquire before starting a rebuild:
  - `SET bm25:lock:{tier}:{status} <token> NX EX 30`
- If lock is not acquired:
  - Do not rebuild.
  - Return immediately (requests continue using Mongo full-text and/or last-built cache).

**Lock safety and release**

- Use a unique `<token>` per rebuild attempt.
- Release lock only if the token matches (atomic compare-and-del):
  - Use a Lua script (or equivalent) so one worker cannot unlock another worker’s lock.
- If a worker crashes, EX expiry ensures eventual release.

**Lock refresh (long rebuild protection)**

- If rebuild can exceed 30s in worst-case (bulk tiers), refresh the lock periodically while rebuilding:
  - `EXPIRE bm25:lock:{tier}:{status} 30` only if still owned by the same token (compare-and-refresh).
- For `memory_bank` (max 1000) typical rebuilds should be <1s, but keep refresh logic for robustness.

**Invalidation + rebuild scheduling flow (recommended)**

- On each query (request path):
  1. Compute `current_count` and optionally `current_max_updated_at`.
  2. If changed from cached:
     - Set `bm25:needs_rebuild:{tier}:{status} = 1` with a short TTL (e.g., 5–30 minutes).
     - Update `bm25:count:{tier}:{status}` / `bm25:max_updated_at:{tier}:{status}` to the latest observed values.
     - Enqueue a background rebuild task (best-effort; dedup via lock).
  3. Continue request using Mongo full-text (freshness) and/or last-built cache (latency).

**Throttling (storm avoidance)**

- Only enqueue if `bm25:needs_rebuild:{tier}:{status}` was previously unset.
- Add a cooldown key per tier to avoid repeated enqueue during bulk edits:
  - `SET bm25:cooldown:{tier}:{status} 1 NX EX 5` (example 5s cooldown)
- Rebuild worker clears `bm25:needs_rebuild:{tier}:{status}` when rebuild completes successfully.

**Background rebuild contract (still required)**

- Deduplicate rebuild jobs (one in-flight rebuild per `{tier,status}` enforced by Redis lock).
- Swap-in rebuilt index atomically when complete.
- If rebuild fails, keep serving Mongo full-text + last-built cache; do not block requests.

**Timeouts + graceful fallback**

- Enforce timeouts; if lexical stage fails/unavailable:
  - return empty lexical list and proceed vector-only.

---

### 3.4.2 Personality System (YAML Templates)

**Goal**

- Allow complete customization of assistant behavior, tone, and identity via YAML templates.
- Personality must be injected as **Section 1** of the prompt, before memory/tool instructions.

**Storage (mimic Roampal, adapted to this stack)**

- File format: YAML content stored in text files (Roampal-style).
- Presets (read-only, shipped with app):
  - Repo path: `frontend-huggingface/templates/personality/presets/`
  - Files: `default.txt`, `professional.txt`, `teacher.txt`
- Custom (user-editable, persistent):
  - Runtime path inside container: `/app/templates/personality/custom/`
  - Persist with a Docker volume mounted to `/app/templates/personality/custom`.
- Active template (single source for runtime behavior):
  - `/app/templates/personality/active.txt` (copied from selected preset/custom; YAML inside)
  - Optional: persist `/app/templates/personality/active.txt` via volume if you want active selection to survive container recreation.

**Backend implementation location**

- Implement as SvelteKit server endpoints under `frontend-huggingface/src/routes/api/personality/*`.
- No FastAPI server required.

**Endpoints (same surface as Roampal)**

- `GET  /api/personality/presets` — list preset + custom templates (id, name, type, updatedAt)
- `GET  /api/personality/current` — get currently active template (id + YAML)
- `GET  /api/personality/template/{id}` — get specific template by id
- `POST /api/personality/save` — save/update custom template (returns `overwrite: true|false`)
- `POST /api/personality/activate` — activate template (validate then copy YAML to `active.txt`)
- `POST /api/personality/upload` — upload YAML file as custom template
- `DELETE /api/personality/custom/{id}` — delete custom template (protect active template)

**Template YAML schema**
Required fields (hard validation):

- `identity.name`
- `identity` (object)
- `communication` (object)

Optional fields (soft validation / warnings):

- `identity.role`, `identity.expertise[]`, `identity.background`
- `communication.tone` (warm|professional|direct|enthusiastic)
- `communication.verbosity` (concise|balanced|detailed)
- `communication.formality` (casual|professional|formal)
- `communication.use_analogies`, `communication.use_examples`, `communication.use_humor`
- `response_behavior.citation_style` (always_cite|cite_patterns|conversational)
- `response_behavior.clarification` (ask_questions|make_assumptions)
- `response_behavior.show_reasoning` (boolean)
- `memory_usage.priority` (always_reference|when_relevant)
- `memory_usage.pattern_trust` (heavily_favor|balanced)
- `personality_traits[]`
- `custom_instructions` (string)

**Security & validation requirements**

- YAML syntax validation with friendly error messages.
- Filename/id sanitization: allow only `[A-Za-z0-9_-]`.
- Preset immutability: cannot modify/delete presets.
- Active template protection: cannot delete the currently active custom template.
- Activate must validate before writing `active.txt`.
- Overwrite detection on save (return `overwrite=true`).
- Optimized preset matching: content hash to detect when a custom template equals a preset.

**Prompt conversion (mimic Roampal, adapted to runMcpFlow)**

- Convert active YAML to a natural-language “personality prompt” with sections:
  - Identity (name/role/background/expertise)
  - Communication style (tone/verbosity/formality + toggles)
  - Response behavior (citations/clarification/reasoning)
  - Memory usage preferences (priority/pattern_trust)
  - Traits + custom instructions (verbatim)

**Prompt integration (performance + robustness)**

- Load and cache the active template by mtime check:
  - If `active.txt` unchanged, reuse cached parsed YAML + cached rendered personality prompt.
- Fallback handling:
  - If template load/parse fails, inject a minimal default personality prompt.

**Personality Customization UI (required; mimic Roampal UX, adapted to Svelte)**

- Add a Settings modal: “Personality & Identity”.
- The modal must allow users to modify personality easily without affecting core memory correctness.

**Customizable elements**

- Identity & Name (shown in sidebar + chat header): `identity.name`, `identity.background`, optional `identity.role`.
- Communication style: `communication.tone`, `communication.verbosity`, `communication.formality`.
- Response behavior: `response_behavior.citation_style`, `response_behavior.clarification`, `response_behavior.show_reasoning`.
- Memory usage: `memory_usage.priority`, `memory_usage.pattern_trust`.
- Personality traits: `personality_traits[]`.
- Custom instructions: `custom_instructions`.

**Base templates**

- `default.txt` — balanced, memory-enhanced assistant (recommended).
- `professional.txt` — concise, direct, business-focused.
- `teacher.txt` — detailed, patient, educational.

**Two UI modes (required)**

- Quick Settings (default; beginner-friendly):
  - Assistant Name (text)
  - Conversation Style / tone (warm|professional|direct|enthusiastic)
  - Response Length / verbosity (concise|balanced|detailed)
  - Memory References / priority (when_relevant|frequently)
  - Custom Instructions (optional textarea)
  - Quick Settings must generate YAML in real time and keep it in sync with Advanced mode.
- Advanced Mode (full control):
  - Full YAML editor with:
    - real-time validation using `js-yaml`
    - friendly error messages (line/column + message)
    - syntax highlighting (use whichever editor component already exists/works in this UI)
    - “Load example template” button
    - download/export YAML

**User capabilities (required)**

- Select from preset templates.
- Edit via Quick Settings OR Advanced mode.
- Save current content as:
  - active template (apply immediately)
  - custom template (with overwrite detection)
- Upload a YAML template file and activate it.
- Delete custom templates (must protect active template).
- Reset to last saved version.
- Unsaved changes protection:
  - show an “unsaved” indicator in the modal
  - warn on close/navigation with unsaved changes and require confirmation

**Immediate apply (no restart)**

- On Save/Activate, backend writes `/app/templates/personality/active.txt`.
- Prompt builder must pick up changes via mtime-based caching; changes apply to the next message.

**Name sync (required)**

- UI extracts `identity.name` from YAML using a robust regex:
  - `/name:\s*(?:"([^"]+)"|'([^']+)'|([^\n]+))/`
- Sidebar/header must update the displayed assistant name.
- Poll `/api/personality/current` every 5 seconds for live updates.

**System-protected elements (hardcoded; must not be user-editable)**

- Memory context injection logic and ordering.
- Collection reliability labels (e.g., ✓ proven solution, 📚 reference docs).
- Core instructions for using the memory system.
- Prompt structure order and injection points.

**Prompt structure (ordering constraint)**

- `[PERSONALITY LAYER]` ← user-customizable YAML rendered to natural language
- `[CORE MEMORY INSTRUCTIONS]` ← hardcoded system-critical
- `[MEMORY CONTEXT]` ← auto-injected (Organic Recall + retrieved memories)
- `[CONVERSATION HISTORY]`
- `[CURRENT QUESTION]`

---

### 3.4.3 Personality System Implementation Details (From Roampal Codebase Analysis)

**Source files analyzed:**

- `/home/ilan/BricksLLM/roampal/backend/personality/` (template storage)
- `/home/ilan/BricksLLM/roampal/backend/app/routers/personality_manager.py` (API endpoints)
- `/home/ilan/BricksLLM/roampal/backend/app/routers/agent_chat.py` (prompt integration)

#### A) Complete YAML Schema (All Fields in Actual Use)

The following schema represents the complete set of fields used in the Roampal personality templates. **All fields must be supported** for full parity:

```yaml
identity:
  name: "DictaChat" # REQUIRED - Assistant display name
  role: "Memory-Enhanced Assistant" # Role description
  expertise: # Array of expertise areas
    - "General Knowledge"
    - "Problem Solving"
    - "Research"
  background: "Description string" # Background/personality desc

communication:
  tone: "warm|professional|direct|enthusiastic" # REQUIRED via object
  verbosity: "concise|balanced|detailed" # Response length
  formality: "casual|professional|formal" # Formality level
  use_analogies: true|false # Use analogies in responses
  use_examples: true|false # Include examples
  use_humor: true|false # Allow humor

response_behavior:
  citation_style: "always_cite|cite_patterns|conversational"
  clarification: "ask_questions|make_assumptions"
  show_reasoning: true|false # Show <think> tags
  step_by_step: true|false # Step-by-step explanations
  prioritize: "accuracy|speed" # Primary optimization

memory_usage:
  priority: "when_relevant|always_reference"
  pattern_trust: "balanced|heavily_favor"
  historical_context: "reference_past|current_only"

formatting: # NEW - not in original plan
  structure: "mixed|bullets" # Response structure
  code_blocks: "separate" # Code block handling
  emphasis: "markdown|plain" # Text emphasis style

personality_traits: # Array of trait strings
  - "Helpful and reliable"
  - "Clear and organized"
  - "Learns from past interactions"

custom_instructions: | # Multiline freeform text
  Custom instructions appear here...
```

#### B) Critical Function: `_template_to_prompt()` (Lines 1527-1619)

**Purpose:** Convert YAML template data to natural language prompt string for LLM injection.

**Implementation (must port to TypeScript):**

```typescript
function templateToPrompt(templateData: PersonalityYAML): string {
  const parts: string[] = [];

  // 1. Identity Section
  const identity = templateData.identity || {};
  const name = identity.name || "Roampal";
  const role = identity.role || "helpful assistant";
  const expertise = identity.expertise || [];
  const background = identity.background || "";

  parts.push(`You are ${name}, a ${role}.`);
  if (expertise.length > 0) {
    parts.push(`Expertise: ${expertise.join(", ")}.`);
  }
  if (background) {
    parts.push(background);
  }

  // 2. CRITICAL: Pronoun Disambiguation (Roampal parity)
  // This prevents the LLM from confusing user identity with its own
  parts.push(
    "\nThe user is a distinct person. When they ask 'my name', 'my preferences', " +
      "or 'what I said', they mean THEIR information (search memory_bank), not yours."
  );

  // 3. Custom Instructions (moved up for prominence)
  const custom = templateData.custom_instructions || "";
  if (custom.trim()) {
    parts.push(`\n${custom}`);
  }

  // 4. Communication Style (condensed)
  const comm = templateData.communication || {};
  const tone = comm.tone || "neutral";
  const verbosity = comm.verbosity || "balanced";

  const styleParts: string[] = [`${tone} tone`, `${verbosity} responses`];
  if (comm.use_analogies) styleParts.push("use analogies");
  if (comm.use_examples) styleParts.push("provide examples");
  if (comm.use_humor) styleParts.push("light humor ok");

  parts.push(`\nStyle: ${styleParts.join(", ")}`);

  // 5. Response Behavior (condensed)
  const behavior = templateData.response_behavior || {};
  const showReasoning = behavior.show_reasoning || false;
  if (showReasoning) {
    parts.push("Show reasoning with <think>...</think> when helpful.");
  }

  // 6. Traits
  const traits = templateData.personality_traits || [];
  if (traits.length > 0) {
    parts.push(`Traits: ${traits.join(", ")}`);
  }

  return parts.join("\n");
}
```

**Critical behaviors to preserve:**

1. **Pronoun disambiguation** - MUST always inject the line clarifying user vs assistant identity
2. **Custom instructions prominence** - placed early, not buried at the end
3. **Condensed style** - boolean flags become single-line style descriptors
4. **`show_reasoning`** - triggers `<think>` tag instruction

#### C) Critical Function: `_load_personality_template()` (Lines 1473-1524)

**Purpose:** Load and cache personality template with file watching.

**Caching pattern (must port):**

```typescript
class PersonalityLoader {
  private cache: string | null = null;
  private cacheMtime: number = 0;
  private templatePath: string = "templates/personality/active.txt";
  private defaultPresetPath: string =
    "templates/personality/presets/default.txt";

  loadTemplate(): string | null {
    try {
      // 1. Check if active template exists
      if (!fs.existsSync(this.templatePath)) {
        // Fallback to default preset
        if (fs.existsSync(this.defaultPresetPath)) {
          this.templatePath = this.defaultPresetPath;
        } else {
          console.warn("No personality template found");
          return null;
        }
      }

      // 2. Get current file modification time
      const currentMtime = fs.statSync(this.templatePath).mtimeMs;

      // 3. Reload ONLY if file changed or cache empty
      if (currentMtime > this.cacheMtime || !this.cache) {
        const content = fs.readFileSync(this.templatePath, "utf-8");
        const templateData = yaml.load(content);
        this.cache = templateToPrompt(templateData);
        this.cacheMtime = currentMtime;
        console.info("Loaded personality template");
      }

      return this.cache;
    } catch (e) {
      console.error(`Failed to load personality template: ${e}`);
      return null;
    }
  }
}
```

**Critical behaviors:**

1. **mtime-based invalidation** - only re-parse when file changes
2. **Fallback chain** - `active.txt` → `default.txt` → null
3. **Exception safety** - never crash, return null on any error
4. **Lazy instantiation** - don't load until first request

#### D) API Endpoint Details from `personality_manager.py`

**Validation function `_validate_template()` (Lines 48-74):**

| Validation                      | Type | Action on Failure                                             |
| ------------------------------- | ---- | ------------------------------------------------------------- |
| YAML parseable                  | Hard | HTTP 400 with parse error                                     |
| Is a dictionary                 | Hard | HTTP 400: "Template must be a YAML dictionary"                |
| Has `identity` section          | Hard | HTTP 400: "Template missing required sections: identity"      |
| Has `communication` section     | Hard | HTTP 400: "Template missing required sections: communication" |
| Has `identity.name` field       | Hard | HTTP 400: "Template must have 'identity.name' field"          |
| Has `response_behavior` section | Soft | Log warning only                                              |
| Has `memory_usage` section      | Soft | Log warning only                                              |

**Filename sanitization (Lines 210-214):**

```python
safe_name = "".join(c for c in request.name if c.isalnum() or c in (' ', '-', '_')).strip()
safe_name = safe_name.replace(' ', '_').lower()
if not safe_name:
    safe_name = "custom"
```

**Active template protection (Lines 319-323):**

```python
if ACTIVE_FILE.exists():
    active_content = ACTIVE_FILE.read_text(encoding="utf-8")
    custom_content = custom_file.read_text(encoding="utf-8")
    if active_content == custom_content:
        raise HTTPException(status_code=400, detail="Cannot delete currently active template")
```

**Hash optimization for preset matching (Lines 138-149):**

```python
content_hash = hash(content)
template_id = "custom"
is_preset = False

for preset_file in PRESETS_DIR.glob("*.txt"):
    preset_content = preset_file.read_text(encoding="utf-8")
    # Fast hash check first, then content compare only if hash matches
    if hash(preset_content) == content_hash and preset_content == content:
        template_id = preset_file.stem
        is_preset = True
        break
```

#### E) Directory Structure (Must Match)

```
templates/
  personality/
    active.txt           # Currently active template (YAML)
    presets/             # Read-only, shipped with app
      default.txt        # Balanced assistant
      professional.txt   # Business-focused
      teacher.txt        # Educational
    custom/              # User-editable, persistent
      *.txt              # User-created templates
```

#### F) Integration Point in Prompt Building (Line 1276-1286)

The personality prompt is injected as the **FIRST** section of the complete prompt:

```python
def _build_complete_prompt(self, message, conversation_history):
    parts = []

    # IDENTITY FIRST (Personality anchors behavior)
    personality_prompt = self._load_personality_template()
    if personality_prompt:
        parts.append(personality_prompt)
    else:
        # Fallback default if no template loaded
        parts.append("""You are Roampal - a memory-enhanced AI with persistent knowledge across all sessions.
Unlike typical AI assistants, you have access to a continuously learning memory system that:
• Remembers everything from past conversations
• Learns what works for this specific user
• Provides context automatically before you respond""")

    # ... rest of prompt building continues
```

#### G) Implementation Checklist for Personality System

- [ ] Create `PersonalityLoader` class with mtime-based caching
- [ ] Implement `templateToPrompt()` conversion function with full field support
- [ ] Add pronoun disambiguation to converted prompt (CRITICAL)
- [ ] Add `formatting` section to YAML schema
- [ ] Implement validation with hard/soft separation
- [ ] Add filename sanitization for custom templates
- [ ] Add hash-based preset matching optimization
- [ ] Add active template protection on delete
- [ ] Inject personality as Section 1 of system prompt
- [ ] Add fallback to hardcoded default if template fails
- [ ] Copy template files from `roampal/backend/personality/` to target location

---

### 3.5 Retrieval & Ranking Service

**Name:** `SearchService`  
**Responsibilities**

- Provide a hard upper bound on the entire search pipeline:
  - enforce an end-to-end timeout (default 15s) and fail open to empty results
  - pass a shared request deadline down into Qdrant/Mongo/reranker adapters
- Multi-source candidate generation:
  - Qdrant ANN candidates (dense)
  - Mongo full-text candidates (BM25-like v1)
  - RRF fusion (vector + text)
- Dedup by memoryId
- Apply Roampal-inspired weighting:
  - tier fairness multipliers
  - memory_bank quality distance reduction
  - KG entity boost
  - dynamic learned-vs-embedding weighting
- Cross-encoder rerank (Hebrew-capable) on capped K:
  - Score top-N candidates with a cross-encoder model (query+doc jointly encoded)
  - Blend scores: **40% original + 60% cross-encoder**
  - Graceful fallback to original ranking on reranker timeout/unavailable
- Prevent request-thread stalls:
  - do not run CPU-heavy reranking or large merges synchronously on the streaming path
  - any potentially blocking work must be isolated (separate service or worker pool) and protected by timeouts
- Return:
  - final ranked items
  - debug metadata (scores, sources, stage latencies)

#### Ranking Formula (Roampal Parity Specification)

1.  **Ghost Filtering (Pre-check):**

    - Must filter out `doc_id`s present in `GhostRegistry` independent of vector results.

2.  **Known Solution Boost (Problem Solving):**

    - Check `KG.problem_solutions` for the current query signature.
    - If a `doc_id` is a known solution: `distance *= 0.5` (strong boost).

3.  **Entity Quality Boost (Content Graph):**

    - For `memory_bank` results, extract entities from query.
    - Match against doc's entities in `ContentGraph`.
    - Calculate `boost = sum(entity_quality) * 0.2`.
    - Apply: `distance *= (1.0 / (1.0 + min(boost, 0.5)))`.

4.  **Action Effectiveness Boost (Reinforcement Learning):**
    - Check `KG.context_action_effectiveness` for the `doc_id`.
    - If `uses >= 3`:
      - `multiplier = 0.7 + (success_rate * 0.6)`
      - `distance /= multiplier`

---

### 3.5.1 Intent Routing Strategy (Basic + OG Heuristics)

**Name:** `RoutingService` (extends `IntentRouterInterface`)

**Goal:** Provide fast-path intent detection to bypass or urge specific LLM tool usage, saving latency and cost for obvious commands.

**Dual Architecture (Ported from Roampal):**

1.  **Basic Router (`BasicIntentRouter`):**

    - **Responsibility:** Detect explicit memory management commands.
    - **Keywords:** `add goal`, `list goals`, `remove goal`, `add value`, `remember that`.
    - **Action:** Direct mapping to `ActionType.ADD_GOAL`, etc.

2.  **OG Router (`OGIntentRouter` - Heuristic Layer):**
    - **Responsibility:** Advanced command parsing, factual query detection, and book lookups.
    - **Components to Port:**
      - **Regex Dispatcher:** Handle slash commands like `/save_learning`, `/og help`.
      - **Factual Triggers (Fast Path):** Detect `["price of", "latest news", "weather"]` → Strongly hint `web_search`.
      - **Book Lookups:** Detect patterns `r"quote.*from.*book"` → Hint `search_memory(tier='books')`.
      - **Multi-part Queries:** Split input on `;` or numbered lists (`1.`, `2.`) to handle compound requests.
      - **Negative Lookahead (Crucial):** Explicitly **skip** web search if input contains image context markers (`"analyze this image"`, `"image content:"`) to prevent hallucinated searches on multimodal inputs.

**Integration Strategy:**

- Run `RoutingService.determine_action(user_input)` **before** the main LLM call in `runMcpFlow`.
- If a specific `Action` is returned (e.g., `PERFORM_WEB_SEARCH`), inject a system prompt hint: _"User intent likely requires web search. Check tool availability."_ or auto-select the tool if confidence > 0.9.

---

### 3.6 Outcome Service

**Name:** `OutcomeService`  
**Responsibilities**

- Record outcomes:
  - explicit feedback (worked/failed/partial)
  - tool-run outcomes (timeout, error, success)
- Update memory statistics:
  - uses count, last_used
  - success/failure counts
  - Wilson score
- Produce “action effectiveness” summaries for routing/promotion

**Roampal parity constraints (must preserve)**

- Outcome-based score updates apply ONLY to: `working`, `history`, `patterns`.
- `books` and `memory_bank` must NEVER be outcome-scored (no promotion/demotion based on chat outcomes).
- Routing KG must still learn from outcomes even when the selected tier was `books` or `memory_bank`.
- Deterministic score updates (Roampal v0.2.5 behavior):
  - `worked` → +0.2 (cap at 1.0)
  - `failed` → -0.3 (floor at 0.0)
  - `partial` → +0.05
  - `unknown` → no change
- User-facing outcome recording must stay fast:
  - synchronous fast path: update per-doc metadata + queue learning
  - deferred path: KG routing update, concept extraction, problem-solution tracking (best-effort, async)

### 3.6.1 Outcome Detector (Advanced LLM-Based)

**Source:** `modules/advanced/outcome_detector.py`

**Purpose:** Analyze conversation history to detect implicit success/failure signals without relying on brittle heuristics. This component is the "eyes" of the learning system.

**Critical Constraint:**

- **LLM-Only:** This detector uses **no heuristic fallback**. It relies entirely on the LLM's distinct ability to understand nuance (e.g., sarcasm, topic shifts).
- **Triggers:** Run primarily on conversation conclusion or after significant turn counts (e.g., every 4 turns).

**Logic Flow:**

1.  **Input:** Validation ensures at least 2 turns of conversation history.
2.  **Formatting:** Truncate messages to 500 chars to fit context window.
3.  **Analysis:** Call LLM with strict JSON-enforcing prompt.
4.  **Output:** `{ outcome, confidence, indicators, reasoning }`.

**Prompt Definition (Must be hardcoded or strictly templated):**

```text
Evaluate if the assistant's response was helpful. Judge both user feedback AND response quality.

"worked": ENTHUSIASTIC satisfaction or clear success
  • "thanks!", "perfect!", "awesome!", "that worked!"
  • User moves to NEW topic (indicates previous was resolved)
  • NOT worked: "yea pretty good", "okay", follow-up questions

"failed": Dissatisfaction, criticism, or confusion
  • "no", "nah", "wrong", "didn't work"
  • Criticism: "why are you...", "stop doing..."
  • Repeated questions about SAME issue (solution didn't work)
  • Follow-up questions expressing confusion

"partial": Lukewarm (positive but not enthusiastic)
  • "yea pretty good", "okay", "sure", "I guess", "kinda"
  • Helped somewhat but incomplete

"unknown": No clear signal yet
  • No user response after answer
  • Pure neutral: "hm", "noted"

CRITICAL: Follow-up questions are NOT success signals. User continuing conversation ≠ satisfaction.

CONVERSATION:
{formatted_conversation_history}

Return JSON only:
{
    "outcome": "worked|failed|partial|unknown",
    "confidence": 0.0-1.0,
    "indicators": ["signals"],
    "reasoning": "brief why"
}
```

**Integration:**

- `OutcomeService` calls `OutcomeDetector.analyze(history)`.
- If `confidence` > 0.7, apply score updates defined in Section 3.6.
- If `confidence` < 0.7, treat as `unknown` (no score change).

---

### 3.7 Promotion Service (Single Deterministic Owner)

**Name:** `PromotionService`  
**Responsibilities**

- Promote based on deterministic rules:
  - Working → History: score ≥ 0.7 AND uses ≥ 2
  - History → Patterns: score ≥ 0.9 AND uses ≥ 3
- Cleanup:
  - Working TTL 24h
  - History TTL 30d (preserve high-value based on score/uses)
  - Garbage cleanup (working/history/patterns only): delete or archive items below a fixed score threshold (default <0.2)
- Enforce invariants:
  - no duplicate cleanup paths
  - idempotent promotions
  - atomic “state transitions” recorded in Mongo events
- Trigger points:
  - On startup: run immediately once
  - Scheduled: every 30 minutes
  - Triggered: every N messages and on conversation switch

**Scheduler correctness (Roampal v0.2.10 lesson)**

- The scheduler loop must run promotion/cleanup first, then sleep (never sleep at loop start).
- Avoid redundant cleanup calls:
  - if promotion already performs TTL cleanup, do not run a second cleanup function in the same cycle.

---

### 3.8 Consistency Service

**Name:** `ConsistencyService`  
**Responsibilities**

- Periodic checks:
  - Mongo has active memoryId but Qdrant missing point
  - Qdrant has point but Mongo missing or archived (tombstone handling)
- Repair actions:
  - re-upsert missing points from Mongo
  - delete stray points or mark them in a quarantine list
- Produces metrics and an admin UI report

---

### 3.9 Reindex Service

**Name:** `ReindexService`  
**Responsibilities**

- Full rebuild of Qdrant from Mongo truth
- Checkpointing:
  - batch cursors
  - last processed updatedAt
- Safe to run while system is live (throttled)

---

### 3.10 Metrics Service

**Name:** `MemoryMetrics`  
**Responsibilities**

- Collect stage metrics in-request and background:
  - qdrant_query_ms, bm25_query_ms, merge_ms, rerank_ms
  - hits per tier, selected tier distribution
  - reranker called count, reranker timeout count
  - tool-call savings (see section 9)
  - outcome events count, promotion counts
- Export to:
  - logs
  - optionally a Mongo `memory_metrics_daily` rollup collection

---

### 3.11 Roampal Parity Essentials (Must Not Omit)

These are non-optional behaviors extracted from Roampal’s architecture + roampal-core release notes, and must be explicitly implemented in this plan to avoid subtle regressions.

**A) Always-inject identity context (memory_bank)**

- Add an `always_inject: boolean` flag for `memory_bank` items.
- `prefetchContext()` must always include all `always_inject=true` items in the injected context, even when semantically unrelated to the current query.

**B) Non-destructive delete semantics for books (Ghost/Tombstones)**

- Do not require synchronous “hard delete from vector index” to make books disappear.
- Implement `removeBook(title|doc_id)` as:
  - mark Mongo truth entries as `status="deleted"` (or store tombstones in a dedicated collection), and
  - ensure both retrieval and book listing filter them out immediately.
- Keep a future “compact”/“vacuum” path (admin action) that can physically delete Qdrant points later.

**C) No truncation policy for tool outputs**

- `search_memory` and `get_context_insights` must return full memory content (limit by count, not characters).
- If UI needs previews, provide a separate `preview` field; do not truncate the canonical `content`.

**D) Dynamic context sizing (5–20 results)**

- Implement a deterministic `estimateContextLimit(query)`:
  - broad queries (“show me all…”, “list…”, “everything…”) → 20
  - how-to / medium complexity → 12
  - specific identity lookup (“my name…”) → 5
- Use this limit for system-driven prefetch and for default tool parameters when caller omits `limit`.

**E) MCP protocol completeness (only if exposed as an MCP server)**

- If this memory system is also exposed as an MCP server (not just internal tools), implement protocol-required handlers:
  - `prompts/list` → empty list is fine
  - `resources/list` → empty list is fine

**F) Action KG example hygiene**

- When deleting/ghosting books, remove Action-KG examples that reference removed doc_ids (prevents stale doc effectiveness stats).
- Store action examples bounded (keep last N per key) to prevent unbounded growth.

---

### 3.12 Book Management API (Ingestion & Search)

**Name:** `BookController` (mapped to SvelteKit `src/routes/api/books/*`)

**Goal:** Provide enterprise-grade document ingestion with real-time feedback, supporting formats like PDF, DOCX, CSV, and HTML.

**API Routes:**

1.  **Ingestion (`POST /api/books/upload`)**

    - **Logic:**
      1.  Validate file (extension + 10MB limit).
      2.  Check duplicates (hash/title).
      3.  Save file to `uploads/` volume.
      4.  Extract content using `FormatExtractor` (port from Python -> TS/Docling).
      5.  **Spawn Async Job:** Do not await chunking/embedding. Return `task_id`.
    - **Response:** `{ success: true, task_id: "uuid" }`

2.  **Progress Tracking (`GET /api/books/progress/[taskId]`)**

    - **Protocol:** Server-Sent Events (SSE) or Long Polling.
    - **Why:** Simpler than WebSockets in SvelteKit; provides same "live progress bar" UX.
    - **State:** Read task progress from Redis `task:progress:{taskId}` (updated by the async job).

3.  **Deletion (`DELETE /api/books/[id]`)**
    - **Logic:**
      1.  Remove metadata from Mongo.
      2.  Remove chunks from Qdrant (`delete points`).
      3.  **Critical:** Add chunk IDs to **Ghost Registry** (see below).
      4.  Clean up Action KG references.

**Ghost Registry (Roampal Parity Component):**

- **Problem:** HNSW indexes (Qdrant) sometimes retain deleted points in the graph structure for a while, leading to "ghost" hits even after deletion.
- **Solution:** Maintain a Redis set `ghost_registry:{collection}` containing IDs of deleted chunks.
- **Query Time:** Filter out any results present in the Ghost Registry.
- **Expiration:** Entries can expire after Qdrant reorganization/optimization runs.

**Background Job Strategy (Robustness):**

- **Implementation:** Since we are in a single-container (or few containers) environment, use `Promise.resolve().then(...)` for non-blocking execution.
- **Tracking:** Track state in Redis (`pending` -> `processing` -> `completed`/`failed`) to survive simple reloads/timeouts if possible.
- **Note:** For full enterprise usage, a dedicated queue (like BullMQ) is better, but this lightweight approach fits the current container constraints while maintaining UX responsiveness.

---

### 3.13 Shared Utilities & Resilience

**Name:** `SharedUtils` (lib/server/utils)

**Goal:** Provide reusable infrastructure for robustness, safety, and text processing parity.

**Components:**

1.  **Circuit Breaker (`circuitBreaker.ts`)**

    - **Port:** `roampal/backend/utils/circuit_breaker.py`
    - **Logic:**
      - States: Closed (normal), Open (fail-fast), Half-Open (test).
      - Config: Threshold (3-5 failures), Reset Timeout (30-60s).
    - **Targets:** `DictaEmbedder`, `QdrantClient`, `TavilyClient`, `PerplexityClient`.

2.  **Disclaimer Manager (`disclaimerManager.ts`)**

    - **Port:** `roampal/backend/utils/disclaimer_manager.py`
    - **Responsibility:** Inject safety warnings based on keyword triggers.
    - **Triggers:**
      - Medical (`doctor`, `health`, `treatment`) → `chat_medical` warning.
      - Financial (`invest`, `bitcoin`, `stock`) → `chat_financial` warning.
      - Legal (`lawyer`, `contract`, `sue`) → `chat_legal` warning.
    - **Integration:** `runMcpFlow.ts` should derive metadata from this manager to append to the final response object.

3.  **Text Processing (`textUtils.ts`)**
    - **Port:** `roampal/backend/utils/text_utils.py`
    - **Thinking Extraction (Crucial):**
      - Implement `extractThinking(text)` to separate `<think>` blocks from the final answer.
      - UI must render `<think>` blocks in a collapsible "Reasoning" details element.
    - **Fluff Stripping:** `stripFluffPhrases(text)` for cleaner Intent Routing.

---

### 3.14 Enterprise MCP Integration (Compliance)

**Goal:** Integrate Roampal as a first-class enterprise service in BricksLLM, strictly following `add_mcp_guidelines.md`.

**A. Docker Containerization Strategy:**

- **Dockerfile:** Create `roampal/Dockerfile` based on `python:3.11-slim`.
- **Compose Service:** Add `dictachat-memory-mcp` to `docker-compose.yml` (mirroring DataGov setup).
  - Port `27182`.
  - Volume mount for persistence (`./data/roampal:/app/data`).

**B. Tool Intelligence (`toolIntelligenceRegistry.ts`):**

- **Register Tools:** `search_memory`, `add_to_memory_bank`, `get_context_insights`.
- **Latency Tier:** `medium` (vector search is fast, but reasoning takes time).
- **Messages:** Add Hebrew feedback strings ("מחפש בזיכרון...", "שומר תובנה...").
- **Priority:** High (`85`) - Memory should be consulted early.

**C. Parameter Normalization (`toolParameterRegistry.ts`):**

- **Normalization:** Map `q`, `search`, `text` -> `query` for search tools.
- **Validation:** Force `tags` to be an array, `importance` to be a number (0-1).

**D. Hebrew Intent Detection (`hebrewIntentDetector.ts`):**

- **Domain:** `memory`
- **Keywords:** `זכור`, `תזכור`, `מה סיכמנו`, `הוסף לזיכרון`, `remember`, `recall`.
- **Expansion:** Map to `get_context_insights` or `search_memory`.

**E. RunMcpFlow Alignment (Avoid Clashes):**

- **Orchestration:** BricksLLM's `runMcpFlow.ts` owns the loop.
- **Hook Avoidance:** Do NOT run Roampal's internal FastAPI hook server (`server/main.py`). The MCP server itself is sufficient.
- **Context Injection:** Rely on the LLM calling `get_context_insights` or explicit tool use, rather than "invisible" hooks, to prevent race conditions.
- **TracePanel:** Ensure `extractThinking` works so users see the memory reasoning process.

---

### 3.15 Hebrew & DataGov Expansions (DictaChat Specific)

**Goal:** Ensure the Memory System acts as a native Hebrew/DataGov extension, leveraging the robust logic already built in `datagov/query_builder.py`.

**A. Shared Hebrew Morphology:**

- **Reuse Logic:** Import `get_hebrew_variants` and `get_all_synonyms` from `datagov.query_builder` (add `datagov` to `PYTHONPATH` or refactor to shared `lib`).
- **Memory Search:** Update `SearchService.search_memories`:
  - Before vector search: Expand query tokens using `get_hebrew_variants`.
  - Example: Query "רכבים" -> search also for "רכב", "לרכבים".
- **Synonym Expansion:** Use `_BIDIRECTIONAL_EXPANSIONS` to boost recall.
  - Query "ביהח" -> expands to "בית חולים", "hospital" -> matches memory "visited Hadassah".

**B. DataGov Schema Ingestion (Knowledge Graph):**

- **One-Time Job:** `ingest_datagov_schemas.py`
- **Logic:**
  - Read `datagov/enterprise_schemas.json`.
  - For each Dataset:
    - Create a `pattern` tier memory: "Dataset: [Title] (ID: [id]) contains fields: [fields]".
    - Extract Concepts: Title, Keywords, Category.
    - Create KG Edges: `[Concept] --(HAS_DATASET)--> [DatasetID]`.
- **Benefit:** The agent "knows" what government data exists without querying the `datagov` tool blindly.

**C. Enterprise Expansions Integration:**

- **Source:** `datagov/enterprise_expansions.py` (21 domains, 300+ terms).
- **Action:** Load these into the `KnowledgeGraphService` as pre-defined synonym edges.
- **Result:** "Housing" queries automatically route to "Diur" (דיור) memories.

---

## 4) Data Model (MongoDB Truth)

### 4.1 `memory_items` (canonical memory objects)

**Document fields**

- `_id`: ObjectId
- `memory_id`: string (UUID; stable primary identifier across systems)
- `user_id`: string
- `org_id`: string | null
- `tier`: `"working" | "history" | "patterns" | "books" | "memory_bank"`
- `status`: `"active" | "archived" | "deleted"`
- `tags`: string[] (identity, preference, project, context, goal, workflow)
- `always_inject`: boolean (memory_bank only; default false)
- `text`: string (canonical content)
- `summary`: string | null (optional compact)
- `entities`: string[] (concept IDs or normalized entity names)
- `source`:
  - `type`: `"user" | "assistant" | "tool" | "document" | "system"`
  - `conversation_id`: string | null
  - `message_id`: string | null
  - `tool_name`: string | null
  - `tool_run_id`: string | null
  - `doc_id`: string | null
  - `chunk_id`: string | null
  - `book` (books only, optional):
    - `book_id`: string
    - `title`: string
    - `author`: string | null
    - `chunk_index`: number
    - `source_context`: string | null
    - `doc_position`: number | null
    - `has_code`: boolean | null
    - `token_count`: number | null
    - `upload_timestamp`: Date | null
- `quality` (memory_bank only, optional elsewhere):
  - `importance`: number (0..1)
  - `confidence`: number (0..1)
  - `mentioned_count`: number
  - `quality_score`: number (importance \* confidence)
- `stats`:
  - `uses`: number
  - `last_used_at`: Date | null
  - `worked_count`: number
  - `failed_count`: number
  - `partial_count`: number
  - `unknown_count`: number
  - `success_rate`: number (derived)
  - `wilson_score`: number (derived; used for promotion and ranking)
  - `initial_score`: number (0..1, default 0.5) - used for seeded takeaways (worked=0.7, failed=0.2)
  - Constraint: for `books` and `memory_bank`, outcome counts and Wilson must not be updated (authoritative stores).
- `timestamps`:
  - `created_at`: Date
  - `updated_at`: Date
  - `archived_at`: Date | null
  - `expires_at`: Date | null (working/history TTL)
- `embedding`:
  - `model`: string
  - `dims`: number
  - `vector_hash`: string (hash(text + prefix + model))
  - `last_indexed_at`: Date | null
- `versioning`:
  - `current_version`: number
  - `supersedes_memory_id`: string | null

**Indexes**

- `(user_id, tier, status)`
- `(user_id, status, timestamps.updated_at)`
- `(tier, timestamps.expires_at)` for TTL cleanup scanning
- `memory_id` unique

---

### 4.2 `memory_versions` (archived prior versions)

- `_id`, `memory_id`, `version`, `archived_text`, `archived_at`, `archived_quality`, `archived_source`

---

### 4.3 `memory_outcomes` (events)

- `_id`
- `user_id`, `conversation_id`, `message_id`
- `subject`:
  - `type`: `"memory" | "tool_run" | "answer"`
  - `memory_ids`: string[]
  - `tool_runs`: `{ name, run_id, ok, timeout, error_type }[]`
- `outcome`: `"worked" | "failed" | "partial" | "unknown"`
- `signal`:
  - `source`: `"explicit_user_feedback" | "heuristic" | "system"`
  - `confidence`: number (0..1)
- `timestamp`: Date
- `debug` (optional): stage metrics snapshot

---

### 4.4 Knowledge Graphs (Intelligence Layer) — MUST-HAVE

**Profound realization:** The 5 memory tiers are storage. The intelligence that makes the system fast, aligned, and self-improving lives in **Knowledge Graphs (KGs)**.

Roampal-style design: maintain **three KGs** that work together and are updated from outcomes:

#### 4.4.1 Routing KG (“which tier should I search?”)

**Collections:** `kg_routing_concepts`, `kg_routing_stats`

**Purpose**

- Maps concepts → best tier(s) to search.
- Learns from outcomes and updates per-tier success rates.
- Prevents brute-force searching across all tiers at full depth.

**Data model (Mongo truth)**

- `kg_routing_concepts`
  - `user_id`, `concept_id`, `label`
  - `aliases`: string[] (Hebrew/English spellings + acronym-expanded variants)
  - `first_seen_at`, `last_seen_at`
- `kg_routing_stats`
  - `user_id`, `concept_id`
  - `tier_success_rates`: `{ working, history, patterns, memory_bank, books }` each storing:
    - `success_rate`, `wilson_score`, `uses`, `worked`, `failed`, `partial`, `unknown`, `last_used_at`
    - `success_rate` MUST be computed from explicit outcomes only:
      - `success_rate = worked / (worked + failed)` when `(worked + failed) > 0`
      - otherwise `success_rate = 0.5` (neutral baseline)
      - `partial` is tracked but MUST NOT affect `success_rate` (Roampal parity)
  - `best_tiers_cached`: string[]

**Update triggers (explicit and deterministic)**

- On each explicit outcome (Worked/Failed/Partial) for a response:
  - Extract concepts from:
    - the query (normalized + acronym-expanded)
    - the retrieved memory IDs used
    - tool outputs referenced in the final answer
  - For each concept, update the tier stats for tiers that contributed top-k candidates.

**Search-time tier plan (fast routing)**

- Given query concepts:
  - Always include `working` (global search across all conversations).
  - Add the top recommended tiers from Routing KG (by wilson_score).
  - If KG is cold/empty: search all tiers with conservative limits.

#### 4.4.2 Content KG (“what entities are related?”) — CRITICAL

**Collections:** `kg_nodes`, `kg_edges`, optional `kg_entity_aliases`

**⚠️ CRITICAL FEATURE — DO NOT DISABLE OR REMOVE ⚠️**
This graph powers organic recall, entity continuity, and the green/purple node visualization.

**Dual-graph mental model (must be preserved)**

- Routing KG is about: what the user searches for → which tier answers it.
- Content KG is about: what the user _is / does / uses_ → entity relationships derived from stored facts.

**Core features (explicit)**

- Entity extraction from memory content (especially memory_bank; later books).
- Co-occurrence based relationship strength and updates on every write.
- BFS path finding between entities (for UI “how are these connected?”).
- Automatic cleanup on memory deletion/archive to prevent stale edges.
- Metadata per entity: `first_seen`, `last_seen`, `mentions`.

**Quality-based entity ranking (mirrors Roampal v0.2.1)**

- Entities maintain quality derived from memory_bank `importance × confidence`:
  - `avg_quality = sum(importance × confidence) / mentions`
- Entities are ranked by `avg_quality` (not by mentions) so authoritative facts beat trivia.

**Content KG → memory_bank search enhancement (required)**

- Apply an additional boost ONLY when searching `memory_bank`:
  - For each matching entity in a candidate, `boost += entity.avg_quality × 0.2`.
  - Cap total boost at 50% (max 1.5× multiplier).
- Other tiers keep their normal ranking (no entity boost).

**Entity extraction update triggers (required)**

- On memory_bank store/update/archive:
  - extract entities (heuristic first; optional model-assisted)
  - update nodes/edges
  - update `avg_quality` aggregates
- On books publish-to-library:
  - extract entities for book chunks (optional v1; recommended v2)

**UI visualization semantics (Roampal-inspired quad-color)**

- 🔵 Blue nodes: routing concepts (what you search)
- 🟢 Green nodes: content entities (who you are / what you use)
- 🟣 Purple nodes: intersection (both routing + content)
- 🟠 Orange nodes: action effectiveness patterns

#### 4.4.3 Action-Effectiveness KG (“what should I do in this context?”)

**Collections:** `kg_action_effectiveness`

**Purpose**

- Learns which actions/tools are effective for each detected context.
- Enables self-correction and alignment:
  - avoid low-success actions
  - prefer actions proven effective for this context

**Data model (Mongo truth)**

- `kg_action_effectiveness`
  - `user_id`
  - `context_type`: string (e.g., `docker`, `debugging`, `datagov_query`, `doc_rag`, `coding_help`, `general`)
  - `action`: string (memory actions + external tool actions)
    - memory actions: `search_memory`, `create_memory`, `update_memory`, `archive_memory`
    - external: `datagov_query`, `docling_convert`, `tavily_search`, `perplexity_ask`, etc.
  - `tier`: string | null
  - `success_rate`, `wilson_score`, `uses`, `worked`, `failed`, `partial`, `unknown`
  - `examples`: compact provenance examples:
    - `{ timestamp, conversation_id?, message_id?, query_preview, outcome, memory_ids?, tool_runs?, doc_ids? }`

**Context detection (required)**

- On each user message (and optionally each tool call), classify `context_type`.
- Use the context_type for:
  - Organic Memory Recall insights
  - tool filtering/gating
  - action-effectiveness updates

**Action caching + boundary safety (required for correctness)**

- Maintain an in-memory “action cache” per conversation turn while tools execute:
  - record actions taken (which tiers searched, which tools invoked)
  - when outcome is later recorded, apply it to the cached actions
- Boundary rule:
  - In BricksLLM you have `conversation_id`, so key caches by conversation_id + turn_id.
  - If external MCP integrations are added later without conversation IDs, add heuristics (time-gap/context-shift) to avoid misattribution.

**HUD / prompt integration (actionable insights)**

- Expose `get_context_insights(context_type, concepts)` that returns:
  - tier recommendations (Routing KG)
  - action success rates (Action KG)
  - top relevant facts (Content KG)
- The Organic Memory Recall block must include a short “Tool Usage Stats” section when helpful.

**Document-level effectiveness (derived from Action KG examples)**

- Store `doc_ids` in examples when actions touch documents/books.
- Derive doc effectiveness stats by scanning examples:
  - If `collection in ["memory_bank","books"]` and `doc_uses >= 3`:
    - `effectiveness_boost = success_rate × 0.15` (max +15% boost)

**Operational constraints (Roampal parity)**

- Routing KG must learn from outcomes for all tiers (including `books` and `memory_bank`).
- Outcome-based score updates must never modify `books` or `memory_bank` items (they are authoritative stores, not promotable patterns).
- Action KG may treat `partial` as 0.5 success for action effectiveness, but routing success_rate must ignore partial (worked/failed only).

**KG UI requirements (Roampal-inspired)**

- Time filters: All Time / Today / This Week / This Session
- Sort: Importance/hybrid score, Recent, Oldest
- Always show top 20 concepts based on active filter/sort
- Concept modal includes:
  - routing breakdown (best tiers)
  - per-tier success rates
  - action-effectiveness hints for common contexts

---

## 5) Qdrant Schema (Index)

### Collection: `memories_v1`

**Point ID**

- Use `memory_id` as point ID (string)

**Vectors**

- `dense`: float32[dims] (from embedding model)
- Optional future:
  - `sparse_bm25_like` or sparse embeddings if desired (not required if using real BM25 engine)

**Payload fields (must mirror filter needs)**

- `user_id`
- `org_id`
- `tier`
- `status`
- `tags` (array)
- `importance`, `confidence`, `quality_score` (memory_bank)
- `wilson_score`, `uses`, `last_used_at`, `created_at`
- `entities` (array; for entity boost prefiltering)
- `expires_at` (for TTL filtering)
- `model`, `vector_hash`

**Payload indexes**

- Index `user_id`, `tier`, `status`, `tags`, `expires_at`, `last_used_at` (depending on Qdrant capabilities and query patterns)

**Schema/bootstrap safety (Roampal v0.2.10 lesson, adapted)**

- Collection bootstrap must be idempotent:
  - creating the collection and payload indexes must not crash if they already exist
  - if a payload index is missing (older state), create it in a background-safe way (no request-path stall)

---

## 5.5) Contextual Retrieval (Contextualized Embeddings)

### Problem

- Memory chunks often lack surrounding context. Plain embeddings of isolated snippets degrade retrieval quality, especially for:
  - short preferences (“use debugger”) without situation
  - project conventions without project identity
  - book chunks with ambiguous terms

### Solution

Generate a **context prefix** per stored chunk and embed:

- `text_to_embed = context_prefix + "\n" + raw_text`

### Where it applies

- Applied **during storage** before calling the embeddings endpoint for:
  - working/history/patterns chunks
  - memory_bank items
  - books chunks (unless using a deterministic book prefix; see below)

### Context prefix generation (LLM)

- Use the existing OpenAI-compatible inference route (same model stack you already run) to produce 1–3 sentences that describe:
  - what the chunk is (preference, project fact, workflow, solution pattern)
  - when it applies (environment/framework/constraints when known)
  - any stable identifiers (project name, repository, book title/section)
- The prefix must be plain text (no markdown, no code fences).

### Books special case

- Always include a deterministic prefix for books, even if LLM is down:
  - `"Book: {title}. Section: {section}."`
- Optionally augment with LLM context, but never block ingestion.

### Timeouts + graceful fallback

- Hard timeout: **5 seconds** per context generation.
- If the LLM is unavailable/timeout/error:
  - Use `raw_text` unchanged, or the deterministic book prefix for books.
  - Continue indexing; never fail the write.

### Caching

- Cache by `vector_hash = hash(model + tier + (title/section for books) + raw_text)`:
  - If hash unchanged, reuse previous context_prefix and embeddings.

### Security and correctness

- Never include secrets/tokens/PII in the context prefix.
- Context generation must be deterministic enough to not drift embeddings unnecessarily; keep the prefix short and stable.

---

## 6) Retrieval: Hybrid + Quality + KG Boost (Concrete Ranking)

### 6.A End-to-end search flow (Roampal-style, adapted to Mongo + Qdrant + dicta-retrieval)

1. Query received → Preprocess (whitespace normalization + acronym expansion + bidirectional synonyms)
2. Organic Memory Recall (analyze context first; see 6.C) → produce structured insights for prompt injection
3. Extract concepts/entities (fast) → consult KGs:
   - Routing KG: decide which tiers to search deeply
   - Content KG: expand related entities for boosts
   - Action-Effectiveness KG: decide preferred actions/tools and avoid low-success ones
4. Generate embedding from the **preprocessed** query (dicta-retrieval embeddings endpoint)
5. For each tier selected by Routing KG (plus always include `working`):
   a. Vector search (Qdrant ANN) using query embedding + filters
   - **Working tier rule (True Continuity):** do NOT filter by `conversation_id`. Working is searched globally across all conversations for the user.
     b. Lexical search (Mongo full-text by default; optional cached BM25 for small corpora)
     c. RRF fusion of vector-ranked + lexical-ranked lists using: `Σ(1/(rank+60))`
6. Merge all tiers (fairness multiplier applies at candidate fetch depth; final ranking remains unified)
7. Dynamic ranking (learned-vs-embedding weighting + quality + KG entity boost)
8. Cross-encoder rerank top-30 (Hebrew-capable) when `candidate_count > limit × 2` (or when results are dense; configurable)
9. Return top-k

### 6.B Graceful degradation rules (must never break streaming)

- If lexical stage unavailable → fall back to vector-only search
- If cross-encoder unavailable → skip reranking and use dynamic ranking only
- If contextual prefix generation fails → embed original text (or deterministic book prefix)
- If any external dependency times out → return empty from that stage and proceed

### 6.C Organic Memory Recall (True Continuity + proactive insights)

**Goal:** The system should not just retrieve documents; it should surface what the memories _mean_ for the user right now.

**Key behaviors**

- True continuity:
  - Working memory is globally searchable across all conversations (user-scoped, no `conversation_id` filter).
  - The LLM already has the current conversation context to disambiguate; global search enables organic recall.
- Pattern recognition:
  - Detect recurring issues across conversation boundaries (“you tried this 3 times”).
- Failure prevention:
  - Surface prior failed approaches relevant to the current query (“this failed last Tuesday due to X”).
- Topic continuity:
  - Identify active topics from recent messages and connect to past related topics.
- Proactive insights:
  - Provide tier effectiveness hints (“patterns is 85% effective for docker/auth”).
- Repetition detection:
  - If the user asked something similar minutes ago in the current thread, surface that link.

**How KGs drive Organic Memory Recall (required)**

- Routing KG:
  - For the query concepts, retrieve best tiers and their success rates.
  - Use this to generate the “Recommendations” line (which tier to check first).
- Content KG:
  - Expand related concepts/entities for:
    - better recall summaries (topic continuity)
    - stronger entity boosts during retrieval
- Action-Effectiveness KG:
  - Use current `context_type` to report:
    - which memory actions are effective (search/store/update)
    - which external tools are effective (e.g., datagov/docling/tavily)
  - Use these hints both in the injected insight block and in tool filtering/gating decisions.

**Process (must run before normal retrieval)**

1. Analyze current conversation context:
   - Extract entities/topics from the last N messages (fast heuristic + KG lookups).
   - Detect repetition within the current conversation (near-duplicate queries).
2. Consult knowledge graph for routing signals:
   - Map extracted entities to KG nodes and fetch related “problem categories” and relationships.
3. Mine outcomes for relevant entities/topics:
   - Fetch top patterns and top failures by entity/topic from Mongo aggregates.
4. Produce a structured, compact insight block for prompt injection.

**Memory context injection format (stable, user-facing)**

- The injected block MUST be deterministic in structure:

```
═══ CONTEXTUAL MEMORY ═══

📋 Past Experience:
  • Based on {uses} past use(s), this approach had a {success_rate}% success rate
    → {short provenance example}

⚠️ Past Failures to Avoid:
  • Similar approach failed before due to: {reason}

💡 Recommendations:
  • For '{topic}', check {tier} collection (historically {tier_success}% effective)

🔗 Continuing discussion about: {topic_1}, {topic_2}

💡 You Already Know This (memory_bank):
  • {fact_1}
  • {fact_2}

Use this context to provide more informed, personalized responses.
```

**Important constraint**

- This block must remain short and stable; it is a guide for the LLM, not a replacement for retrieval.

### 6.C.1 Cold Start Context (Roampal parity)

- When a conversation starts (or after a long inactivity gap), inject a small cold-start block before the first response.
- Required retrieval method (Roampal v0.2.8 lesson): one deterministic semantic search call (no KG ranking, no fallbacks):
  - Search `memory_bank` using a fixed “identity + how to help” query:
    - `user name identity preferences goals what works how to help effectively learned mistakes to avoid proven approaches communication style agent mistakes agent needs to learn agent growth areas`
  - Merge-in all `memory_bank.always_inject=true` items (identity-only) regardless of search match.
- Required display format (Roampal v0.2.8 lesson): simplified bullets only:
  - header: `═══ KNOWN CONTEXT ═══`
  - bullet list of full content (no truncation)
  - footer: `═══ END CONTEXT ═══`
- Cold start must be purely best-effort:
  - never block streaming
  - hard cap by count (not characters)

### 6.0 Query normalization + acronym expansion (Hebrew/English)

- Before any retrieval stage, run:
  - `normalizeWhitespace(query)`
  - `expandAcronymsAndSynonyms(query)` producing:
    - `normalized_query` (string)
    - `expanded_terms` (set of strings)
    - `expanded_query_text` (string; suitable for embedding)
- Apply expansions to both:
  - Vector retrieval (embed `expanded_query_text`)
  - Lexical retrieval (Mongo full-text query built from normalized/expanded forms)
  - Cross-encoder reranking (use normalized/expanded query)

### 6.1 Candidate generation (fast, capped)

- From Qdrant (dense vectors):
  - Query dense vector topK per tier with fairness multiplier:
    - If requested `limit = 5`, fetch 15 per tier (Roampal-style 3× multiplier)
- From BM25 (v1 implementation = Mongo full-text):
  - Use Mongo text indexes as the initial lexical baseline for hybrid search in v1.
  - Return topK candidate `memory_id`s with a normalized `bm25_like_score` (details in 6.4.1).
  - This mimics Roampal’s “hybrid” behavior from `chromadb_adapter.py`, but using Mongo full-text + Qdrant instead of Chroma.
- Merge candidates by `memory_id`

### 6.1.1 Mongo full-text details (v1)

- Add Mongo text indexes on:
  - `memory_items.text`
  - optional: `memory_items.summary`
  - optional: `memory_items.tags` (as text) if useful
- Query filters MUST always include:
  - `user_id` (single-user now, but keep field)
  - `status: "active"`
  - `tier` constraints (searched tiers)
- Notes:
  - Mongo text search is not true BM25 and may diverge by language; v1 accepts this for simplicity.
  - The adapter interface should still be called `Bm25Adapter` so we can replace it later with a true BM25 engine without changing SearchService.

### 6.1.2 Hybrid fusion via Reciprocal Rank Fusion (RRF)

**Goal:** Mimic Roampal’s BM25+Vector hybrid without manual weight tuning.

**Inputs**

- `vector_ranked`: list of candidate `memory_id`s from Qdrant ANN search.
- `text_ranked`: list of candidate `memory_id`s from Mongo full-text search.

**RRF formula**

- For each candidate, compute:
  - `rrf_score = Σ(1 / (rank + 60))` across all rank lists where it appears.
  - Use 1-based rank (rank 1 is best).

**Output**

- `rrf_ranked`: candidates sorted by `rrf_score` descending.
- Keep per-source ranks for explainability.

**Graceful fallback**

- If Mongo full-text is unavailable/timeout:
  - `rrf_ranked = vector_ranked`
- If Qdrant is unavailable/timeout:
  - `rrf_ranked = text_ranked`

**How RRF feeds later ranking**

- Use `rrf_score` as an additional retrieval signal that can be blended into `embedding_similarity` (see 6.4.1).

### 6.2 memory_bank quality enforcement (3-stage, Roampal-inspired)

Only apply to `tier == memory_bank` items:

1. **Distance boost (pre-ranking)**

- `quality = importance * confidence`
- `adjusted_distance = L2_distance * (1.0 - quality * 0.8)`
- Clamp multiplier to a safe range to prevent pathological behavior (e.g., minimum 0.2)

2. **Distance → similarity conversion**

- `similarity = 1 / (1 + adjusted_distance)`

3. **Cross-encoder quality multiplier**

- After blended score (vector/BM25/CE), apply:
  - `final_score = blended_score * (1 + quality)`

### 6.3 KG Entity Boost (max 1.5×)

- Extract query entities (fast heuristic + optional model-assisted)
- For each candidate, compute overlap with candidate.entities
- Apply boost capped at 1.5×:
  - `entity_boost = 1 + min(0.5, entity_overlap_weighted_by_quality)`
- Apply after similarity, before final sort

### 6.4 Tier competition / routing

- Do not hardcode “patterns always wins”. Use a scoring blend with **dynamic weights** that shift from semantic matching to learned effectiveness as an item proves itself.
- Maintain explainability fields per hit:
  - `{ tier, vector_rank, text_rank, ce_rank, quality, entity_boost, embedding_weight, learned_weight, final_score }`

### 6.4.1 Dynamic weighted ranking (Roampal v0.2.5 concept, adapted)

**Goal:** High-value memories rank well even with imperfect queries, without collapsing cold-start behavior.

**Core formula**

- `combined_score = (embedding_weight × embedding_similarity) + (learned_weight × learned_score)`

**Definitions**

- `embedding_similarity`:
  - Primary: dense similarity from Qdrant (convert distance to similarity consistently).
  - Incorporate lexical and fusion signals in a controlled way:
    - Compute `text_similarity` from Mongo full-text rank (monotonic mapping by rank, not raw textScore).
    - Compute `rrf_score` from 6.1.2 and normalize to (0, 1].
  - Recommended v1 blend (configurable):
    - `embedding_similarity = 0.6*dense_similarity + 0.2*text_similarity + 0.2*rrf_similarity`
  - Rationale: keep dense semantic matching primary, but allow RRF and lexical ranks to rescue exact matches.
- `learned_score`:
  - For `working|history|patterns`: `wilson_score` (or a bounded success score derived from outcomes).
  - For `memory_bank`: `quality_score = importance × confidence` (authoritative store; not outcome-scored).
  - For `books`: `learned_score = 0` (authoritative store; never outcome-scored).
  - Optional: add a small recency factor, but do not let recency dominate learned effectiveness.

**Weight assignment logic** (initial policy; keep configurable)
| Memory Type | Uses | Score | Embedding Weight | Learned Weight |
|-------------|------|-------|------------------|----------------|
| Proven high-value | ≥5 | ≥0.8 | 20% | 80% |
| Established | ≥3 | ≥0.7 | 25% | 75% |
| Emerging (positive) | ≥2 | ≥0.5 | 35% | 65% |
| Failing pattern | ≥2 | <0.5 | 70% | 30% |
| Memory_bank (high quality) | any | any¹ | 45% | 55% |
| Memory_bank (standard) | any | any¹ | 60% | 40% |
| New/Unknown | <2 | any | 70% | 30% |

¹ High-quality memory_bank defined as `importance × confidence ≥ 0.8`.

**Interaction with memory_bank 3-stage quality enforcement (Section 6.2)**

- Keep Roampal’s quality enforcement in addition to dynamic weights:
  - pre-ranking distance boost
  - correct distance→similarity conversion
  - post-CE quality multiplier
- Rationale: dynamic weights control semantic vs learned balance; the 3-stage enforcement prevents CE from washing out quality.

**Cross-encoder reranking policy (Hebrew-capable, shared GPU)**

- Purpose: reduce false positives from first-stage retrieval (vector/text/RRF).
- Model: use a **Hebrew-capable** cross-encoder (to be selected). Roampal used `cross-encoder/ms-marco-MiniLM-L-6-v2` (English-only); we must choose a Hebrew or multilingual equivalent.
- When to run:
  - Run reranking only when there is enough candidate density to justify it:
    - If `candidate_count > limit × 2`, rerank top `N=30` (configurable).
    - Otherwise keep original ranking to save latency.
- How it runs:
  - Cross-encoder scores query+document pairs jointly.
  - Input pairs are built from the **canonical Mongo text** for each candidate (never from truncated prompt injections).
- Score blending (Roampal-style):
  - `blended = 0.40 * original_score + 0.60 * cross_encoder_score`
  - Use `blended` for final ordering (then apply memory_bank quality multiplier as specified in 6.2, to ensure quality survives reranking).
- Performance controls (shared GPU):
  - Hard cap top-N rerank (default 30).
  - Batch scoring requests.
  - Hard timeout; if timeout triggers, skip rerank and continue.
- Dependency + implementation shape:
  - Keep reranker behind a `RerankerAdapter` interface so we can swap models (Hebrew BERT package) without changing SearchService.
  - Prefer using `dicta-retrieval` reranker endpoint if it can host the chosen Hebrew cross-encoder; otherwise run a separate local reranker service.
- Graceful fallback:
  - If reranker is unavailable, errors, or times out: return results using original ranking (vector/text/RRF + learned weighting).

---

## 7) Deduplication Plan (v0.2.1 style)

### When to dedup

- On store/update of memory_bank (and optionally patterns)
- Also during retrieval merging (avoid near-duplicates in prompt)

### Similarity threshold

- Use the similarity conversion:
  - `similarity = 1 / (1 + distance)`
- Dedup when:
  - `similarity >= 0.80` (equivalently distance <= 0.25)

### Merge strategy

- Keep the higher-quality item’s metadata:
  - higher `quality_score` (importance\*confidence)
  - if tie, keep higher `wilson_score`, else most recent
- Increase `mentioned_count` on the winner
- Archive the loser as a version (status=archived) rather than hard delete

---

## 8) Deterministic Promotion Service (Single Owner)

### Rules

- Working:
  - TTL 24h
  - Promote to history if:
    - `wilson_score >= 0.7` AND `uses >= 2`
- History:
  - TTL 30d
  - Promote to patterns if:
    - `wilson_score >= 0.9` AND `uses >= 3`
- Patterns:
  - Permanent (no decay)
- Memory bank:
  - Permanent, max 1000 active items
  - Enforce capacity by archiving lowest-quality / lowest-value items:
    - rank by `(quality_score, wilson_score, last_used_at)` and archive bottom N when over cap
- Books:
  - Permanent
  - Contextual embedding prefix:
    - `Book: {title}, Section: {section}. {text}`

### Scheduling & triggers

- Run immediately at startup, then every 30 minutes
- Additionally trigger:
  - every 20 messages (configurable)
  - on conversation switch
  - after explicit outcome feedback (optional)

### Safety

- Only this service performs deletes/archives/promotions.
- All operations are idempotent:
  - promotion checks current tier/status
  - cleanup checks expires_at
  - record transition events for audit

---

## 8.9) Chat Flow (System-Driven Retrieval + Optional LLM Follow-up)

**Goal:** Keep chat UX fast by doing system-driven retrieval first, while still allowing the LLM to optionally refine retrieval via `search_memory` when needed.

### Chat Flow

```
User Message → Chat Service
    ↓
Analyze Conversation Context (Organic Memory Recall)
  • **Task Analysis (New)**:
    - Detect Complexity: `simple` / `medium` / `complex` (adjusts iteration limits).
    - Enforce Mode: Check if model supports `agent` / `learning` modes.
  • Extract concepts from current message + recent messages
  • Consult Routing KG for best tiers
  • Consult Content KG for related entities + failure links
  • Consult Action-Effectiveness KG for context-appropriate actions/tools
  • Identify failures to avoid + topic continuity + repetitions
    ↓
System-Driven Retrieval (uses search_memory mechanism)
  • Call search_memory(query=preprocessed_query, collections=tier_plan)
  • Internally executes: Vector (Qdrant) + Lexical (Mongo full-text / cached BM25) + RRF + Dynamic Ranking + (optional) Cross-Encoder top-30
  • Returns top-k memories + citations + per-tier success hints
    ↓
Inject Context Into Prompt
  • "═══ CONTEXTUAL MEMORY ═══" (Organic insights)
  • Retrieved memory snippets (compact)
  • **Smart Truncation**: Apply `smartTruncate` to fit `safe_context` limit.
  • Conversation history + user question
    ↓
LLM Receives Tools
  • search_memory tool definition (same mechanism; optional follow-up)
  • Other MCP tools
    ↓
LLM Generation
  ├─ **Monitoring**: Check `CoherenceScore` & `TokenBudget` per iteration.
  ├─ Optional: LLM calls search_memory (refinement)
  │    ↓
  │  Tool Execution (Backend)
  │    • Parse tool call
  │    • Execute search_memory (same handler)
  │    • Return results
  │    ↓
  │  LLM continues with refined results
  │
  └─ Final Response Generation
    ↓
Store Content in Memory (working/global) + Citations
    ↓
Outcome Detection (explicit feedback preferred)
    ↓
Memory Update & Learning
    ↓
Knowledge Graph Update (feeds future organic recall)
```

### Rules (to preserve fast chat)

- System-driven retrieval happens before first token streaming completes; it must be bounded by strict timeouts and fail open.
- The `search_memory` mechanism is the single unified retrieval interface, used both:
  - internally by the system prefetch step, and
  - externally by LLM tool calls.
- LLM follow-up `search_memory` calls are optional and must be constrained:
  - default: allow at most 1 refinement call per turn unless user explicitly asks for more search
  - enforce the same timeouts/circuit breakers as the prefetch stage
  - log and score the action in Action-Effectiveness KG

## 8.10) Learning Flow

```
Conversation → Outcome Detection
    ↓
Extract Concepts & Patterns
    ↓
Update Knowledge Graph
    ↓
Score Adjustment
    ↓
Memory Promotion/Demotion
```

## 8.11) Memory Tools (Tool-First API Without A Separate Server)

### Recommendation: use tools, but implement them in-process

- Use tool definitions (Roampal-style) so the LLM can optionally refine retrieval and manage memory.
- Do NOT require a FastAPI server for memory endpoints.
- Implement the tool handlers inside the same runtime that already executes tools in `runMcpFlow.ts`:
  - System-driven retrieval (prefetch) calls the same `search_memory` handler directly.
  - Optional LLM follow-up uses the same `search_memory` handler via tool calls.
  - Both paths MUST share the same per-turn `search_position_map` so `record_response.related=[1,3]` resolves to the same `memory_id`s the LLM saw in the numbered search output.

### Where the tools live

- Tools are registered as **internal tools** owned by BricksLLM’s SvelteKit server.
- Tool execution calls into `UnifiedMemoryFacade` (Mongo truth + Qdrant index + dicta-retrieval).
- This mirrors Roampal’s behavior (tool-driven memory) while preserving your current deployment model.

### Tool execution contract (must be implemented)

- A per-turn tool context object is maintained in `runMcpFlow`:
  - `turn_id`
  - `search_position_map`: `position -> memory_id` for the most recent `search_memory` call
  - `last_search_results`: list of `memory_id`s returned
  - `last_query_normalized`: the normalized/expanded query used
- `record_response.related` supports:
  - positional references (1,2,3) resolved via `search_position_map`
  - explicit `memory_id` strings
- Safe default: invalid `related` inputs fall back to scoring all `last_search_results`.

### Tool set (refactored for BricksLLM)

#### 1) get_context_insights

**Name:** `get_context_insights`

**Purpose**

- Roampal’s “intuition”: fast KG-only lookups before retrieval.

**Parameters**

- `query` (string, required)

**Behavior**

- Runs without embeddings (KG hash/lookup only).
- Returns:
  - `relevant_patterns` (top successful patterns for concept signature)
  - `past_outcomes` (top failures + reasons)
  - `proactive_insights` (tier recommendations from Routing KG)
  - `topic_continuity` (detected topic link to recent messages)
  - `repetition` (similar question recently asked)

**Directive insights (Roampal v0.2.6 lesson, model-agnostic)**

- Include a short “what to do next” hint block that works for small models:
  - recommend which collection(s) to search first
  - remind the workflow close-loop:
    - after responding, call `record_response(key_takeaway, outcome, related?)`

**Performance + fallback**

- Must be <10ms typical.
- If KG is empty/cold, return empty insights.

#### 2) search_memory (single unified retrieval mechanism)

**Name:** `search_memory`

**Purpose**

- Search the 5-tier memory system with hybrid retrieval.

**Parameters**

- `query` (string, required)
- `collections` (array or string, optional): one of `books|working|history|patterns|memory_bank|all` or an explicit list
- `limit` (integer 1–20, default 5)
- `sort_by` (string, optional): `relevance|recency|score` with auto temporal detection
- `metadata` (object, optional): filter constraints

**Behavior (must map to BricksLLM search pipeline)**

- Normalize/expand query first (Section 6.0).
- Determine tier plan:
  - Always include `working` globally across all conversations.
  - Use Routing KG to decide which tiers to search deeply.
- Per tier:
  - Vector search (Qdrant) + lexical search (Mongo full-text; optional cached BM25)
  - RRF fusion
- Merge tiers → dynamic ranking → optional cross-encoder rerank top-30
- Apply `sort_by`:
  - `relevance`: default final ranking
  - `recency`: reorder by timestamp (after filtering)
  - `score`: reorder by learned effectiveness (wilson/quality)
  - auto-detect recency queries from temporal keywords (only when `sort_by` is omitted)
    - keywords: `last`, `recent`, `yesterday`, `today`, `earlier`, `previous`, `before`, `when did`, `how long ago`, `last time`, `previously`, `lately`, `just now`

**Return format (LLM-friendly + supports positional indexing)**

- Return an array with stable positional numbering starting at 1.
- Each result includes:
  - `position`
  - `tier`
  - `memory_id`
  - `score_summary`: `{ final_score, wilson_score, uses, last_outcome, age }`
  - `content` (full, untruncated)
  - `preview` (optional; UI-only convenience)
  - `citations` (provenance pointers)
- Tool executor must update `search_position_map` for the turn.

**Graceful fallback**

- If lexical stage unavailable: vector-only.
- If cross-encoder unavailable: dynamic ranking only.
- If Qdrant unavailable: lexical-only.

#### 3) record_response (selective scoring)

**Name:** `record_response`

**Purpose**

- Store a semantic learning summary of the exchange and update outcome scores.

**Parameters**

- `key_takeaway` (string, required): 1–2 sentence summary
- `outcome` (enum, optional, default `unknown`): `worked|failed|partial|unknown`
- `related` (array, optional): positions (1,2,3) and/or `memory_id`s indicating which retrieved results were actually used

**Behavior**

- Store `key_takeaway` into `working` tier as type `key_takeaway`.
- Set initial score for the stored takeaway:
  - worked=0.7, failed=0.2, partial=0.55, unknown=0.5
- Selective scoring:
  - If `related` present: score only those referenced results.
  - If absent: score all `last_search_results` (backwards-compatible behavior).
  - Invalid references → score all (safe default).
  - Safeguard: if a referenced `memory_id` belongs to `books` or `memory_bank`, do not update its outcome score (but still learn routing/action stats).
- Performance constraint (Roampal v0.2.3 lesson):
  - Must never scan persisted session files/logs to “find the last thing to score”.
  - All scoring targets must come from the current turn cache (`search_position_map` / `last_search_results`) and explicit `related`.
- Update:
  - Routing KG (concept → tier → outcome)
  - Action-Effectiveness KG (context_type, action=search_memory, tier searched)
- Clear per-turn search caches (`search_position_map`, `last_search_results`) after recording.

#### 4) add_to_memory_bank

**Name:** `add_to_memory_bank`

**Purpose**

- Store permanent, selective memories that enable continuity and growth across sessions.

**Parameters**

- `content` (string, required)
- `tags` (array, required): `identity|preference|goal|project|system_mastery|agent_growth|workflow|context`
- `importance` (number 0..1, default 0.7)
- `confidence` (number 0..1, default 0.7)
- `always_inject` (boolean, default false): include in every prompt injection (identity only)

**Behavior**

- Dedup using similarity threshold (Section 7) and merge strategy (keep higher-quality metadata).
- Versioning:
  - Updates archive prior versions automatically.
- Quality ranking:
  - Store `quality_score = importance × confidence` and apply 3-stage quality enforcement.
- If `always_inject=true`:
  - mark the memory_bank item accordingly and ensure prefetch/cold-start always include it (Section 3.11.A).
- Capacity enforcement:
  - Keep max 1000 active; archive lowest-value when over cap.

#### 5) update_memory (memory_bank)

**Name:** `update_memory`

**Refactor (recommended for robustness)**

- Replace `old_content/new_content` ambiguity with:
  - `memory_id` (string, optional)
  - `match_query` (string, optional; semantic match when memory_id not provided)
  - `new_content` (string, required)
  - `tags` (array, optional)
  - `importance`/`confidence` (optional)

**Behavior**

- Resolve the target memory:
  - Prefer `memory_id`.
  - Else semantic match using `match_query` against memory_bank.
- Archive old version, write new version, reindex to Qdrant.
- Update Content KG entities/edges.

#### 6) archive_memory (memory_bank)

**Name:** `archive_memory`

**Refactor (recommended for robustness)**

- Parameters:
  - `memory_id` (string, optional)
  - `match_query` (string, optional)

**Behavior**

- Resolve target by `memory_id` or semantic match.
- Soft delete (status=archived) + remove from active retrieval (payload filter).
- Keep version history in Mongo.

### Why tools without FastAPI is the right fit here

- Your `runMcpFlow` already supports tool execution and streaming.
- A separate FastAPI server adds extra processes, more failure modes, and extra latency.
- Tool-first keeps the LLM’s ability to refine retrieval, while system-driven retrieval keeps chat fast.

## 9) Integration in `runMcpFlow.ts` (Exact Flow Points)

### 9.1 Retrieval-first gating: where and what

**Insertion point A (prefetch)**  
After user query is extracted but before tool filtering decides the tool universe:

- Use:
  - [runMcpFlow.ts:L344-L348](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L344-L348)
- Action:
  - Compute `contextLimit = estimateContextLimit(query)` (Section 3.11.D).
  - Call `UnifiedMemoryFacade.prefetchContext({ userId, conversationId, query, recentMessages, hasDocuments, limit: contextLimit })`
    - Step 1 (Organic Memory Recall): analyze context first and build the `═══ CONTEXTUAL MEMORY ═══` insight block (Section 6.C).
    - Step 1.5 (Always-inject identity): include all `memory_bank.always_inject=true` items regardless of semantic match (Section 3.11.A).
    - Step 2 (Normal retrieval): run the full hybrid retrieval pipeline and return top-k memory hits.
- Return:
  - `memoryContextInjection` (string)
    - MUST include the structured Organic Memory Recall block (6.C) plus a `<memory_context>` section containing the selected retrieved memories (do not truncate the canonical content; limit by count).
  - `retrievalDebug` (ids, scores, stage timings, confidence)
  - `retrievalConfidence` (“high|medium|low”)

**Insertion point B (gating decision)**  
Immediately after tool filtering result is available:

- Use:
  - [runMcpFlow.ts:L342-L368](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L342-L368)
- Decision logic:
  - If `retrievalConfidence == high`:
    - Run “answer from memory” with tools disabled:
      - Ensure the request goes out with `tool_choice: "none"` (native tools mode) or omit tools from prompt injection.
      - This requires adjusting the existing early return at:
        - [runMcpFlow.ts:L365-L368](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L365-L368)
      - Outcome: fewer tool calls, faster replies.
  - If `medium`:
    - Proceed with tools but inject memory context; optionally reduce tool set further.
  - If `low`:
    - Proceed normally.

**Insertion point C (inject personality + memory context into prompt)**  
When building `prepromptPieces`:

- Use:
  - [runMcpFlow.ts:L433-L538](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L433-L538)
- Action (ordering is critical):
  - Load the active personality template (`/app/templates/personality/active.txt`) and render it into a natural-language personality prompt (cached by mtime).
  - Insert personality prompt as **Section 1**:
    - `prepromptPieces.push(personalityPrompt)`
  - Insert contextual memory (Organic Recall + retrieved snippets) as **Section 2**:
    - `prepromptPieces.push(memoryContextInjection)`
  - Then include tool preprompt/definitions (if any), followed by the normal system/user content.
  - Include strict instruction:
    - “Prefer answering from `<memory_context>` if sufficient; avoid tool calls unless missing info.”

### 9.2 Outcome updates: where and what

**Update “uses” for retrieved memories**

- Immediately after prefetch returns results (Insertion point A)
- Increment:
  - `stats.uses`, `stats.last_used_at`
- Record event: `memory_used` with retrieval stage metrics

**Record tool-run outcomes**

- After tool execution completes per loop iteration:
  - [runMcpFlow.ts:L1148-L1252](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1148-L1252)
- For each tool run:
  - record `tool_run` event with:
    - ok/error/timeout
    - latency
    - tool name
    - tie it to the current “answer attempt id”
- If tool output indicates “worked/failed” heuristically, store as `heuristic` outcome with low confidence.

**Action KG tracking (Roampal v0.2.6 lesson)**

- Track actions at the common “tool completion” exit point (not inside per-tool branches) so it captures:
  - built-in memory tools (`search_memory`, `add_to_memory_bank`, `update_memory`, `archive_memory`, `record_response`)
  - external MCP tools (future) without extra code
- Cache `ActionOutcome` objects per `conversation_id + turn_id` and apply the final explicit outcome when recorded.

**Store working memory entry from final answer**

- On final answer emission:
  - [runMcpFlow.ts:L1313-L1326](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1313-L1326)
- Action:
  - `store()` into `working` tier:
    - store as a combined exchange fragment (Roampal parity):
      - `text = "User: {userQuery}\nAssistant: {finalAnswer}"`
    - problem signature: normalized userQuery
    - include tool summary references
    - include retrieved memory IDs used (if any)

**Explicit user feedback (primary signal)**

- Add a UI action “Worked / Didn’t work / Partial”.
- Feedback endpoint records:
  - outcome for:
    - retrieved memories used
    - tool sequence used
    - final answer id
- OutcomeService updates Wilson score and triggers PromotionService (async).

---

## 10) Hard Timeouts + Fallback (All External Components)

### Timeouts (initial defaults, configurable)

- Qdrant query: 300–800ms target, hard timeout 1500ms
- Lexical query:
  - Mongo full-text (BM25-like v1): 200–600ms target, hard timeout 1500ms
  - Cached BM25 rebuild (if enabled): best-effort; rebuild is bounded and can be deferred if it would block the request path
- Reranker (Hebrew-capable cross-encoder, shared GPU):
  - hard timeout 2000–4000ms depending on N (default 30) and model
  - if reranker times out/unavailable, fall back to dynamic ranking only
- Contextual prefix generation (store-time): hard timeout 5000ms; fallback to original text

### End-to-end deadline guard (Roampal v0.2.10 lesson, required)

- Wrap the full retrieval path in a single hard timeout (default 15s):
  - if exceeded, return empty retrieval results + diagnostics and continue the chat normally
  - do not allow “hung dependency” states (model loading, DB lock, vector index corruption) to stall the UI/streaming path indefinitely
- Implement a “remaining time budget” helper so each stage gets a bounded slice of the overall deadline.

### Blocking-call isolation (Roampal v0.2.10 lesson, required)

- Never run known-blocking calls on the request thread:
  - any sync client code, CPU-heavy rerank/merge work, or large JSON parsing must be isolated (worker pool or separate service)
  - every dispatched task must have a hard timeout and safe cancellation semantics
- If cancellation is not possible for a dependency call, the wrapper must stop awaiting it and return fail-open results.

### Performance characteristics (targets; validate with metrics)

- Contextual prefix: ~+100ms per store (store-time only; never on search path)
- Lexical index build (cached BM25 mode): ~500ms for ~1000 docs (lazy build, cached)
- Cross-encoder rerank: ~+200ms for top-30 (only when triggered; model/VRAM dependent)
- Overall search latency goal: keep request-path retrieval under tight budgets by:
  - caching BM25 indexes
  - capping rerank candidates
  - failing open on timeouts

### Fallback behaviors

- Qdrant fails → use BM25-only + cached memories (if available)
- BM25 fails → vector-only + cached memories
- Reranker fails → skip rerank, still return results
- Any failure must:
  - log structured error
  - increment a metric counter
  - never throw to the streaming loop

### Circuit breaker

- Add circuit breakers per dependency:
  - qdrant
  - bm25
  - reranker
- embeddings (query + store-time)
- contextual-prefix LLM (store-time)
- If breaker is open, immediately skip that stage for a cooling period.
  - Optional: use lightweight health checks to close breakers sooner, but never block request path on health probes.

### GPU/VRAM-aware safety (Roampal v0.2.3 lesson, adapted)

- Any GPU-backed dependency (main LLM, embeddings, reranker) must have VRAM-aware defaults:
  - cap rerank batch sizes and rerank_k based on available GPU memory headroom
  - never enable a configuration that reliably OOMs the GPU during peak load
  - if GPU resources are insufficient, degrade gracefully (skip reranker; keep search functional)

---

## 11) Reindex Capability (Rebuild Qdrant from Mongo Truth)

### Why it’s required

- Enables recovery from index corruption, payload drift, model change, dedup/promotion rewrites
- Prevents “ghost entry class” issues from ever becoming fatal

### Plan

- `ReindexService.rebuild({ userId?, tier?, since? })`
- Steps:
  1. Create new Qdrant collection `memories_v1_reindex_{timestamp}`
  2. Stream Mongo active items in batches (ordered by updated_at)
  3. For each item:
     - compute embedding if `vector_hash` missing or changed
     - upsert to new collection
  4. Swap alias `memories_v1` to new collection
  5. Keep old collection for rollback window, then delete

### Throttling

- Cap reindex embedding/rerank concurrency
- Support pause/resume checkpoints in Mongo

---

## 12) Consistency Checks (Mongo ⇄ Qdrant Drift)

### Periodic job (e.g., every 15 minutes)

- Sample-based + count-based
- Checks:
  - Mongo active memory_ids missing in Qdrant
  - Qdrant points whose memory_id is missing/archived/deleted in Mongo
- Repairs:
  - Missing in Qdrant → re-upsert from Mongo
  - Orphan in Qdrant → delete or quarantine

### Safety

- Repairs must be idempotent
- All repairs emit events and metrics
- Add KG hygiene:
  - `KnowledgeGraphService.cleanupDeadReferences()` runs on a schedule and after deletions/archives
  - Removes entity edges pointing to deleted/archived memory_ids and tombstoned book chunks

---

## 13) Metrics (What to measure and where)

### In-request metrics (per message)

- `memory_prefetch_ms`
- `qdrant_query_ms`, `bm25_query_ms`, `candidate_merge_ms`
- `rerank_ms`, `rerank_called` (0/1), `rerank_k`
- `tier_hits`: counts by tier in final topK
- `memory_confidence`: high/medium/low
- `tools_called_count`
- `tool_call_savings_estimate`:
  - baseline: tools that would have been called by intent
  - actual: tools called
- `final_answer_tokens`, `first_token_latency_ms`

### Benchmark metrics (Roampal v0.2.3 lesson, required)

- Add a retrieval-only benchmark suite that measures the memory system (not generation):
  - adversarial scenario sets where semantic similarity points to the wrong answer
  - report: Top-1 accuracy, MRR, nDCG@5
- Add a “token efficiency” benchmark:
  - compare: vector-only baseline (top-3/top-5) vs outcome-weighted retrieval vs full hybrid+rerank (as applicable)
  - measure: prompt tokens consumed per query for the same task completion quality
  - keep scenarios and answer keys deterministic and versioned so regressions are obvious

### Background metrics

- `promotion_runs`, `promoted_working_to_history`, `promoted_history_to_patterns`
- `ttl_cleanup_deleted`
- `dedup_merges`, `archived_versions_created`
- `consistency_repairs`, `reindex_batches_processed`
- `memory_bank_active_count` (enforce cap 1000)

### Surfacing

- Log structured JSON
- Optional: daily rollup in Mongo for dashboards
- UI panels (later): “Memory Health” and “Retrieval Latency”

---

## 14) Memory Bank Feature Requirements (Your Expected Outcome)

### Core requirements

- Permanent retention, max 1000 items
- LLM autonomy to store/update/archive (via tools)
- User override UI (restore/delete)
- Versioning by auto-archiving old versions on update
- Quality-based ranking:
  - `quality = importance * confidence`
  - pre-ranking distance reduction up to 50%
  - CE multiplier `(1 + quality)`
- KG entity boost capped 1.5×

### Scope guidelines enforcement

- Hard rule: never store raw conversation exchanges in memory_bank
- memory_bank entries must be:
  - identity/preferences/projects/workflows/learned system mastery
- working/history store session detail and decays

Implementation detail:

- Provide “memory_bank_write_guard” that rejects entries lacking:
  - tags
  - importance/confidence
  - minimal structure (title-like first line or summary)

---

## 15) Rollout Strategy (Minimize Breakage)

### Feature flags (recommended)

- `MEMORY_SYSTEM_ENABLED`
- `MEMORY_QDRANT_ENABLED`
- `MEMORY_BM25_ENABLED`
- `MEMORY_RERANK_ENABLED`
- `MEMORY_OUTCOME_ENABLED`
- `MEMORY_PROMOTION_ENABLED`

### Advanced Feature Flags (Ported from `backend/config/feature_flags.py`)

- `ENABLE_KG`: Knowledge graph enhancements (default: True).
- `ENABLE_AUTONOMY`: Autonomous actions (default: False).
- `ENABLE_OUTCOME_DETECTION`: Outcome detection system (default: True).
- `ENABLE_PROBLEM_SOLUTION_INDEX`: Track problem-solution pairs (default: True).
- `ENABLE_WEBSOCKET_STREAMING`: Token-by-token streaming (default: True).
- `REQUIRE_CONFIRMATION`: Safety gate for dangerous actions (default: True).

### Feature Flag Validation (Ported from `backend/config/feature_flag_validator.py`)

- Implement `validateFeatureConfig(config)` to reject dangerous combinations:
  - `ENABLE_AUTONOMY` + `!REQUIRE_CONFIRMATION` -> Error.
  - `ENABLE_AUTO_APPLY_SOLUTIONS` + `!ENABLE_PROBLEM_SOLUTION_INDEX` -> Error.
  - `ENABLE_GIT_OPERATIONS` + `!REQUIRE_CONFIRMATION` -> Error.
- Enforce "Production Safety Profile":
  - Force `ENABLE_AUTONOMY = False`
  - Force `REQUIRE_CONFIRMATION = True`
  - Force `MAX_FILE_WRITES = 0`

### Stepwise rollout

1. Add Mongo truth schema + store to working tier only (no Qdrant yet)
2. Add Qdrant indexing + vector retrieval for working/history
3. Add memory_bank CRUD + UI + quality ranking
4. Add outcomes + Wilson scoring + promotion
5. Add KG extraction + visualization
6. Add BM25 engine + hybrid fusion
7. Add full benchmark harness + regression tests

---

## 16) Decisions + Remaining Open Items

## 16) Decisions + Remaining Open Items

### Confirmed decisions (based on current direction)

### 16.1 Configuration Management (.env)

**Goal:** Centralize all Memory configuration in `/home/ilan/BricksLLM/.env` using DictaChat naming conventions.

**Variables to Add (Merge into `.env`):**

```ini
# ========================================
# DictaChat Memory System
# ========================================

# Feature Flags
MEMORY_SYSTEM_ENABLED=true  # Master switch
MEMORY_UI_ENABLED=true      # Enable Sidebar/Dock panels
MEMORY_KG_VIZ_ENABLED=true  # Enable Knowledge Graph UI

# Storage Paths (Mapped to Docker Volumes)
DICTACHAT_MEMORY_DATA_DIR=./data/memory

# Memory Scoring (Reinforcement Learning)
MEMORY_INITIAL_SCORE=0.5
MEMORY_POSITIVE_BOOST=0.2
MEMORY_NEGATIVE_PENALTY=0.3
MEMORY_PARTIAL_BOOST=0.05
MEMORY_TOP_K=10

# Memory Search Strategy
# Note: Vectors stored in Qdrant (reusing QDRANT_HOST from main config)
# Note: Embeddings use Dicta-Retrieval (reusing TEI_ENDPOINT from main config)
MEMORY_SEARCH_LIMIT=20
MEMORY_SEARCH_MIN_SCORE=0.0         # Return all results, let ranking sort them

# Enterprise Compliance & Safety
MEMORY_LOG_LEVEL=INFO
MEMORY_REQUIRE_AUTH=true

# Internal LLM (DictaLM) for Outcome Detection
MEMORY_LLM_BASE_URL=http://localhost:8002/v1
MEMORY_LLM_API_KEY=sk-dictachat
MEMORY_LLM_MODEL=dictalm-2.0

# Note: DO NOT add OLLAMA_* or CHROMADB_* variables.
# We use DictaLM and Qdrant exclusively.
```

### 16.2 Architectural Decisions

- User identity scope:
  - Single-user system for v1. Keep `user_id` in all schemas and always filter by it, but use a constant/default user identifier for now.
  - Design must remain multi-user safe by construction (no cross-user queries without explicit filter).
- Embeddings:
  - Reuse `dicta-retrieval` embeddings endpoint.
- Reranking:
  - Implement Roampal-style cross-encoder reranking, but **select a Hebrew-capable cross-encoder**.
  - Reranker shares GPU with the main LLM; enforce strict caps (top-30) and hard timeouts.
  - Prefer hosting the reranker behind `dicta-retrieval` if feasible; otherwise run a dedicated local reranker service behind the same adapter interface.
- BM25 (v1):
  - Implement lexical retrieval using Mongo full-text (text indexes) as the v1 “BM25-like” component.
  - Keep the adapter boundary so we can swap to a true BM25 engine later without refactoring SearchService.
- No ChromaDB:
  - Whenever Roampal uses Chroma/`chromadb_adapter.py`, we mimic the same responsibilities using Mongo + Qdrant + dicta-retrieval.

### Remaining open item (needs a design choice)

- Global Books/Knowledge store strategy:
  - You currently have per-conversation document ingestion (`document_contexts`/`document_chunks`). We need a robust path to make selected documents globally reusable across conversations.

**Recommended plan for Books/Articles/Knowledge (robust, minimal breakage)**

- Keep existing per-conversation document ingestion as-is for conversation-local use.
- Add a global tier `books` in `memory_items` with its own `doc_group_id` and provenance.
- Introduce a deterministic “publish to global library” step:
  - Default: documents stay conversation-local.
  - User action (UI) or explicit tool command promotes a document to global `books` by:
    - computing a stable `document_hash`
    - writing canonical book metadata into Mongo (truth)
    - indexing chunks in Qdrant with `tier="books"`
- This avoids accidental leakage and prevents unbounded global growth.

**Books ingestion + deletion mechanics (Roampal parity, simple + robust)**

- Ingestion guardrails:
  - enforce max document size (default 10MB) to avoid accidental huge indexing jobs
  - chunk by sentence boundaries with overlap (fallback to character chunking if needed)
  - batch embed chunks and batch upsert; on failure, roll back the batch (no partial books)
  - duplicate detection:
    - if `document_hash` already exists, do not re-ingest; return existing ids
- Multi-format support (Roampal v0.2.3 lesson, adapted):
  - Accept common formats for ingestion into `books`: `pdf`, `docx`, `xlsx`, `csv`, `html`, `rtf`, `txt`, `md`.
  - Conversion strategy:
    - Convert all formats to canonical plain text + optional structured extracts (tables) before chunking/embedding.
    - Reuse existing conversion tooling where available (e.g., `docling_convert`) but keep the ingestion API format-agnostic.
  - Metadata extraction (stored in Mongo truth + copied into Qdrant payload filters when useful):
    - `file_type` / `mime_type`
    - `title`, `author` (when extractable)
    - `source_context` (section/heading)
    - `token_count`, `has_code`, `doc_position`
    - `upload_timestamp`
  - Tabular documents:
    - Must not drop tables silently.
    - Extract tables to a deterministic text representation (row/column headings preserved) so semantic search works over spreadsheets/CSV.
- Deletion:
  - implement non-destructive delete semantics (Section 3.11.B) so a book disappears immediately without requiring synchronous vector deletion
  - on delete, remove Action-KG examples referencing deleted chunk ids (Section 3.11.F)

If you prefer an automatic approach later, add a rule-based auto-publish policy (opt-in) after you have outcomes and capacity controls.

---

## 17) Implementation Checklist (Concrete)

- [ ] Update `.env` with Roampal configuration (Section 16.1)
- [ ] Define Mongo schemas + indexes for `memory_items`, `memory_versions`, `memory_outcomes`, `kg_nodes`, `kg_edges`
- [ ] Implement `QdrantAdapter` (Roampal Parity)
  - [ ] Implement 768d vector validation (fail-fast)
  - [ ] Implement single-collection strategy (`roampal_memories`) + User Isolation
  - [ ] Map ChromaDB metadata semantics to Qdrant Payload
  - [ ] Implement `SetPayload` (payload-only updates) for high-frequency score updates
  - [ ] Add payload indexes for `user_id`, `tier`, `status`, `timestamp`, `composite_score`
- [ ] Add shared memory config and types modules
- [ ] Implement `UnifiedMemoryFacade` with no-op fallback
- [ ] Implement Search & Ranking Strategy (Roampal Parity)
  - [ ] Implement Hybrid Ranking (Vector + BM25 equivalent + Qdrant Score)
  - [ ] Implement Known Solution Boosting (0.5x distance for problem matches)
  - [ ] Implement Content KG Entity Boosting (Quality-weighted boost)
  - [ ] Implement Action Effectiveness Boosting (RL-based ranking)
  - [ ] Implement Ghost Registry Filtering (Pre-filter deleted IDs)
- [ ] Implement Dicta Embedding & Reranking Integration (Strict No-Local)
  - [ ] Implement `DictaEmbeddingClient` (batching + timeouts)
  - [ ] Implement Redis caching layer (7-day TTL, MD5 keys)
  - [ ] Implement `DictaReranker` integration
  - [ ] Verify connection to container endpoints (fail-fast on startup)
- [ ] Add always_inject identity memories + cold start injection
- [ ] Enforce no-truncation in memory tool outputs (count-capped only)
- [ ] Add non-destructive book delete semantics (tombstones + filters)
- [ ] Add dynamic context sizing (5–20) for prefetch and tools
- [ ] Implement retrieval-first prefetch + injection into `runMcpFlow.ts` at:
  - [runMcpFlow.ts:L344-L348](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L344-L348)
  - [runMcpFlow.ts:L433-L538](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L433-L538)
- [ ] Implement outcome updates at:
  - tool completion: [runMcpFlow.ts:L1148-L1252](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1148-L1252)
  - final answer: [runMcpFlow.ts:L1313-L1326](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1313-L1326)
- [ ] Implement RoutingService (Dual Router Logic)
  - [ ] Port `BasicIntentRouter` logic (explicit memory commands)
  - [ ] Port `OGIntentRouter` heuristics (regex dispatcher, image context avoidance)
  - [ ] Implement Factual Triggers (fast-path to web search hint)
  - [ ] Implement Book Lookup patterns
  - [ ] Implement Multi-part query splitting
- [ ] Implement Book Management API
  - [ ] Implement `BookController` (Upload, SSE Progress, Delete)
  - [ ] Implement `FormatExtractor` (PDF/DOCX/HTML support)
  - [ ] Implement `Ghost Registry` (Redis set for deleted vector filtering)
- [ ] Implement Shared Utilities & Resilience
  - [ ] Implement `CircuitBreaker` class (State: Open/Closed/Half-Open)
  - [ ] Implement `DisclaimerManager` (Safety keyword triggers)
  - [ ] Implement `ThinkingTagProcessor` (UI + Logic for `<think>` tags)
  - [ ] (Optional) Port `ImageSecurityMonitor` if multimodal enabled
- [ ] Implement Enterprise MCP Integration (Compliance)
  - [ ] Create `roampal/Dockerfile` (Python 3.11-slim)
  - [ ] Update `docker-compose.yml` with `dictachat-memory-mcp` service
  - [ ] Register tools in `toolIntelligenceRegistry.ts` (Latency, Hebrew Messages)
  - [ ] Configure `toolParameterRegistry.ts` for Roampal tools
  - [ ] Add Hebrew Intent Expansions in `hebrewIntentDetector.ts`
  - [ ] Update `runMcpFlow.ts` to prioritize `get_context_insights` usage
- [ ] Implement DataGov & Hebrew Integration (DictaChat Specific)
  - [ ] Import/Reuse `get_hebrew_variants()` from `datagov/query_builder.py`
  - [ ] Update `SearchService` to apply Hebrew query expansion (Section 3.15.A)
  - [ ] Implement `ingest_datagov_schemas.py` One-Time Job (Section 3.15.B)
  - [ ] Load `enterprise_expansions` into Knowledge Graph (Section 3.15.C)
- [ ] Implement deterministic PromotionService (single owner) + immediate-on-start run
- [ ] Implement OutcomeDetector (Advanced LLM-Based)
  - [ ] Port logic from `outcome_detector.py` (LLM-only analysis, no heuristic fallback)
  - [ ] Implement hardcoded prompt with strict JSON output
  - [ ] Integrate with `OutcomeService` (Section 3.6.1)
- [ ] Add timeouts + circuit breakers for qdrant/bm25/reranker
- [ ] Implement reindex job + alias swap strategy
- [ ] Implement consistency checker + repair actions
- [ ] Add KG dead-reference cleanup job
- [ ] Add export/import backup coverage for KGs and tombstones
- [ ] Add facade characterization tests to preserve behavior
- [ ] Add metrics instrumentation and rollups
- [ ] Add Memory Bank UI (list/search/edit/archive/restore/delete) + KG UI with Roampal features

### Personality System Checklist (from Section 3.4.3 analysis)

- [ ] Copy personality template files from `roampal/backend/personality/` to `frontend-huggingface/templates/personality/`
- [ ] Create `PersonalityLoader` class in `frontend-huggingface/src/lib/server/memory/personalityLoader.ts`
  - [ ] Implement mtime-based caching for template reloading
  - [ ] Implement fallback chain: `active.txt` → `default.txt` → hardcoded default
  - [ ] Add exception safety (never crash, return null on error)
- [ ] Implement `templateToPrompt()` conversion function
  - [ ] Support all YAML fields including `formatting` section
  - [ ] Add pronoun disambiguation line (CRITICAL for preventing identity confusion)
  - [ ] Place custom instructions early in converted prompt
  - [ ] Handle `show_reasoning` → `<think>` tag instruction
- [ ] Implement personality API endpoints under `/api/memory/personality/`:
  - [ ] `GET /presets` - list presets and custom templates
  - [ ] `GET /current` - get active template with hash-based preset matching
  - [ ] `GET /template/:id` - get specific template
  - [ ] `POST /save` - save custom template with filename sanitization
  - [ ] `POST /activate` - validate and copy to active.txt
  - [ ] `POST /upload` - upload YAML file
  - [ ] `DELETE /custom/:id` - delete with active template protection
- [ ] Implement validation function with hard/soft separation
  - [ ] Hard validation: YAML syntax, dictionary type, `identity`/`communication` sections, `identity.name`
  - [ ] Soft validation: warnings for missing `response_behavior`, `memory_usage`
- [ ] Integrate personality prompt as Section 1 in `runMcpFlow.ts` system prompt

---

## 18) UI/UX Parity (Roampal Desktop / tauri-ui → frontend-huggingface)

### Goal

- Ship the Roampal memory system with a UI that makes it obvious, safe, and pleasant to use:
  - users can see what the system “knows”, why it answered a certain way, and how to correct it
  - users can manage identity/personality without touching code
  - users can manage books and memory health without breaking retrieval or requiring restarts
- UX must remain stable under partial failures (Qdrant down, reranker down, schema mismatch, cold start, empty KGs).

### Design principle (enterprise-grade)

- Every memory feature must have:
  - a clear entry point (discoverable navigation)
  - a clear status/health indicator
  - safe defaults + reversible actions (archive/tombstone, restore, export/import)
  - fast search and filter UX (works at 1k–100k items, with virtualization where needed)
  - accessibility baseline (keyboard, focus trap in modals, readable states)

### 18.1 Sidebar integration (Roampal `Sidebar.tsx` parity)

- Add a “Memory” group to the sidebar with quick actions:
  - Personality & Identity
  - Memory & Knowledge
  - Books / Document Processor
  - Settings (Memory)
- Display assistant name in the sidebar header by reading the active personality YAML:
  - fetch `/api/personality/current` and parse `identity.name` with the robust regex already documented in Section 3.4.2
  - poll every 5 seconds (mtime-cached server-side is acceptable) so changes show up without a reload
- Add a “collapse sidebar” control that is compatible with the existing sidebar resize logic in `+layout.svelte`.

### 18.1.1 Exact implementation map (frontend-huggingface)

- Add these new files (Svelte + stores):
  - `src/lib/stores/memoryUi.ts`:
    - `isRightDockOpen`, `rightDockWidth`, `activeDockTab`, `isPersonalityModalOpen`, `isBooksModalOpen`
    - `activeConcepts`, `lastContextInsights`, `lastSearchResults`, `lastRetrievalDebug`
  - `src/lib/components/memory/PersonalityModal.svelte`
  - `src/lib/components/memory/BooksProcessorModal.svelte`
  - `src/lib/components/memory/RightMemoryDock.svelte` (collapsible right navbar/drawer)
  - `src/lib/components/memory/KnowledgeGraphPanel.svelte` (tab content)
  - `src/lib/components/memory/MemoryPanel.svelte` (tab content)
  - `src/lib/components/memory/SearchPanel.svelte` (tab content)
- Modify these existing files:
  - `src/lib/components/NavMenu.svelte`: add buttons that open the new modals/dock
  - `src/routes/+layout.svelte`: add third column and the right dock toggle affordance
  - `src/lib/components/chat/ChatMessage.svelte`: add in-chat “Known Context / Citations / Feedback” affordances
  - `src/lib/server/textGeneration/mcp/runMcpFlow.ts`: emit structured memory metadata per assistant message (so UI can show citations/active concepts)
  - `src/lib/server/api` or `src/routes/api`: add REST endpoints for personality, books, memory bank, KG queries, and job status

### 18.1.1.1 `memoryUi.ts`: exact store shape + events + streaming update rules (required)

- Store module: `src/lib/stores/memoryUi.ts`
- State shape (single source of truth for memory UI):
  - `enabled`: boolean (feature flag gate; default false until wired)
  - `rightDock`:
    - `isOpen`: boolean
    - `widthPx`: number (persist to localStorage key `rightDockWidth`)
    - `activeTab`: `"search" | "memory" | "knowledge"`
  - `modals`:
    - `personalityOpen`: boolean
    - `booksProcessorOpen`: boolean
    - `memoryBankOpen`: boolean
  - `session`:
    - `activeConversationId`: string | null
    - `activeAssistantMessageId`: string | null (current streaming assistant msg)
    - `lastCompletedAssistantMessageId`: string | null
    - `blockingScoringRequired`: boolean (default false; prevents new input until scored)
    - `lastUnscoredMessageId`: string | null (ID of the message needing a score)
  - `data`:
    - `activeConcepts`: string[] (chips shown in dock header; derived from last meta)
    - `lastContextInsights`: object | null (raw from backend; count-capped)
    - `lastRetrievalDebug`: object | null (timeouts/fallbacks; count-capped)
    - `lastKnownContextTextByMessageId`: Record<string, string>
    - `lastCitationsByMessageId`: Record<string, Array<{ tier: string; memory_id: string; doc_id?: string }>>
    - `lastMemoryMetaByMessageId`: Record<string, object>
  - `ui`:
    - `expandedKnownContextByMessageId`: Record<string, boolean>
    - `expandedCitationsByMessageId`: Record<string, boolean>
    - `feedbackEligibleByMessageId`: Record<string, boolean>
- Events (DOM CustomEvent names; used to decouple chat stream from dock rendering):
  - `memoryui:toggleRightDock` `{ tab?: "search"|"memory"|"knowledge" }`
  - `memoryui:openPersonality`
  - `memoryui:openBooksProcessor`
  - `memoryui:openMemoryBank`
  - `memoryui:setConversation` `{ conversationId: string }`
  - `memoryui:assistantStreamStarted` `{ conversationId: string; messageId: string }`
  - `memoryui:assistantStreamFinished` `{ conversationId: string; messageId: string }`
  - `memoryui:memoryMetaUpdated` `{ conversationId: string; messageId: string; meta: MemoryMetaV1 }`
- Streaming update rules (when to update what):
  - On conversation navigation:
    - emit `memoryui:setConversation`; clear `session.activeAssistantMessageId`; keep UI open/width stable
  - On assistant stream start (first token / `status.started`):
    - emit `memoryui:assistantStreamStarted`
    - set `feedbackEligibleByMessageId[messageId]=false`
  - On each `memoryMetaUpdated` (mid-stream or final):
    - update `lastMemoryMetaByMessageId[messageId]=meta`
    - update `activeConcepts` from `meta.context_insights.matched_concepts`
    - update `lastKnownContextTextByMessageId[messageId]=meta.known_context.known_context_text`
    - update `lastCitationsByMessageId[messageId]=meta.citations`
    - update `lastContextInsights` and `lastRetrievalDebug` from meta (dock header and banners)
  - On assistant stream finish (`finalAnswer` or `status.finished`):
    - emit `memoryui:assistantStreamFinished`
    - set `feedbackEligibleByMessageId[messageId]=meta.feedback?.eligible === true`

### 18.1.2 Left navbar buttons (Personality / Document Processor / Memory Dock)

- Implement buttons in `src/lib/components/NavMenu.svelte` (desktop and mobile):
  - Add a “Memory” section near the bottom action list (next to MCP servers / settings).
  - Buttons:
    - “Personality & Identity” → `memoryUi.isPersonalityModalOpen=true`
    - “Document Processor” → `memoryUi.isBooksModalOpen=true`
    - “Memory” (toggle right dock) → `memoryUi.isRightDockOpen = !isRightDockOpen`
  - Do not navigate away from the chat route for these actions; they are overlays/panels.
  - Respect auth gating:
    - If `requireAuthUser()` blocks, do not open the panels (match existing sidebar patterns).
  - Keyboard shortcuts (desktop):
    - `Ctrl/Cmd+Shift+M` toggle right dock
    - `Ctrl/Cmd+Shift+P` open Personality modal
    - `Ctrl/Cmd+Shift+B` open Document Processor modal
  - Persistence:
    - store `rightDockWidth` and `isRightDockOpen` in `localStorage` (same approach as left sidebar width)

### 18.2 Personality & identity UI (Roampal `PersonalityCustomizer.tsx` parity)

- Provide a dedicated Personality panel (modal or route) with two modes:
  - Quick Settings:
    - `identity.name`, `identity.role`, `identity.background`
    - `communication.tone`, `communication.verbosity`, `communication.formality`
    - toggles: `use_analogies`, `use_examples`, `use_humor`
    - `memory_usage.priority`, `memory_usage.pattern_trust`
    - `custom_instructions` multiline
  - Advanced:
    - full YAML editor with validation and line-aware errors
- Preset management:
  - list presets (GET `/api/personality/presets`)
  - load a preset (GET `/api/personality/template/:id`)
  - save custom YAML (POST `/api/personality/save`)
  - activate template (POST `/api/personality/activate`)
- UX requirements:
  - unsaved-changes indicator + reset-to-last-saved
  - download YAML to file
  - show a short “How it works” info panel (small and skimmable)
  - errors are non-fatal (validation blocks saving but never breaks chat)

### 18.2.1 Personality modal: exact UI+API instructions

- Component: `src/lib/components/memory/PersonalityModal.svelte` using the existing [Modal.svelte](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/components/Modal.svelte) pattern (focus trap + inert app).
- Data flow:
  - Load on open:
    - GET `/api/memory/personality/presets` → presets list
    - GET `/api/memory/personality/current` → `{ template_id, content }`
  - Preset switch:
    - GET `/api/memory/personality/template/:id` → template YAML
    - POST `/api/memory/personality/activate` → `{ template_id }`
  - Save/apply:
    - POST `/api/memory/personality/save` → `{ name: "custom", content }`
    - POST `/api/memory/personality/activate` → `{ template_id: "custom" }`
- YAML validation:
  - Validate client-side before save (parse; show line-aware errors; block save).
  - Server must also validate and return a structured error payload (never 500 on invalid YAML).
- UI requirements (must match Roampal UX):
  - “Quick Settings” tab that edits nested keys and regenerates YAML
  - “Advanced” editor (monospace, line numbers optional) with copy/download
  - “Unsaved changes” indicator + Reset button
  - “How it works” info box (collapsible)
  - On success: show transient “Saved” toast state (do not close modal automatically)
- Sidebar name binding:
  - After activation, publish a `window` event (e.g. `personalityUpdated`) and update NavMenu header label without reload.

### 18.3 Memory & Knowledge panel (Roampal `MemoryPanelV2.tsx` parity)

- Add a right-side “Memory Dock” (collapsible right navbar/drawer) with tabs:
  - Search
  - Memory
  - Knowledge (KG visualization)
- Memory tab requirements:
  - search box (client-side filtering for small sets; server-side search for large)
  - filter by tier (`working|history|patterns` plus `all`)
  - sort by `recent` and by `score` (learned)
  - refresh button (re-runs `getStats` and refreshes panel data)
  - “what are these types?” help modal (short, deterministic explanations)
- Knowledge tab requirements:
  - show the routing/content/action concept map as a compact visualization
  - support time filters: `all`, `today`, `week`, `session`
  - support sorting: hybrid score, recent, oldest
  - node click opens a concept detail panel (definition + outcome breakdown)

### 18.3.1 Right dock: exact layout, collapse, and file placements

- Implement `src/lib/components/memory/RightMemoryDock.svelte` as a desktop-only third column plus a mobile drawer:
  - Desktop: integrated in `src/routes/+layout.svelte` grid:
    - change `grid-template-columns` from `left + main` to `left + main + right`
    - right width is `rightDockWidth` when open, `0px` when collapsed
  - Add a right-side toggle handle similar to [ExpandNavigation.svelte](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/components/ExpandNavigation.svelte):
    - place it `absolute inset-y-0 right-0` and offset based on right dock width
    - keyboard accessible (`aria-label`, focus ring)
  - Mobile: do not add a permanent third column:
    - implement the right dock as a modal-like drawer using the same gesture safety patterns as `MobileNav.svelte` (no conflict with vertical scrolling)
- Resizing:
  - Add a resize handle on the left edge of the right dock (pointer events) with keyboard resizing parity:
    - store width in localStorage: `rightDockWidth`
    - clamp: `240px–520px` (default 360px)
- Tabs:
  - Keep a stable tab bar at the top of the dock:
    - “Search” / “Memory” / “Knowledge”
    - never unmount the whole dock when switching tabs (preserve search input state)

### 18.3.2 “Search” tab (missing in current plan: explicit requirements)

- Implement `SearchPanel.svelte`:
  - Search input + collection selector + `sort_by` selector
  - Results list with positional numbering (1-based), tier badge, score badge, timestamp badge
  - Clicking a result:
    - expands full content and shows citations/provenance
    - offers “Pin to Memory Bank” action (calls `add_to_memory_bank`)
  - Performance:
    - client should debounce keystrokes
    - server should hard-cap results and return `debug` object for transparency

### 18.3.3 “Active Concepts” (missing in current plan: explicit UX + data flow)

- The right dock header must include a compact “Active Concepts” strip:
  - chips derived from `ContextInsights.matched_concepts` (max 8; overflow “+N”)
  - clicking a chip:
    - opens Knowledge tab
    - focuses that concept in the graph and shows concept detail panel
- Data source:
  - During each turn, `runMcpFlow` computes `get_context_insights` before tool calls and attaches:
    - `matched_concepts`
    - `tier recommendations`
    - `you_already_know` facts
  - The UI reads this from the assistant message metadata stream (preferred) and caches in `memoryUi.lastContextInsights`.

### 18.4 Memory Bank management (Roampal `MemoryBankModal.tsx` parity)

- Add a Memory Bank modal with views:
  - Active
  - Archived
  - Stats
- Active/Archived list requirements:
  - fast search by text and tags
  - tag filter chips (multi-select)
  - virtualization for 1000 items (must not lag on scrolling)
  - per-item actions: Archive, Restore (archived view), Delete (hard delete only from archive unless admin-mode)
  - timestamps shown; tags displayed consistently
- Stats view:
  - total/active/archived counts
  - top tags + tag count
  - optional “cap warning” when approaching `max_memory_bank_items`

### 18.4.1 Exact integration: where Memory Bank appears in frontend-huggingface

- Add an entry point in the left sidebar (NavMenu) under the “Memory” section:
  - “Memory Bank” opens a modal with the same three views (Active/Archived/Stats).
- Add an entry point in the right dock (Memory tab) as a button “Open Memory Bank…”.

### 18.5 Books / document processor UX (Roampal `BookProcessorModal.tsx` parity)

- Add a Books Library experience that supports:
  - upload (multi-format) with progress
  - conversion stage and chunking stage progress (trace-like UI)
  - list ingested books with metadata, size, and last update
  - delete book with non-destructive semantics (tombstone + immediate disappearance)
  - optional “publish to global library” from conversation-local documents (Section 16)
- Must not block chat while ingestion runs; show status and allow safe cancellation where possible.

### 18.5.1 Document Processor modal: exact implementation plan (not optional)

- Component: `src/lib/components/memory/BooksProcessorModal.svelte` using `Modal.svelte`.
- UX requirements (must match Roampal behavior):
  - top area: upload zone (drag/drop + button) supporting multi-format
  - middle area: library list with search/filter + per-book actions (view metadata, delete)
  - bottom area: ingestion jobs list (running/completed/failed) with trace-like progress
- Progress transport (web equivalent of Tauri events):
  - Preferred: SSE endpoint `GET /api/memory/books/jobs/:jobId/events` streaming JSON events
  - Fallback: polling `GET /api/memory/books/jobs/:jobId/status` every 1–2s
  - Do not require WebSockets; SSE is sufficient and simpler to run behind proxies
- Backend contract (must be implemented before UI):
  - POST `/api/memory/books/upload` → returns `{ jobId }`
  - GET `/api/memory/books/list` → returns books with metadata
  - DELETE `/api/memory/books/:bookId` → tombstone + immediate disappearance
  - GET `/api/memory/books/jobs/:jobId/status` → progress snapshot + errors
  - GET `/api/memory/books/jobs/:jobId/events` → live progress (SSE)

### 18.6 Settings: memory operations + integrations UX (Roampal `SettingsModal.tsx` parity)

- Add a Memory section under Settings (route or modal) that links to:
  - Memory Bank
  - Model Context Settings (context window guardrails)
  - Integrations (Docling, external tools)
  - MCP tool servers (already present; extend with memory diagnostics)
  - Data Management
- Data Management must include:
  - export backup (memory items, outcomes, KGs, tombstones)
  - import backup (with validation + dry-run summary)
  - “reindex now” trigger (admin-only or dev-only)
  - “consistency check now” trigger (admin-only or dev-only)

### 18.6.1 Where to implement Settings entry points in frontend-huggingface

- Add a “Memory” subsection under `/settings/application` (or a new settings route group):
  - Personality
  - Memory Bank
  - Books Library
  - Memory Health (reindex/consistency diagnostics, admin-only)
- Use the existing settings modal layout patterns under `src/routes/settings/(nav)/...` for consistent UX.

### 18.7 In-chat transparency UX (critical for trust)

- Add UI affordances in the chat stream:
  - show a compact “Known Context” preview badge that expands to show injected items
  - show per-answer “Memory citations” (chips indicating tier + id) when the answer used `<memory_context>`
  - show retrieval confidence (high/medium/low) + which stages were skipped (breaker open)
- Add explicit outcome feedback controls on assistant messages:
  - Worked / Didn’t work / Partial

## 18.8 Roampal Hooks System Adaptation (Core Logic Integration)

### Goal

- Port the robust session tracking and enforced scoring logic from `roampal/hooks` (Python) to the new `frontend-huggingface` + MCP Server architecture.
- Ensure the "Scoring Loop" is preserved: User -> Pre-Flight Context -> LLM -> Post-Flight Enforcement -> Scoring -> Next User Message.

### 18.8.1 Session Service (Backend / MCP Server)

- **Role:** Replaces `roampal/hooks/session_manager.py`.
- **Responsibilities:**
  - Track "Completion State" per session (is the last exchange scored?).
  - Store exchanges in JSONL format (compatible with Roampal's expected format for potential future analysis).
  - Serve "Context Injection" (memories + scoring prompts).
- **New API Endpoints:**
  - `POST /api/hooks/exchange`: Stores a completed exchange (User + Assistant + Metadata).
    - Returns: `{ required_scoring: boolean, current_state: "scored" | "unscored" }`
  - `GET /api/hooks/context`: Retrieves injection context for a new prompt.
    - Input: `query`, `conversationId`.
    - Logic:
      - Check if previous exchange exists and is unscored.
      - If unscored, append `<roampal-score-required>` prompt.
      - Fetch relevant memories via `ContextManager`.
      - Return formatted injection string.
  - `POST /api/hooks/score`: Explicitly marks an exchange as scored (outcome).
    - Updates the JSONL record and internal state.

### 18.8.2 Frontend "Pre-Flight" Hook (`runMcpFlow.ts`)

- **Role:** Replaces `roampal/hooks/user_prompt_submit_hook.py`.
- **Implementation:**
  - Inside `runMcpFlow` (before creating the LLM stream):
    1. Call `GET /api/hooks/context` with the user's message.
    2. Receive the injection string (which may include "Score the previous exchange..." instructions).
    3. Prepend this injection to the user's message sent to the LLM (hidden from UI if possible, or shown as "System Context").
    4. _Crucial:_ If the backend returns a "Blocking" error (e.g., "Must score previous manually"), abort the flow and trigger the UI scoring modal.

### 18.8.3 Frontend "Post-Flight" Hook (`runMcpFlow.ts` + `memoryUi.ts`)

- **Role:** Replaces `roampal/hooks/stop_hook.py`.
- **Implementation:**
  - Inside `runMcpFlow` (after `textGeneration` stream finishes):
    1. Collect the full User Message and Assistant Response.
    2. Call `POST /api/hooks/exchange`.
    3. **Enforcement Logic:**
       - The backend checks if the Assistant used the `record_response` tool during the generation.
       - If `record_response` was **NOT** used, and the session logic determines it _should_ have been (e.g., non-trivial exchange):
         - The API returns `{ blocking: true }`.
         - The frontend sets `memoryUi.session.blockingScoringRequired = true`.
         - `memoryUi.session.lastUnscoredMessageId` is set.

### 18.8.4 UI Blocking & Scoring Interface

- **Role:** Enforces the "Exit Code 2" behavior of `stop_hook.py` in a GUI.
- **Components:**
  - **Input Box State:**
    - If `memoryUi.session.blockingScoringRequired` is true:
      - Disable the main chat input textarea.
      - Overlay text: "Please score the previous response to continue."
  - **Scoring Modal / Inline Controls:**
    - When blocked, automatically scroll to the last assistant message.
    - Highlight the "Worked / Failed / Partial" buttons (pulsing animation).
  - **Action:**
    - Clicking a score button calls `POST /api/hooks/score` (or `record_response` tool via backend).
    - On success:
      - Set `memoryUi.session.blockingScoringRequired = false`.
      - Enable input box.
      - Toast: "Response recorded. You may continue."
  - Must map to `record_response(outcome, related)` with positional indexing support
  - Must avoid annoying prompts when the user interrupts mid-response (completion-aware scoring)

### 18.7.1 Exact “where/how” for in-chat memory transparency

- Update `src/lib/server/textGeneration/mcp/runMcpFlow.ts` to attach a `memoryMeta` object to the final assistant message:
  - `known_context_text` (what was injected)
  - `citations` (memory_ids + tiers)
  - `retrieval_confidence` + `debug` (timeouts/fallbacks)
  - `matched_concepts` (active concepts)
  - `search_position_map` (so UI feedback can reference positions reliably)
- Update `src/lib/components/chat/ChatMessage.svelte`:
  - Add a “Known Context” badge that expands into the injected block
  - Add citation chips (tier + short id)
  - Add “Worked / Didn’t / Partial” buttons that call a new endpoint:
    - POST `/api/memory/record_response` with `{ key_takeaway, outcome, related }`
  - Completion-aware scoring:
    - show the feedback controls only when the assistant message is complete and the next user turn begins (match Roampal hook semantics)

### 18.7.2 `memoryMeta` concrete JSON schema + transport (required)

- Transport to UI:
  - Add a new message update kind `MessageUpdateType.MemoryMeta` (preferred) emitted by `runMcpFlow`:
    - The update must be emitted at least once per assistant message (final).
    - Best-effort: may also be emitted once early (after prefetch) to populate Active Concepts fast.
  - Do not embed large arrays unbounded:
    - cap `citations` and `known_context_items` by count
    - store full content in the memory system; UI gets only what it needs for transparency
- JSON Schema (Draft 2020-12), `MemoryMetaV1` (stable contract):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://bricksllm.local/schemas/memoryMeta.v1.json",
  "title": "MemoryMetaV1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "conversation_id",
    "assistant_message_id",
    "created_at",
    "retrieval",
    "known_context",
    "citations",
    "context_insights",
    "debug",
    "feedback"
  ],
  "properties": {
    "schema_version": { "type": "string", "const": "v1" },
    "conversation_id": { "type": "string", "minLength": 1 },
    "assistant_message_id": { "type": "string", "minLength": 1 },
    "user_id": { "type": ["string", "null"] },
    "created_at": { "type": "string", "format": "date-time" },
    "context_type": { "type": ["string", "null"] },
    "retrieval": {
      "type": "object",
      "additionalProperties": false,
      "required": ["query", "limit", "tiers_considered", "tiers_used"],
      "properties": {
        "query": { "type": "string" },
        "normalized_query": { "type": ["string", "null"] },
        "limit": { "type": "integer", "minimum": 1, "maximum": 50 },
        "sort_by": {
          "type": ["string", "null"],
          "enum": ["relevance", "recency", "score", null]
        },
        "tiers_considered": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["working", "history", "patterns", "books", "memory_bank"]
          }
        },
        "tiers_used": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["working", "history", "patterns", "books", "memory_bank"]
          }
        },
        "search_position_map": {
          "type": "object",
          "additionalProperties": false,
          "required": ["by_position", "by_memory_id"],
          "properties": {
            "by_position": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["position", "tier", "memory_id"],
                "properties": {
                  "position": { "type": "integer", "minimum": 1 },
                  "tier": {
                    "type": "string",
                    "enum": [
                      "working",
                      "history",
                      "patterns",
                      "books",
                      "memory_bank"
                    ]
                  },
                  "memory_id": { "type": "string" }
                }
              }
            },
            "by_memory_id": {
              "type": "object",
              "additionalProperties": {
                "type": "object",
                "additionalProperties": false,
                "required": ["position", "tier"],
                "properties": {
                  "position": { "type": "integer", "minimum": 1 },
                  "tier": {
                    "type": "string",
                    "enum": [
                      "working",
                      "history",
                      "patterns",
                      "books",
                      "memory_bank"
                    ]
                  }
                }
              }
            }
          }
        }
      }
    },
    "known_context": {
      "type": "object",
      "additionalProperties": false,
      "required": ["known_context_text", "known_context_items"],
      "properties": {
        "known_context_text": { "type": "string" },
        "known_context_items": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["tier", "memory_id", "content"],
            "properties": {
              "tier": {
                "type": "string",
                "enum": [
                  "working",
                  "history",
                  "patterns",
                  "books",
                  "memory_bank"
                ]
              },
              "memory_id": { "type": "string" },
              "content": { "type": "string" },
              "doc_id": { "type": ["string", "null"] },
              "score_summary": { "type": ["object", "null"] }
            }
          }
        }
      }
    },
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["tier", "memory_id"],
        "properties": {
          "tier": {
            "type": "string",
            "enum": ["working", "history", "patterns", "books", "memory_bank"]
          },
          "memory_id": { "type": "string" },
          "doc_id": { "type": ["string", "null"] },
          "chunk_id": { "type": ["string", "null"] }
        }
      }
    },
    "context_insights": {
      "type": "object",
      "additionalProperties": false,
      "required": ["matched_concepts", "active_concepts"],
      "properties": {
        "matched_concepts": { "type": "array", "items": { "type": "string" } },
        "active_concepts": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["concept"],
            "properties": {
              "concept": { "type": "string" },
              "best_collection": { "type": ["string", "null"] },
              "success_rate": {
                "type": ["number", "null"],
                "minimum": 0,
                "maximum": 1
              },
              "usage_count": { "type": ["integer", "null"], "minimum": 0 }
            }
          }
        },
        "tier_recommendations": { "type": ["array", "null"] },
        "you_already_know": { "type": ["array", "null"] },
        "directives": {
          "type": ["array", "null"],
          "items": { "type": "string" }
        }
      }
    },
    "debug": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "retrieval_confidence",
        "fallbacks_used",
        "stage_timings_ms",
        "errors"
      ],
      "properties": {
        "retrieval_confidence": {
          "type": "string",
          "enum": ["high", "medium", "low"]
        },
        "fallbacks_used": { "type": "array", "items": { "type": "string" } },
        "stage_timings_ms": {
          "type": "object",
          "additionalProperties": { "type": "number", "minimum": 0 }
        },
        "errors": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["stage", "message"],
            "properties": {
              "stage": { "type": "string" },
              "message": { "type": "string" },
              "code": { "type": ["string", "null"] }
            }
          }
        },
        "vector_stage_status": {
          "type": ["string", "null"],
          "enum": [
            "enabled",
            "disabled_schema_mismatch",
            "disabled_breaker_open",
            "disabled_config",
            null
          ]
        }
      }
    },
    "feedback": {
      "type": "object",
      "additionalProperties": false,
      "required": ["eligible", "interrupted"],
      "properties": {
        "eligible": { "type": "boolean" },
        "interrupted": { "type": "boolean" },
        "eligible_reason": { "type": ["string", "null"] },
        "default_related_positions": {
          "type": "array",
          "items": { "type": "integer", "minimum": 1 }
        }
      }
    }
  }
}
```

### 18.8 Failure states and graceful degradation (must not break UX)

- Every memory panel must handle and clearly display:
  - “memory disabled” mode (feature flag off): hide panels and avoid broken links
  - “vector stage disabled” mode (schema mismatch): show a clear banner and remain usable (lexical-only)
  - “reranker unavailable” mode: show a subtle indicator, not an error modal
- empty states (no memories yet, no books yet, no KG yet) with guided next actions

### 18.9 Implementation approach (safe rollout)

- Implement UI behind flags:
  - `MEMORY_UI_ENABLED`
  - `MEMORY_BOOKS_UI_ENABLED`
  - `MEMORY_KG_UI_ENABLED`
- Keep changes additive:
  - do not change existing conversation flows or model selection behavior
  - ship panels as optional routes/modals and progressively enhance

---

## 19. Enterprise Backend Patterns (Roampal → BricksLLM Adaptation)

These production-grade patterns from Roampal must be integrated into BricksLLM backend to ensure security, robustness, and maintainability.

### 19.1 Dependency Injection & Service Initialization

**Source**: [dependencies_initializers.py](file:///home/ilan/BricksLLM/roampal/backend/app/dependencies_initializers.py)

**Pattern**: Factory functions for async service initialization with interface-based design

**Adapt to BricksLLM**:

- Create `backend/services/service_initializers.go` (or equivalent service layer)
- Initialize memory system, embedding system, MCP clients, etc. via factory functions
- Use interfaces for testability (e.g., `MemoryServiceInterface`, `EmbeddingServiceInterface`)
- **Path Traversal Protection**: Validate all fragment/collection IDs with regex (e.g., `^[a-zA-Z0-9_-]+$`)
- Example validation from Roampal:

  ```python
  if not fragment_id or not re.match(r'^[a-zA-Z0-9_-]+$', fragment_id):
      raise ValueError(f"Invalid fragment_id: '{fragment_id}'")

  # Normalize paths and validate within expected directory
  vector_store_path = os.path.abspath(settings.paths.get_vector_db_dir(fragment_id))
  expected_base = os.path.abspath("data/vector_stores")
  if not vector_store_path.startswith(expected_base):
      raise ValueError(f"Invalid vector store path: {vector_store_path}")
  ```

**Critical for BricksLLM**:

- Validate all user-provided IDs (conversation_id, collection names, etc.)
- Centralize initialization logic to avoid scattered setup
- Prevent path traversal in fragment/shard access

### 19.2 Response Validation & Injection Protection

**Source**: [agent_chat.py ResponseValidator](file:///home/ilan/BricksLLM/roampal/backend/app/routers/agent_chat.py#L73-L113)

**Pattern**: `ResponseValidator` class validates LLM responses for hijacking/injection attempts

**Adapt to BricksLLM**:

- Create `backend/validation/response_validator.go` with:
  - `ValidateResponse(text string) (isValid bool, reason string)`
  - Detect hijack patterns:
    - Role change admission: `"I am now"`, `"in pirate voice"`, `"as requested I will"`
    - System tag injection: `<system>`, `</system>`
    - Short suspicious responses (< 15 chars with keywords `"hack"`, `"pwned"`, `"error"`)
    - Hijack payload in final sentence: `"HACK"`, `"HACKED"`, `"PWNED"`
  - Return fallback on detection: `"I noticed something unusual in my response. Let me try again - how can I help you?"`
- **Critical**: Apply validation to DictaLM outputs in `runMcpFlow.ts` streaming logic

### 19.3 Security Middleware

**Source**: [middleware/security.py](file:///home/ilan/BricksLLM/roampal/backend/middleware/security.py)

**Pattern**: Centralized utilities for path validation, command sanitization, rate limiting

**Adapt to BricksLLM**:

- Create `backend/middleware/security.go` with:
  - `ValidatePath(path string, allowedDirs []string) (string, error)`: Prevent path traversal
  - `SanitizeBashCommand(cmd string) (string, error)`: Block dangerous patterns
    - Dangerous commands: `"rm -rf /"`, `"dd"`, `"mkfs"`, `"format"`, `"sudo"`, `"su"`, `"chmod 777"`, `"eval"`, `"exec"`
    - Command chaining: `;`, `&&`, `||`, `` ` ``, `$(`
    - Redirection: `>`, `>>`, `<`, `|`
  - `GenerateAPIKey() string`: Secure token generation
  - `HashAPIKey(key string) string`: SHA-256 hashing for storage
  - `RateLimiter`: In-memory rate limiter (100 req/min per session)

**Critical for BricksLLM**:

- Apply to all file operations in MCP tools
- Validate webhooks and URLs to prevent SSRF attacks
- Rate limit `/api/chat` and `/api/mcp/` endpoints

### 19.4 Input Validation

**Source**: [models/validation.py](file:///home/ilan/BricksLLM/roampal/backend/models/validation.py)

**Pattern**: Pydantic models with strict field validation, regex patterns, and custom validators

**Adapt to BricksLLM**:

- Use Go struct tags for validation (library: `go-playground/validator`)
- **Key Validations**:
  - `conversation_id`: Pattern `^conv_[a-z0-9_]{1,50}$`
  - `doc_id`: Pattern `^[a-zA-Z]+_[a-f0-9]{8,}$`
  - `outcome`: Enum `(worked|failed|partial)`
  - `message`: Strip whitespace, check for control characters (`[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]`), min/max length
- Reject requests with invalid fields early (before business logic)

### 19.5 System Health Monitoring

**Source**: [system_health.py](file:///home/ilan/BricksLLM/roampal/backend/app/routers/system_health.py)

**Pattern**: Centralized `/health` endpoint with disk space warnings and data size breakdowns

**Adapt to BricksLLM**:

- Add `GET /api/health` endpoint to return:
  ```json
  {
    "status": "healthy|warning|error",
    "timestamp": "2026-01-06T...",
    "disk": {
      "total_gb": 1024,
      "used_gb": 512,
      "free_gb": 512,
      "used_percent": 50
    },
    "data_sizes": {
      "chromadb_mb": 256,
      "sessions_count": 150,
      "backups_mb": 2048
    },
    "warnings": ["⚠️ Disk space getting low: Less than 5GB free"]
  }
  ```
- **Warning Thresholds**:
  - `< 500MB free`: Critical (status=error)
  - `< 1GB free`: Low (status=warning)
  - `< 5GB free`: Getting low (status=warning)
  - `ChromaDB > 1GB`: Large database warning
  - `Sessions > 1000`: Cleanup recommendation

### 19.6 Session Security

**Source**: [session_manager.py](file:///home/ilan/BricksLLM/roampal/backend/services/session_manager.py)

**Pattern**: Cryptographically secure session tokens with HMAC validation

**Adapt to BricksLLM**:

- Create `backend/services/session_manager.go`
- **Token Format**: `{user_id}_{shard_id}_{token_prefix}_{hmac_prefix}:{full_token}`
- **HMAC Computation**: `HMAC-SHA256(secret_key, {user_id}:{shard_id}:{token})`
- **Session Isolation**: Sessions are strictly isolated by user_id and shard_id (prevent cross-user data access)
- **Timeout**: Default 24 hours, configurable

### 19.7 Rate Limiting Middleware

**Source**: [main.py rate_limit_middleware](file:///home/ilan/BricksLLM/roampal/backend/main.py#L683-L711)

**Pattern**: FastAPI middleware for global rate limiting (100 req/min per session)

**Adapt to BricksLLM**:

- Add Go HTTP middleware to rate limit requests
- Track requests per session via `X-Session-Id` header or IP fallback
- Return `HTTP 429 Too Many Requests` when limit exceeded
- Skip rate limiting for `/health`, `/metrics`, `/stats`, and WebSocket endpoints (`/ws/`)
- **Storage**: In-memory map `{session_id: [timestamps]}` with cleanup of old entries

### 19.8 Implementation Priority

**Phase 1 (Critical - Security)**:

1. Input validation (19.4): Prevent injection attacks
2. Response validation (19.2): Detect LLM hijacking
3. Path traversal protection (19.1, 19.3): Prevent file system attacks

**Phase 2 (Scale & Reliability)**:

1. Session security (19.6): Secure multi-user sessions
2. Rate limiting (19.7): Prevent abuse
3. Health monitoring (19.5): Operational visibility

**Phase 3 (Maintenance)**:

1. Dependency injection (19.1): Clean architecture for testing
2. Security middleware (19.3): Centralized security utilities

---

## 20) Enterprise Prompt System (Roampal → BricksLLM Adaptation)

### Goal

Port the optimized, enterprise-grade prompt templates from Roampal to achieve consistent, high-quality LLM responses across both Hebrew and English users. This system was tested extensively to achieve reliable structured outputs and memory operations.

### Source Directories Analyzed

- `/home/ilan/BricksLLM/roampal/backend/prompts/` — 14 specialized prompt templates
- `/home/ilan/BricksLLM/roampal/backend/modules/prompt/` — Jinja2 prompt engine
- `/home/ilan/BricksLLM/roampal/backend/modules/prompt/templates/` — System prompt templates

---

### 20.1 Prompt Engine Architecture

#### A) Jinja2-Based Templating System

**Source:** `modules/prompt/prompt_engine.py`

**Purpose:** Dynamic prompt construction with variable injection, allowing different contexts (memory, conversation history, user profile) to be cleanly inserted into prompts.

**Key Features:**

1. **Prioritized Template Directories** — Fragment-specific templates override shared templates
2. **Async Rendering** — Non-blocking template rendering for streaming compatibility
3. **Graceful Fallback** — Returns minimal safe prompt on template errors

**TypeScript Adaptation for BricksLLM:**

```typescript
// frontend-huggingface/src/lib/server/memory/promptEngine.ts
import Handlebars from "handlebars"; // Use Handlebars as TypeScript Jinja2 equivalent
import fs from "fs";
import path from "path";

interface PromptContext {
  user_input: string;
  system_prompt?: string;
  contextual_opener?: string;
  conversation_bridges?: string[];
  conversation_history?: string;
  [key: string]: any;
}

export class PromptEngine {
  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();
  private templateDirs: string[];
  private defaultSystemPrompt: string = "default_system";

  constructor(templateDirectories: string[]) {
    this.templateDirs = templateDirectories.filter((dir) => fs.existsSync(dir));
    if (this.templateDirs.length === 0) {
      throw new Error(
        "PromptEngine must have at least one valid template directory"
      );
    }
  }

  private loadTemplate(templateName: string): HandlebarsTemplateDelegate {
    const cached = this.templateCache.get(templateName);
    if (cached) return cached;

    // Search directories in priority order (first found wins)
    for (const dir of this.templateDirs) {
      const templatePath = path.join(dir, `${templateName}.txt`);
      if (fs.existsSync(templatePath)) {
        const content = fs.readFileSync(templatePath, "utf-8");
        const compiled = Handlebars.compile(content);
        this.templateCache.set(templateName, compiled);
        return compiled;
      }
    }
    throw new Error(
      `Template '${templateName}.txt' not found in any template directory`
    );
  }

  buildPrompt(
    userInput: string,
    context: PromptContext,
    systemPromptName?: string
  ): string {
    try {
      const templateName = systemPromptName || this.defaultSystemPrompt;
      const template = this.loadTemplate(templateName);

      const renderContext = { ...context, user_input: userInput };
      return template(renderContext).trim();
    } catch (error) {
      console.error(`Error building prompt: ${error}`);
      // Graceful fallback
      return `You are a helpful assistant. Please assist the user with: ${userInput}`;
    }
  }
}
```

#### B) System Prompt Template Structure

**Source:** `modules/prompt/templates/system_prompt.txt`

```jinja2
{{ system_prompt }}

{% if contextual_opener %}
{{ contextual_opener }}

{% endif %}
{% if conversation_bridges %}
{% for bridge in conversation_bridges %}
{{ bridge }}
{% endfor %}

{% endif %}
{% if conversation_history %}
Recent conversation:
{{ conversation_history }}

{% endif %}
Current user input:
{{ user_input }}
```

**Adaptation for TypeScript/Handlebars:**

```handlebars
{{{system_prompt}}}

{{#if contextual_opener}}
  {{{contextual_opener}}}

{{/if}}
{{#if conversation_bridges}}
  {{#each conversation_bridges}}
    {{{this}}}
  {{/each}}

{{/if}}
{{#if conversation_history}}
  Recent conversation:
  {{{conversation_history}}}

{{/if}}
Current user input:
{{{user_input}}}
```

---

### 20.2 Prompt Template Catalog

Below is the complete catalog of enterprise prompts with their purposes, usage contexts, and adaptation notes.

#### 20.2.1 Memory & Profile Detection Prompts

##### `profile_update_detection.txt` — **CRITICAL for Memory Bank**

**Purpose:** Detect when a user shares personal information that should be stored in memory_bank.

**Usage Context:** Called after each user message to extract identity/preferences/goals.

**Template:**

```
Analyze the following USER input to extract profile information.
Only extract facts, goals, preferences, or values if the USER clearly states them directly.
Ignore facts, values, or preferences stated or implied by the assistant.

RULES:
- DO NOT infer from jokes, sarcasm, or hypotheticals
- The fact must be a strong, direct statement by the user
- Extract specific, actionable information only

ENHANCED CATEGORIZATION:
When extracting information, use intelligent categorization:

Core Categories: ["name", "goals", "skills", "values", "interests", "preferences"]
Enhanced Categories:
- "learning_goals" - Things user wants to learn or master
- "short_term_goals" - Goals for next 1-6 months
- "long_term_goals" - Career/life goals 1+ years
- "technical_skills" - Programming, software, tools
- "creative_skills" - Art, design, writing, music
- "interpersonal_skills" - Communication, leadership
- "projects" - Current work or personal projects
- "challenges" - Current problems or obstacles
- "work_context" - Job details, role, responsibilities
- "colleagues" - Work relationships mentioned
- "family" - Family members mentioned
- "communication_style" - How they prefer to interact

OUTPUT FORMAT:
If you find profile information, return JSON with:
- "field": The most specific applicable category from above
- "value": The extracted information as a clear, concise string
- "reasoning": Brief explanation quoting the user
- "confidence": "high", "medium", or "low" based on clarity of user statement

If no clear profile information is found, output: "null"

EXAMPLES:
{"field": "technical_skills", "value": "Python programming", "reasoning": "User said 'I code in Python'", "confidence": "high"}
{"field": "learning_goals", "value": "Master machine learning", "reasoning": "User said 'I want to learn ML'", "confidence": "high"}
{"field": "short_term_goals", "value": "Launch my app this quarter", "reasoning": "User mentioned 'launching my app this quarter'", "confidence": "high"}

User input: {user_input}

JSON Output:
```

**Hebrew/English Bilingual Adaptation:**

```
Analyze the following USER input to extract profile information.
The input may be in HEBREW (עברית) or ENGLISH - analyze in the input's language.
Only extract facts, goals, preferences, or values if the USER clearly states them directly.

זיהוי מידע פרופיל: נתח את הקלט ואתר עובדות, מטרות, העדפות או ערכים.

RULES / כללים:
- DO NOT infer from jokes, sarcasm, or hypotheticals / אל תסיק מבדיחות או אירוניה
- The fact must be a strong, direct statement / העובדה חייבת להיות הצהרה ישירה
- Extract specific, actionable information only / חלץ רק מידע ספציפי

[Rest of template unchanged - categories are universal]

User input: {user_input}

JSON Output:
```

**Integration Point in BricksLLM:**

- Call in `runMcpFlow.ts` after user message received
- If JSON returned (not "null"), call `add_to_memory_bank` with extracted data
- Set `importance` based on category (identity=0.9, goals=0.8, preferences=0.7)

---

##### `history_summary.txt` — Conversation Compression

**Purpose:** Compress conversation history for context window efficiency.

**Template:**

```
Summarize the following chat in {num_bullets} bullet points.
Only include facts, explicit user-affirmed goals, or preferences. Ignore speculation, jokes, and assistant suggestions.
{chat_text}

Summary:
```

**Hebrew/English Bilingual Adaptation:**

```
Summarize the following chat in {num_bullets} bullet points.
If the chat is in HEBREW, write the summary in HEBREW.
If the chat is in ENGLISH, write the summary in ENGLISH.

סכם את השיחה ב-{num_bullets} נקודות. שמור על שפת המקור.

Only include facts, explicit user-affirmed goals, or preferences.
כלול רק עובדות, מטרות שהמשתמש אישר, או העדפות.

{chat_text}

Summary / סיכום:
```

**Integration Point:** Call when conversation exceeds 8 messages to compress older messages.

---

#### 20.2.2 Knowledge Graph Prompts

##### `knowledge_graph_analysis.txt` — **CRITICAL for KG Construction**

**Purpose:** Extract concepts and relationships for the three Knowledge Graphs (Routing, Content, Action).

**Key Features:**

- Concept extraction with types (quote, model, summary, learning, concept)
- Relationship types: influences, builds_upon, supports, contradicts, evolves_from, connects_to, CAUSES, LEADS_TO, TRIGGERS, PREVENTS
- Structured JSON output with confidence scores

**Full Template:** (See `/home/ilan/BricksLLM/roampal/backend/prompts/knowledge_graph_analysis.txt`)

**Integration Point:**

- Call after storing memories in `patterns` tier
- Feed output to `KnowledgeGraphService.updateGraph()`

---

#### 20.2.3 Book Processing Prompts

##### `book_extraction.txt` — Document Intelligence

**Purpose:** Extract quotes, mental models, and summaries from ingested documents.

**Template:**

```
Extract the key quotes, mental models, and summaries from the following book text: {content}

Book: {book_title}

For each item, assign a category that best describes its domain or topic.
[Categories: philosophy, psychology, business, science, technology, health, relationships, creativity, leadership, spirituality, education, economics, politics, history, literature, art, music, sports, nature, personal_development, productivity, communication, decision_making, strategy, innovation, ethics, culture, society, environment]

Output in JSON format only:
{
  "quotes": [
    {"text": "quote1", "category": "philosophy"},
    ...
  ],
  "models": [
    {"text": "model1", "category": "psychology"},
    ...
  ],
  "summaries": [
    {"text": "summary1", "category": "leadership"},
    ...
  ]
}
```

**Hebrew/English Bilingual Adaptation:**

- Categories are universal (use English for consistency)
- Extracted text preserves the source language
- Add instruction: "Preserve the original language of quotes and summaries."

**Integration Point:** Call during book ingestion in `BookIngestionService`.

---

##### `map_chunk.txt` — Chunk Analysis (Map Phase)

**Purpose:** Analyze individual text chunks during MapReduce document processing.

**Template:**

```
Analyze the following text chunk and extract key insights:

Text: {chunk_text}

Please provide:
1. A concise summary of the main points
2. Any notable quotes or phrases
3. Key concepts or models mentioned
4. The overall tone and style

Format your response as JSON with the following structure:
{
  "summary": "Brief summary of the chunk",
  "quotes": ["notable quote 1", "notable quote 2"],
  "concepts": ["concept 1", "concept 2"],
  "tone": "descriptive tone",
  "style": "writing style"
}
```

---

##### `reduce_summaries.txt` — Summary Aggregation (Reduce Phase)

**Purpose:** Combine multiple chunk summaries into a unified document summary.

**Template:**

```
Combine and synthesize the following summaries into a coherent overview:

Summaries:
{summaries}

Please create a unified summary that:
1. Identifies common themes and patterns
2. Highlights the most important insights
3. Maintains the key concepts from each summary
4. Provides a cohesive narrative

Format your response as JSON:
{
  "unified_summary": "Combined summary text",
  "key_themes": ["theme1", "theme2"],
  "main_insights": ["insight1", "insight2"]
}
```

---

#### 20.2.4 Memory Quality Prompts

##### `fragment_rating.txt` — Relevance Scoring

**Purpose:** Score the usefulness of a memory fragment for a specific query (used by SearchService).

**Template:**

```
Rate usefulness of this fragment for query '{query}': 0 (useless) to 1 (essential).
Fragment: {fragment_text}
Rating:
```

**Integration Point:** Call during retrieval to re-rank candidates beyond vector similarity.

---

##### `fragment_replay.txt` — Memory Enhancement

**Purpose:** Improve low-value memory fragments to increase future retrieval quality.

**Template:**

```
Re-synthesize this low-value fragment: {fragment_text}
Improved version:
```

**Integration Point:** Call during PromotionService cleanup to salvage low-score memories.

---

##### `merge_cluster.txt` — Deduplication

**Purpose:** Merge similar memory fragments into a consolidated version.

**Template:**

```
Merge the following similar fragments into a single consolidated fragment.

Cluster contents:
{cluster_contents}

Output:
**Consolidated Fragment**: the merged text
**Confidence Score**: a number from 0.0 to 1.0 indicating merge quality
```

**Integration Point:** Call during deduplication (Section 7) when similarity > 0.80.

---

#### 20.2.5 Content Processing Prompts

##### `extract_content.txt` — General Content Extraction

**Purpose:** Extract structured information from arbitrary text.

**Template:**

```
Extract specific content from the following text:

Text: {text_content}

Please extract:
1. Notable quotes and memorable phrases
2. Key concepts, models, or frameworks
3. Important insights and lessons
4. Technical terms or specialized vocabulary

Format your response as JSON:
{
  "quotes": ["quote1", "quote2"],
  "concepts": ["concept1", "concept2"],
  "insights": ["insight1", "insight2"],
  "technical_terms": ["term1", "term2"]
}
```

---

##### `blend_inputs.txt` — Multi-Source Blending

**Purpose:** Combine multiple information sources into a unified response.

**Template:**

```
You are a content blending assistant. Your task is to blend multiple input sources into a coherent, unified response.

Input sources to blend:
{inputs}

Guidelines:
1. Identify the key themes and insights from each source
2. Find commonalities and complementary information
3. Create a unified narrative that incorporates all relevant information
4. Maintain the most important details from each source
5. Ensure the final output is coherent and well-structured

Blended output:
```

**Integration Point:** Use when combining memory search results with external tool outputs.

---

#### 20.2.6 Reasoning & Decision Prompts

##### `tool_decision_prompt.txt` (prompts/) — Tool Selection

**Purpose:** Decide whether an external tool is needed for a user request.

**Template:**

```
You are an AI assistant. Analyze the user's request and determine if you need to use any tools.

User query: {{ user_input }}

Available context: {{ context }}

Respond naturally and helpfully to the user's request. If you need to search for information or use tools, do so appropriately.
```

---

##### `tool_decision_prompt.txt` (modules/prompt/templates/) — Web Search Decision

**Purpose:** Structured JSON decision for web search tool calls.

**Template:**

```
You are a helpful AI assistant that decides whether a tool must be used to fulfill the user's request.

Respond with one of the following two strict JSON objects, and nothing else.

### If tool is needed (including multiple queries):
{
  "tool_calls": [
    {
      "name": "perform_web_search",
      "arguments": {
        "query": "precise search terms for the first fact"
      }
    }
  ]
}

### If no tool is needed:
{ "tool_calls": null }

IMPORTANT RULES:
- The ONLY allowed tool is: perform_web_search
- NEVER invent or modify tool names.
- If the user's request contains multiple unrelated facts, create a separate tool_call for each.
- Do NOT include any explanation, markdown, or code formatting — just the JSON.

User Request: "{{ user_input }}"
```

---

##### `debate_prompt.txt` — Multi-Perspective Analysis

**Purpose:** Generate balanced analysis with multiple viewpoints.

**Template:**

```
Engage in a thoughtful debate about the following topic:

Topic: {debate_topic}

Consider multiple perspectives and provide:
1. Arguments for and against
2. Evidence and reasoning
3. Potential counterarguments
4. A balanced conclusion

Format your response as JSON:
{
  "arguments_for": ["argument1", "argument2"],
  "arguments_against": ["argument1", "argument2"],
  "evidence": ["evidence1", "evidence2"],
  "counterarguments": ["counter1", "counter2"],
  "conclusion": "Balanced conclusion"
}
```

---

##### `tone_inference.txt` — Tone Detection

**Purpose:** Detect the user's desired communication tone for adaptive responses.

**Template:**

```
Infer the desired tone for this user input: {user_input}
Output a tone label: "formal", "casual", "empathetic", etc.
```

**Integration Point:** Use to dynamically adjust the conversation style overlay in the personality system.

---

### 20.3 Bilingual (Hebrew/English) Prompt Design Guidelines

#### A) Core Principles

1. **Language Detection First** — Every user-facing prompt should start with:

   ```
   The input may be in HEBREW (עברית) or ENGLISH - analyze and respond in the input's language.
   הקלט עשוי להיות בעברית או באנגלית - נתח והשב בשפת הקלט.
   ```

2. **Key Instructions in Both Languages** — Critical rules should be stated in both:

   ```
   RULES:
   - Extract only explicit facts / חלץ רק עובדות מפורשות
   - Ignore jokes and sarcasm / התעלם מבדיחות וציניות
   ```

3. **Preserve Source Language in Outputs** — When extracting quotes or content:

   ```
   Preserve the original language of extracted text.
   שמור על השפה המקורית של הטקסט.
   ```

4. **Universal Categories** — Use English category names (they're universal identifiers):

   ```json
   { "field": "goals", "value": "ללמוד פייתון", "confidence": "high" }
   ```

5. **Hebrew-Aware Tokenization** — When processing Hebrew text:
   - Right-to-left text handling
   - No word-boundary assumptions (Hebrew often lacks spaces between some words)
   - Consider nikud (vowel marks) variations

#### B) Prompt Template Bilingual Wrappers

For each prompt that accepts user input, wrap with:

```typescript
function wrapBilingualPrompt(basePrompt: string, userInput: string): string {
  const bilingualHeader = `
The following input may be in HEBREW or ENGLISH. Analyze and respond appropriately.
הקלט הבא עשוי להיות בעברית או באנגלית. נתח והשב בהתאם.

`;
  return bilingualHeader + basePrompt.replace("{user_input}", userInput);
}
```

---

### 20.4 Integration Points in BricksLLM/DictaChat

#### A) File Structure

```
frontend-huggingface/
  templates/
    prompts/                         # Main prompt templates
      profile_update_detection.txt
      knowledge_graph_analysis.txt
      book_extraction.txt
      map_chunk.txt
      reduce_summaries.txt
      fragment_rating.txt
      fragment_replay.txt
      merge_cluster.txt
      extract_content.txt
      blend_inputs.txt
      debate_prompt.txt
      tone_inference.txt
      history_summary.txt
    prompt_templates/                # Jinja2/Handlebars system templates
      system_prompt.txt
      tool_decision_prompt.txt
  src/lib/server/memory/
    promptEngine.ts                  # TypeScript prompt engine
    promptLoader.ts                  # Template loading utilities
```

#### B) Usage Context Mapping

| Prompt                     | Service                 | Method                  | Trigger                          |
| -------------------------- | ----------------------- | ----------------------- | -------------------------------- |
| `profile_update_detection` | `ContextService`        | `detectProfileUpdate()` | After each user message          |
| `history_summary`          | `ContextService`        | `compressHistory()`     | When messages > 8                |
| `knowledge_graph_analysis` | `KnowledgeGraphService` | `extractConcepts()`     | After storing to `patterns`      |
| `book_extraction`          | `BookIngestionService`  | `extractContent()`      | During document ingestion        |
| `map_chunk`                | `BookIngestionService`  | `processChunk()`        | Per chunk during ingestion       |
| `reduce_summaries`         | `BookIngestionService`  | `aggregateSummaries()`  | After all chunks processed       |
| `fragment_rating`          | `SearchService`         | `rerankCandidates()`    | During retrieval reranking       |
| `fragment_replay`          | `PromotionService`      | `enhanceLowScore()`     | During cleanup cycle             |
| `merge_cluster`            | `MemoryBankService`     | `mergeDuplicates()`     | During deduplication             |
| `extract_content`          | `ContextService`        | `extractInsights()`     | On demand content extraction     |
| `blend_inputs`             | `SearchService`         | `blendResults()`        | Multi-source response generation |
| `debate_prompt`            | N/A                     | N/A                     | Optional advanced reasoning      |
| `tone_inference`           | `ContextService`        | `detectTone()`          | For adaptive personality         |
| `system_prompt`            | `PromptEngine`          | `buildPrompt()`         | Every LLM request                |
| `tool_decision_prompt`     | MCP Integration         | `shouldCallTool()`      | Before tool execution            |

#### C) Configuration in `memory_config.ts`

```typescript
export const promptConfig = {
  templateDir: "templates/prompts",
  systemTemplateDir: "templates/prompt_templates",

  // Profile detection settings
  profileDetection: {
    enabled: true,
    minConfidence: "medium", // 'low', 'medium', 'high'
    importanceMapping: {
      name: 0.95,
      identity: 0.9,
      goals: 0.85,
      learning_goals: 0.85,
      projects: 0.8,
      skills: 0.75,
      preferences: 0.7,
      challenges: 0.7,
      work_context: 0.65,
      default: 0.6,
    },
  },

  // History compression
  historySummary: {
    triggerThreshold: 8, // messages
    bulletCount: 5,
  },

  // Fragment quality
  fragmentRating: {
    rerankThreshold: 0.3, // Only rerank top candidates above this score
    ratingWeight: 0.4, // Weight of LLM rating vs vector similarity
  },
};
```

---

### 20.5 Implementation Checklist

- [ ] Copy prompt templates from `roampal/backend/prompts/` to `frontend-huggingface/templates/prompts/`
- [ ] Copy system templates from `roampal/backend/modules/prompt/templates/` to `frontend-huggingface/templates/prompt_templates/`
- [ ] Create `PromptEngine` class in TypeScript with Handlebars
- [ ] Implement `promptLoader.ts` with mtime-based caching
- [ ] Add bilingual wrappers to all user-facing prompts
- [ ] Integrate `profile_update_detection` in `runMcpFlow.ts` post-message hook
- [ ] Integrate `history_summary` in context management
- [ ] Integrate `fragment_rating` in `SearchService.rerankCandidates()`
- [ ] Integrate `book_extraction` and MapReduce prompts in `BookIngestionService`
- [ ] Integrate `knowledge_graph_analysis` in `KnowledgeGraphService`
- [ ] Add prompt configuration to `memory_config.ts`
- [ ] Create unit tests for prompt template loading and variable injection
- [ ] Test Hebrew input handling for all user-facing prompts

---

### 20.6 LLM Usage Instructions (For Model Integration)

When using these prompts with an LLM (DictaLM, Mistral, etc.):

1. **JSON Outputs** — Prompts ending with "JSON Output:" or "Format your response as JSON:" expect ONLY valid JSON, no markdown fencing.

2. **Confidence Levels** — Use `"high"` when the user makes a direct statement, `"medium"` when inferred from context, `"low"` when possible but uncertain.

3. **Hebrew Handling** — Hebrew text should flow right-to-left naturally. The model should not translate between languages unless explicitly asked.

4. **Structured Extraction** — When extracting lists/arrays, prefer fewer high-quality items over many low-quality ones.

5. **Fallback Behavior** — If unable to extract information, return `"null"` or an empty array `[]` rather than fabricating data.

6. **Category Selection** — When assigning categories, prefer the most specific applicable category over generic ones like "general" or "other".
