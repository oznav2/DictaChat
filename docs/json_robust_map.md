# Tool‑Call / XML / Prompt Handling Map

> Snapshot of current parsing, XML handling, and prompt/template injection paths (Jan 27, 2026).

## Tool‑Call Parse Points

- `frontend-huggingface/src/lib/server/textGeneration/mcp/ToolCallCodec.ts`
  - Central codec for XML/JSON tool_call parsing, Unicode normalization, bidi stripping.
  - Payload‑only bidi cleanup preserves bilingual/RTL text in user‑visible output.
  - Ajv schema validation for tool arguments (derived from MCP tool definitions).
  - Best‑effort repair for malformed JSON payloads (bareword quoting, brace/bucket balancing).
- `frontend-huggingface/src/lib/server/textGeneration/mcp/workerPool.ts`
  - Worker pool for tool_call parsing with queue + hard timeouts.
- `frontend-huggingface/src/lib/server/textGeneration/mcp/toolParseWorker.ts`
  - Worker entrypoint that runs ToolCallCodec in isolation.
- `frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts`
  - Native tool calls: `delta.tool_calls` handling inside streaming loop.
  - XML/JSON fallback: `decodeToolCallFromStream(...)` from `ToolCallCodec` (XML preferred).
  - Streaming gate: buffers tokens and only pauses after **validated** tool_call confirmation.
  - Strips tool_calls JSON from assistant content before follow‑up tool messages.
- `frontend-huggingface/src/lib/server/textGeneration/mcp/toolCallsPayload.ts`
  - `findToolCallsPayloadStartIndex` (JSON tool_calls detection after `</think>`).
  - `findXmlToolCallStartIndex` / `findPartialXmlToolCallIndex` (XML tag detection).
  - `stripLeadingToolCallsPayload` (removes tool_calls JSON from content).
- `frontend-huggingface/src/lib/server/textGeneration/utils/jsonExtractor.ts`
  - `extractJsonObjectSlice` for brace‑balanced JSON extraction.
- `frontend-huggingface/src/lib/server/textGeneration/utils/jsonRepair.ts`
  - `extractAndRepairJson` legacy JSON repair (not currently wired in runMcpFlow).

## XML / Tag Handling

- `frontend-huggingface/src/lib/server/textGeneration/utils/xmlUtils.ts`
  - `repairXmlTags` closes unclosed `<think>`, `<tool_call>`, `<tools>`.
  - `repairXmlStream` closes unclosed `<think>` and unwraps JSON from fenced code blocks.
  - `isTagOpen`, `extractTagContent` utilities.
- `frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts`
  - Detects `<think>` and partial XML tool_call tags during streaming.
  - Strips `<reasoning>` tags from final output.
  - Repairs XML tags on final answer if unclosed.

## Prompt Injection / Template Rules

- `frontend-huggingface/src/lib/server/textGeneration/utils/toolPrompt.ts`
  - Uses a **toolCallFormat** switch (`json` or `xml`).
  - Logs prompt mode: `[mcp] tool prompt built (native-first, envelope fallback)`.
- `chat_template.jinja2.template`
  - **Instructs XML tool_call envelope** for tool invocation output.
  - Serializes tool calls inside `<tool_call>` tags for assistant messages.
  - Explicitly forbids `{ "tool_calls": ... }` wrapper when using XML.
- **Grammar enforcement (Option C)**
  - **Decision:** Skip GBNF/JSON schema enforcement in llama; rely on XML envelope + ToolCallCodec.
  - **Runtime expectation:** No `--grammar` / `--json-schema` flags in llama startup logs.

## Tool Output Parsing / Storage

- `frontend-huggingface/src/lib/server/textGeneration/mcp/toolInvocation.ts`
  - Emits tool outputs into UI message stream.
  - Validates tool output via `ToolResultSchemaRegistry` before structured usage.
  - Docling outputs bridged into memory system.
  - Non‑docling tool outputs ingested into memory (summarized) via `ToolResultIngestionService`.
  - Tool results are treated as text/structured output from MCP response.
- `frontend-huggingface/src/lib/server/textGeneration/mcp/ToolResultSchemaRegistry.ts`
  - Provides tool result schema registry and validation/repair flow (raw-text-only fallback).

## Downstream Dependencies (Risk Surface)

- **Docling**: `dicta-docling` outputs → memory ingestion + document chunking.
- **DataGov**: `datagov/schemas/*.json` used for tool queries and schema definitions.
- **Perplexity / Tavily**: research/search outputs ingested as memory.
- **DB**: MongoDB and Qdrant store tool outputs and derived memory.

## Log Signals (Current)

- `[codec] parse attempt` → ToolCallCodec parse flow started.
- `[codec] bidi controls removed` → Payload‑only bidi cleanup applied.
- `[codec] repair attempted` / `[codec] repair rejected` → JSON repair path used or skipped.
- `[codec] schema validation failed` → Ajv rejected tool arguments.
- `[mcp] tool prompt built (native-first, envelope fallback)` → prompt mode initialized.
- `[mcp] template tool_call mode: XML envelope` → XML envelope mode in use.
- `[mcp] tool_call parsing path: ToolCallCodec` → runtime parser announcement.
- `[mcp] tool_call path: native|xml|json` → selected parsing path.
- `[mcp] tool_call buffer size` → buffered content length before parse attempt.
- `[mcp] tool_call confirmed` → validated tool call detected during streaming.
- `[mcp] tool_call parsed via codec` → ToolCallCodec produced tool calls.
- `[mcp] tool_call codec parse failed` → ToolCallCodec found no valid tool calls.
- `[mcp] tool_call parse timeout` → codec parse exceeded timeout budget.
- `[mcp] tool_call parse failed` → codec parse failed during streaming (buffer flushed).
- `[mcp] tool_call conflict detected` → XML and JSON markers observed together.
- `[mcp] streaming paused: validated tool_call` → streaming halted after confirmation.
- `[mcp] streaming resumed` → parsing failed; buffer flushed and streaming resumed.
- `[worker] job started` → worker accepted a parse job.
- `[worker] job completed` → worker finished a parse job.
- `[worker] timeout` → worker job timed out.
- `[worker-pool] queue length` → worker pool queue depth.
- `[worker-pool] timeout` → worker pool timeout triggered.
- `[worker-pool] fallback to inline parse` → worker unavailable; inline decode used.
- `[codec-metrics]` → worker parse success/fail/timeout counts.
- `[tool-schema] registry built` → tool result schema registry created.
- `[tool-schema] raw-text-only` → tool output bypassed schema parsing.
- `[tool-schema] validation failed` → tool output failed schema validation.
- `[tool-schema] repair attempted` → tool output JSON repair attempted.
- `[tool-schema] repair failed` → tool output JSON repair failed.
- `[tool-schema] datagov validated` → DataGov tool output schema validated.
- `[tool-schema] datagov raw-text-only` → DataGov output fell back to raw text.
- `[tool-schema] tavily validated` → Tavily output schema validated.
- `[tool-schema] tavily raw-text-only` → Tavily output fell back to raw text.
- `[tool-schema] perplexity validated` → Perplexity output schema validated.
- `[tool-schema] perplexity raw-text-only` → Perplexity output fell back to raw text.
- `[qdrant] search ok` → Qdrant search completed with results.
- `[mcp] repaired unclosed XML tags in final answer` → XML repair applied on completion.
- `[mcp→memory] Bridging docling output to memory system` → docling output ingest.
- `[ingest] Tool result stored` → tool output stored in memory.
- `[tool-ingest] Skipped - low quality output` → tool output rejected.
