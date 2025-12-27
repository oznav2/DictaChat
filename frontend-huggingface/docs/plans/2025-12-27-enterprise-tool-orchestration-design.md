# Enterprise-Grade Tool Orchestration System

## Executive Summary

Design a unified system where the model intelligently selects, prioritizes, and invokes MCP tools with proper parameter construction, response time awareness, and token management.

## Current State Analysis

### What Already Exists (DO NOT BREAK)

| Component | File | Functionality |
|-----------|------|---------------|
| **Intent Detection** | `hebrewIntentDetector.ts` | Hebrew keywords → Perplexity tool scoring |
| **Tool Categories** | `toolFilter.ts` | 12 categories with Hebrew+English keywords |
| **Tool Priorities** | `toolFilter.ts` | Numerical scores (0-100) for best-in-class |
| **Perplexity Selection** | `toolFilter.ts` | `selectBestPerplexityTool()` - intelligent scoring |
| **DataGov Priority** | `toolFilter.ts` | Official data intent → DataGov-only filtering |
| **Parameter Normalization** | `toolParameterRegistry.ts` | Universal alias mapping + type coercion |
| **Timeout Management** | `httpClient.ts` | Tool-specific timeouts (60s default, 5min for research) |
| **MAX_TOOLS Limit** | `toolFilter.ts` | Caps tools at 4 to prevent model overload |
| **Token Management** | `runMcpFlow.ts` | max_tokens clamping, output truncation |
| **Tool Summarizers** | `toolSummarizers.ts` | Post-processing for tool outputs |
| **Loop Detection** | `loopDetector.ts` | Prevents infinite tool call loops |
| **Circuit Breaker** | `circuitBreaker.ts` | Fails fast when MCP servers are down |

### Gaps to Address

1. **No Universal Tool Scoring** - Only Perplexity has intent-based scoring; other tools use static priorities
2. **No Cascade Fallback** - When primary tool fails, no automatic retry with secondary
3. **No Latency Awareness** - Model doesn't know which tools are fast vs slow
4. **No Response Size Hints** - Model doesn't know expected output sizes
5. **No Cross-Tool Conflict Resolution** - Multiple tools may match same intent

---

## Proposed Architecture

### Phase 1: Tool Intelligence Registry

**File: `toolIntelligenceRegistry.ts`**

Extend the parameter registry concept to include tool metadata:

```typescript
interface ToolIntelligence {
  // Identity
  name: string;
  patterns: RegExp[];
  mcpServer: string;

  // Priority & Hierarchy
  priority: number;                    // 0-100, higher = better
  hierarchy: string[];                 // Fallback chain: ["datagov_query", "perplexity-search", "tavily-search"]
  conflictsWith: string[];             // Tools to exclude when this is selected

  // Performance Characteristics
  latency: {
    typical: number;                   // Expected ms (e.g., 2000)
    timeout: number;                   // Max wait ms (e.g., 300000)
    userFeedbackDelay: number;         // Show "searching..." after ms
  };

  // Response Characteristics
  response: {
    typicalTokens: number;             // Expected output size
    maxTokens: number;                 // Truncate threshold
    structured: boolean;               // Returns JSON vs text
    requiresSummarization: boolean;    // Needs post-processing
  };

  // Intent Scoring
  intentSignals: {
    keywords: RegExp;                  // Hebrew + English patterns
    weight: number;                    // Score boost when matched
    exclusiveIntent?: string;          // If matched, use ONLY this tool
  };

  // Parameter Hints (for model guidance)
  parameterHints: {
    required: string[];
    optional: string[];
    examples: Record<string, unknown>;
  };
}
```

### Phase 2: Unified Tool Scoring

**Extend `toolFilter.ts` with universal scoring:**

```typescript
interface ToolScore {
  tool: string;
  score: number;
  matchedSignals: string[];
  latencyTier: "fast" | "medium" | "slow";
  confidenceLevel: "high" | "medium" | "low";
}

function scoreAllTools(query: string, availableTools: string[]): ToolScore[] {
  // 1. Apply intent keyword matching (like Perplexity scoring)
  // 2. Apply hierarchy boosts (datagov > perplexity for Israeli data)
  // 3. Apply latency penalties for slow tools when query seems urgent
  // 4. Return sorted list with confidence levels
}
```

### Phase 3: Cascade Fallback System

**Add to `toolInvocation.ts`:**

```typescript
interface FallbackChain {
  primary: string;
  fallbacks: string[];
  maxRetries: number;
  retryConditions: ("timeout" | "error" | "empty_result")[];
}

async function executeWithFallback(
  chain: FallbackChain,
  params: Record<string, unknown>,
  context: ExecutionContext
): Promise<ToolResult> {
  for (const tool of [chain.primary, ...chain.fallbacks]) {
    try {
      const result = await executeTool(tool, params);
      if (isValidResult(result)) return result;
    } catch (error) {
      if (!shouldRetry(error, chain.retryConditions)) throw error;
      // Log and continue to next fallback
    }
  }
  throw new Error("All fallback tools failed");
}
```

### Phase 4: Response Optimization

**Add to `runMcpFlow.ts`:**

```typescript
interface ResponseOptimizer {
  // Pre-execution: Set expectations
  estimateResponseSize(tool: string): { tokens: number; truncateAt: number };

  // Post-execution: Process output
  optimizeOutput(tool: string, output: string): {
    content: string;
    wasTruncated: boolean;
    summarized: boolean;
  };

  // Context management
  fitsInContextWindow(currentContext: number, estimatedOutput: number): boolean;
}
```

---

## Tool Hierarchy (Your Choice: Explicit + Fallback)

### Israeli Government Data
```
Primary: datagov_query (priority: 95)
  └─ Fallback 1: perplexity-search (priority: 90)
      └─ Fallback 2: tavily-search (priority: 85)
```

### Research / Deep Analysis
```
Primary: perplexity-research (priority: 100)
  └─ Fallback 1: perplexity-ask (priority: 95)
      └─ Fallback 2: tavily-search (priority: 80)
```

### Quick Search / Facts
```
Primary: tavily-search (priority: 90)
  └─ Fallback 1: perplexity-search (priority: 85)
```

### File Operations
```
Primary: read_file / write_file (priority: 80)
  └─ No fallback (fail immediately)
```

---

## Latency Tiers (Tool-Dependent)

| Tier | Expected Latency | User Feedback | Tools |
|------|------------------|---------------|-------|
| **Fast** | < 3 seconds | Immediate response | time, fetch, filesystem, git |
| **Medium** | 3-15 seconds | "Searching..." | tavily, datagov_query |
| **Slow** | 15-120 seconds | Progress indicator | perplexity-research, perplexity-reason |
| **Very Slow** | 2-5 minutes | Detailed progress | perplexity-research (deep mode) |

---

## Implementation Phases

### Phase 1: Tool Intelligence Registry (Week 1)
1. Create `toolIntelligenceRegistry.ts` with metadata for all tools
2. Migrate existing priorities from `toolFilter.ts`
3. Add latency and response characteristics
4. Add fallback chains

### Phase 2: Universal Scoring (Week 1-2)
1. Generalize `scorePerplexityTools()` to `scoreAllTools()`
2. Apply same Hebrew intent detection to all categories
3. Add conflict resolution (e.g., DataGov vs Perplexity)
4. Integrate with existing `filterToolsByIntent()`

### Phase 3: Cascade Fallback (Week 2)
1. Add `executeWithFallback()` to `toolInvocation.ts`
2. Define retry conditions per tool
3. Add logging for fallback events
4. Preserve existing error handling

### Phase 4: Response Optimization (Week 2-3)
1. Add response size estimation
2. Implement smart truncation based on tool type
3. Add context window awareness
4. Integrate with existing token management

---

## Risk Mitigation

### Preserving Existing Functionality

1. **Don't modify working code directly** - Add new functions alongside existing ones
2. **Feature flags** - Use env vars to toggle new behavior
3. **Gradual rollout** - Apply new scoring only where tested
4. **Preserve caching** - Keep 30s TTL cache for tool filtering

### Testing Strategy

1. Unit tests for new scoring functions
2. Integration tests with mock MCP servers
3. A/B testing: old logic vs new logic
4. Monitor for regressions in DataGov accuracy

---

## User Decisions (APPROVED)

1. **Hierarchy**: DataGov > Perplexity > Tavily for Israeli data ✅

2. **Fallback Behavior**:
   - **CRITICAL: Users should NEVER see raw errors**
   - Cascade through ALL fallbacks silently
   - If all fail, provide meaningful guidance (not error messages)
   - Suggest how user can improve their query
   - Syntax/validation errors caught before reaching user

3. **Progress Indicators**:
   - Show tool name + action: "Researching with Perplexity..."
   - Transparent about what's happening

---

## Success Metrics

1. **Error Rate**: < 5% tool invocation failures
2. **Fallback Success**: > 80% recovery when primary fails
3. **Latency Accuracy**: Estimated vs actual within 50%
4. **Token Efficiency**: < 5% responses truncated
5. **User Satisfaction**: No regression in DataGov/Perplexity quality
