# Unwired Elements Analysis

> Purpose: Document unused exports, endpoints, and components for future integration or cleanup

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Memory System Exports](#memory-system-exports)
3. [MCP System Exports](#mcp-system-exports)
4. [Unused API Endpoints](#unused-api-endpoints)
5. [Unused Svelte Components](#unused-svelte-components)
6. [Recommendations](#recommendations)

---

## Executive Summary

| Category | Unused Count | Status |
|----------|--------------|--------|
| Memory Exports | 26 | Utility functions, experimental code |
| MCP Exports | 26 functions + 3 classes | Observability/admin APIs |
| API Endpoints | 19 | Admin/maintenance operations |
| Svelte Components | 8 | UI components never mounted |
| **Core Services** | **0 unused** | All 12 services properly wired |

**Bottom Line**: The core memory and MCP systems are fully functional. Unused elements are primarily:
- Admin/observability APIs never exposed in UI
- Experimental features (ContextualEmbeddingService, PromptEngine)
- Utility functions exported for modularity but only used internally
- Legacy components from HuggingFace template

---

## Memory System Exports

Location: `/src/lib/server/memory/`

### HIGH PRIORITY - Dead Code

#### 1. PromptEngine System

**Files**: `PromptEngine.ts`, exported from `memory/index.ts`

| Export | Type | Description |
|--------|------|-------------|
| `getPromptEngine()` | Function | Singleton factory for PromptEngine instance |
| `createPromptEngine()` | Function | Creates isolated PromptEngine instances |
| `resetPromptEngine()` | Function | Resets singleton (for testing) |

**What It Does**:
- Handlebars-based template rendering system
- Loads `.hbs` template files from `memory/templates/`
- Supports variable interpolation, partials, and helpers
- Designed for structured prompt generation

**Utility If Wired**:
- Centralized prompt management with version control
- Consistent prompt formatting across all memory injection points
- Easy A/B testing of different prompt templates
- Bilingual template support with language switching

**Current Status**: The system uses inline prompt construction in `memoryIntegration.ts` instead.

**Integration Path**:
```typescript
// In memoryIntegration.ts
import { getPromptEngine } from "$lib/server/memory";

const engine = getPromptEngine();
const prompt = engine.render("memory-injection", {
  memories: searchResults,
  language: "he",
  confidence: "HIGH"
});
```

---

#### 2. ContextualEmbeddingService

**Files**: `ContextualEmbeddingService.ts`, exported from `memory/index.ts`

| Export | Type | Description |
|--------|------|-------------|
| `ContextualEmbeddingService` | Class | Context-aware embedding generation |
| `createContextualEmbeddingService()` | Function | Factory function |

**What It Does**:
- Generates embeddings with conversation context awareness
- Uses LLM to "boost" embedding dimensions with semantic understanding
- Improves retrieval accuracy for ambiguous queries
- Supports dimension expansion (1024 → enhanced representation)

**Utility If Wired**:
- Better memory retrieval for context-dependent queries
- Improved handling of pronouns and references ("that thing we discussed")
- Higher precision in multi-turn conversation memory lookup
- Semantic disambiguation for Hebrew/English mixed queries

**Current Status**: Experimental. System uses standard DictaEmbeddingClient.

**Integration Path**:
```typescript
// In SearchServiceImpl.ts
const contextualService = createContextualEmbeddingService({
  baseEmbedder: dictaClient,
  llmClient: inferenceClient,
  contextWindow: 3 // messages
});

const embedding = await contextualService.embed(query, conversationContext);
```

---

#### 3. templateToPrompt Function

**File**: `personality/PersonalityLoader.ts`

| Export | Type | Description |
|--------|------|-------------|
| `templateToPrompt()` | Function | Converts PersonalityYAML to prompt string |

**What It Does**:
- Transforms structured personality YAML into formatted system prompt
- Handles persona, guidelines, examples, and constraints sections
- Supports bilingual output (Hebrew/English)

**Utility If Wired**:
- Dynamic personality switching without code changes
- User-customizable AI personas via YAML files
- Consistent personality application across sessions

**Current Status**: PersonalityLoader is used, but this specific converter isn't called.

---

### MEDIUM PRIORITY - Utility Functions

#### 4. BilingualPrompts Helpers (11 functions)

**File**: `BilingualPrompts.ts`, exported from `memory/index.ts`

| Export | Description | Utility |
|--------|-------------|---------|
| `getBilingualPrompt(key, lang)` | Get prompt by key and language | Centralized i18n for prompts |
| `getBothLanguages(key)` | Get EN + HE versions | Side-by-side translation |
| `renderBilingual(text, lang)` | Apply language markers | RTL/LTR handling |
| `renderPrompt(template, vars)` | Template interpolation | Dynamic prompts |
| `createBilingualPrompt(en, he)` | Factory for bilingual objects | Type-safe creation |
| `mergeBilingualPrompts(...prompts)` | Combine multiple prompts | Prompt composition |
| `wrapWithDirection(text, dir)` | Add RTL/LTR markers | Hebrew text handling |
| `createDirectionalDiv(text, lang)` | HTML div with direction | UI rendering |
| `buildMemoryContextHeader(lang)` | Memory section header | Consistent formatting |
| `buildGoalReminder(goals, lang)` | Goal reminder prompt | Goal-oriented responses |
| `buildFailureWarning(failures, lang)` | Failure prevention prompt | Learning from mistakes |
| `buildErrorMessage(error, lang)` | User-friendly errors | Better UX |

**What They Do**:
- Provide structured bilingual text generation
- Handle Hebrew RTL text direction
- Standardize prompt formatting across the system

**Utility If Wired**:
- Consistent Hebrew/English prompt handling
- Centralized translation management
- Proper RTL rendering in all UI contexts
- Reusable prompt building blocks

**Current Status**: Used internally within BilingualPrompts.ts but not imported elsewhere.

---

### LOW PRIORITY - Internal Exports

#### 5. Retrieval Functions (11 functions)

**File**: `search/MemoryRetrievalService.ts`

| Export | Description |
|--------|-------------|
| `rrfFuse()` | Reciprocal Rank Fusion implementation |
| `rrfFuseWithDynamicK()` | RRF with adaptive k parameter |
| `calculateRrfScore()` | Individual RRF score calculation |
| `calculateDynamicWeights()` | Weight calculation for fusion |
| `applyDynamicWeights()` | Apply weights to results |
| `applyDynamicWeightsToResults()` | Batch weight application |
| `applyDistanceBoost()` | Distance-based score boosting |
| `distanceToSimilarity()` | Convert distance to similarity |
| `applyCEQualityMultiplier()` | Contextual embedding quality |
| `applyMemoryBankQualityEnforcement()` | Memory bank quality stage 1 |
| `enforceMemoryBankQuality()` | Memory bank quality stage 2/3 |

**Status**: These ARE used internally by MemoryRetrievalService. Exported for modularity/testing.

**Recommendation**: Keep exports for unit testing access.

---

## MCP System Exports

Location: `/src/lib/server/textGeneration/mcp/`

### Observability APIs (Never Exposed in UI)

#### 1. Circuit Breaker Stats

**File**: `circuitBreaker.ts`

| Export | Type | Description |
|--------|------|-------------|
| `getCircuitBreakerStats()` | Function | Returns stats for all circuit breakers |
| `resetAllCircuitBreakers()` | Function | Manual reset of all breakers |
| `createCircuitBreaker()` | Function | Factory (internal) |
| `CircuitBreakerCollection` | Class | Collection manager (internal) |

**What They Do**:
- Track circuit breaker states (open/closed/half-open)
- Count failures, successes, and timeouts per tool
- Enable manual intervention for stuck breakers

**Utility If Wired**:
- Admin dashboard showing tool health status
- Manual recovery from cascading failures
- Real-time visibility into MCP tool availability
- Debugging tool execution issues

**Integration Path**:
```typescript
// New endpoint: /api/admin/circuit-breakers
import { getCircuitBreakerStats, resetAllCircuitBreakers } from "./circuitBreaker";

export const GET = async () => {
  return json(getCircuitBreakerStats());
};

export const POST = async () => {
  resetAllCircuitBreakers();
  return json({ success: true });
};
```

---

#### 2. Performance Monitor

**File**: `performanceMonitor.ts`

| Export | Type | Description |
|--------|------|-------------|
| `getPerformanceStats(operation)` | Function | Get stats for specific operation |
| `getPerformanceSummary()` | Function | Overall performance summary |
| `clearPerformanceMetrics()` | Function | Reset all metrics |
| `recordMetric(name, value)` | Function | Record custom metric |

**What They Do**:
- Track execution times for all MCP operations
- Calculate p50, p95, p99 latencies
- Count invocations and errors per tool
- Enable performance trending

**Utility If Wired**:
- Performance dashboard for MCP tools
- Identify slow tools for optimization
- Detect degradation over time
- SLA monitoring (e.g., "Perplexity p95 < 5s")

**Integration Path**:
```typescript
// New endpoint: /api/admin/mcp-performance
import { getPerformanceSummary } from "./performanceMonitor";

export const GET = async () => {
  return json(getPerformanceSummary());
};
```

---

#### 3. Structured Logging Wrappers

**File**: `loggingService.ts`

| Export | Type | Description |
|--------|------|-------------|
| `initializeLogging()` | Function | Initialize global logger |
| `getLogger()` | Function | Get global logger instance |
| `logDebug(msg, ctx)` | Function | Debug level wrapper |
| `logInfo(msg, ctx)` | Function | Info level wrapper |
| `logWarn(msg, ctx)` | Function | Warning level wrapper |
| `logError(msg, ctx)` | Function | Error level wrapper |

**What They Do**:
- Provide convenience wrappers around StructuredLoggingService
- Enable global logging without passing logger instance
- Support structured context in all log messages

**Utility If Wired**:
- Consistent logging across all MCP modules
- Easier debugging with structured context
- Log aggregation compatibility (JSON format)

**Current Status**: runMcpFlow.ts directly instantiates StructuredLoggingService instead.

---

#### 4. Tool Summarizers

**File**: `toolSummarizers.ts`

| Export | Type | Description |
|--------|------|-------------|
| `getSummarizerPattern(toolName)` | Function | Get summarization pattern for tool |
| `applyLanguageInstructions(pattern, lang)` | Function | Apply language-specific instructions |

**What They Do**:
- Select appropriate summarization strategy per tool
- Handle different output formats (JSON, markdown, HTML)
- Apply Hebrew/English language instructions
- Patterns include: extract_key_facts, preserve_structure, highlight_entities

**Utility If Wired**:
- Consistent tool output summarization
- Token-efficient memory storage (summarize before storing)
- Language-appropriate summaries for Hebrew users
- Better context utilization

**Integration Path**:
```typescript
// In toolInvocation.ts after tool execution
import { getSummarizerPattern, applyLanguageInstructions } from "./toolSummarizers";

const pattern = getSummarizerPattern(toolName);
const instructions = applyLanguageInstructions(pattern, userLanguage);
const summary = await llm.summarize(toolOutput, instructions);
```

---

#### 5. Tool Intelligence Utilities (11 functions)

**File**: `toolIntelligenceRegistry.ts`

| Export | Description | Utility |
|--------|-------------|---------|
| `getLatencyTier(tool)` | Get fast/medium/slow classification | UI loading indicators |
| `getToolTimeout(tool)` | Get timeout in ms | Prevent hanging |
| `getUserFeedbackDelay(tool)` | Delay before "waiting..." | UX polish |
| `getMaxOutputTokens(tool)` | Max tokens to accept | Prevent context overflow |
| `needsSummarization(tool)` | Check if output needs processing | Conditional summarization |
| `getToolsForServer(server)` | Get tools by MCP server | Server management |
| `rankToolsForQuery(query)` | Rank tools by relevance | Smart tool selection |
| `getAllRegisteredTools()` | List all tool names | Admin inventory |
| `generatePostExecutionSuggestions(tool)` | Suggest next actions | Guided workflow |
| `getToolUsageAttribution(tool)` | Source attribution | Citation generation |
| `getComplementaryTools(tool)` | Tools that pair well | Workflow suggestions |

**What They Do**:
- Provide rich metadata about MCP tools
- Enable intelligent tool selection and orchestration
- Support UI feedback and user guidance

**Utility If Wired**:
- Smarter tool selection based on query analysis
- Better UX with appropriate loading states
- Workflow automation ("After search, try summarize")
- Tool discovery and suggestions

---

## Unused API Endpoints

Location: `/src/routes/api/`

### Memory Admin APIs

| Endpoint | Methods | Description | Utility If Exposed |
|----------|---------|-------------|-------------------|
| `/api/memory/ops/cleanup` | GET, POST | Orphaned session cleanup | Database maintenance |
| `/api/memory/ops/diagnostics` | GET | Comprehensive health check | Debugging "0 memories" issues |
| `/api/memory/ops/migrate` | GET, POST, PUT | Legacy migration | One-time data migration |
| `/api/memory/ops/reset` | GET, POST | Nuclear reset (DELETE ALL) | Development/testing reset |
| `/api/memory/ops/sanitize` | GET, POST | Remove corrupted data | Fix base64 artifacts |
| `/api/memory/ops/prefetch` | POST | Direct prefetch testing | Debug memory injection |
| `/api/memory/patterns/performance` | GET | Top performing patterns | Analytics dashboard |
| `/api/memory/content-graph/stats` | GET | KG statistics | Graph health monitoring |
| `/api/memory/content-graph/backfill` | POST | Rebuild KG from memories | Recovery/repair |
| `/api/memory/decay/schedule` | GET | Promotion scheduler status | System monitoring |
| `/api/memory/books/recognize` | GET, POST | Document deduplication | Prevent re-processing |

### System APIs

| Endpoint | Methods | Description | Utility If Exposed |
|----------|---------|-------------|-------------------|
| `/api/hooks/context` | GET, POST | Raw context query | Testing/debugging |
| `/api/documents/check-url` | POST | URL deduplication | Prevent duplicate URLs |
| `/api/system/data-sizes` | GET | Storage statistics | Capacity planning |
| `/api/models` | GET | List available models | Model selection UI |
| `/api/user` | GET | Authenticated user info | User profile display |
| `/api/settings/model/providers/detect` | GET | Auto-detect provider | Smart configuration |
| `/api/settings/integrations` | GET | List integrations | Integration management |
| `/api/v2/{...slugs}` | * | Legacy v2 API | Backwards compatibility |

### Recommended Admin Panel

These endpoints would be valuable in an admin panel:

```
/admin
├── /system
│   ├── Health Dashboard (diagnostics, circuit-breakers)
│   ├── Storage Stats (data-sizes)
│   └── Performance (patterns/performance, mcp-performance)
├── /memory
│   ├── Cleanup Tools (cleanup, sanitize, reset)
│   ├── Migration (migrate)
│   └── Knowledge Graph (content-graph/stats, backfill)
└── /documents
    ├── Library (documents)
    └── Deduplication (check-url, books/recognize)
```

---

## Unused Svelte Components

Location: `/src/lib/components/`

### 1. IconPaperclip.svelte

**Path**: `icons/IconPaperclip.svelte`

**What It Does**: SVG icon for attachment/paperclip symbol

**Utility If Used**: File attachment indicator in chat input, document upload buttons

**Recommendation**: Remove if file upload uses different iconography

---

### 2. LogoHuggingFaceBorderless.svelte

**Path**: `icons/LogoHuggingFaceBorderless.svelte`

**What It Does**: Official Hugging Face logo (borderless variant, 88x95px)

**Utility If Used**: Branding in footer, about page, or login screen

**Recommendation**: Remove - project is DictaLM-focused, not HF-branded

---

### 3. DocumentLibrary.svelte

**Path**: `documents/DocumentLibrary.svelte`

**What It Does**:
- Unified library UI for all documents (books, web articles, API imports)
- Filtering by source type and language
- Bilingual source badges
- Click-to-open DocumentModal integration

**Utility If Used**:
- Central document management interface
- Browse all ingested content
- Cross-chat document discovery
- Document metadata viewing

**Integration Path**:
```svelte
<!-- /routes/settings/(nav)/documents/+page.svelte -->
<script>
  import DocumentLibrary from "$lib/components/documents/DocumentLibrary.svelte";
</script>

<DocumentLibrary />
```

---

### 4. ModelCardMetadata.svelte

**Path**: `ModelCardMetadata.svelte`

**What It Does**: Displays model metadata cards with links to HuggingFace resources

**Utility If Used**: Model browser, model selection page, about model section

**Recommendation**: Remove - legacy from HF chat template, not needed for single-model setup

---

### 5. DataManagementModal.svelte

**Path**: `settings/DataManagementModal.svelte`

**What It Does**:
- Export data as backup
- Delete specific memory tiers/collections
- Compact database
- Show data stats per tier

**Utility If Used**:
- User data management
- Privacy controls (delete my data)
- Storage management
- Backup/restore functionality

**Integration Path**:
```svelte
<!-- /routes/settings/(nav)/data/+page.svelte -->
<script>
  import DataManagementModal from "$lib/components/settings/DataManagementModal.svelte";
  let showModal = false;
</script>

<button on:click={() => showModal = true}>Manage Data</button>
<DataManagementModal bind:show={showModal} />
```

---

### 6. Pagination.svelte

**Path**: `Pagination.svelte`

**What It Does**:
- Page number links with ellipsis
- Previous/next navigation
- Smart page range calculation

**Utility If Used**:
- Memory search results pagination
- Document library pagination
- Model catalog pagination

**Note**: PaginationArrow.svelte IS used; this parent component isn't

---

### 7. PersonalitySelector.svelte

**Path**: `personality/PersonalitySelector.svelte`

**What It Does**:
- Colored badge buttons for personality selection
- Active state highlighting
- RTL-aware layout
- Callback-based selection

**Utility If Used**:
- Quick personality switching in chat
- Personality preview before selection
- Multi-personality comparison

**Integration Path**:
```svelte
<!-- In PersonalityModal.svelte -->
<script>
  import PersonalitySelector from "./PersonalitySelector.svelte";
</script>

<PersonalitySelector
  personalities={availablePersonalities}
  active={currentPersonality}
  onSelect={(p) => selectPersonality(p)}
/>
```

---

### 8. HoverTooltip.svelte

**Path**: `HoverTooltip.svelte`

**What It Does**:
- Generic hover tooltip wrapper
- 4 position options (top, bottom, left, right)
- Mobile-friendly (visible on tap)
- Max 64 character width

**Utility If Used**:
- Button help text
- Tool descriptions
- Memory item labels
- Icon explanations

**Note**: Similar to existing Tooltip.svelte - possible duplicate

---

## Recommendations

### Immediate Cleanup (Safe to Remove)

1. **IconPaperclip.svelte** - Unused icon
2. **LogoHuggingFaceBorderless.svelte** - Wrong branding
3. **ModelCardMetadata.svelte** - Legacy HF component
4. **HoverTooltip.svelte** - Duplicate of Tooltip.svelte

### Integration Candidates (High Value)

1. **DataManagementModal** → Settings > Data page
2. **DocumentLibrary** → Settings > Documents page
3. **PersonalitySelector** → PersonalityModal
4. **Circuit Breaker Stats** → Admin dashboard
5. **Performance Monitor** → Admin dashboard
6. **Tool Summarizers** → Post-execution processing
7. **PromptEngine** - Valuable for prompt management
8. **ContextualEmbeddingService** - Valuable for better retrieval
8. **BilingualPrompts helpers** - Valuable for Hebrew support

### Keep As-Is (Internal Modularity)

1. **Retrieval functions** - Used internally, exported for testing
2. **Migration utilities** - One-time use, keep for reference

---

## Appendix: Quick Reference

### Files to Delete (if cleaning up)

```
src/lib/components/icons/IconPaperclip.svelte
src/lib/components/icons/LogoHuggingFaceBorderless.svelte
src/lib/components/ModelCardMetadata.svelte
src/lib/components/HoverTooltip.svelte
```
