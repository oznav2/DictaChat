# IMPLEMENTATION PRIORITIES & EXECUTION ORDER

**Version:** 2.1 (GPT-5.2 + Kimi Enterprise Requirements)
**Date:** January 14, 2026
**Reference:** `codespace_gaps_enhanced.md` v3.6

---

## Executive Summary

The execution order has been revised based on GPT-5.2 enterprise analysis and Kimi requirements to:
1. **Land safeguards FIRST** - Prevent learning on corrupt statistics
2. **Consolidate duplicate phases** - Avoid redundant work
3. **Prioritize wiring over new code** - Many functions exist but aren't called
4. **Enforce tool gating at runtime** - Not just prompt-level guidance (KIMI)
5. **Async ingestion by default** - No synchronous embedding on user path (KIMI)
6. **Defer DataGov until core reliability proven**

---

## Kimi Enterprise Requirements Summary

These requirements are **MANDATORY** for enterprise-grade reliability:

| Requirement | Section | Status |
|-------------|---------|--------|
| Enforceable Tool Gating | 0.3 | Must implement `decideToolGating()` |
| Async Ingestion Protocol | 0.4 | Store-then-embed, no sync upserts |
| Authoritative Outcome Semantics | 0.5 | Exact deltas in mapping table |
| Performance Baselines | 0.6 | Capture metrics before changes |
| Raw Stream Debugging | APPENDIX E | Never enable in production |
| DataGov Controls | APPENDIX F | Feature-flagged, resumable |

---

## Phase Consolidation (CRITICAL)

> **WARNING:** The original plan contains duplicate phases. These MUST be consolidated to avoid redundant work.

| Duplicate Phases | Canonical Phase | Action |
|------------------|-----------------|--------|
| Phase 3 + Phase 13 | **Phase 3** | Memory-First Tool Gating (merge all tasks into Phase 3) |
| Phase 2 + Phase 16 | **Phase 2** | Tool Result Ingestion (merge all tasks into Phase 2) |
| Phase 6 + Phase 20 | **Phase 6** | KG Label Rendering (merge all tasks into Phase 6) |
| Phase 8 + Phase 17 | **Phase 8** | Real-Time UI Updates (merge all tasks into Phase 8) |

**When implementing:** Reference the canonical phase only. Mark duplicate phases as "CONSOLIDATED" in progress tracking.

---

## Risk-Aware Execution Order

### TIER 1: Safeguards (MUST DO FIRST)

These phases establish correctness guarantees that all subsequent phases depend on.

| Order | Phase | Description | Risk Mitigated |
|-------|-------|-------------|----------------|
| 1 | **Phase 23** | v0.2.8 Bug Fixes (Safeguards) | Corrupt stats → bad learning |
| 2 | **Phase 22** | v0.2.9 Natural Selection | Incorrect scoring semantics |

**Why first?** Phase 23 fixes bugs that corrupt Wilson scores. If other phases land first, they will "learn" on bad data that can never be corrected.

### TIER 2: Core Data Integrity

| Order | Phase | Description | Risk Mitigated |
|-------|-------|-------------|----------------|
| 3 | **Phase 1** | Consolidate Memory Collections | Dual-collection divergence |
| 4 | **Phase 4** | Document Hash Deduplication | Storage bloat, search degradation |

### TIER 3: Memory-First Intelligence

| Order | Phase | Description | Risk Mitigated |
|-------|-------|-------------|----------------|
| 5 | **Phase 3** *(+13)* | Memory-First Tool Gating | Unnecessary tool calls |
| 6 | **Phase 2** *(+16)* | Tool Result Ingestion | Lost research value |
| 7 | **Phase 5** | Fix "0 Memories Found" | User trust erosion |

### TIER 4: Learning & Attribution

| Order | Phase | Description | Risk Mitigated |
|-------|-------|-------------|----------------|
| 8 | **Phase 7** | Memory Attribution | Can't track what helped |
| 9 | **Phase 8** *(+17)* | Outcome Detection + UI Updates | Silent failures |
| 10 | **Phase 12** | Wilson Score Time Decay | Stale data dominance |

### TIER 5: Search & Retrieval Quality

| Order | Phase | Description | Risk Mitigated |
|-------|-------|-------------|----------------|
| 11 | **Phase 15** | Search Service RRF Fusion | Poor relevance ranking |
| 12 | **Phase 19** | Action Outcomes Tracking | Tool effectiveness unknown |

### TIER 6: Platform Hardening

| Order | Phase | Description | Risk Mitigated |
|-------|-------|-------------|----------------|
| 13 | **Phase 24** | DictaLM Response Integrity | Silent parsing failures |
| 14 | **Phase 14** | Embedding Circuit Breaker | System lock-ups |

### TIER 7: Knowledge Expansion (After Core Stability)

| Order | Phase | Description | Risk Mitigated |
|-------|-------|-------------|----------------|
| 15 | **Phase 25** | DataGov Pre-Ingestion | Tool-dependent for gov data |

### TIER 8: Polish & Observability

| Order | Phase | Description | Risk Mitigated |
|-------|-------|-------------|----------------|
| 16 | **Phase 6** *(+20)* | KG Visualization Fix | Empty node names |
| 17 | **Phase 21** | Memory System Observability | Debugging difficulty |
| 18 | **Phase 9-11, 18** | Optimization & Templates | Performance gaps |

---

## Phase 23 Implementation Priority (FIRST)

> **THIS PHASE MUST BE IMPLEMENTED FIRST** - it establishes safeguards that prevent all subsequent phases from learning on corrupt statistics.

| Step | Priority | Effort | Risk | Dependencies |
|------|----------|--------|------|--------------|
| 23.1 Explicit Outcome Types | **CRITICAL** | Small | Low | None |
| 23.2 Wilson 10-Use Cap Fix | **CRITICAL** | Small | Medium | None |
| 23.3 Failed Increments Uses | **CRITICAL** | Tiny | Low | None |
| 23.4 Atomic Wilson Update | HIGH | Medium | Medium | 23.1-23.3 |

### Outcome Semantics Mapping Table (Authoritative)

| Outcome | `success_count` Delta | `uses` Increment | Wilson Impact | Promotion Effect |
|---------|----------------------|------------------|---------------|------------------|
| `worked` | +1.0 | +1 | Positive | Increases eligibility |
| `partial` | +0.5 | +1 | Neutral | Weak positive |
| `unknown` | +0.25 | +1 | Weak negative | Signals "not helpful" |
| `failed` | +0.0 | +1 | Strong negative | Blocks promotion |

---

## Phase 23 Testing Checklist

### v0.2.8.1 Hotfix Tests
- [ ] Invalid outcome type ("typo") returns false, logs warning
- [ ] `unknown` outcome adds exactly 0.25 to success_count (not 0.5)
- [ ] `partial` outcome adds exactly 0.5 to success_count
- [ ] Switch statement has no default case (TypeScript exhaustiveness)

### Wilson Score Bug Tests
- [ ] Memory with 50 uses, 45 worked has Wilson ~0.87 (not 0.8)
- [ ] Records without success_count use fallback calculation
- [ ] Fallback calculation logs warning (for migration tracking)

### Failed Outcome Tests
- [ ] Failed outcome increments uses by 1
- [ ] Failed outcome increments failed_count by 1
- [ ] Failed outcome adds 0 to success_count
- [ ] Memory with 10 failures has Wilson ~0.0 (not 0.5)

### Atomicity Tests
- [ ] Concurrent outcome recording doesn't corrupt Wilson
- [ ] Race condition test: 10 parallel outcomes = uses=10

---

## Phase 3 (+ Phase 13) Tool Gating Priority

> **CONSOLIDATION:** Phase 13 tasks merged into Phase 3.

| Step | Priority | Effort | Risk | Dependencies |
|------|----------|--------|------|--------------|
| 3.1 Reorder Flow (Memory Before Tools) | **HIGH** | Medium | Medium | Phase 23 |
| 3.2 Wire `shouldAllowTool()` | **HIGH** | Small | Low | 3.1 |
| 3.3 Wire `extractExplicitToolRequest()` | HIGH | Small | Low | 3.2 |
| 3.4 Wire `getContextualGuidance()` | HIGH | Small | Low | 3.1 |
| 3.5 Add Tool Skip Trace Event | Medium | Small | Low | 3.2 |
| 3.6 Implement `decideToolGating()` function | HIGH | Medium | Medium | 3.2-3.4 |

### Tool Gating Decision Function Pattern

```typescript
function decideToolGating(params: {
    retrievalConfidence: 'high' | 'medium' | 'low';
    explicitToolRequest: string | null;
    detectedHebrewIntent: 'research' | 'search' | 'general';
    memoryDegraded: boolean;
}): { allowedTools: Tool[]; traceExplanation: string }
```

---

## Phase 25 DataGov Priority

> **DEFER UNTIL TIER 7** - Only implement after core reliability is proven (Phases 23, 22, 1-5, 15, 24).

| Step | Priority | Effort | Risk | Dependencies |
|------|----------|--------|------|--------------|
| 25.1 Create Ingestion Service | HIGH | Large | Medium | Phase 23, 15, 21 |
| 25.2 Define Memory Types | HIGH | Small | Low | None |
| 25.3-25.5 Ingest Categories/Schemas/Expansions | HIGH | Large | Medium | 25.1, 25.2 |
| 25.6 Create KG Structure | Medium | Medium | Medium | Phase 6 |
| 25.7 Startup Integration | HIGH | Medium | High | 25.1-25.5 |
| 25.8 Memory Panel Filter | Medium | Medium | Low | 25.1 |
| 25.9 Hebrew Intent Detection | HIGH | Small | Low | Phase 3 |
| 25.10 Environment Configuration | HIGH | Tiny | Low | None |

### Critical Requirements for Phase 25

- [ ] Ingestion must be **idempotent** - safe to re-run
- [ ] Ingestion must be **incremental** - supports updates
- [ ] Ingestion must be **recoverable** - crash-safe with checkpoints
- [ ] Ingestion must be **resumable** - can continue from failure point
- [ ] Ingestion must be **feature-flagged** - `DATAGOV_PRELOAD_ENABLED=true`
- [ ] Ingestion must be **observable** - logs and metrics for monitoring

---

## Risk Assessment Summary

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Corrupt stats → bad learning | **High** | Medium | Phase 23 FIRST |
| Tool gating blocks needed tools | Medium | Medium | Explicit override detection |
| Tool ingestion bloats storage | **High** | **High** | Dedup by hash; async embedding |
| DataGov slows startup | **High** | Medium | Background/resumable; feature flag |
| Memory-first skips stale data | Medium | Medium | Time decay; override patterns |

---

## Definition of Ready (Before Starting Any Phase)

- [ ] Phase dependencies are complete
- [ ] Test fixtures defined
- [ ] Success criteria measurable
- [ ] Orchestration integration points identified (see Appendix A in gaps doc)

## Definition of Done (Per Phase)

- [ ] Success criteria met with evidence
- [ ] Unit tests passing (>80% coverage for new code)
- [ ] Integration tests for data-path changes
- [ ] Hebrew support verified
- [ ] Orchestration functions wired (not just imported)
- [ ] Async ingestion pattern followed (no sync embedding on user path) - KIMI
- [ ] Tool gating enforced at runtime (not just prompt guidance) - KIMI

---

## Kimi-Specific Implementation Checklists

### Tool Gating Enforcement (Phase 3)

- [ ] Create `src/lib/server/textGeneration/mcp/toolGatingDecision.ts`
- [ ] Implement `decideToolGating()` function with 5 rules
- [ ] Wire into `runMcpFlow.ts` after memory prefetch
- [ ] Emit trace event when tools are reduced
- [ ] Test: `memoryDegraded=true` → all tools allowed (fail-open)
- [ ] Test: `explicitToolRequest` set → all tools allowed
- [ ] Test: `retrievalConfidence='high'` + 3+ results → tools reduced

### Async Ingestion Protocol (Phase 2, 25)

- [ ] All `store()` calls set `needs_reindex: true`
- [ ] No `await embeddingClient.embed()` on user request path
- [ ] Fire-and-forget embedding queue implemented
- [ ] Deferred reindex endpoint wired to scheduler
- [ ] Per-tier caps enforced (working: 1000, history: 10000)

### Outcome Semantics Verification (Phase 23)

- [ ] `worked` → +1.0 success_count, +1 uses
- [ ] `partial` → +0.5 success_count, +1 uses
- [ ] `unknown` → +0.25 success_count, +1 uses
- [ ] `failed` → +0.0 success_count, +1 uses
- [ ] No default case in switch statement (TypeScript exhaustiveness)
- [ ] Wilson calculated from cumulative stats (not capped history)

### Raw Stream Debugging (Phase 24)

- [ ] `DEBUG_RAW_STREAM=false` by default
- [ ] Sampling at 1% when enabled
- [ ] Redaction of API keys, passwords, Bearer tokens
- [ ] Request ID correlation in logs
- [ ] JSON `"tool_calls"` parsing (not XML `<tool_call>`)

### DataGov Controls (Phase 25)

- [ ] `DATAGOV_PRELOAD_ENABLED=false` by default
- [ ] Background ingestion (non-blocking startup)
- [ ] Checkpoint storage for resumable ingestion
- [ ] KG node cap: 150 max (21 categories + 5 datasets each)
- [ ] Store-then-embed pattern (no sync embedding)

---

## Performance Baseline Capture (Before Any Phase)

| Metric | Capture Command | Target |
|--------|-----------------|--------|
| Memory prefetch P95 | `grep "prefetch" logs \| percentile 95` | <50ms |
| Search latency P95 | `grep "search_complete" logs \| percentile 95` | <100ms |
| Ingestion throughput | `count(ingestion_complete) / minute` | >50/min |
| Embedding QPS | `count(embed_request) / second` | >10/sec |

**Capture these BEFORE implementing any phase. Compare AFTER to ensure no regression.**

---

*Document Version: 2.1 (GPT-5.2 + Kimi Enterprise Requirements)*
*Last Updated: January 14, 2026*
*Reference: codespace_gaps_enhanced.md v3.6*
*Kimi Requirements: 12 enterprise controls integrated*
