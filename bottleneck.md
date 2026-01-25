# BricksLLM Memory + MCP Workflow Bottleneck Analysis

Date: 2026-01-19

This document analyzes the end-to-end latency path from a user message → memory retrieval + memory bank → MCP orchestration (`runMcpFlow`) → final streamed answer, and enumerates bottlenecks, redundancies, and double-work that can delay **time-to-first-token** and/or **time-to-final-answer**, plus evidence-backed optimizations.

Scope (runtime paths):
- Frontend server streaming pipeline: [textGeneration/index.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/index.ts)
- Message preprocessing (files/images): [preprocessMessages.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/endpoints/preprocessMessages.ts)
- MCP orchestration brain: [runMcpFlow.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts)
- MCP tool stack (selection, parsing, execution): [toolFilter.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/toolFilter.ts), [toolInvocation.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/toolInvocation.ts), [toolParameterRegistry.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/toolParameterRegistry.ts), [toolPrompt.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/utils/toolPrompt.ts), [prepareFilesMemoized.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/utils/prepareFilesMemoized.ts), [xmlUtils.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/utils/xmlUtils.ts), [jsonExtractor.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/utils/jsonExtractor.ts), [performanceMonitor.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/performanceMonitor.ts), [circuitBreaker.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/circuitBreaker.ts)
- Memory integration glue invoked by MCP: [memoryIntegration.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/memoryIntegration.ts)
- Memory system core and retrieval pipeline: [UnifiedMemoryFacade.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/UnifiedMemoryFacade.ts), [PrefetchServiceImpl.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/services/PrefetchServiceImpl.ts), [SearchService.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/search/SearchService.ts), [QdrantAdapter.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/adapters/QdrantAdapter.ts), [MemoryMongoStore.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/stores/MemoryMongoStore.ts), [DictaEmbeddingClient.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/embedding/DictaEmbeddingClient.ts), [StoreServiceImpl.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/services/StoreServiceImpl.ts), [SearchServiceImpl.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/services/SearchServiceImpl.ts), feature flags/env config: [featureFlags.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/featureFlags.ts)
- Memory bank UI/API surface (not on critical TTFT path, but affects “memory_bank” correctness and perceived slowness): [memory-bank/+server.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/routes/api/memory/memory-bank/+server.ts), [memory-bank/[id]/+server.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/routes/api/memory/memory-bank/%5Bid%5D/+server.ts), UI state handling: [memoryUi.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/stores/memoryUi.ts)

Out-of-scope (non-runtime artifacts):
- Historical backups under `.../mcp/old_attempts/` are not imported by runtime code (they can be treated as maintenance noise, not runtime latency).
- Generated test artifacts under `.../__tests__/node_modules/` and `.../__tests__/test-results/` are not executed in production.

---

## 1) End-to-End Flow (User → Memory → MCP → Final Answer)

### 1.1 Request entry + preprocessing
1. `textGeneration(ctx)` starts three async generators: title generation + message generation + keep-alives, and merges them. See [textGeneration/index.ts:L24-L34](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/index.ts#L24-L34).
2. `preprocessMessages(messages, convId)` runs:
   - downloads referenced files for *all messages*, possibly writing large attachments to disk for docling/image usage, and injects clipboard files into message content. See [preprocessMessages.ts:L9-L89](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/endpoints/preprocessMessages.ts#L9-L89).
3. Only after preprocessing completes does MCP start. See [textGeneration/index.ts:L50-L64](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/index.ts#L50-L64).

### 1.2 MCP orchestration high-level
`runMcpFlow` does, in order:
1. Server selection, URL safety filtering, optional HF token overlay. See [runMcpFlow.ts:L218-L373](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L218-L373).
2. Tool list retrieval (`getOpenAiToolsForMcp`) + tool filtering by intent. See [runMcpFlow.ts:L438-L482](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L438-L482).
3. Message preparation (images/files → OpenAI format). See [runMcpFlow.ts:L532-L536](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L532-L536).
4. **Memory integration prefetch** (plus contextual guidance + tool guidance) **awaited before any model streaming begins**. See [runMcpFlow.ts:L549-L1160](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L549-L1160).
5. Tool gating based on memory confidence. See [runMcpFlow.ts:L1162-L1231](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1162-L1231).
6. Tool prompt injection and language instruction; build final system preprompt; configure completion request. See [runMcpFlow.ts:L1233-L1430](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1233-L1430).
7. Stream model output; parse tool calls from native deltas or fallback JSON/XML; execute tools; loop; finally emit `FinalAnswer` with `memoryMeta`. See [runMcpFlow.ts:L1494-L2412](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1494-L2412).

### 1.3 MemoryMeta emission + UI consumption
- `memoryMeta` is constructed right after memory prefetch completes (only if memory is operational) and attached to the `FinalAnswer` update. See [runMcpFlow.ts:L821-L946](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L821-L946) and emission at [runMcpFlow.ts:L2288-L2293](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L2288-L2293).
- The UI intentionally keeps `MessageMemoryUpdateType.Found` lightweight, and only processes heavy metadata when the final answer arrives, to avoid browser freezes. See [conversation/+page.svelte:L441-L448](file:///home/ilan/BricksLLM/frontend-huggingface/src/routes/conversation/%5Bid%5D/+page.svelte#L441-L448).
- The store update that fans out memoryMeta into citations/known context is [memoryUi.ts:L360-L405](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/stores/memoryUi.ts#L360-L405).

---

## 2) Primary Bottlenecks (Most Impactful First)

These are the bottlenecks most likely to delay “assistant starts answering” (TTFT) and “assistant finishes”.

### 2.1 **Hard TTFT blocker: Memory prefetch awaited before starting model stream**
Evidence:
- `runMcpFlow` runs cold-start + memory prefetch + contextual guidance + tool guidance, and it **awaits** the `Promise.allSettled` result before creating the OpenAI completion stream. See [runMcpFlow.ts:L681-L757](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L681-L757) and the completion stream only starts at [runMcpFlow.ts:L1550-L1570](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1550-L1570).
- Default memory prefetch timeout is **6000ms**, meaning worst-case TTFT can be ~6s even before inference. See [featureFlags.ts:L151-L155](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/featureFlags.ts#L151-L155) and `with timeout if not provided` logic in [memoryIntegration.ts:L408-L424](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/memoryIntegration.ts#L408-L424).

Impact:
- For any slowdown in embedding/Qdrant/BM25/reranker, TTFT degrades directly.

High-confidence optimization options (in order of “same architecture, minimal risk”):
1. **Reduce prefetch timeout aggressively** for interactive chat TTFT (e.g., 300–800ms) and rely on:
   - memory-first gating + tool calling fallback when memory misses
   - later turns learning
   Evidence: current config explicitly allows 6s stalls (env default). See [featureFlags.ts:L153](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/featureFlags.ts#L153).
2. **Make prefetch “fast path”**: split into `always_inject` and “semantic search”, where:
   - always_inject is fetched cheaply (Mongo indexed query) and always included
   - semantic search is attempted under a strict short timeout; if it misses, proceed without it
   Evidence: always_inject today uses Qdrant search (see next section) which is unnecessary work.
3. **Turn off reranking during prefetch** (or reduce its top-K) even if enabled elsewhere, because prefetch’s main job is *prompt context*, not perfect ordering.
   Evidence: prefetch calls `hybridSearch.search(... enableRerank: flags.rerankEnabled)` in [PrefetchServiceImpl.ts:L84-L94](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/services/PrefetchServiceImpl.ts#L84-L94).

### 2.2 **Always-inject retrieval is implemented as a Qdrant similarity search with a zero vector**
Evidence:
- `PrefetchServiceImpl.fetchAlwaysInjectMemories()` creates a zero vector and calls `qdrant.search()` for top 20, then filters client-side by `payload.always_inject === true`. See [PrefetchServiceImpl.ts:L165-L195](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/services/PrefetchServiceImpl.ts#L165-L195).
- This is a mismatch: “always inject” is metadata filtering, not similarity search.

Impact:
- Extra Qdrant query every turn, even when no memories will be used.
- Poor correctness under load: “closest to zero vector” is arbitrary; you may miss always_inject items if they don’t appear in top 20.

High-confidence optimization options:
1. **Fetch always_inject from MongoDB** via `memory_items` with an index on `{ user_id, always_inject, status }`.
   - This removes an entire Qdrant call from the critical TTFT path.
   - Mongo already supports this pattern (`getAlwaysInject` exists in [MemoryMongoStore.ts:L797-L806](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/stores/MemoryMongoStore.ts#L797-L806)).
2. Alternatively, **use Qdrant filtering directly** via `scroll` with a payload filter (Qdrant supports filtering). Your adapter currently doesn’t expose a “scroll with filter” helper, so the existing comment “scroll doesn’t support custom filters” is likely the reason for the hack. See the comment at [PrefetchServiceImpl.ts:L171-L173](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/services/PrefetchServiceImpl.ts#L171-L173).

### 2.3 **Message preprocessing can block TTFT (file downloads + disk writes)**
Evidence:
- `preprocessMessages` downloads files and writes to disk when docling/image mime types are detected. See [preprocessMessages.ts:L47-L70](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/endpoints/preprocessMessages.ts#L47-L70).
- It runs over all messages and all files via nested `Promise.all`. See [preprocessMessages.ts:L47-L70](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/endpoints/preprocessMessages.ts#L47-L70).

Impact:
- Large conversation histories with old attachments can cause per-turn pre-processing overhead.
- Disk operations (`existsSync`, `mkdir`, `writeFile`) can delay starting the model stream.

High-confidence optimization options:
1. Only download/process files in the *most recent* N messages, or only in messages that are actually relevant to tool use (e.g., the last user message + last assistant message).
2. Avoid writing image/docling payloads to disk unless a docling tool is actually invoked in the turn.

### 2.4 Tool prompt injection inflates tokens and slows inference (prompt bloat)
Evidence:
- `buildToolPreprompt` embeds the entire tool definitions as pretty-printed JSON (`JSON.stringify(tools, null, 2)`) and adds a capability manifest. See [toolPrompt.ts:L14-L37](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/utils/toolPrompt.ts#L14-L37).
- `runMcpFlow` pushes this into the system message preprompt. See [runMcpFlow.ts:L1256-L1259](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1256-L1259) and system message merge at [runMcpFlow.ts:L1327-L1337](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1327-L1337).

Impact:
- Larger prompt ⇒ slower TTFT (longer prefill) and slower per-token generation on llama.cpp.
- Also increases probability of hitting context limits and causing tool-call formatting mistakes.

High-confidence optimization options:
1. Use compact JSON (no indentation) and/or only include the filtered tool subset already selected (you already filter tools; the formatting step still bloats).
2. Move the “capability manifest” into a short bullet list instead of a large structured payload.

### 2.5 Cache key generation in `prepareMessagesWithFilesMemoized` can be expensive
Evidence:
- It builds cache keys by `JSON.stringify` over the entire messages structure, including file metadata and `file.value?.length`. See [prepareFilesMemoized.ts:L30-L48](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/utils/prepareFilesMemoized.ts#L30-L48).

Impact:
- For large conversations, key generation can dominate the cost you were trying to avoid.
- If file values are large and vary, cache hit rate can be low and you still pay stringify cost.

High-confidence optimization options:
1. Hash message content + file SHA references (not full structures) into a short stable key.
2. Limit key construction to last N messages or to messages that contain files.

### 2.6 Streaming keep-alives every 100ms adds load and can amplify tail latency
Evidence:
- `keepAlive` yields a status update every 100ms until the generation is done. See [textGeneration/index.ts:L14-L22](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/index.ts#L14-L22).

Impact:
- Increased SSE traffic, more client-side updates, potential server overhead.
- The stream stays “not done” longer because `runMcpFlow` continues doing post-answer work before returning (see 2.7).

High-confidence optimization options:
1. Increase interval (e.g., 250–1000ms) or only enable keep-alives when upstream is silent beyond a threshold.

### 2.7 Post-answer work extends request lifetime (even after FinalAnswer is yielded)
Evidence:
- After emitting `FinalAnswer`, `runMcpFlow` still does:
  - `recordResponseOutcome` (async but awaited in code path via `.catch` only; OK),
  - emits memory outcome events,
  - does a `storeWorkingMemory` that is awaited up to 500ms via `Promise.race`. See [runMcpFlow.ts:L2299-L2405](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L2299-L2405).
- `finally` awaits `drainPoolEnhanced()`. See [runMcpFlow.ts:L2427-L2433](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L2427-L2433).

Impact:
- Even though the user sees the answer, the server keeps the request open longer, which can:
  - keep keep-alives running
  - delay cleanup and resource reuse under concurrency

High-confidence optimization options:
1. After yielding `FinalAnswer`, return immediately and schedule post-work as fire-and-forget (best-effort).
2. Do not await `drainPoolEnhanced()` in the generator teardown on the hot path; run it on a background timer or only when pool pressure is detected.

---

## 3) Redundancies, Double Calls, and “Unnecessary Work”

### 3.1 Duplicate “explicit tool request” extraction
Evidence:
- `explicitToolRequest` is computed early at [runMcpFlow.ts:L560-L561](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L560-L561) and again inside tool gating at [runMcpFlow.ts:L1177-L1179](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1177-L1179).

Impact:
- Minor CPU waste, but easy to eliminate.

### 3.2 Memory system “operational” check is too shallow, causing wasted slow attempts
Evidence:
- `isMemorySystemOperational()` only checks `MEMORY_SYSTEM_ENABLED`. See [featureFlags.ts:L199-L202](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/featureFlags.ts#L199-L202).
- `memoryIntegration.prefetchMemoryContext` uses this to decide whether to attempt Qdrant/Mongo work. See [memoryIntegration.ts:L395-L400](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/memoryIntegration.ts#L395-L400).

Impact:
- If Mongo/Qdrant/embeddings are down but flag is true, the system still tries and waits (until timeouts/circuit breakers).

Optimization:
- Promote a “health-derived operational” state (e.g., circuit breaker open ⇒ treat as degraded) to skip work earlier.

### 3.3 Heavy logging in hot loops
Evidence:
- `runMcpFlow` logs message size summaries and tool execution details, sometimes including previews of tool outputs. See [runMcpFlow.ts:L1410-L1430](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1410-L1430) and tool output logging at [runMcpFlow.ts:L2106-L2123](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L2106-L2123).

Impact:
- Console IO can become a throughput bottleneck under load.

Optimization:
- Gate verbose logs behind env flags or `LogLevel` thresholds.

### 3.4 Tool filtering regex complexity and tool list scale
Evidence:
- Tool categories are defined with many regexes and long keyword lists, and tools are filtered each turn. See [toolFilter.ts:L109-L257](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/toolFilter.ts#L109-L257).
- There is a cache, but TTL is 30 seconds and key is derived from full user query. See [toolFilter.ts:L30-L89](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/toolFilter.ts#L30-L89).

Impact:
- Not usually dominant, but becomes noticeable if tool lists are large (80+ tools) and many requests are unique queries.

Optimization:
- Cache on `(category match signature, hasDocuments flag)` rather than full query string.

---

## 4) Memory & Memory_Bank Specific Bottlenecks

### 4.1 Prefetch search is the critical path; `facade.search` (UI-driven) can be heavier than prefetch
Notes:
- `runMcpFlow` uses `facade.prefetchContext` (via [memoryIntegration.prefetchMemoryContext](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/memoryIntegration.ts#L357-L464)), not `facade.search`.
- `SearchServiceImpl.search` (used by `/api/memory/search` and other explicit searches) can run bilingual query expansion and execute multiple hybrid searches in parallel. See [SearchServiceImpl.ts:L318-L343](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/services/SearchServiceImpl.ts#L318-L343).

Impact:
- Not TTFT-critical unless you call `facade.search` in the chat path, but it matters for admin panels and manual memory search.

Optimization:
- Only do bilingual expansion for BM25 stage, not full hybrid searches (avoids repeated embedding calls).

### 4.2 Memory bank API listing does full in-memory sort/paginate
Evidence:
- `/api/memory/memory-bank` loads all matching docs (`toArray()`), then deduplicates and sorts in JS, then slices. See [memory-bank/+server.ts:L38-L174](file:///home/ilan/BricksLLM/frontend-huggingface/src/routes/api/memory/memory-bank/+server.ts#L38-L174).

Impact:
- Can become slow with large memory bank sizes, and it runs every time the modal opens.

Optimization:
- Push sort/pagination/dedup down into Mongo using indexes and `$group`/`$sort`.

### 4.3 Memory bank uses dual collection pattern, with potential overlap/double counting
Evidence:
- The stats endpoint explicitly sums counts from both `collections.memoryBank` and `memory_items(tier=memory_bank)` and notes overlap risk. See [memory-bank/stats/+server.ts:L8-L43](file:///home/ilan/BricksLLM/frontend-huggingface/src/routes/api/memory/memory-bank/stats/+server.ts#L8-L43).

Impact:
- Not a chat latency issue, but can confuse UI and produce unnecessary DB reads.

Optimization:
- Complete consolidation and remove legacy reads once migration is finished.

---

## 5) Concrete “Fast Answer” Improvements (MemoryMeta & Response Flow)

These are changes most directly tied to “emit answers faster” while preserving correctness.

### 5.1 Improve TTFT by decoupling memory prefetch from initial inference
Current behavior:
- First token cannot be streamed until prefetch finishes (or times out). See [runMcpFlow.ts:L734-L757](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L734-L757).

Recommended architecture (fast, safe variant):
- “Fast path” prompt (personality + minimal tool instructions + language instruction) starts streaming immediately.
- Memory prefetch runs in parallel and is used to:
  - gate tools (still useful even if it arrives slightly later),
  - and/or be appended in the next round (tool-followup loop) if tool calls occur.

Constraint to acknowledge:
- You cannot inject new system prompt content into an already-started OpenAI streaming completion. So this requires either:
  - accepting “no memory context on the first completion” when prefetch is slow, or
  - moving memory retrieval to a tool call (`search_memory`) that the model can invoke early (which does start streaming immediately).

High-confidence variant (minimal behavioral change):
- Keep prefetch, but cap it to a strict short timeout (e.g., 300–800ms) and proceed with no memory if exceeded.

### 5.2 Emit `memoryMeta` earlier without heavy UI cost (optional)
Current behavior:
- `memoryMeta` is attached only to `FinalAnswer`, by design, to prevent browser freezes. See [conversation/+page.svelte:L441-L448](file:///home/ilan/BricksLLM/frontend-huggingface/src/routes/conversation/%5Bid%5D/+page.svelte#L441-L448).

If you still want “earlier memoryMeta” for UI:
- Emit a new lightweight update type that contains:
  - `tiers_used`, `retrieval_confidence`, and `search_position_map` only
  - and postpone `known_context_text` / full citation content until FinalAnswer.

This matches the current performance-aware philosophy and avoids reintroducing freezes.

### 5.3 Remove nonessential per-turn Qdrant calls (always_inject)
This is the biggest “memory-specific” speed win that does not require architectural changes:
- Replace [PrefetchServiceImpl.fetchAlwaysInjectMemories](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/services/PrefetchServiceImpl.ts#L165-L195) with a Mongo query (you already have `MemoryMongoStore.getAlwaysInject`).

---

## 6) Suggested Measurement Strategy (to validate improvements)

You already have the necessary primitives:
- MCP perf metrics: [performanceMonitor.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/performanceMonitor.ts)
- Memory timing surfaced via debug `stage_timings_ms` from prefetch/search: [SearchService.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/search/SearchService.ts#L182-L269) and `PrefetchServiceImpl` additional timings at [PrefetchServiceImpl.ts:L143-L154](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/services/PrefetchServiceImpl.ts#L143-L154).

Minimum metrics to capture:
- TTFT from request start → first streamed token
- `prefetch_total_ms` and its breakdown:
  - always_inject fetch ms
  - embedding ms
  - qdrant_query_ms / bm25_query_ms / rerank_ms
- Tool execution latency distribution by tool name

---

## 7) Summary of “Top Fixes” (Shortest path to fastest answers)

1. **Reduce/limit memory prefetch blocking** (TTFT): cap to ~300–800ms or parallelize via tool-based retrieval. Evidence: [runMcpFlow.ts:L734-L757](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L734-L757) + [featureFlags.ts:L153](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/featureFlags.ts#L153).
2. **Remove always_inject Qdrant hack**: fetch always_inject via Mongo index. Evidence: [PrefetchServiceImpl.ts:L165-L195](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/services/PrefetchServiceImpl.ts#L165-L195).
3. **Shrink tool prompt payload** to reduce prefill cost. Evidence: [toolPrompt.ts:L14-L37](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/utils/toolPrompt.ts#L14-L37).
4. **Trim preprocessing scope** (attachments) so old history doesn’t block the turn. Evidence: [preprocessMessages.ts:L47-L70](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/endpoints/preprocessMessages.ts#L47-L70).
5. **Stop awaiting post-answer tasks** (or reduce their wait budget) so the request closes quickly and keep-alives stop. Evidence: [runMcpFlow.ts:L2351-L2398](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L2351-L2398) + [textGeneration/index.ts:L14-L22](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/index.ts#L14-L22).

