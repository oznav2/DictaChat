# Wire the Gap: Integration & Cleanup Plan (Enhanced)

> **Status**: Planning → Implementation Ready
> **Source Analysis**: `frontend-huggingface/docs/unwired_elements.md`
> **Goal**: Systematically integrate ALL unwired capabilities to maximize memory system utility and user experience.
> **Priority**: ALL items are HIGH PRIORITY

---

## Executive Summary

This plan bridges the gap between existing "unwired" capabilities and the active application. All tasks are necessary for full memory system utilization.

**Total Targets**:
- **Cleanup**: 4 Components (immediate removal)
- **Backend Wiring**: 5 Major Integrations
- **Admin APIs**: 3 New Endpoints
- **UI Features**: 4 Component Integrations
- **Template System**: Complete refactor of inline prompts

---

## Table of Contents

1. [Phase 1: Cleanup (Safe Deletions)](#phase-1-cleanup-safe-deletions)
2. [Phase 2: BilingualPrompts Integration](#phase-2-bilingualprompts-integration)
3. [Phase 3: PromptEngine Integration](#phase-3-promptengine-integration)
4. [Phase 4: ContextualEmbeddingService Integration](#phase-4-contextualembeddingservice-integration)
5. [Phase 5: MCP Observability APIs](#phase-5-mcp-observability-apis)
6. [Phase 6: UI Component Wiring](#phase-6-ui-component-wiring)
7. [Phase 7: ToolSummarizers Integration](#phase-7-toolsummarizers-integration)
8. [Verification Checklist](#verification-checklist)

---

## Phase 1: Cleanup (Safe Deletions)

**Risk Level**: NONE - Zero dependencies confirmed
**Estimated Impact**: Reduced bundle size, cleaner codebase

### Files to Delete

```bash
# Execute from frontend-huggingface/
rm src/lib/components/icons/IconPaperclip.svelte
rm src/lib/components/icons/LogoHuggingFaceBorderless.svelte
rm src/lib/components/ModelCardMetadata.svelte
rm src/lib/components/HoverTooltip.svelte
```

### Verification

```bash
# Confirm no references before deletion
grep -r "IconPaperclip" src/
grep -r "LogoHuggingFaceBorderless" src/
grep -r "ModelCardMetadata" src/
grep -r "HoverTooltip" src/
# All should return 0 results except the files themselves
```

---

## Phase 2: BilingualPrompts Integration

**Goal**: Replace ALL inline Hebrew/English prompt strings in `memoryIntegration.ts` with centralized BilingualPrompts utilities.

**Why This Matters**:
- Consistent RTL handling for Hebrew users
- Centralized translation management
- Easier A/B testing of prompt variations
- Proper directional text wrapping

### Current State Analysis

**File**: `src/lib/server/textGeneration/mcp/memoryIntegration.ts`

The following inline prompt constructions should be replaced:

| Line | Current Inline Prompt | Replace With |
|------|----------------------|--------------|
| 253-270 | `getConfidencePromptHint()` returns inline strings | `getBilingualPrompt()` with confidence keys |
| 1179-1212 | `MEMORY_ATTRIBUTION_INSTRUCTION` constant | New BilingualPrompt key `memory_attribution` |
| 1198-1212 | `MEMORY_ATTRIBUTION_INSTRUCTION_HE` constant | Same key, Hebrew version |
| 1866-1901 | `MEMORY_BANK_PHILOSOPHY` constant | New BilingualPrompt key `memory_bank_philosophy` |
| 1906-1929 | `MEMORY_BANK_PHILOSOPHY_HE` constant | Same key, Hebrew version |
| 938-943 | `formatContextualGuidancePrompt()` header | `getBilingualPrompt('contextual_guidance_header')` |

### Step-by-Step Implementation

#### Step 2.1: Add New Keys to BILINGUAL_PROMPTS

**File**: `src/lib/server/memory/BilingualPrompts.ts`

Add to the `BILINGUAL_PROMPTS` object after line 233:

```typescript
// Memory Attribution
memory_attribution_instruction: {
  en: `IMPORTANT: When using information from the memory context above, at the END of your response,
add a hidden attribution comment in this exact format on its own line:
<!-- MEM: 1👍 2👎 3➖ -->

Where numbers correspond to memory positions from the context:
- 👍 = memory was helpful and used in your response
- 👎 = memory was unhelpful, irrelevant, or wrong
- ➖ = memory was not used in your response

Example: If memories 1 and 3 helped, memory 2 was wrong, and 4-5 weren't used:
<!-- MEM: 1👍 3👍 2👎 4➖ 5➖ -->

This helps improve memory quality for future conversations. Include ALL memory positions.`,
  he: `חשוב: כאשר אתה משתמש במידע מהקשר הזיכרון לעיל, בסוף התשובה שלך,
הוסף הערת ייחוס מוסתרת בפורמט הזה בדיוק בשורה נפרדת:
<!-- MEM: 1👍 2👎 3➖ -->

כאשר המספרים מתאימים למיקומי הזיכרונות מההקשר:
- 👍 = הזיכרון היה שימושי ונעשה בו שימוש בתשובתך
- 👎 = הזיכרון היה לא רלוונטי או שגוי
- ➖ = לא נעשה שימוש בזיכרון בתשובתך

דוגמה: אם זיכרונות 1 ו-3 עזרו, זיכרון 2 היה שגוי, ו-4-5 לא נעשה בהם שימוש:
<!-- MEM: 1👍 3👍 2👎 4➖ 5➖ -->

זה עוזר לשפר את איכות הזיכרון לשיחות עתידיות. כלול את כל מיקומי הזיכרון.`,
},

// Confidence Hints
confidence_high: {
  en: `**MEMORY CONTEXT AVAILABLE (HIGH CONFIDENCE)**
The memory context above contains highly relevant information for this query.
You SHOULD be able to answer directly from memory without calling external tools.
Only use tools if the memory context is clearly insufficient or outdated.`,
  he: `**הקשר זיכרון זמין (ודאות גבוהה)**
הקשר הזיכרון למעלה מכיל מידע רלוונטי מאוד לשאילתה זו.
אתה אמור להיות מסוגל לענות ישירות מהזיכרון ללא שימוש בכלים חיצוניים.
השתמש בכלים רק אם הקשר הזיכרון אינו מספיק או מיושן.`,
},

confidence_medium: {
  en: `**MEMORY CONTEXT AVAILABLE (MEDIUM CONFIDENCE)**
The memory context above may contain relevant information.
Check the memory context first before deciding to use external tools.
If memory provides a partial answer, consider supplementing with tools.`,
  he: `**הקשר זיכרון זמין (ודאות בינונית)**
הקשר הזיכרון למעלה עשוי להכיל מידע רלוונטי.
בדוק את הקשר הזיכרון לפני שתחליט להשתמש בכלים חיצוניים.
אם הזיכרון מספק תשובה חלקית, שקול להשלים עם כלים.`,
},

confidence_low: {
  en: `**MEMORY CONTEXT AVAILABLE (LOW CONFIDENCE)**
The memory context above has limited relevance to this query.
You may need to use tools to gather additional information.`,
  he: `**הקשר זיכרון זמין (ודאות נמוכה)**
להקשר הזיכרון למעלה יש רלוונטיות מוגבלת לשאילתה זו.
ייתכן שתצטרך להשתמש בכלים כדי לאסוף מידע נוסף.`,
},

// Contextual Guidance
contextual_guidance_header: {
  en: `**CONTEXTUAL GUIDANCE FROM MEMORY SYSTEM**
The following insights are derived from past interactions and should inform your response:`,
  he: `**הנחיות הקשריות ממערכת הזיכרון**
התובנות הבאות נגזרות מאינטראקציות קודמות ויש להתחשב בהן בתשובתך:`,
},
```

#### Step 2.2: Refactor memoryIntegration.ts

**File**: `src/lib/server/textGeneration/mcp/memoryIntegration.ts`

**Add import at top (after line 16)**:

```typescript
import {
  getBilingualPrompt,
  detectLanguage,
  type SupportedLanguage,
} from "$lib/server/memory/BilingualPrompts";
```

**Replace `getConfidencePromptHint()` function (lines 243-272)**:

```typescript
/**
 * Get prompt hint based on retrieval confidence
 * Guides the model on whether to use tools or answer from memory
 */
export function getConfidencePromptHint(
  retrievalConfidence: RetrievalConfidence,
  hasMemoryContext: boolean,
  language: SupportedLanguage = "en"
): string {
  if (!hasMemoryContext) {
    return "";
  }

  switch (retrievalConfidence) {
    case "high":
      return getBilingualPrompt("confidence_high", language);
    case "medium":
      return getBilingualPrompt("confidence_medium", language);
    case "low":
      return getBilingualPrompt("confidence_low", language);
    default:
      return "";
  }
}
```

**Replace `getAttributionInstruction()` function (lines 1492-1497)**:

```typescript
/**
 * Get the appropriate attribution instruction based on language
 */
export function getAttributionInstruction(language?: "he" | "en" | "mixed"): string {
  const lang: SupportedLanguage = language === "he" ? "he" : "en";
  return getBilingualPrompt("memory_attribution_instruction", lang);
}
```

**Delete the inline constants (lines 1179-1212 and 1866-1929)** and use BilingualPrompts instead.

#### Step 2.3: Use Prompt Builders in formatContextualGuidancePrompt

**Replace lines 933-944**:

```typescript
export function formatContextualGuidancePrompt(
  guidance: ContextualGuidanceResult,
  language: SupportedLanguage = "en"
): string | null {
  if (!guidance.hasGuidance || !guidance.guidanceText) {
    return null;
  }

  const header = getBilingualPrompt("contextual_guidance_header", language);
  return `${header}

${guidance.guidanceText}

${getBilingualPrompt("this_might_help", language)}`;
}
```

### Verification

```bash
# After refactoring, verify no inline Hebrew/English duplication exists
grep -n "You SHOULD be able to answer" src/lib/server/textGeneration/mcp/memoryIntegration.ts
grep -n "אתה אמור להיות" src/lib/server/textGeneration/mcp/memoryIntegration.ts
# Should return 0 results (all moved to BilingualPrompts)
```

---

## Phase 3: PromptEngine Integration

**Goal**: Replace complex template strings with Handlebars templates for better maintainability and bilingual support.

**Why This Matters**:
- Version-controlled prompt templates
- A/B testing capability
- Handlebars helpers for RTL, truncation, conditionals
- Separation of prompt logic from code

### Current State

**File**: `src/lib/server/memory/PromptEngine.ts`
- Fully implemented with custom helpers (ifLang, rtl, join, truncate, etc.)
- Never initialized or used anywhere in the codebase

**File**: `src/lib/server/memory/templates/` (does not exist yet)

### Step-by-Step Implementation

#### Step 3.1: Create Templates Directory Structure

```bash
mkdir -p frontend-huggingface/templates/memory
mkdir -p frontend-huggingface/templates/memory/partials
```

#### Step 3.2: Create Template Files

**File**: `templates/memory/memory-injection.hbs`

```handlebars
{{!-- @description: Memory context injection for system prompt --}}
{{!-- @category: memory --}}

{{#ifLang "he"}}
**הקשר זיכרון**
על סמך מה שאני יודע עליך:

{{#each memories}}
{{add @index 1}}. {{truncate this.content 200}}
{{#if this.confidence}} ({{percent this.confidence}}){{/if}}
{{/each}}
{{else}}
**Memory Context**
Based on what I know about you:

{{#each memories}}
{{add @index 1}}. {{truncate this.content 200}}
{{#if this.confidence}} ({{percent this.confidence}}){{/if}}
{{/each}}
{{/ifLang}}
```

**File**: `templates/memory/attribution-instruction.hbs`

```handlebars
{{!-- @description: Memory attribution instruction for selective scoring --}}
{{!-- @category: memory --}}

{{#ifLang "he"}}
חשוב: כאשר אתה משתמש במידע מהקשר הזיכרון לעיל, בסוף התשובה שלך,
הוסף הערת ייחוס מוסתרת בפורמט הזה בדיוק בשורה נפרדת:
<!-- MEM: {{#each positions}}{{this}}{{#unless @last}} {{/unless}}{{/each}} -->
{{else}}
IMPORTANT: When using information from the memory context above, at the END of your response,
add a hidden attribution comment in this exact format on its own line:
<!-- MEM: {{#each positions}}{{this}}{{#unless @last}} {{/unless}}{{/each}} -->
{{/ifLang}}

{{#ifLang "he"}}
כאשר המספרים מתאימים למיקומי הזיכרונות מההקשר:
- 👍 = הזיכרון היה שימושי
- 👎 = הזיכרון היה לא רלוונטי
- ➖ = לא נעשה שימוש בזיכרון
{{else}}
Where numbers correspond to memory positions from the context:
- 👍 = memory was helpful and used
- 👎 = memory was unhelpful or wrong
- ➖ = memory was not used
{{/ifLang}}
```

**File**: `templates/memory/tool-guidance.hbs`

```handlebars
{{!-- @description: Tool guidance based on action effectiveness --}}
{{!-- @category: guidance --}}

═══ TOOL GUIDANCE (Context: {{contextType}}) ═══

🎯 Tool Effectiveness (learned from past outcomes):
{{#each stats}}
  {{#if (gt this.success_rate 0.7)}}✓{{else}}{{#if (lt this.success_rate 0.4)}}✗{{else}}○{{/if}}{{/if}} {{this.action_type}}() → {{percent this.success_rate}} success ({{this.total_uses}} uses){{#if (lt this.success_rate 0.4)}} - AVOID{{/if}}
{{/each}}

{{#ifNotEmpty avoidTools}}
⚠️ Based on past failures, avoid: {{join avoidTools ", "}}
{{/ifNotEmpty}}
```

#### Step 3.3: Initialize PromptEngine in hooks.server.ts

**File**: `src/hooks.server.ts`

**Add import after memory imports**:

```typescript
import { getPromptEngine } from "$lib/server/memory/PromptEngine";
```

**Add initialization after `runAllSeeders()` (around line 220)**:

```typescript
// Initialize PromptEngine for template-based prompts
try {
  const templatesDir = join(process.cwd(), "templates/memory");
  const promptEngine = getPromptEngine({ templatesDir });
  await promptEngine.initialize();
  logger.info({ templateCount: promptEngine.listTemplates().length }, "PromptEngine initialized");
} catch (err) {
  logger.warn({ err }, "PromptEngine initialization failed, using inline prompts");
}
```

#### Step 3.4: Use PromptEngine in memoryIntegration.ts

**Add to imports**:

```typescript
import { getPromptEngine } from "$lib/server/memory/PromptEngine";
```

**Create helper function** (add after imports):

```typescript
/**
 * Safely render a template, falling back to inline if PromptEngine unavailable
 */
function safeRenderTemplate(
  templateId: string,
  context: Record<string, unknown>,
  fallback: string
): string {
  try {
    const engine = getPromptEngine();
    if (engine.hasTemplate(templateId)) {
      return engine.render(templateId, context);
    }
  } catch {
    // PromptEngine not initialized
  }
  return fallback;
}
```

**Use in formatMemoryPromptSections()** (replace memory context building):

```typescript
// Section 2: Memory context (if available)
if (result.memoryContext) {
  // Try template first, fall back to raw context
  const templatedContext = safeRenderTemplate(
    "memory-injection",
    {
      memories: result.retrievalDebug?.results ?? [],
      language: language ?? "en",
    },
    result.memoryContext
  );
  sections.push(templatedContext);

  // Add confidence hint
  const confidenceHint = getConfidencePromptHint(
    result.retrievalConfidence,
    !!result.memoryContext,
    language ?? "en"
  );
  if (confidenceHint) {
    sections.push(confidenceHint);
  }
}
```

### Verification

```bash
# Verify templates are loaded
curl http://localhost:8003/api/memory/health | jq '.promptEngine'
# Should show templateCount > 0
```

---

## Phase 4: ContextualEmbeddingService Integration

**Goal**: Improve retrieval accuracy for context-dependent queries like "that thing we discussed" or "the approach that worked".

**Why This Matters**:
- Better handling of pronouns and references
- LLM-generated context prefixes improve embedding quality
- Redis caching prevents redundant LLM calls
- Circuit breaker provides graceful degradation

### Current State

**File**: `src/lib/server/memory/ContextualEmbeddingService.ts`
- Fully implemented with Redis caching and circuit breaker
- Never instantiated or used

**Integration Point**: `src/lib/server/memory/services/SearchServiceImpl.ts`

### Step-by-Step Implementation

#### Step 4.1: Add Feature Flag

**File**: `src/lib/server/memory/featureFlags.ts`

Add to `MemoryFeatureFlags` interface:

```typescript
/** Enable contextual embedding with LLM-generated prefixes */
contextualEmbeddingEnabled: boolean;
```

Add to `getMemoryFeatureFlags()`:

```typescript
contextualEmbeddingEnabled: envToBool(env.CONTEXTUAL_EMBEDDING_ENABLED, false),
```

**File**: `.env`

```bash
# Contextual Embedding (experimental - uses LLM for embedding prefix)
CONTEXTUAL_EMBEDDING_ENABLED=false
```

#### Step 4.2: Modify SearchServiceImpl Constructor

**File**: `src/lib/server/memory/services/SearchServiceImpl.ts`

**Add import**:

```typescript
import {
  ContextualEmbeddingService,
  createContextualEmbeddingService,
  type ContextualChunk,
} from "../ContextualEmbeddingService";
import { getMemoryFeatureFlags } from "../featureFlags";
```

**Modify interface (after line 37)**:

```typescript
export interface SearchServiceImplConfig {
  hybridSearch: HybridSearchService;
  config?: MemoryConfig;
  mongoStore?: { ... };
  kgService?: { ... };
  /** Optional contextual embedding service for LLM-enhanced retrieval */
  contextualEmbeddingService?: ContextualEmbeddingService;
}
```

**Add to class properties (after line 76)**:

```typescript
private contextualEmbeddingService: ContextualEmbeddingService | null = null;
```

**Modify constructor (after line 83)**:

```typescript
// Initialize contextual embedding if enabled
const flags = getMemoryFeatureFlags();
if (flags.contextualEmbeddingEnabled) {
  this.contextualEmbeddingService = params.contextualEmbeddingService ??
    createContextualEmbeddingService({
      enabled: true,
      timeout_ms: 5000,
      cache_ttl_hours: 24,
    });
  logger.info("ContextualEmbeddingService enabled for search");
}
```

#### Step 4.3: Enhance Query Before Search

**Add method to SearchServiceImpl** (after `expandQueryBilingual`):

```typescript
/**
 * Enhance query with contextual prefix for better embedding similarity
 * Uses LLM to generate context that helps retrieval understand references
 */
private async enhanceQueryWithContext(
  query: string,
  conversationContext?: string
): Promise<string> {
  if (!this.contextualEmbeddingService || !this.contextualEmbeddingService.isEnabled()) {
    return query;
  }

  if (this.contextualEmbeddingService.isCircuitOpen()) {
    logger.debug("ContextualEmbedding circuit breaker open, using raw query");
    return query;
  }

  try {
    const enhanced = await this.contextualEmbeddingService.prepareForEmbedding(
      query,
      conversationContext
    );

    if (enhanced.context_prefix) {
      logger.debug(
        {
          originalLength: query.length,
          prefixLength: enhanced.context_prefix.length
        },
        "Query enhanced with contextual prefix"
      );
      return enhanced.combined_text;
    }
  } catch (err) {
    logger.warn({ err }, "Contextual embedding enhancement failed, using raw query");
  }

  return query;
}
```

#### Step 4.4: Integrate into search() Method

**Modify the main `search()` method** to use contextual enhancement:

```typescript
async search(params: SearchParams): Promise<SearchResponse> {
  const startTime = Date.now();

  // ... existing validation code ...

  // NEW: Enhance query with contextual embedding if enabled
  let searchQuery = params.query;
  if (this.contextualEmbeddingService && params.recentMessages?.length) {
    const conversationContext = params.recentMessages
      .slice(-3)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    searchQuery = await this.enhanceQueryWithContext(params.query, conversationContext);
  }

  // Continue with existing search logic using searchQuery instead of params.query
  // ...
}
```

#### Step 4.5: Wire in hooks.server.ts

**File**: `src/hooks.server.ts`

When creating SearchServiceImpl, pass the contextual embedding service:

```typescript
import { createContextualEmbeddingService } from "$lib/server/memory/ContextualEmbeddingService";

// In initializeMemoryFacadeOnce():
const contextualEmbeddingService = flags.contextualEmbeddingEnabled
  ? createContextualEmbeddingService({
      enabled: true,
      timeout_ms: 5000,
      cache_ttl_hours: 24,
    })
  : undefined;

const searchService = new SearchServiceImpl({
  hybridSearch,
  config: memoryConfig,
  mongoStore,
  kgService,
  contextualEmbeddingService, // NEW
});
```

### Safety Considerations

1. **Feature flag** defaults to `false` - no impact on existing functionality
2. **Circuit breaker** prevents cascading failures if LLM is slow/unavailable
3. **Redis caching** prevents redundant LLM calls (24h TTL)
4. **Timeout** (5s) ensures queries don't hang
5. **Graceful fallback** always returns original query on error

### Verification

```bash
# Enable feature and test
export CONTEXTUAL_EMBEDDING_ENABLED=true

# Check circuit breaker status
curl http://localhost:8003/api/memory/ops/circuit-breaker | jq '.contextual_prefix'

# Test with a reference query
curl -X POST http://localhost:8003/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query": "that approach we discussed yesterday", "userId": "admin"}'
```

---

## Phase 5: MCP Observability APIs

**Goal**: Expose circuit breaker stats and performance metrics for admin visibility.

### Step-by-Step Implementation

#### Step 5.1: Create Circuit Breaker Admin Endpoint

**File**: `src/routes/api/admin/circuit-breakers/+server.ts`

```typescript
/**
 * GET /api/admin/circuit-breakers - Get all circuit breaker stats
 * POST /api/admin/circuit-breakers/reset - Reset all circuit breakers
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getCircuitBreakerStats,
  resetAllCircuitBreakers
} from "$lib/server/textGeneration/mcp/circuitBreaker";

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.isAdmin) {
    return error(403, "Admin access required");
  }

  try {
    const stats = getCircuitBreakerStats();
    return json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.isAdmin) {
    return error(403, "Admin access required");
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action ?? "reset";

    if (action === "reset") {
      resetAllCircuitBreakers();
      return json({
        success: true,
        message: "All circuit breakers reset",
        timestamp: new Date().toISOString(),
      });
    }

    return error(400, `Unknown action: ${action}`);
  } catch (err) {
    return json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
};
```

#### Step 5.2: Create Performance Admin Endpoint

**File**: `src/routes/api/admin/performance/+server.ts`

```typescript
/**
 * GET /api/admin/performance - Get MCP performance summary
 * POST /api/admin/performance/clear - Clear metrics
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getPerformanceSummary,
  clearPerformanceMetrics,
} from "$lib/server/textGeneration/mcp/performanceMonitor";

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.isAdmin) {
    return error(403, "Admin access required");
  }

  try {
    const summary = getPerformanceSummary();
    return json({
      success: true,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.isAdmin) {
    return error(403, "Admin access required");
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action ?? "clear";

    if (action === "clear") {
      clearPerformanceMetrics();
      return json({
        success: true,
        message: "Performance metrics cleared",
        timestamp: new Date().toISOString(),
      });
    }

    return error(400, `Unknown action: ${action}`);
  } catch (err) {
    return json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
};
```

### Verification

```bash
# Test circuit breaker endpoint
curl http://localhost:8003/api/admin/circuit-breakers

# Test performance endpoint
curl http://localhost:8003/api/admin/performance

# Reset circuit breakers
curl -X POST http://localhost:8003/api/admin/circuit-breakers \
  -H "Content-Type: application/json" \
  -d '{"action": "reset"}'
```

---

## Phase 6: UI Component Wiring

### Step 6.1: DocumentLibrary Integration

**Create**: `src/routes/settings/(nav)/documents/+page.svelte`

```svelte
<script lang="ts">
  import DocumentLibrary from "$lib/components/documents/DocumentLibrary.svelte";
</script>

<svelte:head>
  <title>Documents - Settings</title>
</svelte:head>

<div class="p-4">
  <h1 class="text-2xl font-bold mb-4">Document Library</h1>
  <p class="text-gray-600 mb-6">
    Browse and manage all ingested documents across conversations.
  </p>
  <DocumentLibrary />
</div>
```

### Step 6.2: DataManagementModal Integration

**Create**: `src/routes/settings/(nav)/data/+page.svelte`

```svelte
<script lang="ts">
  import DataManagementModal from "$lib/components/settings/DataManagementModal.svelte";
  let showModal = true; // Show inline, not as modal
</script>

<svelte:head>
  <title>Data Management - Settings</title>
</svelte:head>

<div class="p-4">
  <h1 class="text-2xl font-bold mb-4">Data Management</h1>
  <p class="text-gray-600 mb-6">
    Export backups, clear memory tiers, and manage your data.
  </p>
  <DataManagementModal bind:show={showModal} inline={true} />
</div>
```

### Step 6.3: PersonalitySelector Integration

**File**: `src/lib/components/personality/PersonalityModal.svelte`

Add PersonalitySelector for quick switching:

```svelte
<script lang="ts">
  import PersonalitySelector from "./PersonalitySelector.svelte";
  // ... existing code ...
</script>

<!-- Add after personality editor section -->
<div class="mt-4 border-t pt-4">
  <h3 class="text-sm font-medium mb-2">Quick Switch</h3>
  <PersonalitySelector
    personalities={presets.map(p => ({ id: p.name, name: p.name, color: getPresetColor(p.name) }))}
    active={currentPreset}
    onSelect={(preset) => loadPreset(preset.id)}
  />
</div>
```

### Verification

```bash
# Navigate to new settings pages
open http://localhost:8003/settings/documents
open http://localhost:8003/settings/data
```

---

## Phase 7: ToolSummarizers Integration

**Goal**: Reduce context usage by summarizing tool outputs before storage.

### Step-by-Step Implementation

#### Step 7.1: Wire into toolInvocation.ts

**File**: `src/lib/server/textGeneration/mcp/toolInvocation.ts`

**Add import**:

```typescript
import {
  getSummarizerPattern,
  applyLanguageInstructions
} from "./toolSummarizers";
```

**Add summarization after tool execution** (after receiving tool result):

```typescript
/**
 * Summarize tool output for memory storage (optional)
 * Only applies to verbose tools that benefit from summarization
 */
async function summarizeForStorage(
  toolName: string,
  output: string,
  language: "en" | "he" = "en"
): Promise<string> {
  const pattern = getSummarizerPattern(toolName);

  if (!pattern) {
    // No summarization needed for this tool
    return output;
  }

  // Only summarize if output is large
  if (output.length < 500) {
    return output;
  }

  const instructions = applyLanguageInstructions(pattern, language);

  // TODO: Use LLM to apply summarization instructions
  // For now, just truncate with marker
  logger.debug(
    { toolName, originalLength: output.length, pattern: pattern.type },
    "Tool output would be summarized"
  );

  return output; // Full implementation requires LLM call
}
```

---

## Verification Checklist

### Phase 1: Cleanup
- [ ] IconPaperclip.svelte deleted
- [ ] LogoHuggingFaceBorderless.svelte deleted
- [ ] ModelCardMetadata.svelte deleted
- [ ] HoverTooltip.svelte deleted
- [ ] No grep results for deleted components

### Phase 2: BilingualPrompts
- [ ] New keys added to BILINGUAL_PROMPTS
- [ ] getConfidencePromptHint uses getBilingualPrompt
- [ ] getAttributionInstruction uses getBilingualPrompt
- [ ] No inline Hebrew/English duplication in memoryIntegration.ts
- [ ] Verify Hebrew prompt displays correctly in UI

### Phase 3: PromptEngine
- [ ] templates/memory/ directory exists
- [ ] Template files created (.hbs)
- [ ] PromptEngine initialized in hooks.server.ts
- [ ] safeRenderTemplate helper added
- [ ] Template rendering fallback works

### Phase 4: ContextualEmbeddingService
- [ ] Feature flag added to .env (default: false)
- [ ] SearchServiceImpl accepts contextualEmbeddingService
- [ ] enhanceQueryWithContext method added
- [ ] Circuit breaker provides graceful degradation
- [ ] Test with reference query shows enhanced results

### Phase 5: Admin APIs
- [ ] /api/admin/circuit-breakers returns stats
- [ ] /api/admin/circuit-breakers POST resets breakers
- [ ] /api/admin/performance returns summary
- [ ] /api/admin/performance POST clears metrics
- [ ] Admin check enforced on all endpoints

### Phase 6: UI Components
- [ ] /settings/documents page exists and loads DocumentLibrary
- [ ] /settings/data page exists and loads DataManagementModal
- [ ] PersonalitySelector integrated into PersonalityModal
- [ ] Navigation links added to settings sidebar

### Phase 7: ToolSummarizers
- [ ] getSummarizerPattern imported in toolInvocation.ts
- [ ] summarizeForStorage function added
- [ ] Large tool outputs are marked for summarization

---

## Dependency Graph

```
Phase 1 (Cleanup)
    │
    ▼
Phase 2 (BilingualPrompts) ──────────────────┐
    │                                         │
    ▼                                         │
Phase 3 (PromptEngine) ◄─────────────────────┘
    │
    ▼
Phase 4 (ContextualEmbedding) ◄─── Phase 5 (Admin APIs)
    │
    ▼
Phase 6 (UI Components)
    │
    ▼
Phase 7 (ToolSummarizers)
```

**Critical Path**: Phases 2 and 3 must complete before Phase 4 to ensure bilingual support in contextual embeddings.

---

## Success Metrics

1. **Code Quality**: Zero inline Hebrew/English prompt duplication
2. **Retrieval Accuracy**: Measure improvement with reference queries
3. **Admin Visibility**: Real-time circuit breaker and performance stats
4. **User Access**: Documents and data management accessible via UI
5. **Bundle Size**: Reduced by ~10KB from removed components
6. **Test Coverage**: All new integrations have verification steps

---

## Rollback Plan

Each phase can be rolled back independently:

1. **Cleanup**: Git restore deleted files
2. **BilingualPrompts**: Revert memoryIntegration.ts changes
3. **PromptEngine**: Remove templates dir, revert hooks.server.ts
4. **ContextualEmbedding**: Set `CONTEXTUAL_EMBEDDING_ENABLED=false`
5. **Admin APIs**: Delete endpoint files
6. **UI Components**: Delete page files
7. **ToolSummarizers**: Revert toolInvocation.ts changes
