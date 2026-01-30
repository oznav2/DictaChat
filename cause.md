# BricksLLM: “UI Frozen / Memory Not Called / Hallucinated Final Answer” — Causes

Date: 2026-01-19

This document consolidates findings from multiple investigation phases:
1) “Hallucinated final answer + UI becomes unresponsive” (tool loop / tool-call leakage).
2) “Memory not called” experiences (MCP skipped → fallback generator).
3) “UI becomes unresponsive after an answer that used memory” (post-answer freeze).

---

## 1) What the “frozen UI” incident actually was

### Primary cause: intentional stop-streaming when tool-calls are detected

In the MCP flow, as soon as a tool-call payload is detected in the model output, the server intentionally stops streaming tokens to the browser until tool execution and follow-up generation completes.

Relevant code:
- [runMcpFlow.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1745-L1820)  
  Detects tool calls in-stream and logs: `detected tool_calls ... in stream, stopping UI streaming`.

Why it feels like a freeze:
- The client keeps `loading = true` until it receives `FinalAnswer` (or the request ends).
- During tool loops or slow follow-up completions, the user sees no new assistant text even though the server is active.

### Amplifier: tool loops + slow follow-up completions create long “no visible progress” windows

If the model repeatedly selects an unreliable tool (example: `fetch` to Google Search), it can loop:
- tool execution → blocked content (robots/CAPTCHA) → model tries again → repeat
- eventually hallucinated “final answer” due to lack of evidence

Loop detection exists but can miss “near repeats” where arguments vary:
- [loopDetector.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/loopDetector.ts#L15-L73)

---

## 2) Why you can experience “memory was not called”

There are two distinct meanings of “memory not called”:
1) **Memory retrieval truly did not run** because the system fell back to the non-MCP generation path.
2) **Memory retrieval did run**, but it returned empty/degraded context or the UI did not surface it clearly.

### 2.1 Memory truly not called: MCP flow skipped → default generation runs (no memory)

The architecture:
- The system tries MCP first.
- If MCP returns `false` or errors, it falls back to `generate()`.
- The fallback `generate()` does not integrate memory.

Evidence:
- MCP fallback logic: [textGeneration/index.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/index.ts#L54-L85)
- Default generation has no memory prefetch/injection: [generate.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/generate.ts#L16-L246)

Concrete reasons MCP can return `false` (all happen before memory-prefetch inside MCP):
- No MCP servers selected after merge/selection:  
  [runMcpFlow.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L291-L295)
- All selected servers rejected by URL validation:  
  [runMcpFlow.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L297-L331)  
  Validation rules: [urlValidationCache.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/urlValidationCache.ts#L195-L209)
- Model/tools disabled or router chose non-tool route:  
  [runMcpFlow.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L382-L436)
- Tool filtering produced zero usable tools:  
  [runMcpFlow.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L456-L482)

### 2.2 Memory did run, but looked like “not called” (empty/degraded)

Even when memory retrieval is invoked inside MCP, it can return “empty” or “degraded”, which may be perceived as “not called”:
- Memory prefetch wrapper and operational checks:  
  [memoryIntegration.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/memoryIntegration.ts#L357-L464)

---

## 3) Why hallucinated final answers happen (both MCP and fallback paths)

### 3.1 Hallucination in MCP path: tools fail to fetch evidence, but the model still answers

There is no hard “evidence required” gate. If tools fail (robots/CAPTCHA), the model can still proceed to write a plausible-looking answer.

Tool prompt pressure can worsen this:
- [toolPrompt.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/utils/toolPrompt.ts#L41-L67)  
  Includes: `NEVER say "I cannot search" - USE A TOOL if information is missing.`

### 3.2 Hallucination in fallback path: default generator has no tool requirement and no memory

If MCP is skipped (Section 2.1), the system uses `generate()` with no memory and no enforced tools:
- [generate.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/generate.ts#L16-L246)

---

## 4) Server-side timeouts/abort: what is fixed vs what can still hurt

### Evidence: abort support is implemented in PrefetchServiceImpl

`PrefetchServiceImpl.prefetchContext()` explicitly races the work against `params.signal`:
- [PrefetchServiceImpl.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/memory/services/PrefetchServiceImpl.ts#L75-L125)
- Abort is forwarded into prefetch here: [memoryIntegration.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/memoryIntegration.ts#L408-L424)

### Remaining risk: abort can stop “awaiting”, but not necessarily stop underlying I/O

`Promise.race([...])` stops the caller from waiting, but the underlying `Promise.all([...])` work may still continue in the background (e.g., ongoing network calls in hybrid search). This can:
- increase server load over time under frequent aborts/retries,
- amplify “slow turn” perception during spikes,
- but is unlikely to directly freeze the browser UI (client freezes are usually main-thread work).

---

## 5) Why `<tool_call> … </tool_call>` can still leak, and why `fetch` loops happen

### Symptom

Instead of a clean answer, the assistant sometimes streams:

```xml
<tool_call>
{"name": "fetch", "arguments": {"url": "`https://www.google.com/search?q=...`"}}
</tool_call>
```

and may repeat it.

### Evidence: MCP detects tool calls in-stream (JSON and XML), but partial-tag leakage can happen

The MCP stream-time tool-call detector attempts to stop UI streaming when tool-calls appear (JSON or XML):
- [runMcpFlow.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L1745-L1820)

Why leakage can still happen:
- Detection is based on finding a tool-call “start marker” in the accumulated content.
- When the model streams `<tool_call>` token-by-token, the UI can receive partial prefixes (e.g., `<tool_` / `<tool_call`) before the full marker is present and detectable.
- Once detected, streaming is suppressed, but already-yielded partial text remains visible.

Practical fix direction (architectural, not implemented here): treat any `<tool` prefix as “unsafe” and stop streaming earlier, or ensure tool calls are never streamed as assistant-visible tokens (force provider-native function calling only).

### Evidence: tool selection already distinguishes “search” vs “direct URL”

Current tool filtering is written to:
- prefer Perplexity/Context7 tools for general search queries
- reserve `fetch` for explicit URL retrieval

See:
- search intent tool list (Perplexity/Context7): [toolFilter.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/toolFilter.ts#L125-L151)
- direct URL intent tool list (fetch only): [toolFilter.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/toolFilter.ts#L152-L159)

Google Search is hostile to automated fetching:
- robots restrictions and “unusual traffic” CAPTCHA pages are common responses.
- tool results then contain “blocked” content rather than evidence, leading to repeated fetch attempts.

### Argument brittleness: backticks/whitespace inside URL strings

Observed arguments include backticks and padding:

```json
{"url":" `https://www.google.com/search?q=...` "}
```

URL handling typically trims whitespace but does not strip Markdown backticks:
- [urlSafetyEnhanced.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/urlSafetyEnhanced.ts#L69-L78)

This increases the chance of tool execution failure.

### Evidence: argument sanitization already strips wrapping backticks

The server-side tool argument sanitizer strips values wrapped in backticks:
- [toolArgumentSanitizer.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/toolArgumentSanitizer.ts#L144-L181)

---

## 6) Resolution list (tool-call leakage + fetch loops)

Minimal fixes that preserve the architecture:
1) Treat `<tool_call>…</tool_call>` as a tool-call payload during streaming (earlier/safer cursoring).
2) Sanitize tool arguments (strip backticks, trim, normalize URLs) before execution.
3) Constrain `fetch` to direct-URL retrieval; for “web search” prefer Tavily/Perplexity.
4) Add robots/CAPTCHA-aware fallback: on blocked fetch results, switch tools instead of retrying `fetch`.
5) Tighten the tool prompt to forbid `<tool_call>` wrappers and URL backticks.

---

## 7) Deep dive: UI becomes unresponsive around memory-based answers (end-to-end)

### What your log snippet indicates (and what it does not)

Your server logs show outcome recording and a legacy migration path:
- `[Phase 23.5] Initializing missing stats field for legacy memory`
- `[Phase 23] Outcome recorded successfully`
- `[outcome] Score updated with time decay`

These logs are produced during MCP “memory learning” after a response is emitted. In the current MCP flow, memory outcome tracking is wrapped so it “must never block or throw”:
- Memory outcome tracking is inside a try/catch and designed not to block the answer:  
  [runMcpFlow.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts#L2290-L2458)

So the existence of these logs does not prove the server blocked the stream. They do, however, correlate strongly with **memory-based answers**, which is important for the client-side root cause below.

### Stage map: what happens from “FinalAnswer” to “UI idle again”

After `FinalAnswer` arrives, the client typically does (in this order):
1) Merge `finalText` into `messageToWriteTo.content` and store the update  
   [conversation +page.svelte](file:///home/ilan/BricksLLM/frontend-huggingface/src/routes/conversation/%5Bid%5D/+page.svelte#L360-L405)
2) If `update.memoryMeta` exists, push it to `memoryUi.memoryMetaUpdated(...)` (citations/known-context)  
   [conversation +page.svelte](file:///home/ilan/BricksLLM/frontend-huggingface/src/routes/conversation/%5Bid%5D/+page.svelte#L395-L401)
3) In `finally`, drop `loading`, reset memory processing, and call `invalidateAll()` (background refresh)  
   [conversation +page.svelte](file:///home/ilan/BricksLLM/frontend-huggingface/src/routes/conversation/%5Bid%5D/+page.svelte#L528-L535)
4) The message component re-renders markdown; citations UI becomes eligible and may run enhancement

Any post-answer “page unresponsive” is almost always (a) heavy synchronous DOM work, or (b) a render loop that repeatedly triggers heavy work.

### High-confidence culprit (client-side): citation enhancement workload (even after Phase 23.7)

The citation enhancement is gated on “citations exist”:
- [ChatMessage.svelte](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/components/chat/ChatMessage.svelte#L82-L103)

The code has already been refactored to be non-blocking via debounce + abort + chunking:
- Debounce + abort wiring: [ChatMessage.svelte](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/components/chat/ChatMessage.svelte#L110-L145)
- Chunked processing via `requestIdleCallback`: [ChatMessage.svelte](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/components/chat/ChatMessage.svelte#L151-L218)
- Skip markers (`data-citations-enhanced`): [ChatMessage.svelte](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/components/chat/ChatMessage.svelte#L165-L181)

Why freezes can still happen despite chunking:
- The “collect text nodes” pass is still a synchronous `TreeWalker` over the entire message DOM:  
  [ChatMessage.svelte](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/components/chat/ChatMessage.svelte#L156-L176)
- If the message is very large (many markdown blocks), that first pass alone can take long enough to trigger “page unresponsive” on slower machines.
- `processNode` still performs DOM replacement work; chunking reduces worst-case spikes but cannot eliminate them when total work is huge.

This remains the most evidence-backed suspect because it is: (1) gated on memory citations, (2) runs right after `FinalAnswer`, and (3) touches the DOM extensively.

### Secondary bottleneck A: markdown parsing + highlight.js (main thread paths still exist)

Markdown rendering is normally offloaded to a worker, but there are two relevant facts:
1) On first instantiation, the renderer initializes with `processBlocksSync(...)`:
   - [MarkdownRenderer.svelte](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/components/chat/MarkdownRenderer.svelte#L18-L48)
2) `processBlocksSync` uses highlight.js (`highlightAuto`) which can be very CPU-expensive:
   - [marked.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/utils/marked.ts#L274-L283)

Additionally, your `frontend-UI` logs show Vite dependency optimizer issues:
- `[vite] Pre-transform error: The file does not exist at "/app/node_modules/.vite/deps/chunk-PRIFNYJH.js"...`
- followed by `optimized dependencies changed. reloading`

When these happen, worker/module loading can become brittle, which increases the chance that markdown processing falls back to non-worker execution or repeats during reload cycles.

### Secondary bottleneck B: post-answer data refresh can cause large re-render work

Even though `invalidateAll()` is launched “fire-and-forget”, it can still lead to:
- a large message list refresh,
- re-running markdown renders,
- re-triggering citation enhancement for the same message if markers were not set or if DOM changed,
- and general UI jank.

Evidence of this always happening after each send:
- [conversation +page.svelte](file:///home/ilan/BricksLLM/frontend-huggingface/src/routes/conversation/%5Bid%5D/+page.svelte#L528-L535)

### “Loading won’t end” issue (responsiveness adjacent): title generation can prolong the stream

The response stream is a merge of:
- title generation
- text generation
- keep-alives

This is done via `mergeAsyncGenerators(...)`:
- [textGeneration/index.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/index.ts#L54-L70)
- [mergeAsyncGenerators.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/utils/mergeAsyncGenerators.ts#L1-L38)

Title generation performs its own model call and is not abort-coupled to the “done” signal:
- [title.ts](file:///home/ilan/BricksLLM/frontend-huggingface/src/lib/server/textGeneration/title.ts#L1-L28)

If title generation is slow or stuck, the overall merged stream can stay open longer than the user expects (keep-alives continue). This prolongs “loading”, but it typically does not cause a main-thread browser freeze by itself.

---

## 8) Highest-confidence explanation for “unresponsive after memory answer”

Most likely: the citation enhancement pipeline (even post-Phase 23.7) still does a full synchronous DOM scan (TreeWalker collection pass) and then performs incremental DOM mutations. On sufficiently large content, that is enough to trip the “page unresponsive” watchdog.

The Vite optimize-deps chunk error (and subsequent reload) is a strong secondary contributor that can worsen responsiveness during/after generation.

---

## 9) Remediation plan for fluent memory UX (before/during/after)

This list is prioritized for the explicit goal: fluent and responsive UI before/during/after memory answers.

### P0 (directly targets “page unresponsive”)

1) Remove DOM-walking citation enhancement entirely: generate citation spans at render-time  
   Replace the TreeWalker approach with a markdown/token transform that converts `[\d+]` into a Svelte component or safe inline HTML during markdown render. This eliminates full-DOM scans.

2) If TreeWalker must remain, chunk the collection pass too  
   The current code chunks DOM mutation, but the “collect nodes” TreeWalker is synchronous. Chunking collection with `requestIdleCallback` is the next critical improvement.

### P1 (reduces jank spikes around FinalAnswer)

3) Make markdown parsing strictly-worker for large content  
   Avoid `processBlocksSync` for long assistant messages, and cap/skip `highlightAuto` for blocks over a size threshold.

4) Defer `invalidateAll()` when a heavy post-processing task is active  
   If citation enhancement/markdown render is still running, delay the background refresh to avoid overlapping expensive work.

### P2 (responsiveness-adjacent correctness)

5) Stop streaming earlier on partial `<tool` prefixes  
   Prevents leaking tool tags into the chat and reduces UI “thrash” during tool routing.

6) Ensure title generation cannot prolong “loading”  
   Couple title generation to the same abort/done signal or move it to a separate background job not tied to the streaming response.
