# BricksLLM - Missing System Logs (Detailed Implementation Map)

This document provides a precise map of where to implement missing logs identified in `codespace_gaps.md`.

## Phase 1: Consolidate Memory Collections
| Log Statement | Target File | Location/Context |
|:--------------|:------------|:-----------------|
| `logger.info({ count, duration }, "[migration] memoryBank→memory_items complete");` | `src/lib/server/memory/migrations/consolidateMemoryBank.ts` | End of migration function |
| `logger.error({ err, itemId }, "[migration] Failed to migrate item");` | `src/lib/server/memory/migrations/consolidateMemoryBank.ts` | Inside catch block of migration loop |
| `logger.debug({ id, idType: ObjectId.isValid(id) ? 'objectId' : 'uuid' }, "[memory-bank] Update request");` | `src/routes/api/memory/memory-bank/[id]/+server.ts` | Top of PUT/DELETE handlers |
| `logger.warn("[memory-bank] Accessing deprecated collection memoryBank");` | `src/lib/server/database.ts` | Inside getter for `memoryBank` collection |

## Phase 2 & 16: Tool Result Ingestion
| Log Statement | Target File | Location/Context |
|:--------------|:------------|:-----------------|
| `logger.info({ toolName, outputLength, chunkCount }, "[tool-ingest] Storing tool result");` | `src/lib/server/memory/services/ToolResultIngestionService.ts` | Inside `ingestToolResult` after chunking |
| `logger.warn({ toolName, reason }, "[tool-ingest] Skipped - low quality output");` | `src/lib/server/memory/services/ToolResultIngestionService.ts` | Inside `ingestToolResult` quality check block |
| `logger.warn({ err, toolName }, "[mcp] Tool result ingestion failed (non-blocking)");` | `src/lib/server/textGeneration/mcp/toolInvocation.ts` | Inside catch block of `ingestToolResult` call (near line 1190) |
| `logger.info({ toolName, category }, "[tool-ingest] Stored result");` | `src/lib/server/textGeneration/mcp/toolInvocation.ts` | After successful ingestion call |
| `logger.info({ toolName, outputLen: output.length }, "[ingest] Tool result stored");` | `src/lib/server/textGeneration/mcp/toolInvocation.ts` | After successful storage in `ingestToolResult` |
| `logger.warn({ toolName }, "[ingest] Skipped - output too short");` | `src/lib/server/textGeneration/mcp/toolInvocation.ts` | Before storage, if output length < threshold |

## Phase 3 & 13: Memory-First Decision Logic (Tool Gating)
| Log Statement | Target File | Location/Context |
|:--------------|:------------|:-----------------|
| `logger.info({ confidence, resultCount }, "[mcp] HIGH confidence - considering tool skip");` | `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | After memory prefetch (around line 620) |
| `logger.info({ skippedTools, confidence, memoryHits }, "[mcp] Tool skip decision");` | `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | After `filterToolsByConfidence` call |
| `logger.info({ confidence: 'high' }, "[guidance] Injecting high-confidence memories");` | `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | Inside `buildContextualGuidance` high-confidence block |
| `logger.debug({ failureCount: failures.length }, "[guidance] Injected failure patterns");` | `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | Inside `buildContextualGuidance` after failure extraction |
| `logger.info({ confidence, toolCount }, "[filter] HIGH confidence - filtering search tools");` | `src/lib/server/textGeneration/mcp/toolFilter.ts` | Inside `filterToolsByConfidence` high-confidence check |
| `logger.info({ confidence, filteredCount }, "[tool-gate] Tools filtered by confidence");` | `src/lib/server/textGeneration/mcp/toolFilter.ts` | End of `filterToolsByConfidence` |
| `logger.debug({ skippedTools }, "[tool-gate] Skipped redundant search tools");` | `src/lib/server/textGeneration/mcp/toolFilter.ts` | Inside filtering loop for search tools |
| `logger.warn("[tool-gate] Allowing tool despite high confidence (explicit request)");` | `src/lib/server/textGeneration/mcp/toolFilter.ts` | Inside explicit request bypass block |

## Phase 4: Document Deduplication for Tool Calls
| Log Statement | Target File | Location/Context |
|:--------------|:------------|:-----------------|
| `logger.info({ contentHash, fileName }, "[mcp→memory] Document already in memory, skipping duplicate storage");` | `src/lib/server/textGeneration/mcp/toolInvocation.ts` | Inside `bridgeDoclingToMemory` after existence check |

## Phase 5: Fix "0 Memories Found" Issue
| Log Statement | Target File | Location/Context |
|:--------------|:------------|:-----------------|
| `logger.warn({ userId, count }, "[search] Found unindexed items - triggering background reindex");` | `src/lib/server/memory/search/SearchService.ts` | Inside `search` when results == 0 and `needsReindex` > 0 |

## Phase 11: Atomic Operations (Promotion)
| Log Statement | Target File | Location/Context |
|:--------------|:------------|:-----------------|
| `logger.info({ oldId, newId }, "[promotion] Created in history");` | `src/lib/server/memory/services/PromotionService.ts` | After successful creation in history tier |
| `logger.info({ itemId }, "[promotion] Archived from working");` | `src/lib/server/memory/services/PromotionService.ts` | After successful archival of working item |

## Phase 12: Wilson Score Time Decay
| Log Statement | Target File | Location/Context |
|:--------------|:------------|:-----------------|
| `logger.debug({ lastUsed, ageDays, weight }, "[outcome] Time weight calculated");` | `src/lib/server/memory/services/OutcomeServiceImpl.ts` | Inside `calculateTimeWeight` |
| `logger.warn({ memoryId }, "[outcome] Item not found");` | `src/lib/server/memory/services/OutcomeServiceImpl.ts` | Inside `recordOutcome` initial lookup failure |
| `logger.info({ memoryId, outcome, oldScore, newScore, delta, timeWeight }, "[outcome] Score updated with time decay");` | `src/lib/server/memory/services/OutcomeServiceImpl.ts` | Inside `recordOutcome` after score calculation |
| `logger.info({ memoryId, outcome, delta, timeWeight }, "[outcome] Recording with time decay");` | `src/lib/server/memory/services/OutcomeServiceImpl.ts` | End of `recordOutcome` |
| `logger.debug({ ageDays, decayFactor }, "[outcome] Time weight calculation");` | `src/lib/server/memory/services/OutcomeServiceImpl.ts` | Inside `calculateTimeWeight` detailed steps |
| `logger.warn({ memoryId, reason }, "[outcome] Failure recorded");` | `src/lib/server/memory/services/OutcomeServiceImpl.ts` | Inside `recordOutcome` when outcome == 'failed' |

## Phase 14: Cold-Start Injection
| Log Statement | Target File | Location/Context |
|:--------------|:------------|:-----------------|
| `logger.info({ conversationId }, "[cold-start] First message detected");` | `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | Inside `isFirstMessage` block (near line 500) |
| `logger.info({ docCount }, "[cold-start] Injected user profile");` | `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | After successful `getColdStartContext` and injection |
| `logger.info({ conversationId, isFirst: true }, "[cold-start] Injecting profile");` | `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | Start of cold-start injection logic |
| `logger.debug({ summary }, "[cold-start] Context preview");` | `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | After summary generation |
| `logger.warn({ conversationId }, "[cold-start] No profile found, proceeding without");` | `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | If `coldStartContext.summary` is empty |

## Phase 15: Causal Attribution (Memory Marks)
| Log Statement | Target File | Location/Context |
|:--------------|:------------|:-----------------|
| `logger.debug({ markCount }, "[marks] Parsed memory marks");` | `src/lib/server/textGeneration/mcp/memoryMarks.ts` | End of `parseMemoryMarks` |
| `logger.info({ marks }, "[attribution] Parsed memory marks from response");` | `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | After `parseMemoryMarks` call in flow |
| `logger.debug({ upvotes, downvotes }, "[attribution] Scoring memories based on marks");` | `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | During mark-to-outcome conversion loop |

## Phase 17: Frontend Real-Time Updates
| Log Statement | Target File | Location/Context |
|:--------------|:------------|:-----------------|
| `logger.debug({ event: data.type }, "[sse] Memory event received");` | `src/lib/stores/memoryUi.ts` | Inside `EventSource.onmessage` handler |

## Phase 18: Graceful Degradation
| Log Statement | Target File | Location/Context |
|:--------------|:------------|:-----------------|
| `logger.error({ err }, "[search] Failed, returning empty");` | `src/lib/server/memory/search/SearchService.ts` | Inside main `search` catch block |
| `logger.warn({ timeout: 15000 }, "[search] Timeout, returning empty results");` | `src/lib/server/memory/search/SearchService.ts` | Inside `timeoutFallback` or race rejection |
| `logger.error({ err }, "[search] Service error, graceful fallback");` | `src/lib/server/memory/search/SearchService.ts` | Inside catch block specifically for service-level errors |

## Phase 19: Hybrid Search with RRF
| Log Statement | Target File | Location/Context |
|:--------------|:------------|:-----------------|
| `logger.debug({ vectorCount, bm25Count }, "[search] Hybrid sources");` | `src/lib/server/memory/search/SearchService.ts` | Before RRF fusion |
| `logger.info({ fusedCount, rrfWeights }, "[search] RRF fusion complete");` | `src/lib/server/memory/search/SearchService.ts` | After RRF fusion |

## Phase 20: Knowledge Graph Node Names
| Log Statement | Target File | Location/Context |
|:--------------|:------------|:-----------------|
| `console.debug('[KG3D] Rendering node:', node.id, label);` | `src/lib/components/memory/KnowledgeGraph3D.svelte` | Inside node rendering loop/function |

---

## General Logging Standards (Phase 21)

All functions in the following files **must** implement Entry/Exit/Error logging:

1.  **`UnifiedMemoryFacade.ts`**: All public entry points for memory operations.
2.  **`SearchService.ts`**: Every step of the retrieval and fusion pipeline.
3.  **`KnowledgeGraphService.ts`**: Graph construction and debounce logic.
4.  **`PromotionService.ts`**: Item migration between tiers.
5.  **`OutcomeServiceImpl.ts`**: Feedback loop and score updates.
6.  **`runMcpFlow.ts`**: Orchestration milestones and tool/memory interleaving.
