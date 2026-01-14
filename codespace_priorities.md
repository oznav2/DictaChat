# IMPLEMENTATION TASK BREAKDOWN

### Recommended Execution Order

**Critical Path:**
1. Phase 23 - v0.2.8 Bug Fixes (safeguards first)
2. Phase 22 - v0.2.9 Natural Selection
3. Phase 1 - Consolidate Memory Collections
4. Phase 4 - Fix UI/Backend Memory Sync

**Core Functionality :**
5. Phase 2 - Tool Result Memory Ingestion
6. Phase 3 - Document Hash Deduplication
7. Phase 7 - Memory Attribution in Responses
8. Phase 8 - Outcome Detection from User Follow-up

**Optimization:**
9. Phase 9 - Memory Prefetch Optimization
10. Phase 10 - Working Memory Lifecycle
11. Phase 11 - History Tier Management
12. Phase 12 - Wilson Score Time Decay

**Advanced Features:**
13. Phase 13 - Memory-First Decision Logic
14. Phase 14 - Embedding Circuit Breaker Improvements
15. Phase 15 - Search Service RRF Fusion
16. Phase 16 - Qdrant Adapter Improvements

**Infrastructure :**
17. Phase 17 - MongoDB Store Improvements
18. Phase 18 - Prompt Template System
19. Phase 19 - Action Outcomes Tracking
20. Phase 20 - Known Solutions Cache

**Polish :**
21. Phase 5 - Knowledge Graph Visualization Fix
22. Phase 6 - Trace Panel Deduplication
23. Phase 21 - Memory System Observability

---

## Phase 23 Implementation Priority

| Step | Priority | Effort | Risk | Dependencies |
|------|----------|--------|------|--------------|
| 23.1 Explicit Outcome Types | CRITICAL | Small | Low | None |
| 23.2 Wilson 10-Use Cap Fix | CRITICAL | Small | Medium | 22.3 |
| 23.3 Failed Increments Uses | CRITICAL | Tiny | Low | None |
| 23.4 Atomic Wilson Update | HIGH | Medium | Medium | 23.1-23.3 |

---

## Phase 23 Testing Checklist

### v0.2.8.1 Hotfix Tests
- [ ] Invalid outcome type ("typo") returns false, logs warning
- [ ] `unknown` outcome adds exactly 0.25 to success_count (not 0.5)
- [ ] `unknown` outcome adds exactly 0.0 to raw score (not 0.05)
- [ ] `partial` outcome adds exactly 0.5 to success_count
- [ ] Switch statement has no default case (TypeScript exhaustiveness)

### Wilson Score Bug Tests
- [ ] Memory with 50 uses, 45 worked has Wilson ~0.87 (not 0.8)
- [ ] Records without success_count use fallback calculation
- [ ] Fallback calculation logs warning (for migration tracking)
- [ ] Migration script backfills success_count correctly

### Failed Outcome Tests
- [ ] Failed outcome increments uses by 1
- [ ] Failed outcome increments failed_count by 1
- [ ] Failed outcome adds 0 to success_count
- [ ] Memory with 10 failures has Wilson ~0.0 (not 0.5)

### Atomicity Tests
- [ ] Concurrent outcome recording doesn't corrupt Wilson
- [ ] Race condition test: 10 parallel outcomes = uses=10
