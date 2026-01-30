# AGENTS.md - AI Coding Agent Guidelines for BricksLLM

## Project Overview

BricksLLM is an enterprise AI gateway + SvelteKit chat interface for DictaLM-3.0 (24B). Stack: Go gateway, SvelteKit frontend, MongoDB, Qdrant, Redis, PostgreSQL, Docker Compose.

**Current Version**: v0.2.18 (January 14, 2026)
**Branch**: `genspark_ai_developer`

**Key directories:**
- `frontend-huggingface/` - SvelteKit frontend (main development area)
- `cmd/bricksllm/` - Go gateway entry point
- `internal/` - Go backend modules
- `datagov/` - Python MCP server for Israeli government data
- `MAP_ROAMPAL/`, `SRC_ROAMPAL/` - Reference implementation (read-only)

---

## Build / Lint / Test Commands

### Frontend (SvelteKit) - `frontend-huggingface/`

```bash
npm run dev          # Dev server with hot-reload (use Docker instead)
npm run build        # Production build
npm run check        # TypeScript + Svelte type checking
npm run check:watch  # Watch mode type checking
npm run lint         # Prettier check + ESLint
npm run format       # Auto-format with Prettier
npm run test         # Run all Vitest tests
```

### Running a Single Test (Frontend)

```bash
cd frontend-huggingface

# Run specific test file
npx vitest run src/lib/server/memory/__tests__/unit/test_search_service.test.ts

# Run tests matching pattern
npx vitest run --testNamePattern "search"

# Watch mode for single file
npx vitest src/lib/server/memory/__tests__/unit/test_search_service.test.ts
```

### Go Backend (Root)

```bash
go build ./cmd/bricksllm           # Build gateway
go test ./internal/testing/...     # Integration tests
go test -v -run TestApiKey ./...   # Single test by name
```

### Docker Operations

```bash
./stop.sh && ./start.sh    # ALWAYS stop before start (prevents port conflicts)
./test-stack.sh            # Verify all containers healthy
```

---

## Code Style Guidelines

### Import Organization

Order imports in this sequence, separated by blank lines:

```typescript
// 1. Type imports
import type { RequestHandler } from "@sveltejs/kit";
import type { MemoryConfig } from "../types";

// 2. External packages
import { z } from "zod";
import { ObjectId } from "mongodb";

// 3. SvelteKit/Svelte framework
import { json, error } from "@sveltejs/kit";
import { browser } from "$app/environment";

// 4. Alias path imports ($lib/...)
import { logger } from "$lib/server/logger";
import { collections } from "$lib/server/database";

// 5. Relative imports
import { defaultConfig } from "../config";

// 6. Icon imports (Svelte components only)
import CarbonClose from "~icons/carbon/close";
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files (classes/services) | PascalCase | `UnifiedMemoryFacade.ts` |
| Files (utilities) | camelCase | `toolPrompt.ts` |
| Svelte components | PascalCase | `MemoryPanel.svelte` |
| Functions | camelCase | `fetchEmbeddings()` |
| Variables | camelCase | `selectedTier`, `isLoading` |
| Constants | SCREAMING_SNAKE | `ADMIN_USER_ID`, `MAX_RETRIES` |
| Types/Interfaces | PascalCase | `interface StoreParams` |
| Interface suffixes | *Params, *Result, *Config | `SearchParams`, `SearchResult` |
| Enums | PascalCase + PascalCase | `enum ErrorCategory { Transient }` |

### Type Annotations

```typescript
// Always explicit return types on public methods
async search(params: SearchParams): Promise<SearchResult[]> { }

// Generic types with constraints
private async request<T>(path: string): Promise<T | null> { }

// Record for typed objects
const filter: Record<string, unknown> = { };

// Union types for nullable (prefer over ?)
lastFailure: number | null = null;
```

### Error Handling

```typescript
// Try-catch with logger
try {
    const result = await operation();
    return json({ success: true, result });
} catch (err) {
    logger.error({ err, context }, "Operation failed");
    return json({ success: false, error: err.message }, { status: 500 });
}

// SvelteKit error helper for HTTP errors
if (!found) error(404, "Resource not found");

// Graceful degradation - return empty results, don't throw
if (serviceDown) return { results: [], latencyMs: 0 };
```

### Svelte 5 Patterns (Runes)

```typescript
// Props with interface
interface Props {
    items: Item[];
    loading?: boolean;
    onselect?: (item: Item) => void;
}
let { items, loading = false, onselect }: Props = $props();

// State
let selected = $state<Item | null>(null);
let count = $state(0);

// Derived values
let filtered = $derived(items.filter(i => i.active));
let computed = $derived.by(() => expensiveCalculation(items));

// Effects (for side effects)
$effect(() => {
    if (selected) fetchDetails(selected.id);
});

// Two-way binding
let files = $bindable<File[]>([]);

// Event callbacks (not on:event)
<button onclick={() => onselect?.(item)}>Select</button>
```

### Comments & Documentation

```typescript
/**
 * ServiceName - Brief description
 * 
 * Key features:
 * - Feature 1
 * - Feature 2
 */
export class ServiceName { }

// Section separators for long files
// ============================================
// Circuit Breaker
// ============================================

// Route documentation
// POST /api/memory/search - Search memories with pagination
export const POST: RequestHandler = async ({ request }) => { };
```

---

## ESLint Rules (Enforced)

**Strict in client code:**
- `@typescript-eslint/no-explicit-any`: error
- `@typescript-eslint/no-non-null-assertion`: error  
- `@typescript-eslint/no-unused-vars`: error (except `^_` prefix)

**Relaxed in `src/lib/server/**`:** `any` and non-null assertions allowed.

---

## Formatting (Prettier)

```json
{
  "useTabs": true,
  "trailingComma": "es5",
  "printWidth": 100
}
```

Run `npm run format` before committing.

---

## Critical Rules

1. **Stop before start**: Always `./stop.sh && ./start.sh` to prevent port conflicts
2. **Don't run npm dev locally**: Use Docker container on port 8003/8004
3. **Hot-reload works**: Frontend changes auto-refresh, no rebuild needed
4. **Check STATUS.md first**: Read current project state before making changes
5. **Update STATUS.md**: Record significant changes after implementation
6. **RoamPal Parity**: When implementing memory features, read `MAP_ROAMPAL/` first
7. **Hebrew support**: All user-facing strings must support RTL/Hebrew
8. **Single admin user**: No multi-tenancy - assume admin privileges
9. **Embedding dimensions**: BGE-M3 produces 1024-dim vectors (`QDRANT_VECTOR_SIZE=1024`)

---

## Multi-Instance Readiness (K.8)

**Current posture (single-instance):**
- One active frontend + gateway + memory stack; assumes a single admin user.
- Some state is process-local (in-memory metrics windows, circuit-breaker counters, background queues).

**Future posture (multi-instance):**
- If running multiple frontend/gateway replicas, add Redis-backed distributed locks (or leader election) for all critical write-side flows that currently rely on local serialization.

**Components that will require distributed locks first:**
- Knowledge Graph writes (KG write buffer / flush serialization).
- Deduplication gates (document-hash dedup and any future hash-based tool-result dedup).
- Circuit breaker + retry orchestration (embedding service and reranker health state).

---

## Key Files

| File | Purpose |
|------|---------|
| `frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts` | Core orchestrator ("brain") |
| `frontend-huggingface/src/lib/server/memory/` | Memory system services |
| `frontend-huggingface/src/lib/server/memory/embedding/DictaEmbeddingClient.ts` | Embedding client with circuit breaker |
| `frontend-huggingface/src/lib/server/documents/UnifiedDocumentIngestionService.ts` | Document upload pipeline |
| `.env` | Single source of truth for all config |
| `STATUS.md` | Project history and current state |
| `CLAUDE.md` | Full architecture documentation |

---

## Docker Architecture & Ports

| Container | Purpose | Host Port | Log Command |
|-----------|---------|-----------|-------------|
| `frontend-UI` | SvelteKit Chat UI | 8004 | `docker logs -f frontend-UI` |
| `bricksllm-gateway` | API Gateway & Admin | 8002, 8001 | `docker logs -f bricksllm-gateway` |
| `bricksllm-llama` | Inference (llama-server) | 5002 | `docker logs -f bricksllm-llama` |
| `bricksllm-mongo` | MongoDB for Memory | 27018 | `docker logs -f bricksllm-mongo` |
| `bricksllm-qdrant` | Vector DB | 6333 | `docker logs -f bricksllm-qdrant` |
| `dicta-retrieval` | Embeddings (5005) & Reranking (5006) | 5005, 5006 | `docker logs -f dicta-retrieval` |
| `dicta-docling` | Document OCR/Parsing | 5001 | `docker logs -f dicta-docling` |
| `mcp-sse-proxy` | MCP Tool Bridge | 3100 | `docker logs -f mcp-sse-proxy` |
| `bricksllm-redis` | Rate Limiting & Cache | 6380 | `docker logs -f bricksllm-redis` |
| `bricksllm-postgresql` | Proxy Config Storage | 5433 | `docker logs -f bricksllm-postgresql` |

**Data flow**: User -> Frontend (8004) -> Gateway (8002) -> Llama (5002)

### Troubleshooting Commands

```bash
# Check all container status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Follow logs for a specific container
docker logs -f <container-name>

# Check last 50 lines of logs
docker logs --tail=50 <container-name>

# Check container health
docker inspect --format='{{.State.Health.Status}}' <container-name>

# Restart a specific container
docker restart <container-name>

# Check GPU usage (for llama-server)
nvidia-smi
```

### Common Log Patterns to Watch

| Container | What to Look For |
|-----------|------------------|
| `bricksllm-llama` | "model loaded", "slot", OOM errors |
| `dicta-retrieval` | "InvalidIntervalError", embedding dimension errors |
| `frontend-UI` | TypeScript errors, API route errors |
| `bricksllm-qdrant` | Collection creation, dimension mismatch |
| `bricksllm-mongo` | Connection errors, index creation |

---

## MCP Orchestration (`runMcpFlow.ts`)

The ~1200-line `runMcpFlow.ts` is the "brain" managing "Reasoning First" flow:

1. **Init**: Load `MCP_SERVERS` from `.env`, init `ServiceContainer`
2. **Prompt**: `toolPrompt.ts` injects `<think>` instructions
3. **Inference**: Stream tokens from `endpointOai.ts` (max 16k)
4. **Decision Loop**:
   - Smart Skip: `</think>` with no tools -> stream answer
   - Tool Execution: JSON tool calls -> filter -> loop check -> execute -> recurse
5. **Safety**: `xmlUtils.ts` repairs unclosed tags

**Key MCP components:**
- `toolFilter.ts` - Hebrew intent detection, best-in-class selection
- `toolIntelligenceRegistry.ts` - Tool metadata, fallbacks
- `toolInvocation.ts` - Execution with cascade fallback
- `loopDetector.ts` - Prevents infinite tool loops (3x limit)
- `circuitBreaker.ts` - Fails fast if MCP servers down

---

## Smart Orchestration Methods (CRITICAL)

> **WARNING:** The codebase contains 30+ smart methods for intelligent tool orchestration. When implementing memory or tool features, you MUST integrate with these existing capabilities - do NOT create parallel implementations.

### Orchestration Methods Inventory

| Layer | File | Method/Feature | Purpose |
|-------|------|----------------|---------|
| **Selection** | `toolFilter.ts` | `detectHebrewIntent()` | Hebrew intent detection (3,972 terms) |
| **Selection** | `toolFilter.ts` | `TOOL_PRIORITIES` | Best-in-class tool selection scoring |
| **Selection** | `toolFilter.ts` | `TOOL_CATEGORIES` | Category-based tool filtering |
| **Preparation** | `toolParameterRegistry.ts` | Parameter Normalization | Auto-fix model mistakes |
| **Execution** | `toolInvocation.ts` | `getFallbackChain()` | Cascade fallback on failure |
| **Execution** | `toolIntelligenceRegistry.ts` | Smart Timeouts | 5min research, 1min quick |
| **Response** | `toolInvocation.ts` | `toGracefulError()` | Hebrew-friendly error messages |
| **Response** | `toolIntelligenceRegistry.ts` | Capability Awareness | Model can describe tool capabilities |
| **Integration** | `memoryIntegration.ts` | `shouldAllowTool()` | Memory confidence gates tool calls |
| **Learning** | `memoryIntegration.ts` | `recordResponseOutcome()` | Tool outcomes feed Wilson scores |

### Existing But UNUSED Functions (Must Wire)

These functions are **implemented but never called** - they must be wired in:

| Function | File | Status | Must Wire In |
|----------|------|--------|--------------|
| `shouldAllowTool()` | memoryIntegration.ts:194 | **IMPORTED but NOT CALLED** | runMcpFlow.ts |
| `getContextualGuidance()` | memoryIntegration.ts:350 | **DEFINED but NOT CALLED** | runMcpFlow.ts prompt |
| `getColdStartContextForConversation()` | memoryIntegration.ts:320 | **DEFINED but NOT CALLED** | First message |
| `getAttributionInstruction()` | memoryIntegration.ts:450 | **IMPORTED but NOT INJECTED** | System prompt |
| `processResponseWithAttribution()` | memoryIntegration.ts:480 | **IMPORTED but NOT CALLED** | Response parsing |
| `getToolGuidance()` | memoryIntegration.ts:400 | **DEFINED but NOT CALLED** | Tool effectiveness stats |
| `extractExplicitToolRequest()` | memoryIntegration.ts:280 | **DEFINED but NOT CALLED** | Detects "search for", "חפש" |

### Integration Requirements

When implementing memory or tool features:
1. **USE** `detectHebrewIntent()` for Hebrew query routing
2. **USE** `getToolIntelligence()` for tool metadata
3. **USE** `toGracefulError()` for Hebrew error messages
4. **CALL** `shouldAllowTool()` before tool execution (not just import)
5. **INJECT** `getContextualGuidance()` output into prompts
6. **WIRE** outcome recording to feed Wilson scores

---

## Memory System Architecture

**Dual-collection pattern** - Memory bank uses TWO collections:
1. `memoryBank` - Items from Memory Bank UI modal
2. `memory_items` (tier="memory_bank") - Items via UnifiedMemoryFacade

**Key endpoints:**
- `POST /api/memory/ops/reindex/deferred` - Reindex items that failed embedding
- `POST /api/memory/ops/circuit-breaker` - Reset embedding circuit breaker
- `POST /api/memory/books/recognize` - Check document hash for deduplication

**Document deduplication**: SHA-256 hash enables cross-chat document recognition.

---

## Testing Patterns

```typescript
// Test file naming: *.test.ts
// Location: src/lib/server/memory/__tests__/unit/

import { describe, it, expect, vi } from "vitest";

describe("ServiceName", () => {
    it("should handle expected case", async () => {
        const result = await service.method(input);
        expect(result.success).toBe(true);
    });

    it("should handle error case", async () => {
        await expect(service.method(bad)).rejects.toThrow();
    });
});
```

---

## Common Pitfalls

- **502 Bad Gateway**: Llama server loading (~45s). Check `docker logs -f llama-server`
- **Memory returns 0 results**: Check if embeddings indexed in Qdrant, not just MongoDB. Use `POST /api/memory/ops/reindex/deferred`
- **Embedding dimension mismatch**: Ensure `QDRANT_VECTOR_SIZE=1024` in `.env`
- **PostgreSQL errors after password change**: Delete volume: `docker volume rm bricksllm_postgresql_data`
- **Hebrew streaming crash**: Fixed in v0.2.18 - regex now includes `\u0590-\u05FF`
- **UI freeze on embedding failure**: Circuit breaker with graceful degradation handles this
- **Type errors in server code**: ESLint rules are relaxed there - check manually

---

## Hardware & Resource Constraints

**Hardware**: RTX 3090 24GB VRAM + 64GB RAM + WSL2

**VRAM Budget @ 32K context:**
- Model (Q4_K_M): ~14.3GB
- KV Cache (q8_0): ~6GB
- Overhead: ~1GB
- **Total**: ~21GB / 24GB (3GB headroom)

**Performance**: 35-45 tokens/sec @ 32K context

**Critical `.env` Variables:**
| Variable | Value | Purpose |
|----------|-------|---------|
| `CONTEXT_SIZE` | 32768 | 32K context for MCP tools |
| `N_GPU_LAYERS` | 99 | Full GPU offload |
| `FLASH_ATTN` | on | 30-40% speedup |
| `KV_CACHE_TYPE` | q8_0 | Saves ~4GB VRAM |
| `NUM_PREDICT` | 4096 | Max tokens per response |
| `QDRANT_VECTOR_SIZE` | 1024 | BGE-M3 embedding dims |

---

## MCP Tools Available

**Configured in `FRONTEND_MCP_SERVERS`:**
- Everything, Context7, Docker, Sequential Thinking
- Git, Fetch, Time, Memory, Filesystem
- Perplexity, Tavily Search, YouTube Summarizer, DataGov

**Tool Filtering**: `MCP_MAX_TOOLS=4` limits tools per turn for quantized models.

---

## DataGov Enterprise Intelligence (Israeli Government Data)

The DataGov system provides comprehensive access to Israeli government data with 30+ smart methods for intelligent querying.

### DataGov Knowledge Assets

| File | Content | Records |
|------|---------|---------|
| `/datagov/schemas/_index.json` | All resources with category, format, record counts | 1,960 resources |
| `/datagov/schemas/_category_index.json` | Categories → dataset_ids mapping | 21 categories |
| `/datagov/schemas/_field_index.json` | Field availability (has_phone, has_address) | All resources |
| `/datagov/enterprise_expansions.py` | Bidirectional Hebrew↔English terms | 22 domains, ~9,500 terms |
| `/datagov/schemas/{category}/*.json` | Individual schema files | 1,190 files |

### DataGov Categories (21 Total)

| Category | Hebrew Name | Datasets |
|----------|-------------|----------|
| transportation | תחבורה | ~179 |
| health | בריאות | ~54 |
| finance | כספים | ~60 |
| justice | משפט | ~73 |
| education | חינוך | ~24 |
| environment | סביבה | ~85 |
| geography | גיאוגרפיה | ~116 |
| water | מים | ~48 |
| welfare | רווחה | ~41 |
| culture | תרבות | ~32 |
| technology | מדע וטכנולוגיה | ~28 |
| *...and 10 more* | | |

### Semantic Expansion Domains (22)

Each domain provides bidirectional Hebrew↔English term mapping:

```python
# Example from enterprise_expansions.py
TRANSPORTATION_EXPANSIONS = {
    "vehicle": ["רכב", "כלי רכב", "רכבים", "מכונית"],
    "רכב": ["vehicle", "car", "automobile"],
    "bus": ["אוטובוס", "תחבורה ציבורית", "קו"],
    # ~200+ terms per domain
}
```

**Domains:** TRANSPORTATION, HEALTH, EDUCATION, FINANCE, JUSTICE, ENVIRONMENT, GEOGRAPHY, WATER, WELFARE, CULTURE, TECHNOLOGY, AGRICULTURE, IMMIGRATION, HOUSING, COMMUNICATIONS, TOURISM, RELIGION, MUNICIPAL, ECONOMY, DEMOGRAPHICS, BANKING, STATISTICS

### DataGov Pre-Ingestion (Phase 25)

**Goal:** All DataGov knowledge pre-loaded at application startup so the assistant "knows" what government data exists before being asked.

**New Memory Tiers:**
- `datagov_schema` - Dataset metadata (1,190 schemas)
- `datagov_expansion` - Semantic term mappings (22 domains)

**Environment Variables:**
```bash
DATAGOV_PRELOAD_ENABLED=true          # Enable pre-loading at startup
DATAGOV_SCHEMAS_PATH=/datagov/schemas  # Path to schema files
DATAGOV_KG_SAMPLE_SIZE=5              # Datasets per category in KG
DATAGOV_BATCH_SIZE=50                 # Batch size for ingestion
```

### DataGov Intent Detection

Queries matching these patterns should check memory FIRST before tool calls:

```typescript
// Hebrew patterns that indicate DataGov queries
const DATAGOV_INTENT_PATTERNS = [
    /מאגרי?\s*מידע\s*(ממשלתי|ציבורי)/i,    // government data
    /נתונים\s+(ממשלתי|ציבורי)/i,           // public data
    /אילו\s+מאגרים/i,                       // which datasets
    /(מידע|נתונים)\s+על\s+(תחבורה|בריאות|חינוך)/i,  // data about X
];
```

### DataGov Key Files

| File | Purpose |
|------|---------|
| `datagov/server.py` | MCP server entry point |
| `datagov/enterprise_expansions.py` | 22 semantic domains with ~9,500 terms |
| `datagov/schemas/_index.json` | Master resource index |
| `datagov/schemas/_category_index.json` | Category→datasets mapping |
| `datagov/schemas/_field_index.json` | Field availability index |

---

## Memory System Deep Dive

### Five Memory Tiers

| Tier | Purpose | TTL | Promotion |
|------|---------|-----|-----------|
| `working` | Current session context | 24h | → history (score≥0.7, uses≥2) |
| `history` | Validated past conversations | 30d | → patterns (score≥0.9, uses≥3) |
| `patterns` | Proven long-term knowledge | Permanent | - |
| `books` | Document chunks (RAG) | Permanent | - |
| `memory_bank` | User-curated facts | Permanent | - |

### MongoDB Collections

| Collection | Purpose |
|------------|---------|
| `memory_items` | All memory tiers |
| `memory_outcomes` | Outcome events per memory |
| `action_outcomes` | Tool effectiveness tracking |
| `known_solutions` | Cached high-score solutions |
| `kg_nodes` | Knowledge graph entities |
| `kg_edges` | Entity relationships |
| `memoryBank` | Legacy memory bank items |

### Key Memory Services (File Locations)

| Service | File | Key Functions |
|---------|------|---------------|
| **UnifiedMemoryFacade** | `memory/UnifiedMemoryFacade.ts` | `search()` L589, `store()` L606, `prefetchContext()` L585 |
| **MemoryMongoStore** | `memory/stores/MemoryMongoStore.ts` | `store()` L370, `query()` L547, `recordOutcome()` L745 |
| **QdrantAdapter** | `memory/adapters/QdrantAdapter.ts` | `search()` L570, `upsert()` L445 |
| **DictaEmbeddingClient** | `memory/embedding/DictaEmbeddingClient.ts` | `embed()` L236, `getDiagnostics()` L763 |
| **SearchService** | `memory/search/SearchService.ts` | `search()` L105, RRF fusion L303 |
| **PromotionService** | `memory/learning/PromotionService.ts` | `runCycle()` L136, `promoteMemory()` L249 |
| **KnowledgeGraphService** | `memory/kg/KnowledgeGraphService.ts` | `getTierPlan()` L174, `extractEntities()` L363 |

### Memory Integration in runMcpFlow.ts

| Integration Point | Lines | Function |
|-------------------|-------|----------|
| Memory Prefetch | 526-933 | `prefetchMemoryContext()` |
| Cold-Start Injection | 566-583 | First message user profile |
| Contextual Guidance | 776-817 | Past experience, failures |
| Tool Guidance | 825-875 | Action effectiveness from KG |
| Attribution Instruction | 759-769 | `<!-- MEM: 1👍 2👎 -->` |
| Working Memory Storage | 1959-1978 | `storeWorkingMemory()` |
| Outcome Recording | 1934-1957 | `recordResponseOutcome()` |

### Wilson Score Calculation

Used for memory ranking and promotion eligibility:
```typescript
// Location: stores/MemoryMongoStore.ts L130-141
wilson_score = (p + z²/2n - z√(p(1-p)/n + z²/4n²)) / (1 + z²/n)
// where p = successes/total, z = 1.96 (95% confidence)
```

### Circuit Breaker Config

```typescript
// Location: memory_config.ts L214-224
embeddings: {
  failure_threshold: 2,      // Open after 2 failures
  success_threshold: 2,      // Close after 2 successes
  open_duration_ms: 60000,   // 60s before retry
}
```

---

## Prompt System

### Template Files (Handlebars `.hbs`)

Location: `frontend-huggingface/src/lib/server/memory/templates/`

| Template | Purpose |
|----------|---------|
| `personality-prompt.hbs` | User/assistant persona |
| `memory-injection.hbs` | Memory context injection |
| `book-context.hbs` | RAG document chunks |
| `failure-prevention.hbs` | Past failure warnings |
| `organic-recall.hbs` | Proactive memory suggestions |

### Prompt Injection Order (runMcpFlow.ts)

1. **Personality prompt** (Section 1)
2. **Memory context** (Section 2)
3. **Confidence hint** (HIGH/MEDIUM/LOW)
4. **Attribution instruction** (`<!-- MEM: ... -->`)
5. **Contextual guidance** (past experience, failures)
6. **Tool guidance** (effectiveness stats)
7. **Memory bank philosophy**
8. **Tool prompt** (via `buildToolPreprompt()`)
9. **Language instruction** (Hebrew/English)

### Think Tag Handling

```typescript
// Model MUST output: <think>reasoning</think>final answer
// xmlUtils.ts repairs unclosed tags before UI rendering
// Smart skip: </think> with no tools → stream answer directly
```

---

## RoamPal Parity (Reference Architecture)

### Key Patterns to Follow

1. **5-tier memory** with promotion based on Wilson scores
2. **Dual KG**: Routing KG (query→tier) + Content KG (entity relationships)
3. **Action-Effectiveness KG**: Tool success rates per context type
4. **Cold-start injection**: User profile on first message
5. **Causal attribution**: LLM marks helpful memories `<!-- MEM: 1👍 2👎 -->`
6. **Outcome detection**: Analyze user follow-up to score memories

### RoamPal Files to Reference

| Pattern | RoamPal File | Line Numbers |
|---------|--------------|--------------|
| Chat Processing | `agent_chat.py` | 58-650 |
| Memory Search | `unified_memory_system.py` | 234-380 |
| Promotion Logic | `promotion_service.py` | 55-177 |
| Cold-Start | `agent_chat.py` | 627-668 |
| Contextual Guidance | `agent_chat.py` | 675-794 |
| Outcome Detection | `agent_chat.py` | 1146-1294 |

---

## Known Breaking Points & Bottlenecks

### Memory System
- **Embedding service down** → Circuit breaker opens, UI may freeze → Check `dicta-retrieval` logs
- **Qdrant dimension mismatch** → Search fails silently → Verify `QDRANT_VECTOR_SIZE=1024`
- **MongoDB full-text index missing** → BM25 search fails → Check `memory_text_search` index
- **Deferred reindex queue full** → Memories stored but not searchable → Run reindex endpoint

### Inference
- **OOM on llama-server** → Reduce `CONTEXT_SIZE` or use `q4_0` KV cache
- **Slow generation** → Check `nvidia-smi`, ensure Flash Attention enabled
- **Tool loop** → Loop detector should catch at 3x, check `loopDetector.ts`

### Frontend-Backend Wiring
- **FinalAnswer missing memoryMeta** → Citations won't display → Check `runMcpFlow.ts` L1915
- **Memory events not refreshing UI** → `dispatchMemoryEvent()` not called → Check `+page.svelte`
- **TracePanel not updating** → Trace events not emitted → Check `MessageTraceUpdate` emissions

### Database
- **Redis connection timeout** → Rate limiting fails → Check `REDIS_URL` and container
- **MongoDB language error** → Use `language: "none"` for bilingual content
- **PostgreSQL volume corruption** → Delete volume and restart

---

## Debug Checklist

1. **Memory not working?**
   - Check `MEMORY_SYSTEM_ENABLED=true` in `.env`
   - Verify `dicta-retrieval` container healthy
   - Check circuit breaker: `GET /api/memory/ops/circuit-breaker`
   - Look for dimension mismatch in logs

2. **Search returns 0 results?**
   - Check if items have `needs_reindex: true` in MongoDB
   - Run `POST /api/memory/ops/reindex/deferred`
   - Verify Qdrant collection exists with correct dimensions

3. **UI not showing memory status?**
   - Check `MessageMemoryUpdate` events in browser console
   - Verify `memoryUi.ts` store is receiving updates
   - Check `+page.svelte` event handlers

4. **Tools not executing?**
   - Check `MCP_USE_NATIVE_TOOLS=false`
   - Verify `mcp-sse-proxy` container running
   - Check tool filtering in `toolFilter.ts`
