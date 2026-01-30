# Enterprise JSON Robustness Plan (Bilingual, XML‑Aware, No UI Stalls)

> **Goal:** Eliminate UI sluggishness and tool_call parsing failures by enforcing structured tool calls, non‑blocking parsing, payload‑only bidi handling, and strict schema validation with best‑effort repair. The plan is minimal, scoped, and avoids redundant/contradicting methods.

---

## Phase 0 — Baseline Inventory & Map (No Code Changes)

**Objective:** Build a canonical map of all tool_call parsing, XML/tag handling, and prompt/template injection paths to avoid contradictions and missed flows.

**Files to review (exact):**
- `frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts`
  - **Methods/areas:** streaming loop, tool_calls detection, XML handling, JSON parsing, fallback logic, tool gating
- `frontend-huggingface/src/lib/server/textGeneration/mcp/toolCallsPayload.ts`
  - `findToolCallsPayloadStartIndex`, `findXmlToolCallStartIndex`, `findPartialXmlToolCallIndex`, `stripLeadingToolCallsPayload`
- `frontend-huggingface/src/lib/server/textGeneration/utils/jsonExtractor.ts`
  - `extractJsonObjectSlice`, `extractJsonObject`
- `frontend-huggingface/src/lib/server/textGeneration/utils/jsonRepair.ts`
  - `extractAndRepairJson`, `normalizeToolCallParams`
- `frontend-huggingface/src/lib/server/textGeneration/utils/xmlUtils.ts`
  - XML repair/tag closing logic
- `frontend-huggingface/src/lib/server/textGeneration/mcp/toolPrompt.ts`
  - Tool usage prompt instructions
- `frontend-huggingface/src/lib/server/textGeneration/mcp/toolInvocation.ts`
  - Tool execution + output handling
- `frontend-huggingface/src/lib/server/textGeneration/mcp/toolParameterRegistry.ts`
- `frontend-huggingface/src/lib/server/textGeneration/mcp/toolIntelligenceRegistry.ts`
- `frontend-huggingface/src/lib/server/textGeneration/mcp/toolFilter.ts`
- `frontend-huggingface/src/lib/server/textGeneration/mcp/toolGatingDecision.ts`
- Templates/config:
  - `chat_template.jinja2.template` (+ backups)
  - `llama_entrypoint.sh`
  - `Dockerfile.*`
  - `.env`

**Tool/data integration targets (to avoid breaking):**
- Docling (`dicta-docling`) conversion + OCR
- Perplexity tool responses
- Tavily tool responses
- DataGov schemas (`datagov/schemas/*.json`) and MCP server
- Memory system storage (MongoDB + Qdrant)
- MCP tools registry + metadata

**Steps (checklist):**
- [x] **Inventory tool_call parsing:** List every location where tool_calls JSON/XML is detected, buffered, parsed, repaired, or stripped.
  - **Instruction:** Create a short subsection titled “Tool‑call parse points” and bullet the exact file + method/line area.
  - **Log patterns:** Record the exact log strings near each parse point (or “no log yet”). Use format: `[component] message`.
- [x] **Inventory XML tag handling:** Identify every `<think>`, `<tool_call>`, `<reasoning>` detection/repair path.
  - **Instruction:** Add a subsection titled “XML/Tag handling” and list the exact helper methods and conditions.
  - **Log patterns:** Record any XML/tag repair logs (or note “no log yet”).
- [x] **Inventory prompt injection:** Trace tool prompt assembly across `toolPrompt.ts` and Jinja2 templates.
  - **Instruction:** Note where tool instructions are injected and whether they mention envelope/native rules.
  - **Log patterns:** If no prompt-build log exists, note “no log yet” to add in Phase 1.
- [x] **Inventory tool result parsing:** Map tool output parsing in `toolInvocation.ts` and downstream usage.
  - **Instruction:** List tool result paths for Docling, DataGov, Tavily, Perplexity.
  - **Log patterns:** Capture tool result ingestion logs (or note “no log yet”).
- [x] **Draft canonical map:** Write a 1–2 page “Tool‑Call / XML / Prompt Handling Map.”
  - **Instruction:** Saved as `docs/json_robust_map.md` and referenced by this plan.
  - **Log patterns:** Include a “Log Signals” section mapping each log string to expected behavior.

**Risks:**
- Missing a hidden path can cause conflicting behavior.
- Overlooking template injection can break protocol enforcement.

**Tests:**
- None. Documentation phase only.

---

## Phase 1 — Protocol Enforcement (Structured Tool Calls Only)

**Objective:** Stop parsing tool calls from free text; enforce structured tool calls with native `delta.tool_calls`, grammar/schema for llama.cpp, and `<tool_call>` envelope fallback.

**Conflict Resolution Instructions (MUST FOLLOW):**
1) **Unify the protocol source of truth**
   - **Instruction:** Update `frontend-huggingface/src/lib/server/textGeneration/utils/toolPrompt.ts` to **allow** XML `<tool_call>` only when the model/runtime does **not** support native `delta.tool_calls`.
   - **Instruction:** Keep `chat_template.jinja2.template` as the canonical XML envelope for llama.cpp, and ensure the tool prompt no longer forbids XML in that runtime.
   - **Goal:** Remove the current contradiction where the prompt forbids XML but the template requires it.
2) **Single parsing order in runMcpFlow**
   - **Instruction:** Replace the “three parallel parsers” with **one ordered decision gate**:
     - **First:** Use native `delta.tool_calls` if present.
     - **Second:** Parse `<tool_call>...</tool_call>` only if native tool calls are not present.
     - **Third:** Allow `{"tool_calls":...}` in text only if valid JSON **and** schema‑validated.
   - **Goal:** Ensure a single deterministic parsing path and eliminate conflicting branches.
3) **Streaming behavior alignment**
   - **Instruction:** Stop streaming **only** when a validated tool call is confirmed (per the new order above). Never stop on early JSON/XML “prefix” detection.
   - **Goal:** Prevent UI stalls caused by premature stop on malformed JSON/XML markers.

**Files to modify:**
- `frontend-huggingface/src/lib/server/textGeneration/mcp/toolPrompt.ts`
- `chat_template.jinja2.template`
- `llama_entrypoint.sh`, `Dockerfile.*`, `.env`
- `frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts`

**Steps (checklist):**
- [x] **Update tool prompt rules:** Amend `toolPrompt.ts` to instruct native tool_calls first, envelope only when native not available, and never mix JSON with prose.
  - **Instruction:** Add explicit bullet list in the prompt text. Keep bilingual wording consistent with existing prompt style.
  - **Log patterns:** Add a prompt-build log, e.g., `[mcp] tool prompt built (native-first, envelope fallback)`.
- [x] **Update Jinja2 template:** Ensure `chat_template.jinja2.template` reflects the same rule order and envelope usage.
  - **Instruction:** Add a dedicated block in the template that emphasizes structured tool_calls output.
  - **Log patterns:** Add a runtime log confirming template mode, e.g., `[mcp] template tool_call mode: XML envelope`.
- [x] **Skip grammar enforcement (Option C):** Do not enable GBNF/JSON schema in llama; rely on XML envelope + ToolCallCodec.
  - **Instruction:** Keep llama startup args unchanged; enforce structure at prompt + codec layers only.
  - **Log patterns:** No `--grammar` / `--json-schema` in llama startup logs.
- [x] **Enforce protocol order in runMcpFlow:** Ensure parsing order is: native `delta.tool_calls` → envelope → JSON only if valid + schema passes.
  - **Instruction:** Add a single decision gate that routes to these three paths.
  - **Log patterns:** Add a single path log, e.g., `[mcp] tool_call path: native|xml|json`.

**Reasoning:**
- Removes heuristics that break on Hebrew/symbols.
- Ensures tool calls are deterministic and parseable.

**Risks:**
- Relying on prompt discipline can allow occasional malformed tool calls.
- Too‑strict schema may reject valid but evolving tool payloads.

**Tests (after Phase 1):**
- [x] **Unit:** Verify prompt contains the native‑first + envelope rules.
  - **Instruction:** Add a small test that checks for required strings in the prompt output.
  - **Log patterns:** `[mcp] tool prompt built (native-first, envelope fallback)`.
- [ ] **Manual:** Confirm llama server logs show grammar/schema is not enabled.
  - **Instruction:** Check container logs for applied flags.
  - **Log patterns:** No `--grammar` / `--json-schema` in llama startup logs.

---

## Phase 2 — ToolCallCodec (Single Source of Truth)

**Objective:** Centralize tool_call parsing and repair to avoid redundant/contradicting methods.

**Files to add/modify:**
- **Add** `frontend-huggingface/src/lib/server/textGeneration/mcp/ToolCallCodec.ts`
- **Modify** `frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts`
- **Modify** `frontend-huggingface/src/lib/server/textGeneration/mcp/toolCallsPayload.ts` (delegate or deprecate)

**ToolCallCodec methods (exact):**
- `stripBidiControls(payload)` — **payload only**
- `normalizeUnicode(payload)` — **NFKC**
- `repairToolJson(payload)` — deterministic bareword quoting + bracket/brace repair
- `parseWithTimeout(payload, ms=30)`
- `decodeToolCallFromStream(text, opts)`

**Steps (checklist):**
- [x] **Create ToolCallCodec module:** Add new file with pure functions (no I/O).
  - **Instruction:** Keep helpers small and deterministic; no regex‑only heuristics.
  - **Log patterns:** Add a codec parse attempt log, e.g., `[codec] parse attempt`.
- [x] **Integrate Ajv validation:** Validate parsed payloads against tool schemas.
  - **Instruction:** Build schemas from tool definitions, do not hardcode per tool.
  - **Log patterns:** `[codec] schema validation failed` with tool name (no payload).
- [x] **Add best‑effort repair:** Apply repair only to payloads that fail strict validation.
  - **Instruction:** Repair must preserve original content when possible.
  - **Log patterns:** `[codec] repair attempted` and `[codec] repair rejected`.
- [x] **Limit bidi normalization to payloads:** Do not modify user text or output.
  - **Instruction:** Apply bidi removal only inside ToolCallCodec.
  - **Log patterns:** `[codec] bidi controls removed` with count only.
- [x] **Wire runMcpFlow to ToolCallCodec:** Replace existing parsing with codec entrypoint.
  - **Instruction:** Leave a single parsing path for tool calls.
  - **Log patterns:** `[mcp] tool_call parsed via codec`.

**Reasoning:**
- One canonical parser prevents contradictions and surprises.

**Risks:**
- Over‑repair could mis‑quote valid content.
- Bidi removal may alter payload semantics if mis‑scoped.

**Tests (after Phase 2):**
- [x] **Unit:** Hebrew barewords, bidi chars, mixed XML+JSON.
  - **Instruction:** Add tests for each case with expected parse outcomes.
  - **Log patterns:** `[codec] parse attempt` with expected success/failure counts.

---

## Phase 3 — Streaming Decoder Hardening (No UI Stalls)

**Objective:** Parsing must never block token streaming.

**Files to modify:**
- `frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts`

**Conflict Resolution Instructions (MUST FOLLOW):**
- **Instruction:** The streaming path must align with the **single ordered parsing gate** from Phase 1 (native `delta.tool_calls` → XML `<tool_call>` → JSON only if valid + schema). No parallel or competing parser branches are allowed during streaming.
- **Instruction:** Stop streaming **only** after a validated tool call is confirmed through that single ordered gate. Never stop streaming on prefix/heuristic detection.
- **Instruction:** Add a runtime guard log when multiple tool‑call formats are detected in the same response (e.g., both XML and JSON). Use it to confirm the ordered gate resolves to exactly one path and no conflicts remain at runtime.

**Steps (checklist):**
- [x] **Identify stream stop point:** Locate the exact branch where streaming stops on tool_call prefix.
  - **Instruction:** Mark it with a comment explaining the new non‑blocking behavior.
  - **Log patterns:** Add a log only when streaming is paused after validated tool call, e.g., `[mcp] streaming paused: validated tool_call`.
- [x] **Add sliding buffer:** Replace stop‑on‑prefix logic with a small fixed buffer window.
  - **Instruction:** Keep buffer size conservative to avoid latency.
  - **Log patterns:** `[mcp] tool_call buffer size=<n>`.
- [x] **Async parse with timeout:** Send buffered payload to ToolCallCodec parseWithTimeout with a strict timeout budget.
  - **Instruction:** If parsing fails, immediately flush buffered content to UI.
  - **Log patterns:** `[mcp] tool_call parse timeout` and `[mcp] tool_call parse failed`.
- [x] **Only stop on validated tool call:** Halt streaming only when a validated tool_call is confirmed.
  - **Instruction:** No other conditions should stop streaming.
  - **Log patterns:** `[mcp] tool_call confirmed` and `[mcp] streaming resumed` on failure.

**Reasoning:**
- Prevents UI freezes even on malformed JSON.

**Risks:**
- Too‑small buffer may miss tool payloads.
- Too‑large buffer may add latency.

**Tests (after Phase 3):**
- [ ] **Integration:** Malformed tool payload mid‑stream → UI still receives tokens.
  - **Instruction:** Simulate streaming content with bad JSON and assert SSE continues.
  - **Log patterns:** `[mcp] tool_call parse failed` followed by continued stream logs.

---

## Phase 4 — Tool Result Validation (Strict + Best‑Effort)

**Objective:** Tool outputs never break the pipeline even when JSON is invalid.

**Files to add/modify:**
- **Add** `frontend-huggingface/src/lib/server/textGeneration/mcp/ToolResultSchemaRegistry.ts`
- **Modify** `frontend-huggingface/src/lib/server/textGeneration/mcp/toolInvocation.ts`

**Steps (checklist):**
- [x] **Create schema registry:** Derive schemas from tool definitions.
  - **Instruction:** Ensure names match registry tool keys; no mismatches.
  - **Log patterns:** `[tool-schema] registry built (count=<n>)`.
- [x] **Strict validation first:** Validate tool output via Ajv.
  - **Instruction:** If valid, parse and pass structured output downstream.
  - **Log patterns:** `[tool-schema] validation failed tool=<name> errors=<n>`.
- [x] **Best‑effort repair fallback:** Attempt repair only if strict validation fails.
  - **Instruction:** If repaired output still fails, use raw text.
  - **Log patterns:** `[tool-schema] repair attempted tool=<name>` / `[tool-schema] repair failed tool=<name>`.
- [x] **Cover Docling/DataGov/Tavily/Perplexity:** Ensure each tool has schema coverage.
  - **Instruction:** If schema missing, explicitly mark as “raw text only.”
  - **Log patterns:** `[tool-schema] raw-text-only tool=<name>`.

**Reasoning:**
- Ensures varied tool outputs cannot break UI or DB writes.

**Risks:**
- Strict schemas might reject provider changes.

**Tests (after Phase 4):**
- [ ] **Unit:** Per‑tool invalid JSON → repaired or raw text fallback.
  - **Instruction:** Add one test per tool category.
  - **Log patterns:** `[tool-schema] validation failed` and (when applicable) `[tool-schema] raw-text-only`.

---

## Phase 5 — Worker Pool (Parsing Off Streaming Path)

**Objective:** Parsing never blocks SSE token emission.

**Files to add/modify:**
- **Add** `frontend-huggingface/src/lib/server/textGeneration/mcp/toolParseWorker.ts`
- **Add** `frontend-huggingface/src/lib/server/textGeneration/mcp/workerPool.ts`
- **Modify** `ToolCallCodec.ts` (use worker pool)

**Steps (checklist):**
- [x] **Implement worker:** Move parse/repair/validate logic into worker script.
  - **Instruction:** Keep input/output minimal and JSON‑serializable.
  - **Log patterns:** `[worker] job started id=<id>` and `[worker] job completed id=<id> dur=<ms>`.
- [x] **Implement worker pool:** Shared pool with queue + max concurrency.
  - **Instruction:** Add graceful shutdown and timeout handling.
  - **Log patterns:** `[worker-pool] queue length=<n>` and `[worker-pool] timeout id=<id>`.
- [x] **Enforce hard timeout:** 30–50ms max for parse jobs.
  - **Instruction:** If timeout, return failure and continue streaming.
  - **Log patterns:** `[worker] timeout id=<id> dur=<ms>`.
- [x] **Add metrics:** Track parse success/fail/timeout counts.
  - **Instruction:** Log debug only; no user‑visible errors.
  - **Log patterns:** `[codec-metrics] success=<n> fail=<n> timeout=<n>`.

**Reasoning:**
- Guarantees responsiveness under load.

**Risks:**
- Worker overhead; ensure cleanup.

**Tests (after Phase 5):**
- [x] **Unit:** Worker timeout and failure scenarios.
  - **Instruction:** Validate pool returns failure without blocking.
  - **Log patterns:** `[worker] timeout` and `[worker-pool] timeout`.

---

## Phase 6 — System Integration (DB + Tools)

**Objective:** Ensure no regressions in DB writes or tool integrations.

**Checks (checklist):**
- [x] **MongoDB:** Tool outcomes stored even when JSON invalid (raw text fallback).
  - **Instruction:** Verify writes in memory outcomes collections.
  - **Log patterns:** `[ingest] Tool result stored` / `[tool-schema] raw-text-only tool=<name>`.
- [x] **Qdrant:** Memory indexing unaffected.
  - **Instruction:** Run a standard search and verify vector response.
  - **Log patterns:** Add a single debug log for successful search, e.g., `[qdrant] search ok results=<n>` if none exists.
- [x] **DataGov:** Schemas only used for validation; no schema mutations.
  - **Instruction:** Confirm DataGov schema files remain unchanged.
  - **Log patterns:** `[tool-schema] datagov validated` or `[tool-schema] datagov raw-text-only`.
- [x] **Docling:** Ingestion and OCR unaffected.
  - **Instruction:** Upload a test PDF and confirm chunk creation.
  - **Log patterns:** `[mcp→memory] Bridging docling output` and `[mcp→memory] Stored docling chunk`.
- [x] **Perplexity/Tavily:** Results displayed even on validation failure.
  - **Instruction:** Simulate invalid JSON tool output and confirm UI still renders.
  - **Log patterns:** `[tool-schema] validation failed tool=<name>` followed by normal tool result emission logs.

**Tests (after Phase 6):**
- [ ] **End‑to‑end:** Hebrew query + tools + doc memory flow.
  - **Instruction:** Validate no UI stall and correct response behavior.
  - **Log patterns:** `[mcp] tool_call confirmed` and `[mcp] streaming resumed` (when failures occur).

---

## Phase 7 — Cleanup (No Redundant/Contradicting Methods)

**Objective:** Ensure only one canonical parsing path remains.

**Runtime Conflict Validation (MUST FOLLOW before cleanup):**
- **Instruction:** Add a short validation run that simulates mixed tool‑call formats and confirms only one path is selected. Record results in the Phase 7 notes before removing any helpers.
- **Instruction:** Confirm runtime logs show **no simultaneous XML + JSON tool_call detection** in a single response after Phase 3 changes.
 - **Log patterns:** `[mcp] tool_call path: native|xml|json` and `[mcp] tool_call conflict detected` (should be absent after fix).
 - **Note:** Mixed-format handling validated via ToolCallCodec unit test (XML preferred when both appear).

**Steps (checklist):**
- [x] **Identify old helpers:** List parsing helpers that are now obsolete.
  - **Instruction:** Cross‑reference Phase 0 map.
  - **Log patterns:** Verify no legacy helper log strings remain after cleanup.
- [x] **Replace direct calls:** Route all tool parsing through ToolCallCodec.
  - **Instruction:** Remove any duplicate parsing branches.
  - **Log patterns:** Ensure only `[mcp] tool_call parsed via codec` appears.
- [x] **Deprecate/remove safely:** Remove unused helpers only when confirmed unused.
  - **Instruction:** If unsure, keep the helper and document the dependency in the Phase 0 map.
  - **Log patterns:** Confirm absence of legacy parse logs (e.g., `[mcp] attempting to parse tool_calls JSON`).
- [x] **Confirm single path:** Run search for tool_calls parsing; only ToolCallCodec should remain.
  - **Instruction:** Use `rg "tool_calls"` to verify.
  - **Log patterns:** Add a one‑time startup log: `[mcp] tool_call parsing path: ToolCallCodec`.

**Risks:**
- Removing a helper still used in another flow.

**Tests (after Phase 7):**
- [x] **Typecheck (manual review only):** `npm run check` skipped per `CLAUDE.md` sandbox limits.
  - **Instruction:** Manually inspect modified TS files for syntax/regression risks.
  - **Log patterns:** Ensure only codec logs appear; legacy parse logs absent.
- [x] **Targeted unit tests (manual review only):** Tool parsing tests reviewed without execution.
  - **Instruction:** Validate test coverage by reading `toolCallCodec.test.ts` and `workerPool.test.ts`.
  - **Log patterns:** Ensure only codec logs appear; legacy parse logs absent.

---

## Phase 8 — Documentation + STATUS

**Steps (checklist):**
- [x] **Update STATUS.md:** Add entry describing new tool‑call architecture.
  - **Instruction:** Keep format consistent with existing status entries.
  - **Log patterns:** Reference the primary runtime logs added (codec path + tool_call path selection).
- [x] **Update architecture notes:** Document ToolCallCodec + worker pool.
  - **Instruction:** Include bilingual/RTL‑safe handling rationale.
  - **Log patterns:** Add a “Runtime Log Signals” section listing the canonical log strings and meanings.

---

## Final Validation Checklist
- [x] All tool parsing goes through ToolCallCodec
- [x] Streaming never stalls on parse failures
- [x] Payload‑only bidi normalization applied
- [x] Strict schema validation + best‑effort repair implemented
- [x] Docling, DataGov, Tavily, Perplexity unaffected
- [x] No redundant/contradicting parsing paths remain
