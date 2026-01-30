# Wire Remaining 64 Elements - Comprehensive Plan

## Executive Summary
This plan wires ALL remaining unwired elements from `unwired_elements.md` into active usage.

---

## BATCH 1: BilingualPrompts Helpers (10 functions)

### Target File: `memoryIntegration.ts`

**Functions to wire:**
1. `buildMemoryContextHeader()` - Already exists but needs usage
2. `buildGoalReminder()` - For goal section in prompts
3. `buildFailureWarning()` - For contextual guidance failures
4. `buildErrorMessage()` - For error formatting
5. `wrapWithDirection()` - For RTL text handling
6. `createDirectionalDiv()` - For HTML RTL rendering
7. `renderBilingual()` - For templated prompts
8. `renderPrompt()` - For single-language templates
9. `createBilingualPrompt()` - Utility (keep exported)
10. `mergeBilingualPrompts()` - For combining prompt sections

**Integration points:**
- `formatContextualGuidancePrompt()` → use `buildFailureWarning()`
- New `formatMemoryHeader()` → use `buildMemoryContextHeader()`
- Error handling → use `buildErrorMessage()`

---

## BATCH 2: Tool Intelligence Utilities (11 functions)

### Target Files: `toolInvocation.ts`, `toolFilter.ts`, `runMcpFlow.ts`

**Functions to wire:**
1. `getLatencyTier()` → logging in toolInvocation.ts
2. `getToolTimeout()` → dynamic timeouts in toolInvocation.ts
3. `getUserFeedbackDelay()` → progress messages in runMcpFlow.ts
4. `getMaxOutputTokens()` → output truncation in toolInvocation.ts
5. `needsSummarization()` → conditional summarization in toolInvocation.ts
6. `getToolsForServer()` → server management (keep exported)
7. `rankToolsForQuery()` → smarter tool selection in toolFilter.ts
8. `getAllRegisteredTools()` → admin inventory (already used)
9. `generatePostExecutionSuggestions()` → tool result messages
10. `getToolUsageAttribution()` → source citations
11. `getComplementaryTools()` → tool workflow suggestions

---

## BATCH 3: PromptEngine Active Rendering

### Target File: `memoryIntegration.ts`

**Current state:** Engine initialized but `engine.render()` never called
**Goal:** Use PromptEngine for structured prompt generation

**Integration:**
- Create `renderMemoryPrompt()` function using PromptEngine
- Replace inline prompt strings with template rendering
- Support for language switching via templates

---

## BATCH 4: UI Components (3 components)

### 4.1 PersonalitySelector.svelte
**Target:** `PersonalityModal.svelte`
**Integration:** Add personality quick-selection badges

### 4.2 Pagination.svelte
**Target:** `DocumentLibrary.svelte`
**Integration:** Add pagination for large document lists

### 4.3 DataManagementModal.svelte
**Action:** DELETE (duplicate of `/settings/data/+page.svelte`)

---

## BATCH 5: Admin Dashboard UI

### Target: `/settings/dev/+page.svelte`

**Expose APIs:**
- Circuit Breaker Stats panel
- Performance Monitor panel
- System diagnostics

**Existing endpoints to consume:**
- `GET /api/admin/circuit-breakers`
- `GET /api/admin/performance`
- `GET /api/memory/ops/diagnostics`

---

## BATCH 6: Structured Logging Wrappers

### Target Files: Various MCP files

**Functions:** `logDebug()`, `logInfo()`, `logWarn()`, `logError()`
**Decision:** LOW PRIORITY - Current logger usage is sufficient

---

## BATCH 7: Remaining API Endpoints UI Exposure

### Already exist but need UI:
1. `/api/memory/ops/cleanup` → Data Management
2. `/api/memory/ops/diagnostics` → Dev Tools
3. `/api/memory/ops/sanitize` → Data Management
4. `/api/memory/patterns/performance` → Performance tab
5. `/api/memory/content-graph/stats` → KG Stats panel
6. `/api/memory/books/recognize` → Document deduplication

---

## Execution Order

1. **BATCH 1** - BilingualPrompts (impacts prompt quality)
2. **BATCH 2** - Tool Intelligence (impacts tool execution)
3. **BATCH 4** - UI Components (user-facing improvements)
4. **BATCH 5** - Admin Dashboard (operational visibility)
5. **BATCH 3** - PromptEngine (optional enhancement)
6. **BATCH 7** - API Exposure (admin features)

---

## Files Modified

| File | Changes |
|------|---------|
| `memoryIntegration.ts` | BilingualPrompts helpers usage |
| `toolInvocation.ts` | Tool Intelligence utilities |
| `toolFilter.ts` | `rankToolsForQuery()` integration |
| `runMcpFlow.ts` | Feedback delay, suggestions |
| `PersonalityModal.svelte` | PersonalitySelector integration |
| `DocumentLibrary.svelte` | Pagination integration |
| `/settings/dev/+page.svelte` | Admin dashboard panels |
| `DataManagementModal.svelte` | DELETE |

---

## Verification

After completion:
```bash
# Check no unused exports remain
grep -r "export function" src/lib/server/memory/BilingualPrompts.ts | wc -l
# All should be imported somewhere

# Check Tool Intelligence usage
grep -r "getLatencyTier\|getToolTimeout\|rankToolsForQuery" src/
# All should have usage
```
