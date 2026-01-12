# Ultimate Gap Fill Plan (GROUNDED)

# Enterprise-Grade Memory System - Based on Actual Codebase Analysis

## Executive Summary

**Analysis Date:** January 2026
**Method:** Systematic file-by-file reading of actual codebase
**Finding:** Backend 87% complete, Frontend/UI ~60% complete (higher than initially thought)

---

## CRITICAL CORRECTION: Roampal Analysis

**Previous Assumption:** Roampal has inline `[n]` citations in response text
**Actual Finding:** Roampal does NOT have inline citations - they use a collapsible citations section below the message, **exactly like BricksLLM already has**

This changes our priorities significantly.

---

## CRITICAL RULES

First think through the problem, read the codebase for relevant files.
Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.
Maintain a documentation file that describes how the implementation works inside and out.
Never speculate about code you have not opened. If the planreferences a specific file, you MUST read the file before implementing. Make sure to investigate and read relevant files BEFORE implementing. Never make any claims about code before investigating unless you are certain of the correct answer - give grounded and hallucination-free answers.

### Backend Engineering Standards (TypeScript + MongoDB)

#### API / service patterns

Keep controllers/handlers thin; business logic in services.

Use consistent error handling (typed errors if existing).

Return stable response shapes; don’t rename fields casually.

#### MongoDB best practices

Use explicit schemas/types for documents.

Use indexes when you introduce new query patterns.

Use atomic updates where possible ($set, $push, $addToSet, $inc).

Avoid unbounded queries; always consider pagination/limits.

Handle ObjectId safely; validate IDs at the edge.

#### Validation & typing

Validate request payloads (and query params) at the handler boundary.

Prefer discriminated unions for event/message types.

Never trust client-provided fields like userId—derive from codebase or auth/session.

#### Performance

Avoid N+1 queries; batch where possible.

Use projections to avoid over-fetching.

If adding realtime features (SSE/WebSocket), include backpressure / cleanup.

## What Actually Exists (Verified by Reading Files)

### Backend (87% - Confirmed)

| Feature                  | Status | File Location                                   |
| ------------------------ | ------ | ----------------------------------------------- |
| Wilson Score Ranking     | DONE   | `WilsonScoreService.ts`, `MemoryMongoStore.ts`  |
| RRF Hybrid Search        | DONE   | `MemoryRetrievalService.ts`                     |
| 3 Knowledge Graphs       | DONE   | `KnowledgeGraphService.ts`                      |
| Memory Tiers             | DONE   | `PromotionService.ts`                           |
| Outcome Learning         | DONE   | `memoryIntegration.ts:recordResponseOutcome()`  |
| Personality Injection    | DONE   | `PersonalityLoader.ts`                          |
| prefetchMemoryContext    | DONE   | `runMcpFlow.ts:464`                             |
| GhostRegistry            | DONE   | `UnifiedMemoryFacade.ts`                        |
| Search Position Tracking | DONE   | `memoryIntegration.ts:buildSearchPositionMap()` |

### Frontend - What EXISTS (Read Actual Files)

**TracePanel.svelte** (Lines 1-303):

- Shows document RAG processing steps (queued → running → done → error)
- Bilingual labels (Hebrew/English)
- Auto-collapse completed steps after 2 seconds
- RTL support
- **Does NOT show memory retrieval steps**

**MemoryContextIndicator.svelte** (Lines 1-296):

- Expandable "Known Context" section with tier labels
- Expandable "Citations" section with memory_id, tier, doc_id
- Confidence badges (high/medium/low) with GREEN/YELLOW/GRAY colors
- Feedback buttons (thumbs up/down) calling `/api/memory/feedback`
- RTL Hebrew support
- **Already has tier icons, confidence colors - contrary to original plan**

**memoryUi.ts** Store (Lines 1-446):

- Right dock management (search, memory, knowledge, health, latency tabs)
- `lastCitationsByMessageId`, `lastKnownContextTextByMessageId` tracking
- `feedbackEligibleByMessageId` state
- Streaming state tracking (`assistantStreamStarted`, `assistantStreamFinished`)
- Event dispatching system

**KnowledgeGraphPanel.svelte** (Lines 1-321):

- Concept list with type colors (routing=blue, content=green, action=purple)
- Usage count, success rate, time ago display
- Concept detail panel with outcomes breakdown (positive/partial/negative)
- Filter controls (time, sort)
- **Does NOT have D3.js visualization - only list view**

**MemoryPanel.svelte** (Lines 1-294):

- Tier statistics with color-coded bars
- Memory list with wilson scores
- Tier descriptions in Hebrew
- Health status indicator
- **Does NOT have virtual scrolling or memory detail modal**

**memoryIntegration.ts** (Lines 1-613):

- `prefetchMemoryContext()` - Full implementation with confidence
- `formatMemoryPromptSections()` - Injects personality + memory context
- `recordResponseOutcome()` - Records outcomes for learning
- `storeWorkingMemory()` - Stores exchanges
- `extractExplicitToolRequest()` - Detects tool requests in Hebrew/English
- Tool gating configuration based on confidence

---

## Actual Gaps (Based on File Analysis)

### Gap 1: TracePanel Not Showing Memory Operations

**Current:** TracePanel only shows document processing steps
**Missing:** No "Searching memories...", "Found N memories" steps during inference
**Impact:** Users don't see memory operations happening in real-time

### Gap 2: No Memory Detail Modal

**Current:** Clicking a memory in MemoryPanel does nothing
**Missing:** Full content view, outcomes history, archive/ghost/delete actions
**Impact:** Users can't inspect or manage individual memories

### Gap 3: No D3.js Knowledge Graph Visualization

**Current:** KnowledgeGraphPanel shows list view only
**Missing:** Force-directed graph showing concept relationships
**Impact:** Users can't visualize how concepts relate

### Gap 4: No Virtual Scrolling in Memory Lists

**Current:** Basic list rendering
**Missing:** Virtual scrolling for performance at scale
**Impact:** Will lag with 1000+ memories

### Gap 5: No Real-Time Memory Status During Streaming

**Current:** No visual indication during inference
**Missing:** Status updates in UI when searching/storing memories
**Impact:** Users don't know memory is being used

### Gap 6: No Graph API Endpoint

**Current:** `/api/memory/kg` returns concepts but not graph structure
**Missing:** Endpoint returning nodes/edges for visualization
**Impact:** Can't render D3.js graph

---

## Revised Phase Plan

## Phase 1: Memory Steps in TracePanel (HIGH PRIORITY)

**Goal:** Show memory operations in existing TracePanel infrastructure
**Effort:** 2-3 days

### 1.1 Add Memory Trace Steps Definition

**File:** `src/lib/server/textGeneration/mcp/constants/traceSteps.ts` (MODIFY)

Add memory-specific step definitions:

```typescript
export const MEMORY_TRACE_STEPS = {
	MEMORY_SEARCH: {
		id: "memory_search",
		label: { he: "מחפש בזיכרון...", en: "Searching memory..." },
	},
	MEMORY_FOUND: {
		id: "memory_found",
		label: { he: "נמצאו זיכרונות", en: "Found memories" },
	},
	MEMORY_INJECT: {
		id: "memory_inject",
		label: { he: "מזריק הקשר", en: "Injecting context" },
	},
	MEMORY_LEARN: {
		id: "memory_learn",
		label: { he: "לומד מתשובה", en: "Learning from response" },
	},
};
```

### 1.2 Emit Memory Trace Events from runMcpFlow

**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts` (MODIFY around line 460)

```typescript
// Before prefetchMemoryContext (line ~460)
yield {
  type: MessageTraceUpdateType.StepCreated,
  runId,
  step: {
    id: 'memory_search',
    parentId: null,
    label: MEMORY_TRACE_STEPS.MEMORY_SEARCH.label,
    status: 'running',
    timestamp: Date.now()
  }
};

// After prefetchMemoryContext returns
yield {
  type: MessageTraceUpdateType.StepStatus,
  runId,
  stepId: 'memory_search',
  status: 'done'
};

if (memoryResult.memoryContext) {
  yield {
    type: MessageTraceUpdateType.StepCreated,
    runId,
    step: {
      id: 'memory_found',
      parentId: null,
      label: {
        he: `נמצאו ${Object.keys(searchPositionMap).length} זיכרונות (${memoryResult.retrievalConfidence})`,
        en: `Found ${Object.keys(searchPositionMap).length} memories (${memoryResult.retrievalConfidence})`
      },
      status: 'done',
      timestamp: Date.now()
    }
  };
}
```

### 1.3 Show TracePanel for Memory Operations

**File:** `src/lib/components/chat/ChatWindow.svelte` (MODIFY)

Create a run for memory operations when starting inference:

```typescript
// When starting inference
if (memoryEnabled) {
	createRun(memoryRunId, detectLanguage(userQuery));
}
```

### Verification (Phase 1):

- [ ] TracePanel shows "Searching memory..." during prefetch
- [ ] "Found N memories (high/medium/low)" appears after prefetch
- [ ] Steps auto-collapse like document processing steps
- [ ] Hebrew labels work correctly

---

## Phase 2: Memory Detail Modal (HIGH PRIORITY)

**Goal:** Users can click memories to see full details and take actions
**Effort:** 2-3 days

### 2.1 Create Memory Detail Modal

**File:** `src/lib/components/memory/MemoryDetailModal.svelte` (CREATE)

```svelte
<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import Modal from "$lib/components/Modal.svelte";
	import type { MemoryTier } from "$lib/types/MemoryMeta";

	export let memory: {
		memory_id: string;
		tier: MemoryTier;
		content: string;
		wilson_score: number;
		outcomes?: { worked: number; failed: number; partial: number };
		tags?: string[];
		created_at: string;
		last_used?: string;
	} | null = null;

	export let open = false;

	const dispatch = createEventDispatcher();

	const tierLabels: Record<MemoryTier, string> = {
		working: "זיכרון עבודה",
		history: "היסטוריה",
		patterns: "דפוסים",
		books: "ספרים",
		memory_bank: "בנק זיכרון",
	};

	async function handleArchive() {
		if (!memory) return;
		const res = await fetch(`/api/memory/memory-bank/${memory.memory_id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status: "archived" }),
		});
		if (res.ok) {
			dispatch("archived", { id: memory.memory_id });
			open = false;
		}
	}

	async function handleGhost() {
		if (!memory) return;
		const res = await fetch("/api/memory/ghost", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				memoryId: memory.memory_id,
				tier: memory.tier,
				reason: "user_action",
			}),
		});
		if (res.ok) {
			dispatch("ghosted", { id: memory.memory_id });
			open = false;
		}
	}
</script>

<Modal bind:open size="lg">
	{#if memory}
		<div class="p-4" dir="rtl">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold">{tierLabels[memory.tier]}</h2>
				<span class="text-sm text-gray-400">
					{Math.round(memory.wilson_score * 100)}% Wilson Score
				</span>
			</div>

			<div class="mb-4 max-h-64 overflow-y-auto rounded-lg bg-gray-800 p-4">
				<p class="whitespace-pre-wrap">{memory.content}</p>
			</div>

			{#if memory.tags?.length}
				<div class="mb-4 flex flex-wrap gap-2">
					{#each memory.tags as tag}
						<span class="rounded bg-gray-700 px-2 py-0.5 text-xs">{tag}</span>
					{/each}
				</div>
			{/if}

			{#if memory.outcomes}
				<div class="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
					<div class="rounded bg-green-900/30 p-2">
						<div class="font-bold text-green-400">{memory.outcomes.worked}</div>
						<div class="text-gray-400">הצליח</div>
					</div>
					<div class="rounded bg-red-900/30 p-2">
						<div class="font-bold text-red-400">{memory.outcomes.failed}</div>
						<div class="text-gray-400">נכשל</div>
					</div>
					<div class="rounded bg-yellow-900/30 p-2">
						<div class="font-bold text-yellow-400">{memory.outcomes.partial}</div>
						<div class="text-gray-400">חלקי</div>
					</div>
				</div>
			{/if}

			<div class="mb-4 text-xs text-gray-500">
				נוצר: {new Date(memory.created_at).toLocaleString("he-IL")}
				{#if memory.last_used}
					| שימוש אחרון: {new Date(memory.last_used).toLocaleString("he-IL")}
				{/if}
			</div>

			<div class="flex gap-2 border-t border-gray-700 pt-2">
				<button
					class="rounded bg-gray-700 px-3 py-1.5 text-sm hover:bg-gray-600"
					on:click={handleArchive}
				>
					ארכיון
				</button>
				<button
					class="rounded bg-gray-700 px-3 py-1.5 text-sm hover:bg-gray-600"
					on:click={handleGhost}
				>
					הסתר
				</button>
			</div>
		</div>
	{/if}
</Modal>
```

### 2.2 Add Click Handler to MemoryPanel

**File:** `src/lib/components/memory/MemoryPanel.svelte` (MODIFY)

```svelte
<script lang="ts">
	import MemoryDetailModal from "./MemoryDetailModal.svelte";

	let selectedMemory: any = null;
	let detailOpen = false;

	function openDetail(memory: any) {
		selectedMemory = memory;
		detailOpen = true;
	}
</script>

<!-- In the memory list, wrap items with click handler -->
{#each memories as memory}
	<button type="button" class="w-full text-right ..." on:click={() => openDetail(memory)}>
		<!-- existing content -->
	</button>
{/each}

<MemoryDetailModal
	bind:open={detailOpen}
	memory={selectedMemory}
	on:archived={refresh}
	on:ghosted={refresh}
/>
```

### 2.3 Create Ghost API Endpoint

**File:** `src/routes/api/memory/ghost/+server.ts` (CREATE if not exists)

```typescript
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory/UnifiedMemoryFacade";
import { ADMIN_USER_ID } from "$lib/server/constants";

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { memoryId, tier, reason } = await request.json();

		const facade = UnifiedMemoryFacade.getInstance();
		await facade.ghostMemory(memoryId, tier, {
			reason: reason || "user_action",
			ghostedBy: ADMIN_USER_ID,
		});

		return json({ success: true });
	} catch (err) {
		console.error("[API] Ghost failed:", err);
		return json({ success: false, error: "Failed to ghost memory" }, { status: 500 });
	}
};
```

### Verification (Phase 2):

- [ ] Click memory in MemoryPanel opens modal
- [ ] Modal shows full content without truncation
- [ ] Outcomes stats display correctly
- [ ] Archive button works
- [ ] Ghost button works (memory disappears from list)
- [ ] Hebrew labels correct

---

## Phase 3: D3.js Knowledge Graph (MEDIUM PRIORITY)

**Goal:** Visualize concept relationships as force-directed graph
**Effort:** 3-4 days

### 3.1 Add Graph API Endpoint

**File:** `src/routes/api/memory/graph/+server.ts` (CREATE)

```typescript
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { ADMIN_USER_ID } from "$lib/server/constants";

export const GET: RequestHandler = async () => {
	try {
		// Get routing KG concepts
		const routingConcepts = await collections.memoryRoutingKG
			.find({ user_id: ADMIN_USER_ID })
			.sort({ hybrid_score: -1 })
			.limit(30)
			.toArray();

		// Get content KG entities
		const contentEntities = await collections.memoryContentKG
			.find({ user_id: ADMIN_USER_ID })
			.sort({ usage_count: -1 })
			.limit(20)
			.toArray();

		const nodes = [
			...routingConcepts.map((c) => ({
				id: `routing_${c.concept}`,
				concept: c.concept,
				type: "routing",
				score: c.hybrid_score || 0.5,
				usage: c.usage_count || 0,
			})),
			...contentEntities.map((e) => ({
				id: `content_${e.entity}`,
				concept: e.entity,
				type: "content",
				score: e.relevance_score || 0.5,
				usage: e.mention_count || 0,
			})),
		];

		// Create edges from related concepts
		const edges: Array<{ source: string; target: string; weight: number }> = [];
		for (const routing of routingConcepts) {
			const related = routing.related_concepts || [];
			for (const rel of related.slice(0, 3)) {
				const target = nodes.find((n) => n.concept === rel);
				if (target) {
					edges.push({
						source: `routing_${routing.concept}`,
						target: target.id,
						weight: 0.5,
					});
				}
			}
		}

		return json({ nodes, edges });
	} catch (err) {
		console.error("[API] Graph fetch failed:", err);
		return json({ nodes: [], edges: [] });
	}
};
```

### 3.2 Add D3.js Graph View to KnowledgeGraphPanel

**File:** `src/lib/components/memory/KnowledgeGraphPanel.svelte` (MODIFY)

Add graph view toggle and D3.js rendering (see original plan for full implementation).

### Verification (Phase 3):

- [ ] Toggle between list and graph view works
- [ ] Nodes render with correct colors by type
- [ ] Node sizes reflect score
- [ ] Drag interaction works
- [ ] Hebrew labels display correctly

---

## Phase 4: Virtual Scrolling (MEDIUM PRIORITY)

**Goal:** Handle 1000+ memories without lag
**Effort:** 2 days

### 4.1 Create VirtualList Component

**File:** `src/lib/components/common/VirtualList.svelte` (CREATE)

See original plan for implementation.

### 4.2 Apply to MemoryPanel

Replace direct list with VirtualList wrapper.

### Verification (Phase 4):

- [ ] 1000 memories render in <200ms
- [ ] Scrolling at 60fps
- [ ] Memory usage stays low

---

## Files Summary (Verified Against Actual Codebase)

### Files That Already Exist and Work:

| File                            | Status | Notes                                |
| ------------------------------- | ------ | ------------------------------------ |
| `TracePanel.svelte`             | EXISTS | Needs memory step additions          |
| `MemoryContextIndicator.svelte` | EXISTS | Already has confidence colors!       |
| `memoryUi.ts`                   | EXISTS | Already tracks citations             |
| `KnowledgeGraphPanel.svelte`    | EXISTS | Needs D3.js addition                 |
| `MemoryPanel.svelte`            | EXISTS | Needs click handler + virtual scroll |
| `memoryIntegration.ts`          | EXISTS | Full implementation                  |
| `runMcpFlow.ts`                 | EXISTS | Needs trace event emission           |

### Files to CREATE:

| File                          | Phase | Purpose                     |
| ----------------------------- | ----- | --------------------------- |
| `MemoryDetailModal.svelte`    | 2     | Memory inspection           |
| `api/memory/graph/+server.ts` | 3     | Graph data endpoint         |
| `api/memory/ghost/+server.ts` | 2     | Ghost endpoint (if missing) |
| `VirtualList.svelte`          | 4     | Performance                 |

### Files to MODIFY:

| File                         | Phase | Changes                       |
| ---------------------------- | ----- | ----------------------------- |
| `runMcpFlow.ts`              | 1     | Emit memory trace events      |
| `traceSteps.ts`              | 1     | Add memory step definitions   |
| `KnowledgeGraphPanel.svelte` | 3     | Add D3.js visualization       |
| `MemoryPanel.svelte`         | 2, 4  | Click handler, virtual scroll |

---

## Implementation Order

**Week 1:**

- Day 1-2: Phase 1 (Memory steps in TracePanel)
- Day 3-4: Phase 2 (Memory Detail Modal)
- Day 5: Testing, fixes

**Week 2:**

- Day 1-3: Phase 3 (D3.js Knowledge Graph)
- Day 4-5: Phase 4 (Virtual Scrolling) + End-to-end testing

---

## Key Corrections from Original Plan

1. **Inline Citations**: NOT needed - Roampal doesn't have them either. Our MemoryContextIndicator already provides citation display.

2. **Confidence Colors**: Already exist in MemoryContextIndicator.svelte (lines 92-101).

3. **Tier Labels**: Already exist in MemoryContextIndicator.svelte (lines 81-90).

4. **Citation Tooltip**: NOT needed as separate component - citations are already expandable.

5. **Memory Events**: Should use existing TracePanel infrastructure, not custom events.

---

---

## Phase 5: Cross-Personality Memory Persistence (CRITICAL)

**Goal:** Memories collected by one personality are accessible to ALL personalities
**Effort:** 4-5 days
**Rationale:** User stated: "the personalities should be wired and each personality knowledge added or learned persist even if the user started a new chat with different personality"

### 5.1 Schema Changes for Memory-Personality Link

**File:** `src/lib/server/memory/stores/schemas.ts` (MODIFY)

Add new fields to `MemoryItemDocument`:

```typescript
export interface MemoryItemDocument {
	// ... existing fields ...

	// NEW: Personality tracking
	source_personality_id: string | null; // Which personality collected this (null = default)
	source_personality_name: string | null; // Display name for attribution

	// NEW: Bilingual support
	language: "he" | "en" | "mixed"; // Primary language of content
	translation_ref_id: string | null; // Points to semantically equivalent memory in other language
}
```

**File:** `src/lib/types/MemoryBankItem.ts` (MODIFY)

```typescript
export interface MemoryBankItem {
	// ... existing fields ...

	// NEW: Cross-personality fields
	sourcePersonalityId?: string; // null = default assistant
	sourcePersonalityName?: string;
	language?: "he" | "en" | "mixed";
	translationRefId?: string;
}
```

### 5.2 Personality-Memory Mapping Collection

**File:** `src/lib/types/PersonalityMemoryMapping.ts` (CREATE)

```typescript
import type { ObjectId } from "mongodb";

/**
 * Tracks which personality collected each memory
 * Enables "this memory came from your Teacher persona" attribution
 */
export interface PersonalityMemoryMapping {
	_id: ObjectId;
	userId: string;
	personalityId: string; // References userPersonality._id or 'default'
	personalityName: string;
	memoryIds: string[]; // References memory_items.memory_id
	createdAt: Date;
	updatedAt: Date;
}
```

### 5.3 Add Collection to Database

**File:** `src/lib/server/database.ts` (MODIFY)

```typescript
import type { PersonalityMemoryMapping } from "$lib/types/PersonalityMemoryMapping";

// In getCollections():
const personalityMemoryMapping = db.collection<PersonalityMemoryMapping>(
	"personalityMemoryMapping"
);

return {
	// ... existing ...
	personalityMemoryMapping,
};
```

### 5.4 Update Memory Storage to Track Personality

**File:** `src/lib/server/memory/stores/MemoryMongoStore.ts` (MODIFY)

In `storeMemory()` method, accept personality context:

```typescript
async storeMemory(params: {
  userId: string;
  content: string;
  tier: MemoryTier;
  // NEW
  personalityId?: string;
  personalityName?: string;
  language?: "he" | "en" | "mixed";
}): Promise<MemoryItem> {
  const doc: MemoryItemDocument = {
    // ... existing ...
    source_personality_id: params.personalityId || null,
    source_personality_name: params.personalityName || null,
    language: params.language || detectLanguage(params.content),
  };
  // ...
}
```

### 5.5 Cross-Personality Search in Retrieval Service

**File:** `src/lib/server/memory/retrieval/MemoryRetrievalService.ts` (MODIFY)

Search should query ALL user memories regardless of source personality:

```typescript
// Memory retrieval ALWAYS searches all personalities for the user
// The source_personality_id is for ATTRIBUTION only, not filtering

async search(params: {
  userId: string;
  query: string;
  // NEW: Include personality context for attribution display
  includePersonalityAttribution?: boolean;
}): Promise<SearchResult[]> {
  // Search ALL memories for user (no personality filter)
  const results = await this.vectorSearch(params.userId, params.query);

  if (params.includePersonalityAttribution) {
    // Add personality attribution to results
    return results.map(r => ({
      ...r,
      sourcePersonality: r.source_personality_name || 'Default'
    }));
  }
  return results;
}
```

### 5.6 Wire Active Personality to Memory Storage

**File:** `src/lib/server/textGeneration/mcp/memoryIntegration.ts` (MODIFY)

```typescript
export async function storeWorkingMemory(params: {
	// ... existing ...
	personalityId?: string;
	personalityName?: string;
}): Promise<void> {
	await facade.storeMemory({
		userId: params.userId,
		content: params.content,
		tier: "working",
		source: "conversation",
		// NEW: Include personality context
		personalityId: params.personalityId,
		personalityName: params.personalityName,
	});
}
```

### 5.7 Get Active Personality from Conversation

**File:** `src/lib/server/textGeneration/mcp/runMcpFlow.ts` (MODIFY around line 350)

```typescript
// Get active personality for this conversation
const conversation = await collections.conversations.findOne({ _id: convId });
const activePersonality = conversation?.personalityId
	? await loader.getPersonalityById(conversation.personalityId)
	: { id: "default", name: "DictaChat" };

// Pass to memory storage
await storeWorkingMemory({
	userId,
	content: exchangeSummary,
	personalityId: activePersonality.id,
	personalityName: activePersonality.name,
});
```

### Verification (Phase 5):

- [ ] Create "Teacher" personality and have conversation about a topic
- [ ] Switch to "Default" personality and ask about that topic
- [ ] Default should find memories with attribution "from Teacher persona"
- [ ] New personality can see ALL user memories, not just its own
- [ ] Memory panel shows which personality collected each memory

---

## Phase 6: Bilingual Memory Synchronization (CRITICAL)

**Goal:** Hebrew and English memories cross-reference each other
**Effort:** 3-4 days
**Rationale:** User stated: "the memory system should be clever enough to display the d3.js graph with hebrew nodes and entities... memories collected due course of chat that was conducted in english will remain outside the scope of chat conducted in hebrew and vice versa"

### 6.1 Language Detection Utility

**File:** `src/lib/server/memory/utils/languageDetection.ts` (CREATE)

```typescript
/**
 * Detect primary language of text
 * Hebrew characters: \u0590-\u05FF
 */
export function detectLanguage(text: string): "he" | "en" | "mixed" {
	const hebrewPattern = /[\u0590-\u05FF]/g;
	const hebrewMatches = text.match(hebrewPattern) || [];
	const totalChars = text.replace(/\s/g, "").length;

	if (totalChars === 0) return "en";

	const hebrewRatio = hebrewMatches.length / totalChars;

	if (hebrewRatio > 0.7) return "he";
	if (hebrewRatio < 0.1) return "en";
	return "mixed";
}

/**
 * Normalize text for cross-lingual matching
 */
export function normalizeForMatching(text: string): string {
	return text
		.toLowerCase()
		.replace(/[\u0591-\u05C7]/g, "") // Remove Hebrew diacritics
		.trim();
}
```

### 6.2 Bilingual Entity Mapping Collection

**File:** `src/lib/types/BilingualEntityMap.ts` (CREATE)

```typescript
import type { ObjectId } from "mongodb";

/**
 * Maps entities between Hebrew and English
 * Pre-populated with common terms, grows from usage
 */
export interface BilingualEntityMap {
	_id: ObjectId;
	userId: string | null; // null = global/system mapping

	// Entity in both languages
	hebrewForm: string; // e.g., "בינה מלאכותית"
	englishForm: string; // e.g., "artificial intelligence"

	// Normalization for search
	hebrewNormalized: string;
	englishNormalized: string;

	// Metadata
	confidence: number; // How confident is this mapping
	source: "system" | "user" | "auto_detected";
	usageCount: number;

	createdAt: Date;
	updatedAt: Date;
}
```

### 6.3 Seed Common Bilingual Mappings

**File:** `src/lib/server/memory/seed/bilingualEntities.ts` (CREATE)

```typescript
export const COMMON_BILINGUAL_ENTITIES = [
	// Technology
	{ he: "בינה מלאכותית", en: "artificial intelligence" },
	{ he: "למידת מכונה", en: "machine learning" },
	{ he: "למידה עמוקה", en: "deep learning" },
	{ he: "רשת נוירונים", en: "neural network" },
	{ he: "מודל שפה", en: "language model" },

	// Programming
	{ he: "תכנות", en: "programming" },
	{ he: "קוד", en: "code" },
	{ he: "פונקציה", en: "function" },
	{ he: "משתנה", en: "variable" },
	{ he: "מחלקה", en: "class" },

	// Data
	{ he: "נתונים", en: "data" },
	{ he: "מסד נתונים", en: "database" },
	{ he: "שאילתה", en: "query" },
	{ he: "חיפוש", en: "search" },

	// Israeli Government
	{ he: "משרד הפנים", en: "Ministry of Interior" },
	{ he: "משרד הבריאות", en: "Ministry of Health" },
	{ he: "רשות המיסים", en: "Tax Authority" },
	{ he: "ביטוח לאומי", en: "National Insurance" },
	{ he: "משרד התחבורה", en: "Ministry of Transport" },

	// Common terms
	{ he: "ירושלים", en: "Jerusalem" },
	{ he: "תל אביב", en: "Tel Aviv" },
	{ he: "ישראל", en: "Israel" },
];
```

### 6.4 Cross-Lingual Search Enhancement

**File:** `src/lib/server/memory/retrieval/MemoryRetrievalService.ts` (MODIFY)

Add bilingual query expansion:

```typescript
async search(params: {
  userId: string;
  query: string;
  expandBilingual?: boolean;  // NEW
}): Promise<SearchResult[]> {
  const queryLanguage = detectLanguage(params.query);
  let expandedQueries = [params.query];

  if (params.expandBilingual) {
    // Get translations for known entities in query
    const translations = await this.getBilingualExpansions(
      params.userId,
      params.query,
      queryLanguage
    );
    expandedQueries = [params.query, ...translations];
  }

  // Search with all query variants
  const allResults: SearchResult[][] = await Promise.all(
    expandedQueries.map(q => this.vectorSearch(params.userId, q))
  );

  // Deduplicate and merge results
  return this.deduplicateResults(allResults.flat());
}

private async getBilingualExpansions(
  userId: string,
  query: string,
  sourceLanguage: "he" | "en" | "mixed"
): Promise<string[]> {
  const mappings = await collections.bilingualEntityMap.find({
    $or: [{ userId }, { userId: null }],  // User + global mappings
  }).toArray();

  let expandedQuery = query;
  for (const mapping of mappings) {
    if (sourceLanguage === "he" && query.includes(mapping.hebrewForm)) {
      expandedQuery = expandedQuery.replace(mapping.hebrewForm, mapping.englishForm);
    } else if (sourceLanguage === "en" && query.toLowerCase().includes(mapping.englishNormalized)) {
      expandedQuery = expandedQuery.replace(new RegExp(mapping.englishForm, 'gi'), mapping.hebrewForm);
    }
  }

  return expandedQuery !== query ? [expandedQuery] : [];
}
```

### 6.5 Update KG Nodes with Bilingual Labels

**File:** `src/lib/server/memory/stores/schemas.ts` (MODIFY)

```typescript
export interface KgNodeDocument {
	// ... existing fields ...

	// NEW: Bilingual support
	translations: {
		he?: string;
		en?: string;
	};
	source_language: "he" | "en";
}
```

### 6.6 Hebrew-First D3.js Display

**File:** `src/lib/components/memory/KnowledgeGraphPanel.svelte` (MODIFY)

```svelte
<script lang="ts">
	// Display preference: Hebrew first for Israeli users
	function getNodeLabel(node: GraphNode): string {
		if (node.translations?.he) {
			return node.translations.he;
		}
		return node.concept;
	}
</script>
```

### Verification (Phase 6):

- [ ] Query in Hebrew finds memories stored in English
- [ ] Query in English finds memories stored in Hebrew
- [ ] D3.js graph shows Hebrew labels by default
- [ ] Entity "artificial intelligence" matches "בינה מלאכותית"
- [ ] New entity pairs are auto-detected and stored

---

## Phase 7: DataGov & MCP Tool Pre-Seeding (CRITICAL)

**Goal:** Memory system knows about all available tools and DataGov capabilities
**Effort:** 2-3 days
**Rationale:** User asked: "what about datagov and preparing the memory system with all the relevant information? what about preparing the memory system for every tool and capability the mcp server has"

### 7.1 System Memory Tier

**File:** `src/lib/server/memory/types.ts` (MODIFY)

Add system tier:

```typescript
export type MemoryTier = "working" | "history" | "patterns" | "books" | "memory_bank" | "system"; // NEW: Pre-seeded system knowledge
```

### 7.2 MCP Tool Registry Seeding

**File:** `src/lib/server/memory/seed/mcpToolSeeder.ts` (CREATE)

```typescript
import { collections } from "$lib/server/database";
import { logger } from "$lib/server/logger";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { config } from "$lib/server/config";

interface McpToolSchema {
	name: string;
	description: string;
	capabilities: string[];
	parameters: Record<string, unknown>;
	examples: string[];
}

/**
 * Seeds memory system with all MCP tool capabilities
 * Run once at startup or on tool registry changes
 */
export async function seedMcpTools(): Promise<void> {
	const mcpServers = JSON.parse(config.MCP_SERVERS || "[]");

	for (const server of mcpServers) {
		try {
			// Fetch tool list from MCP server
			const tools = await fetchMcpTools(server.url);

			for (const tool of tools) {
				// Store tool as system memory
				await collections.memoryItems.updateOne(
					{
						user_id: ADMIN_USER_ID,
						tier: "system",
						"source.tool_name": tool.name,
					},
					{
						$set: {
							memory_id: `system_tool_${tool.name}`,
							user_id: ADMIN_USER_ID,
							tier: "system",
							status: "active",
							text: formatToolDescription(tool),
							summary: tool.description,
							tags: ["mcp_tool", ...tool.capabilities],
							entities: [tool.name, ...extractEntities(tool)],
							always_inject: false, // Inject when tool-related query detected
							source: {
								type: "system_seed",
								tool_name: tool.name,
							},
							quality: {
								importance: 0.9,
								confidence: 1.0,
								quality_score: 1.0,
							},
							updated_at: new Date(),
						},
						$setOnInsert: {
							created_at: new Date(),
						},
					},
					{ upsert: true }
				);
			}

			logger.info({ server: server.name, toolCount: tools.length }, "Seeded MCP tools");
		} catch (err) {
			logger.error({ err, server: server.name }, "Failed to seed MCP tools");
		}
	}
}

function formatToolDescription(tool: McpToolSchema): string {
	return `
Tool: ${tool.name}
Description: ${tool.description}
Capabilities: ${tool.capabilities.join(", ")}
Parameters: ${JSON.stringify(tool.parameters, null, 2)}
Examples:
${tool.examples.map((e) => `  - ${e}`).join("\n")}
`.trim();
}
```

### 7.3 DataGov Categories Seeding

**File:** `src/lib/server/memory/seed/datagovSeeder.ts` (CREATE)

```typescript
import { collections } from "$lib/server/database";
import { ADMIN_USER_ID } from "$lib/server/constants";

/**
 * DataGov categories and capabilities from enterprise_expansions.py
 */
const DATAGOV_CATEGORIES = [
	{
		category: "תחבורה",
		category_en: "Transportation",
		datasets: ["רכבים", "רישיונות", "תאונות", "תחבורה ציבורית"],
		capabilities: ["vehicle_lookup", "license_status", "accident_stats"],
		example_queries: ["כמה רכבים מסוג טויוטה?", "סטטיסטיקת תאונות דרכים", "בדיקת רישיון נהיגה"],
	},
	{
		category: "בריאות",
		category_en: "Health",
		datasets: ["בתי חולים", "קופות חולים", "תרופות", "מדדי בריאות"],
		capabilities: ["hospital_search", "medication_lookup", "health_stats"],
		example_queries: ["בתי חולים בירושלים", "מידע על תרופה", "סטטיסטיקת תחלואה"],
	},
	// ... 20 more categories from enterprise_expansions.py
];

export async function seedDataGovCategories(): Promise<void> {
	for (const cat of DATAGOV_CATEGORIES) {
		await collections.memoryItems.updateOne(
			{
				user_id: ADMIN_USER_ID,
				tier: "system",
				tags: { $all: ["datagov", cat.category] },
			},
			{
				$set: {
					memory_id: `system_datagov_${cat.category_en.toLowerCase().replace(/\s/g, "_")}`,
					user_id: ADMIN_USER_ID,
					tier: "system",
					status: "active",
					text: formatDataGovCategory(cat),
					summary: `DataGov: ${cat.category} (${cat.category_en})`,
					tags: ["datagov", "system_knowledge", cat.category, cat.category_en],
					entities: [cat.category, cat.category_en, ...cat.datasets],
					always_inject: false,
					source: { type: "system_seed" },
					quality: { importance: 0.85, confidence: 1.0, quality_score: 1.0 },
					// Bilingual support
					language: "he",
					updated_at: new Date(),
				},
				$setOnInsert: { created_at: new Date() },
			},
			{ upsert: true }
		);
	}
}

function formatDataGovCategory(cat: (typeof DATAGOV_CATEGORIES)[0]): string {
	return `
קטגוריה: ${cat.category} (${cat.category_en})
מאגרים זמינים: ${cat.datasets.join(", ")}
יכולות: ${cat.capabilities.join(", ")}
שאילתות לדוגמה:
${cat.example_queries.map((q) => `  - ${q}`).join("\n")}
`.trim();
}
```

### 7.4 Run Seeding on Startup

**File:** `src/hooks.server.ts` (MODIFY)

```typescript
import { seedMcpTools } from "$lib/server/memory/seed/mcpToolSeeder";
import { seedDataGovCategories } from "$lib/server/memory/seed/datagovSeeder";

// Run seeding on first request (or app start)
let seeded = false;
export async function handle({ event, resolve }) {
	if (!seeded) {
		await seedMcpTools();
		await seedDataGovCategories();
		seeded = true;
	}
	return resolve(event);
}
```

### 7.5 Inject System Knowledge When Relevant

**File:** `src/lib/server/textGeneration/mcp/memoryIntegration.ts` (MODIFY)

```typescript
export async function prefetchMemoryContext(/* ... */): Promise<MemoryContextResult> {
	// ... existing search ...

	// Also check system tier for tool/datagov queries
	const toolIntent = extractExplicitToolRequest(query);
	if (toolIntent) {
		const systemMemories = await facade.search({
			userId,
			query: toolIntent,
			tiers: ["system"], // Only system tier
			limit: 3,
		});

		// Prepend system knowledge to context
		if (systemMemories.length > 0) {
			memoryContext = formatSystemKnowledge(systemMemories) + "\n" + memoryContext;
		}
	}

	return { memoryContext, citations, retrievalConfidence };
}
```

### Verification (Phase 7):

- [ ] After startup, system tier contains MCP tool descriptions
- [ ] DataGov categories are seeded with Hebrew + English
- [ ] Query "what tools can search the web?" retrieves tool descriptions
- [ ] Query "מה יש ב-DataGov על תחבורה?" retrieves DataGov categories
- [ ] System memories never expire or get archived

---

## Phase 8: Personality UI Integration (HIGH PRIORITY)

**Goal:** Users see personality context in chat UI
**Effort:** 2-3 days
**Rationale:** User stated: "the user ui experience should of course be such that the user will clearly indicate on the navbar the personality name as colored badge next to each chat title"

### 8.1 Add Personality Badge to Conversation

**File:** `src/lib/types/Conversation.ts` (MODIFY)

```typescript
export interface Conversation extends Timestamps {
	// ... existing fields ...

	// NEW: Personality tracking for UI
	personalityId?: string; // References userPersonality._id or 'default'
	personalityBadge?: {
		name: string;
		color: string; // Tailwind color class or hex
	};
}
```

### 8.2 Set Personality When Creating Conversation

**File:** `src/routes/conversation/+server.ts` (MODIFY)

```typescript
// When creating new conversation, capture active personality
const activePersonality = await getActivePersonality(userId);

const conversation: Conversation = {
	// ... existing ...
	personalityId: activePersonality?.id || "default",
	personalityBadge: {
		name: activePersonality?.name || "DictaChat",
		color: activePersonality?.color || "bg-gray-500",
	},
};
```

### 8.3 Personality Selector with Colors

**File:** `src/lib/components/personality/PersonalitySelector.svelte` (CREATE)

```svelte
<script lang="ts">
	import { createEventDispatcher } from "svelte";

	export let personalities: Array<{
		id: string;
		name: string;
		color: string;
		isActive: boolean;
	}> = [];

	const dispatch = createEventDispatcher();

	function selectPersonality(id: string) {
		dispatch("select", { id });
	}
</script>

<div class="flex flex-wrap gap-2" dir="rtl">
	{#each personalities as p}
		<button
			type="button"
			class="rounded-full px-3 py-1.5 text-sm font-medium transition-all
             {p.isActive ? 'ring-2 ring-white' : 'opacity-70 hover:opacity-100'}
             {p.color}"
			on:click={() => selectPersonality(p.id)}
		>
			{p.name}
		</button>
	{/each}
</div>
```

### 8.4 Chat Title with Personality Badge

**File:** `src/lib/components/chat/ChatTitle.svelte` (CREATE)

```svelte
<script lang="ts">
	export let title: string;
	export let personalityBadge: { name: string; color: string } | undefined;
</script>

<div class="flex items-center gap-2">
	<span class="truncate">{title}</span>
	{#if personalityBadge}
		<span class="rounded-full px-2 py-0.5 text-xs text-white {personalityBadge.color}">
			{personalityBadge.name}
		</span>
	{/if}
</div>
```

### 8.5 Show Badge in Conversation List

**File:** `src/lib/components/NavConversationItem.svelte` (MODIFY)

```svelte
<script lang="ts">
	import ChatTitle from "./chat/ChatTitle.svelte";

	export let conv: Conversation;
</script>

<ChatTitle title={conv.title} personalityBadge={conv.personalityBadge} />
```

### 8.6 Default Personality Colors

**File:** `src/lib/server/memory/personality/personalityColors.ts` (CREATE)

```typescript
export const PERSONALITY_COLORS = {
	default: "bg-gray-500",
	friendly: "bg-blue-500",
	technical: "bg-green-500",
	creative: "bg-purple-500",
	teacher: "bg-orange-500",
	researcher: "bg-cyan-500",
	// User-defined personalities get auto-assigned from rotation
};

export function getNextPersonalityColor(existingColors: string[]): string {
	const available = Object.values(PERSONALITY_COLORS);
	return available.find((c) => !existingColors.includes(c)) || "bg-indigo-500";
}
```

### Verification (Phase 8):

- [ ] New conversation shows personality badge in title
- [ ] Conversation list shows colored badges
- [ ] Switching personality creates conversation with new badge
- [ ] Badge color is consistent across views
- [ ] Hebrew personality names display correctly

---

## Database Migration Plan

### New Collections to Create:

1. `personalityMemoryMapping` - Maps personalities to collected memories
2. `bilingualEntityMap` - Hebrew↔English entity translations

### Existing Collections to Update:

1. `memory_items` - Add `source_personality_id`, `language`, `translation_ref_id`
2. `kg_nodes` - Add `translations`, `source_language`
3. `conversations` - Add `personalityId`, `personalityBadge`
4. `userPersonality` - Add `color` field

### Migration Script:

```typescript
// migrations/add_personality_memory_fields.ts
async function migratePersonalityMemoryFields() {
	// Add default values to existing memories
	await collections.memoryItems.updateMany(
		{ source_personality_id: { $exists: false } },
		{
			$set: {
				source_personality_id: null,
				source_personality_name: null,
				language: "he", // Assume Hebrew for existing
				translation_ref_id: null,
			},
		}
	);

	// Add translations field to KG nodes
	await collections.kg_nodes.updateMany(
		{ translations: { $exists: false } },
		{ $set: { translations: {}, source_language: "he" } }
	);

	// Add personality badge to existing conversations
	await collections.conversations.updateMany(
		{ personalityBadge: { $exists: false } },
		{
			$set: {
				personalityId: "default",
				personalityBadge: { name: "DictaChat", color: "bg-gray-500" },
			},
		}
	);
}
```

---

## Success Criteria (Phases 5-8)

1. TracePanel shows memory search/found steps during inference
2. Users can click memories to see full details and manage them
3. Knowledge graph visualizes concept relationships
4. UI remains responsive with 1000+ memories
5. Hebrew RTL works throughout
6. No TypeScript errors
7. **NEW:** Memories from "Teacher" personality visible in "Default" chat
8. **NEW:** Hebrew query finds English memories (and vice versa)
9. **NEW:** System knows about all MCP tools and DataGov categories
10. **NEW:** Personality badges appear next to chat titles

---

## Implementation Order (Complete)

**Week 1:**

- Day 1-2: Phase 1 (Memory steps in TracePanel)
- Day 3-4: Phase 2 (Memory Detail Modal)
- Day 5: Testing, fixes

**Week 2:**

- Day 1-3: Phase 3 (D3.js Knowledge Graph)
- Day 4-5: Phase 4 (Virtual Scrolling) + End-to-end testing

**Week 3:**

- Day 1-2: Phase 5 (Cross-Personality Memory)
- Day 3-4: Phase 6 (Bilingual Memory System)
- Day 5: Integration testing

**Week 4:**

- Day 1-2: Phase 7 (DataGov/MCP Pre-seeding)
- Day 3-4: Phase 8 (Personality UI)
- Day 5: Full system testing, documentation

---

## Key Corrections from Original Plan

1. **Inline Citations**: NOT needed - Roampal doesn't have them either. Our MemoryContextIndicator already provides citation display.

2. **Confidence Colors**: Already exist in MemoryContextIndicator.svelte (lines 92-101).

3. **Tier Labels**: Already exist in MemoryContextIndicator.svelte (lines 81-90).

4. **Citation Tooltip**: NOT needed as separate component - citations are already expandable.

5. **Memory Events**: Should use existing TracePanel infrastructure, not custom events.

6. **NEW: Cross-Personality**: Memories keyed by user_id only, personality is for ATTRIBUTION not FILTERING.

7. **NEW: Bilingual**: Search expands query to both languages, KG nodes have translations object.

8. **NEW: System Tier**: Pre-seeded knowledge never expires, injected when relevant.

---

## Phase 9: Enhanced Source Attribution & Modal Improvements (HIGH PRIORITY)

**Goal:** Users see exactly where each memory came from with bilingual badges
**Effort:** 4-5 days
**Rationale:** User stated: "the memory bank should display the tool used, the linked read and short description of the information collected during the particular chat. the user hence will be able to actively grow with the system"

**Key Finding:** Roampal does NOT have source attribution - this is a competitive advantage for BricksLLM.

### 9.1 Schema Enhancement for Source Attribution

**File:** `src/lib/server/memory/stores/schemas.ts` (MODIFY)

Extend the `source` field in `MemoryItemDocument`:

```typescript
export interface MemoryItemDocument {
	// ... existing fields ...

	source: {
		type: MemorySourceType;
		conversation_id: string | null;
		message_id: string | null;
		tool_name: string | null;
		tool_run_id: string | null;
		doc_id: string | null;
		chunk_id: string | null;
		book?: { title: string; author?: string; chapter?: string };

		// NEW: Enhanced attribution
		url: string | null; // The URL read by fetch/tavily/perplexity
		description: string | null; // LLM-generated summary of what was learned
		description_he: string | null; // Hebrew version of description
		conversation_title: string | null; // Chat title for context
		collected_at: Date | null; // When this was collected
	};
}
```

**File:** `src/lib/types/MemoryBankItem.ts` (MODIFY)

```typescript
export interface MemoryBankItem {
	// ... existing fields ...

	// NEW: Source attribution for display
	source?: {
		toolName: string | null; // "perplexity_ask", "fetch", "tavily_search"
		toolLabel: string | null; // "Perplexity", "Fetch", "Tavily"
		toolIcon: string | null; // Emoji or icon class
		url: string | null; // Source URL
		description: string | null; // What was learned
		descriptionHe: string | null; // Hebrew description
		conversationId: string | null;
		conversationTitle: string | null;
		collectedAt: Date | null;
	};
}
```

### 9.2 Tool Label & Icon Registry

**File:** `src/lib/components/memory/toolRegistry.ts` (CREATE)

```typescript
/**
 * Maps MCP tool names to display labels and icons
 * Supports bilingual display (Hebrew + English)
 */
export interface ToolDisplayInfo {
	name: string; // Internal tool name
	labelEn: string; // English display label
	labelHe: string; // Hebrew display label
	icon: string; // Emoji or icon
	color: string; // Tailwind color class
	category: "search" | "fetch" | "research" | "data" | "compute";
}

export const TOOL_REGISTRY: Record<string, ToolDisplayInfo> = {
	// Research Tools
	perplexity_ask: {
		name: "perplexity_ask",
		labelEn: "Perplexity Research",
		labelHe: "מחקר Perplexity",
		icon: "🔍",
		color: "bg-purple-500",
		category: "research",
	},
	tavily_search: {
		name: "tavily_search",
		labelEn: "Tavily Search",
		labelHe: "חיפוש Tavily",
		icon: "🌐",
		color: "bg-blue-500",
		category: "search",
	},
	tavily_extract: {
		name: "tavily_extract",
		labelEn: "Tavily Extract",
		labelHe: "חילוץ Tavily",
		icon: "📄",
		color: "bg-blue-400",
		category: "fetch",
	},

	// Fetch Tools
	fetch: {
		name: "fetch",
		labelEn: "Web Fetch",
		labelHe: "קריאת דף",
		icon: "📥",
		color: "bg-green-500",
		category: "fetch",
	},
	firecrawl_scrape: {
		name: "firecrawl_scrape",
		labelEn: "Firecrawl Scrape",
		labelHe: "גריפת Firecrawl",
		icon: "🔥",
		color: "bg-orange-500",
		category: "fetch",
	},

	// Data Tools
	datagov_query: {
		name: "datagov_query",
		labelEn: "DataGov Query",
		labelHe: "שאילתת DataGov",
		icon: "🏛️",
		color: "bg-cyan-500",
		category: "data",
	},
	datagov_discover: {
		name: "datagov_discover",
		labelEn: "DataGov Discover",
		labelHe: "חיפוש DataGov",
		icon: "🗂️",
		color: "bg-cyan-400",
		category: "data",
	},

	// Default fallback
	unknown: {
		name: "unknown",
		labelEn: "Unknown Source",
		labelHe: "מקור לא ידוע",
		icon: "❓",
		color: "bg-gray-500",
		category: "search",
	},
};

export function getToolInfo(toolName: string | null): ToolDisplayInfo {
	if (!toolName) return TOOL_REGISTRY.unknown;
	return TOOL_REGISTRY[toolName] || TOOL_REGISTRY.unknown;
}
```

### 9.3 Source Attribution Badge Component

**File:** `src/lib/components/memory/SourceBadge.svelte` (CREATE)

```svelte
<script lang="ts">
	import { getToolInfo, type ToolDisplayInfo } from "./toolRegistry";

	export let toolName: string | null = null;
	export let url: string | null = null;
	export let description: string | null = null;
	export let descriptionHe: string | null = null;
	export let conversationTitle: string | null = null;
	export let collectedAt: Date | string | null = null;
	export let showDetails = false;
	export let lang: "he" | "en" = "he";

	$: tool = getToolInfo(toolName);
	$: label = lang === "he" ? tool.labelHe : tool.labelEn;
	$: desc = lang === "he" && descriptionHe ? descriptionHe : description;
	$: dateStr = collectedAt
		? new Date(collectedAt).toLocaleDateString(lang === "he" ? "he-IL" : "en-US")
		: null;
	$: domain = url ? new URL(url).hostname.replace("www.", "") : null;
</script>

<div class="source-badge" dir={lang === "he" ? "rtl" : "ltr"}>
	<!-- Compact badge -->
	<div class="flex items-center gap-2 text-sm">
		<span class="text-lg">{tool.icon}</span>
		<span class="rounded px-2 py-0.5 text-xs text-white {tool.color}">
			{label}
		</span>
		{#if domain}
			<a
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				class="max-w-[150px] truncate text-xs text-blue-400 hover:underline"
			>
				{domain}
			</a>
		{/if}
	</div>

	<!-- Expanded details -->
	{#if showDetails}
		<div class="mt-2 space-y-1 rounded bg-gray-800/50 p-2 text-sm">
			{#if desc}
				<p class="text-gray-300">{desc}</p>
			{/if}
			{#if conversationTitle}
				<p class="text-xs text-gray-500">
					{lang === "he" ? "משיחה:" : "From chat:"}
					{conversationTitle}
				</p>
			{/if}
			{#if dateStr}
				<p class="text-xs text-gray-500">
					{lang === "he" ? "נאסף:" : "Collected:"}
					{dateStr}
				</p>
			{/if}
			{#if url}
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					class="block truncate text-xs text-blue-400 hover:underline"
				>
					{url}
				</a>
			{/if}
		</div>
	{/if}
</div>

<style>
	.source-badge {
		@apply text-gray-200;
	}
</style>
```

### 9.4 Enhanced Memory Bank Modal

**File:** `src/lib/components/memory/MemoryBankModal.svelte` (MODIFY)

```svelte
<script lang="ts">
	import SourceBadge from "./SourceBadge.svelte";
	import { createEventDispatcher } from "svelte";

	export let open = false;
	export let memories: MemoryBankItem[] = [];

	let expandedId: string | null = null;

	function toggleDetails(id: string) {
		expandedId = expandedId === id ? null : id;
	}
</script>

<Modal bind:open size="xl">
	<div class="p-4" dir="rtl">
		<h2 class="mb-4 text-xl font-semibold">בנק זיכרון</h2>

		<!-- Stats header -->
		<div class="mb-4 flex gap-4 text-sm text-gray-400">
			<span>סה"כ: {memories.length}</span>
			<span>פעילים: {memories.filter((m) => m.status === "active").length}</span>
		</div>

		<!-- Memory list with source attribution -->
		<div class="max-h-[60vh] space-y-3 overflow-y-auto">
			{#each memories as memory (memory._id.toString())}
				<div
					class="hover:bg-gray-750 cursor-pointer rounded-lg bg-gray-800 p-3 transition-colors"
					on:click={() => toggleDetails(memory._id.toString())}
					on:keypress
					role="button"
					tabindex="0"
				>
					<!-- Memory content preview -->
					<p class="mb-2 line-clamp-2 text-gray-200">
						{memory.text}
					</p>

					<!-- Source attribution badge -->
					{#if memory.source?.toolName}
						<SourceBadge
							toolName={memory.source.toolName}
							url={memory.source.url}
							description={memory.source.description}
							descriptionHe={memory.source.descriptionHe}
							conversationTitle={memory.source.conversationTitle}
							collectedAt={memory.source.collectedAt}
							showDetails={expandedId === memory._id.toString()}
							lang="he"
						/>
					{:else}
						<!-- Fallback for memories without source -->
						<div class="text-xs text-gray-500">
							<span>📝</span>
							<span class="rounded bg-gray-700 px-2 py-0.5">זיכרון ידני</span>
						</div>
					{/if}

					<!-- Tags -->
					{#if memory.tags?.length}
						<div class="mt-2 flex flex-wrap gap-1">
							{#each memory.tags as tag}
								<span class="rounded bg-gray-700 px-1.5 py-0.5 text-xs">
									{tag}
								</span>
							{/each}
						</div>
					{/if}

					<!-- Expanded: Full content + actions -->
					{#if expandedId === memory._id.toString()}
						<div class="mt-3 border-t border-gray-700 pt-3">
							<p class="mb-3 whitespace-pre-wrap text-gray-300">
								{memory.text}
							</p>

							<div class="flex gap-2 text-xs">
								<button class="rounded bg-gray-700 px-2 py-1 hover:bg-gray-600"> ערוך </button>
								<button class="rounded bg-gray-700 px-2 py-1 hover:bg-gray-600"> ארכיון </button>
								<button class="rounded bg-red-900/50 px-2 py-1 text-red-300 hover:bg-red-900">
									מחק
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</Modal>
```

### 9.5 User Growth Timeline Component

**File:** `src/lib/components/memory/GrowthTimeline.svelte` (CREATE)

```svelte
<script lang="ts">
	import { onMount } from "svelte";

	interface GrowthDataPoint {
		date: string;
		totalMemories: number;
		bySource: Record<string, number>;
	}

	export let userId: string;

	let data: GrowthDataPoint[] = [];
	let loading = true;

	onMount(async () => {
		const res = await fetch(`/api/memory/growth?userId=${userId}`);
		if (res.ok) {
			data = await res.json();
		}
		loading = false;
	});

	$: latestTotal = data.length > 0 ? data[data.length - 1].totalMemories : 0;
	$: weekAgoTotal = data.length >= 7 ? data[data.length - 7].totalMemories : 0;
	$: weekGrowth = latestTotal - weekAgoTotal;
</script>

<div class="growth-timeline rounded-lg bg-gray-800 p-4" dir="rtl">
	<h3 class="mb-3 text-lg font-semibold">גדילת הידע שלך</h3>

	{#if loading}
		<p class="text-gray-400">טוען...</p>
	{:else}
		<!-- Summary stats -->
		<div class="mb-4 grid grid-cols-3 gap-3">
			<div class="rounded bg-gray-700 p-3 text-center">
				<div class="text-2xl font-bold text-blue-400">{latestTotal}</div>
				<div class="text-xs text-gray-400">סה"כ זיכרונות</div>
			</div>
			<div class="rounded bg-gray-700 p-3 text-center">
				<div class="text-2xl font-bold text-green-400">+{weekGrowth}</div>
				<div class="text-xs text-gray-400">השבוע</div>
			</div>
			<div class="rounded bg-gray-700 p-3 text-center">
				<div class="text-2xl font-bold text-purple-400">
					{Object.keys(data[data.length - 1]?.bySource || {}).length}
				</div>
				<div class="text-xs text-gray-400">מקורות</div>
			</div>
		</div>

		<!-- Simple bar chart -->
		<div class="flex h-32 items-end gap-1">
			{#each data.slice(-14) as point}
				<div
					class="flex-1 rounded-t bg-blue-500 transition-colors hover:bg-blue-400"
					style="height: {(point.totalMemories / latestTotal) * 100}%"
					title="{point.date}: {point.totalMemories} זיכרונות"
				/>
			{/each}
		</div>
		<div class="mt-1 flex justify-between text-xs text-gray-500">
			<span>לפני שבועיים</span>
			<span>היום</span>
		</div>
	{/if}
</div>
```

### 9.6 Growth Stats API Endpoint

**File:** `src/routes/api/memory/growth/+server.ts` (CREATE)

```typescript
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { ADMIN_USER_ID } from "$lib/server/constants";

export const GET: RequestHandler = async ({ url }) => {
	try {
		const days = parseInt(url.searchParams.get("days") || "30");

		// Aggregate memories by date
		const pipeline = [
			{ $match: { user_id: ADMIN_USER_ID } },
			{
				$group: {
					_id: {
						date: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
						source: "$source.tool_name",
					},
					count: { $sum: 1 },
				},
			},
			{ $sort: { "_id.date": 1 } },
		];

		const results = await collections.memoryItems.aggregate(pipeline).toArray();

		// Transform to cumulative growth data
		const byDate = new Map<string, { total: number; bySource: Record<string, number> }>();
		let runningTotal = 0;

		for (const r of results) {
			const date = r._id.date;
			const source = r._id.source || "manual";
			const count = r.count;

			if (!byDate.has(date)) {
				byDate.set(date, { total: runningTotal, bySource: {} });
			}

			const entry = byDate.get(date)!;
			entry.bySource[source] = (entry.bySource[source] || 0) + count;
			runningTotal += count;
			entry.total = runningTotal;
		}

		// Fill in missing dates
		const data = Array.from(byDate.entries())
			.slice(-days)
			.map(([date, stats]) => ({
				date,
				totalMemories: stats.total,
				bySource: stats.bySource,
			}));

		return json(data);
	} catch (err) {
		console.error("[API] Growth stats failed:", err);
		return json([], { status: 500 });
	}
};
```

### 9.7 Capture Source Attribution During Tool Execution

**File:** `src/lib/server/textGeneration/mcp/toolInvocation.ts` (MODIFY)

Add source extraction after tool execution:

```typescript
async function executeToolAndCaptureSource(
	toolCall: ToolCall,
	mcpClient: McpClient
): Promise<ToolResult & { sourceAttribution?: SourceAttribution }> {
	const result = await mcpClient.executeTool(toolCall);

	// Extract source attribution for memory storage
	let sourceAttribution: SourceAttribution | undefined;

	if (toolCall.name.includes("fetch") || toolCall.name.includes("search")) {
		sourceAttribution = {
			toolName: toolCall.name,
			url: extractUrlFromParams(toolCall.parameters),
			collectedAt: new Date(),
		};
	}

	return { ...result, sourceAttribution };
}

function extractUrlFromParams(params: Record<string, unknown>): string | null {
	// Common parameter names for URLs
	const urlKeys = ["url", "urls", "query_url", "source_url"];
	for (const key of urlKeys) {
		if (params[key]) {
			const val = params[key];
			if (typeof val === "string") return val;
			if (Array.isArray(val) && val.length > 0) return val[0];
		}
	}
	return null;
}
```

### 9.8 Generate Description via LLM

**File:** `src/lib/server/memory/services/SourceDescriptionService.ts` (CREATE)

```typescript
import { generateText } from "$lib/server/textGeneration";

/**
 * Generates bilingual (Hebrew + English) descriptions for memory sources
 */
export async function generateSourceDescription(
	toolName: string,
	toolResult: string,
	userQuery: string
): Promise<{ en: string; he: string }> {
	const prompt = `You extracted information using ${toolName} for the query: "${userQuery}"

Based on this result (truncated):
${toolResult.slice(0, 1000)}

Generate a brief 1-sentence description of what was learned. Respond in JSON:
{
  "en": "English description here",
  "he": "תיאור בעברית כאן"
}`;

	try {
		const response = await generateText(prompt, { maxTokens: 150 });
		return JSON.parse(response);
	} catch {
		// Fallback
		return {
			en: `Information extracted using ${toolName}`,
			he: `מידע שנאסף באמצעות ${toolName}`,
		};
	}
}
```

### 9.9 Store Source Attribution with Memory

**File:** `src/lib/server/textGeneration/mcp/memoryIntegration.ts` (MODIFY)

```typescript
export async function storeWorkingMemory(params: {
	userId: string;
	content: string;
	// NEW: Source attribution
	sourceAttribution?: {
		toolName: string;
		url: string | null;
		description?: { en: string; he: string };
		conversationId: string;
		conversationTitle: string;
	};
}): Promise<void> {
	const doc = {
		user_id: params.userId,
		text: params.content,
		tier: "working",
		source: {
			type: params.sourceAttribution ? "tool" : "conversation",
			tool_name: params.sourceAttribution?.toolName || null,
			url: params.sourceAttribution?.url || null,
			description: params.sourceAttribution?.description?.en || null,
			description_he: params.sourceAttribution?.description?.he || null,
			conversation_id: params.sourceAttribution?.conversationId || null,
			conversation_title: params.sourceAttribution?.conversationTitle || null,
			collected_at: new Date(),
		},
		created_at: new Date(),
		updated_at: new Date(),
	};

	await facade.storeMemory(doc);
}
```

### Verification (Phase 9):

- [ ] Memory bank modal shows tool icon + label for each memory
- [ ] Clicking memory shows URL, description, conversation context
- [ ] Hebrew descriptions display alongside English
- [ ] Growth timeline shows memory accumulation over time
- [ ] Source badges show domain name as clickable link
- [ ] Memories from perplexity_ask show "🔍 Perplexity Research" badge
- [ ] Memories from fetch show "📥 Web Fetch" badge with URL

---

## Phase 10: Personality-Aware Modal Views (ENHANCEMENT)

**Goal:** Modals filter/highlight based on active personality
**Effort:** 2 days

### 10.1 Personality Context in Modal

**File:** `src/lib/components/memory/MemoryBankModal.svelte` (MODIFY)

Add personality filter:

```svelte
<script lang="ts">
	export let activePersonalityId: string | null = null;
	export let showAllPersonalities = false;

	$: filteredMemories = showAllPersonalities
		? memories
		: memories.filter(
				(m) => m.sourcePersonalityId === activePersonalityId || m.sourcePersonalityId === null
			);
</script>

<!-- Add toggle -->
<div class="mb-3 flex items-center gap-2">
	<label class="flex items-center gap-1 text-sm">
		<input type="checkbox" bind:checked={showAllPersonalities} />
		<span>הצג מכל האישיויות</span>
	</label>
</div>

<!-- Memory list now uses filteredMemories -->
```

### 10.2 Personality Badge in Memory Item

Show which personality collected each memory:

```svelte
{#if memory.sourcePersonalityName && memory.sourcePersonalityName !== "Default"}
	<span class="text-xs text-gray-500">
		מ-{memory.sourcePersonalityName}
	</span>
{/if}
```

### Verification (Phase 10):

- [ ] Modal defaults to current personality's memories
- [ ] Toggle shows memories from all personalities
- [ ] Each memory shows source personality badge
- [ ] "Default" personality memories show no extra badge

---

## Updated Implementation Order

**Week 1:**

- Day 1-2: Phase 1 (Memory steps in TracePanel)
- Day 3-4: Phase 2 (Memory Detail Modal)
- Day 5: Testing, fixes

**Week 2:**

- Day 1-3: Phase 3 (D3.js Knowledge Graph)
- Day 4-5: Phase 4 (Virtual Scrolling) + Testing

**Week 3:**

- Day 1-2: Phase 5 (Cross-Personality Memory)
- Day 3-4: Phase 6 (Bilingual Memory System)
- Day 5: Integration testing

**Week 4:**

- Day 1-2: Phase 7 (DataGov/MCP Pre-seeding)
- Day 3-4: Phase 8 (Personality UI)
- Day 5: Testing

**Week 5:**

- Day 1-3: Phase 9 (Source Attribution & Enhanced Modals)
- Day 4-5: Phase 10 (Personality-Aware Modals) + Final testing

---

## Updated Success Criteria

1. TracePanel shows memory search/found steps during inference
2. Users can click memories to see full details and manage them
3. Knowledge graph visualizes concept relationships
4. UI remains responsive with 1000+ memories
5. Hebrew RTL works throughout
6. No TypeScript errors
7. Memories from "Teacher" personality visible in "Default" chat
8. Hebrew query finds English memories (and vice versa)
9. System knows about all MCP tools and DataGov categories
10. Personality badges appear next to chat titles
11. **NEW:** Memory bank shows tool used + URL + description for each memory
12. **NEW:** User can see knowledge growth timeline
13. **NEW:** Bilingual source badges (Hebrew + English)
14. **NEW:** Modals filter by active personality with toggle for all

---

## Phase 11: Enterprise Document Processing & Intelligent Caching (CRITICAL)

**Goal:** Zero-latency document deduplication with background processing and rich document viewer
**Effort:** 6-7 days
**Rationale:** User stated: "if the user discussed in the past about a certain article or a pdf file the assistant should in millisec be able to emit and answer that this file was already discussed in the past and the context should be injected from the unified memory system without a new tool call"

### 11.1 Unified Document Registry Collection

**File:** `src/lib/types/DocumentRegistry.ts` (CREATE)

```typescript
import type { ObjectId } from "mongodb";

/**
 * Unified registry for ALL processed documents:
 * - Uploaded files (books)
 * - Web URLs (articles, PDFs)
 * - Enables instant hash-based deduplication
 */
export interface DocumentRegistryItem {
	_id: ObjectId;
	userId: string;

	// Identification (for instant lookup)
	contentHash: string; // SHA256 of parsed content
	urlHash: string | null; // SHA256 of URL (for web documents)
	originalUrl: string | null; // The source URL if web-based

	// Source type
	sourceType: "upload" | "web_fetch" | "chat_link";
	filename: string | null; // Original filename if uploaded
	fileExtension: string | null;
	mimeType: string | null;

	// Parsed content (stored for viewing)
	parsedMarkdown: string; // Full Docling output
	charCount: number;
	wordCount: number;
	pageCount: number | null;

	// LLM-generated summary (bilingual)
	summary: {
		titleAuto: string; // Auto-generated title
		summaryEn: string; // 1-2 paragraph summary
		summaryHe: string; // Hebrew summary
		keyPointsEn: string[]; // 5-10 key points
		keyPointsHe: string[]; // Hebrew key points
	} | null;

	// Processing metadata
	processingStatus: "queued" | "processing" | "completed" | "failed";
	processingError: string | null;
	doclingVersion: string | null;
	processingTimeMs: number | null;

	// Memory integration
	memoryTier: "books" | "memory_bank";
	memoryIds: string[]; // References to memory_items
	chunkCount: number;

	// Attribution
	sourceConversationId: string | null;
	sourcePersonalityId: string | null;
	sourcePersonalityName: string | null;

	// Timestamps
	createdAt: Date;
	updatedAt: Date;
	lastAccessedAt: Date;
}

/**
 * Index definitions for fast lookup
 */
export const DOCUMENT_REGISTRY_INDEXES = [
	{ key: { userId: 1, contentHash: 1 }, unique: true },
	{ key: { userId: 1, urlHash: 1 }, sparse: true },
	{ key: { userId: 1, sourceType: 1 } },
	{ key: { userId: 1, processingStatus: 1 } },
	{ key: { userId: 1, createdAt: -1 } },
];
```

### 11.2 Add Collection to Database

**File:** `src/lib/server/database.ts` (MODIFY)

```typescript
import type { DocumentRegistryItem, DOCUMENT_REGISTRY_INDEXES } from "$lib/types/DocumentRegistry";

// In getCollections():
const documentRegistry = db.collection<DocumentRegistryItem>("documentRegistry");

// Initialize indexes
await Promise.all(
	DOCUMENT_REGISTRY_INDEXES.map((idx) =>
		documentRegistry.createIndex(idx.key, { unique: idx.unique, sparse: idx.sparse })
	)
);

return {
	// ... existing ...
	documentRegistry,
};
```

### 11.3 Document Hash Lookup Service

**File:** `src/lib/server/memory/services/DocumentHashService.ts` (CREATE)

```typescript
import { createHash } from "crypto";
import { collections } from "$lib/server/database";
import { logger } from "$lib/server/logger";
import type { DocumentRegistryItem } from "$lib/types/DocumentRegistry";

/**
 * Fast hash-based document lookup service
 * Enables millisecond deduplication decisions
 */
export class DocumentHashService {
	/**
	 * Hash a URL for instant lookup
	 */
	static hashUrl(url: string): string {
		// Normalize URL before hashing
		const normalized = url
			.toLowerCase()
			.trim()
			.replace(/\/$/, "") // Remove trailing slash
			.replace(/^https?:\/\//, "") // Remove protocol
			.replace(/^www\./, ""); // Remove www
		return createHash("sha256").update(normalized).digest("hex");
	}

	/**
	 * Hash content for deduplication
	 */
	static hashContent(content: string): string {
		return createHash("sha256").update(content).digest("hex");
	}

	/**
	 * Check if URL was already processed (< 5ms)
	 * Returns document if found, null if not
	 */
	static async lookupByUrl(userId: string, url: string): Promise<DocumentRegistryItem | null> {
		const startTime = Date.now();
		const urlHash = this.hashUrl(url);

		const doc = await collections.documentRegistry.findOne({
			userId,
			urlHash,
			processingStatus: "completed",
		});

		const elapsed = Date.now() - startTime;
		logger.debug({ userId, urlHash, found: !!doc, elapsedMs: elapsed }, "URL lookup");

		if (doc) {
			// Update last accessed
			await collections.documentRegistry.updateOne(
				{ _id: doc._id },
				{ $set: { lastAccessedAt: new Date() } }
			);
		}

		return doc;
	}

	/**
	 * Check if content was already processed (< 5ms)
	 */
	static async lookupByContentHash(
		userId: string,
		contentHash: string
	): Promise<DocumentRegistryItem | null> {
		const doc = await collections.documentRegistry.findOne({
			userId,
			contentHash,
			processingStatus: "completed",
		});

		if (doc) {
			await collections.documentRegistry.updateOne(
				{ _id: doc._id },
				{ $set: { lastAccessedAt: new Date() } }
			);
		}

		return doc;
	}

	/**
	 * Fast check: Is this URL already known? (no full doc fetch)
	 */
	static async isUrlKnown(userId: string, url: string): Promise<boolean> {
		const urlHash = this.hashUrl(url);
		const count = await collections.documentRegistry.countDocuments({
			userId,
			urlHash,
			processingStatus: { $in: ["completed", "processing", "queued"] },
		});
		return count > 0;
	}

	/**
	 * Get memory context for a known document (for injection)
	 */
	static async getDocumentContext(
		userId: string,
		urlOrHash: string
	): Promise<{ summary: string; memoryIds: string[] } | null> {
		// Try URL hash first, then content hash
		const urlHash = this.hashUrl(urlOrHash);
		let doc = await collections.documentRegistry.findOne({
			userId,
			$or: [{ urlHash }, { contentHash: urlOrHash }],
			processingStatus: "completed",
		});

		if (!doc || !doc.summary) return null;

		return {
			summary: doc.summary.summaryHe || doc.summary.summaryEn,
			memoryIds: doc.memoryIds,
		};
	}
}
```

### 11.4 Background Document Processing Queue

**File:** `src/lib/server/memory/services/DocumentProcessingQueue.ts` (CREATE)

```typescript
import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { logger } from "$lib/server/logger";
import { extractDocumentText } from "$lib/server/textGeneration/mcp/services/doclingClient";
import { DocumentHashService } from "./DocumentHashService";
import { DocumentSummaryService } from "./DocumentSummaryService";
import type { DocumentRegistryItem } from "$lib/types/DocumentRegistry";

interface QueuedDocument {
	userId: string;
	url?: string;
	filePath?: string;
	filename?: string;
	mimeType?: string;
	conversationId?: string;
	personalityId?: string;
	personalityName?: string;
}

/**
 * Non-blocking document processing queue
 * Enables snappy chat experience while processing in background
 */
export class DocumentProcessingQueue {
	private static queue: QueuedDocument[] = [];
	private static isProcessing = false;

	/**
	 * Queue a URL for background processing
	 * Returns immediately (< 10ms)
	 */
	static async queueUrl(params: {
		userId: string;
		url: string;
		conversationId?: string;
		personalityId?: string;
		personalityName?: string;
	}): Promise<{ queued: boolean; existing?: DocumentRegistryItem; registryId?: string }> {
		// Fast check: already processed?
		const existing = await DocumentHashService.lookupByUrl(params.userId, params.url);
		if (existing) {
			logger.info({ url: params.url }, "Document already processed, skipping queue");
			return { queued: false, existing };
		}

		// Fast check: already in queue/processing?
		if (await DocumentHashService.isUrlKnown(params.userId, params.url)) {
			logger.info({ url: params.url }, "Document already queued/processing");
			return { queued: false };
		}

		// Create registry entry with "queued" status
		const registryId = new ObjectId();
		const urlHash = DocumentHashService.hashUrl(params.url);

		await collections.documentRegistry.insertOne({
			_id: registryId,
			userId: params.userId,
			contentHash: "", // Will be set after parsing
			urlHash,
			originalUrl: params.url,
			sourceType: "web_fetch",
			filename: null,
			fileExtension: this.getExtensionFromUrl(params.url),
			mimeType: null,
			parsedMarkdown: "",
			charCount: 0,
			wordCount: 0,
			pageCount: null,
			summary: null,
			processingStatus: "queued",
			processingError: null,
			doclingVersion: null,
			processingTimeMs: null,
			memoryTier: "books",
			memoryIds: [],
			chunkCount: 0,
			sourceConversationId: params.conversationId || null,
			sourcePersonalityId: params.personalityId || null,
			sourcePersonalityName: params.personalityName || null,
			createdAt: new Date(),
			updatedAt: new Date(),
			lastAccessedAt: new Date(),
		});

		// Add to in-memory queue
		this.queue.push({
			userId: params.userId,
			url: params.url,
			conversationId: params.conversationId,
			personalityId: params.personalityId,
			personalityName: params.personalityName,
		});

		// Start processing if not already running
		this.processQueue();

		return { queued: true, registryId: registryId.toString() };
	}

	/**
	 * Process queue in background
	 */
	private static async processQueue(): Promise<void> {
		if (this.isProcessing || this.queue.length === 0) return;

		this.isProcessing = true;

		while (this.queue.length > 0) {
			const item = this.queue.shift()!;

			try {
				if (item.url) {
					await this.processUrl(item);
				} else if (item.filePath) {
					await this.processFile(item);
				}
			} catch (err) {
				logger.error({ err, item }, "Document processing failed");
			}
		}

		this.isProcessing = false;
	}

	/**
	 * Process a URL document
	 */
	private static async processUrl(item: QueuedDocument): Promise<void> {
		const startTime = Date.now();
		const urlHash = DocumentHashService.hashUrl(item.url!);

		try {
			// Update status to processing
			await collections.documentRegistry.updateOne(
				{ userId: item.userId, urlHash },
				{ $set: { processingStatus: "processing", updatedAt: new Date() } }
			);

			// 1. Fetch the URL content
			const fetchResponse = await fetch(item.url!);
			if (!fetchResponse.ok) {
				throw new Error(`Failed to fetch: ${fetchResponse.status}`);
			}

			const contentType = fetchResponse.headers.get("content-type") || "";
			let parsedText: string;
			let pageCount: number | null = null;

			// 2. Parse based on content type
			if (contentType.includes("application/pdf")) {
				// Download and pass to Docling
				const buffer = await fetchResponse.arrayBuffer();
				const tempPath = `/tmp/${urlHash}.pdf`;
				const { writeFile, unlink } = await import("fs/promises");
				await writeFile(tempPath, Buffer.from(buffer));

				const result = await extractDocumentText(tempPath);
				parsedText = result.text;
				pageCount = result.pages || null;

				await unlink(tempPath).catch(() => {});
			} else if (contentType.includes("text/html")) {
				// Use Docling for HTML parsing
				const html = await fetchResponse.text();
				// For HTML, we can use Docling or a simpler extractor
				parsedText = this.extractTextFromHtml(html);
			} else {
				// Plain text
				parsedText = await fetchResponse.text();
			}

			// 3. Compute content hash
			const contentHash = DocumentHashService.hashContent(parsedText);

			// 4. Check for duplicate content (different URL, same content)
			const existingByContent = await DocumentHashService.lookupByContentHash(
				item.userId,
				contentHash
			);
			if (existingByContent) {
				// Mark as duplicate, link to existing
				await collections.documentRegistry.updateOne(
					{ userId: item.userId, urlHash },
					{
						$set: {
							processingStatus: "completed",
							contentHash,
							parsedMarkdown: "(duplicate - see original)",
							updatedAt: new Date(),
						},
					}
				);
				return;
			}

			// 5. Generate summary via LLM
			const summary = await DocumentSummaryService.generateSummary(parsedText, item.url!);

			// 6. Chunk and store in memory
			const { UnifiedMemoryFacade } = await import("$lib/server/memory");
			const facade = UnifiedMemoryFacade.getInstance();

			const chunkSize = 1000;
			const overlap = 200;
			const chunks: string[] = [];
			for (let i = 0; i < parsedText.length; i += chunkSize - overlap) {
				chunks.push(parsedText.slice(i, i + chunkSize));
			}

			const memoryIds: string[] = [];
			for (let i = 0; i < chunks.length; i++) {
				const result = await facade.store({
					userId: item.userId,
					tier: "books",
					text: chunks[i],
					metadata: {
						document_hash: contentHash,
						url_hash: urlHash,
						source_url: item.url,
						chunk_index: i,
						source_type: "web_fetch",
					},
				});
				if (result?.memory_id) {
					memoryIds.push(result.memory_id);
				}
			}

			// 7. Update registry with completed status
			const processingTimeMs = Date.now() - startTime;
			await collections.documentRegistry.updateOne(
				{ userId: item.userId, urlHash },
				{
					$set: {
						contentHash,
						parsedMarkdown: parsedText,
						charCount: parsedText.length,
						wordCount: parsedText.split(/\s+/).length,
						pageCount,
						summary,
						processingStatus: "completed",
						processingTimeMs,
						memoryIds,
						chunkCount: chunks.length,
						updatedAt: new Date(),
					},
				}
			);

			logger.info(
				{
					url: item.url,
					chunks: chunks.length,
					timeMs: processingTimeMs,
				},
				"Document processed successfully"
			);
		} catch (err) {
			await collections.documentRegistry.updateOne(
				{ userId: item.userId, urlHash },
				{
					$set: {
						processingStatus: "failed",
						processingError: err instanceof Error ? err.message : "Unknown error",
						updatedAt: new Date(),
					},
				}
			);
			throw err;
		}
	}

	private static extractTextFromHtml(html: string): string {
		// Simple HTML to text extraction
		return html
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	}

	private static getExtensionFromUrl(url: string): string | null {
		const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
		return match ? match[1].toLowerCase() : null;
	}
}
```

### 11.5 LLM Summary Generation Service

**File:** `src/lib/server/memory/services/DocumentSummaryService.ts` (CREATE)

```typescript
import { logger } from "$lib/server/logger";

interface DocumentSummary {
	titleAuto: string;
	summaryEn: string;
	summaryHe: string;
	keyPointsEn: string[];
	keyPointsHe: string[];
}

/**
 * Generates bilingual summaries and key points for documents
 */
export class DocumentSummaryService {
	/**
	 * Generate comprehensive summary using LLM
	 */
	static async generateSummary(content: string, sourceUrl?: string): Promise<DocumentSummary> {
		// Truncate content for LLM
		const truncatedContent = content.slice(0, 8000);

		const prompt = `Analyze this document and provide a structured summary.

Document content (truncated):
${truncatedContent}

${sourceUrl ? `Source URL: ${sourceUrl}` : ""}

Respond in JSON format:
{
  "titleAuto": "A concise title for this document (max 80 chars)",
  "summaryEn": "A 2-3 sentence summary in English",
  "summaryHe": "תקציר של 2-3 משפטים בעברית",
  "keyPointsEn": ["Key point 1", "Key point 2", "..."],
  "keyPointsHe": ["נקודה מפתח 1", "נקודה מפתח 2", "..."]
}

Provide 5-8 key points. Focus on the most important information.`;

		try {
			// Use local model for summary generation
			const response = await fetch("http://proxy:8002/v1/chat/completions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "dictalm2.0",
					messages: [{ role: "user", content: prompt }],
					max_tokens: 1000,
					temperature: 0.3,
				}),
			});

			if (!response.ok) {
				throw new Error(`LLM request failed: ${response.status}`);
			}

			const data = await response.json();
			const text = data.choices?.[0]?.message?.content || "";

			// Parse JSON from response
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				return JSON.parse(jsonMatch[0]);
			}

			throw new Error("No JSON found in response");
		} catch (err) {
			logger.error({ err }, "Summary generation failed, using fallback");

			// Fallback summary
			const firstParagraph = truncatedContent.split("\n\n")[0]?.slice(0, 200) || "";
			return {
				titleAuto: sourceUrl ? new URL(sourceUrl).hostname : "Untitled Document",
				summaryEn: firstParagraph + "...",
				summaryHe: "תקציר לא זמין - המסמך עובד בהצלחה",
				keyPointsEn: ["Document processed successfully"],
				keyPointsHe: ["המסמך עובד בהצלחה"],
			};
		}
	}
}
```

### 11.6 Chat Link Detection & Instant Injection

**File:** `src/lib/server/textGeneration/mcp/memoryIntegration.ts` (MODIFY)

Add URL detection and instant context injection:

```typescript
import { DocumentHashService } from "$lib/server/memory/services/DocumentHashService";
import { DocumentProcessingQueue } from "$lib/server/memory/services/DocumentProcessingQueue";

/**
 * Detect URLs in user message and handle accordingly
 */
export async function handleUrlsInMessage(params: {
	userId: string;
	message: string;
	conversationId: string;
	personalityId?: string;
	personalityName?: string;
}): Promise<{
	processedUrls: Array<{ url: string; status: "known" | "queued" }>;
	contextInjection: string | null;
}> {
	// Extract URLs from message
	const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
	const urls = params.message.match(urlRegex) || [];

	if (urls.length === 0) {
		return { processedUrls: [], contextInjection: null };
	}

	const processedUrls: Array<{ url: string; status: "known" | "queued" }> = [];
	let contextInjection: string | null = null;

	for (const url of urls.slice(0, 3)) {
		// Limit to 3 URLs per message
		// Fast lookup: already processed?
		const existing = await DocumentHashService.lookupByUrl(params.userId, url);

		if (existing && existing.summary) {
			// INSTANT INJECTION - no tool call needed
			processedUrls.push({ url, status: "known" });

			if (!contextInjection) {
				contextInjection = `\n[Previously processed document: ${existing.summary.titleAuto}]\n`;
				contextInjection += `Summary: ${existing.summary.summaryHe || existing.summary.summaryEn}\n`;
				contextInjection += `Key points:\n`;
				const keyPoints =
					existing.summary.keyPointsHe.length > 0
						? existing.summary.keyPointsHe
						: existing.summary.keyPointsEn;
				contextInjection += keyPoints.map((p) => `• ${p}`).join("\n");
			}
		} else {
			// Queue for background processing
			await DocumentProcessingQueue.queueUrl({
				userId: params.userId,
				url,
				conversationId: params.conversationId,
				personalityId: params.personalityId,
				personalityName: params.personalityName,
			});
			processedUrls.push({ url, status: "queued" });
		}
	}

	return { processedUrls, contextInjection };
}
```

### 11.7 Update prefetchMemoryContext to Check URLs

**File:** `src/lib/server/textGeneration/mcp/memoryIntegration.ts` (MODIFY)

In `prefetchMemoryContext()`, add URL handling at the start:

```typescript
export async function prefetchMemoryContext(params: {
	userId: string;
	query: string;
	conversationId: string;
	// ... existing params
}): Promise<MemoryContextResult> {
	// FIRST: Check for URLs and get instant context (< 10ms)
	const urlResult = await handleUrlsInMessage({
		userId: params.userId,
		message: params.query,
		conversationId: params.conversationId,
	});

	// If we found a known document, prepend its context
	let memoryContext = urlResult.contextInjection || "";

	// ... rest of existing memory search ...

	// Append regular memory context
	memoryContext += existingMemoryContext;

	return { memoryContext, citations, retrievalConfidence };
}
```

### 11.8 Enhanced Books Modal with Document Viewer

**File:** `src/lib/components/memory/BooksProcessorModal.svelte` (MODIFY)

Add document viewer tab and web articles:

```svelte
<script lang="ts">
  // ... existing imports ...

  interface DocumentItem {
    id: string;
    type: "upload" | "web_fetch";
    title: string;
    author?: string;
    url?: string;
    charCount: number;
    wordCount: number;
    pageCount?: number;
    chunkCount: number;
    summary?: {
      titleAuto: string;
      summaryHe: string;
      keyPointsHe: string[];
    };
    status: string;
    createdAt: string;
    parsedMarkdown?: string;
  }

  let activeTab = $state<"upload" | "library" | "viewer">("upload");
  let documents = $state<DocumentItem[]>([]);
  let selectedDocument = $state<DocumentItem | null>(null);
  let showMarkdown = $state(false);

  async function loadDocuments() {
    loading = true;
    try {
      const response = await fetch(`${base}/api/memory/documents`);
      if (response.ok) {
        const data = await response.json();
        documents = data.documents || [];
      }
    } catch (err) {
      console.error("Failed to load documents:", err);
    } finally {
      loading = false;
    }
  }

  async function viewDocument(doc: DocumentItem) {
    selectedDocument = doc;
    activeTab = "viewer";

    // Fetch full content if not loaded
    if (!doc.parsedMarkdown) {
      const res = await fetch(`${base}/api/memory/documents/${doc.id}/content`);
      if (res.ok) {
        const data = await res.json();
        selectedDocument = { ...doc, parsedMarkdown: data.parsedMarkdown };
      }
    }
  }
</script>

<!-- Tab Navigation (add "viewer" tab when document selected) -->
<div class="border-b border-gray-700 px-6">
  <div class="flex gap-4">
    <button onclick={() => activeTab = "upload"} class={...}>העלאה</button>
    <button onclick={() => activeTab = "library"} class={...}>ספריה</button>
    {#if selectedDocument}
      <button onclick={() => activeTab = "viewer"} class={...}>
        📄 {selectedDocument.title.slice(0, 20)}...
      </button>
    {/if}
  </div>
</div>

<!-- Library with Web Articles -->
{#if activeTab === "library"}
  <div class="space-y-3">
    <!-- Filter tabs: All | Uploads | Web Articles -->
    <div class="flex gap-2 mb-4">
      <button class="px-3 py-1 rounded text-sm bg-gray-700">הכל</button>
      <button class="px-3 py-1 rounded text-sm bg-gray-800">📁 העלאות</button>
      <button class="px-3 py-1 rounded text-sm bg-gray-800">🌐 מאמרים מהרשת</button>
    </div>

    {#each documents as doc (doc.id)}
      <div class="p-4 bg-gray-800 rounded-lg hover:bg-gray-750 cursor-pointer"
           onclick={() => viewDocument(doc)}>
        <div class="flex items-start gap-3">
          <span class="text-xl">
            {doc.type === "web_fetch" ? "🌐" : "📄"}
          </span>
          <div class="flex-1">
            <p class="font-medium text-gray-200">{doc.title}</p>
            {#if doc.url}
              <p class="text-xs text-blue-400 truncate">{doc.url}</p>
            {/if}
            {#if doc.summary}
              <p class="text-sm text-gray-400 mt-1 line-clamp-2">
                {doc.summary.summaryHe}
              </p>
            {/if}
            <div class="flex gap-4 mt-2 text-xs text-gray-500">
              <span>{doc.wordCount.toLocaleString()} מילים</span>
              <span>{doc.chunkCount} חלקים</span>
              {#if doc.pageCount}
                <span>{doc.pageCount} עמודים</span>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}

<!-- Document Viewer Tab -->
{#if activeTab === "viewer" && selectedDocument}
  <div class="space-y-4">
    <!-- Document Header -->
    <div class="p-4 bg-gray-800 rounded-lg">
      <h3 class="text-lg font-semibold text-gray-200">
        {selectedDocument.summary?.titleAuto || selectedDocument.title}
      </h3>
      {#if selectedDocument.url}
        <a href={selectedDocument.url} target="_blank" class="text-sm text-blue-400 hover:underline">
          {selectedDocument.url}
        </a>
      {/if}

      <!-- Stats -->
      <div class="flex gap-4 mt-3 text-sm text-gray-400">
        <span>📝 {selectedDocument.wordCount.toLocaleString()} מילים</span>
        <span>📦 {selectedDocument.chunkCount} חלקים</span>
        {#if selectedDocument.pageCount}
          <span>📄 {selectedDocument.pageCount} עמודים</span>
        {/if}
      </div>
    </div>

    <!-- Summary & Key Points -->
    {#if selectedDocument.summary}
      <div class="p-4 bg-gray-800 rounded-lg">
        <h4 class="font-medium text-gray-300 mb-2">תקציר</h4>
        <p class="text-gray-400">{selectedDocument.summary.summaryHe}</p>

        <h4 class="font-medium text-gray-300 mt-4 mb-2">נקודות מפתח</h4>
        <ul class="space-y-1">
          {#each selectedDocument.summary.keyPointsHe as point}
            <li class="text-gray-400 flex items-start gap-2">
              <span class="text-blue-400">•</span>
              <span>{point}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Full Parsed Content (collapsible) -->
    <div class="p-4 bg-gray-800 rounded-lg">
      <button
        onclick={() => showMarkdown = !showMarkdown}
        class="flex items-center gap-2 text-gray-300 hover:text-gray-100"
      >
        <span>{showMarkdown ? "▼" : "▶"}</span>
        <span>תוכן מלא (Markdown)</span>
      </button>

      {#if showMarkdown && selectedDocument.parsedMarkdown}
        <div class="mt-4 p-4 bg-gray-900 rounded max-h-96 overflow-y-auto">
          <pre class="text-sm text-gray-300 whitespace-pre-wrap font-mono">
            {selectedDocument.parsedMarkdown}
          </pre>
        </div>
      {/if}
    </div>
  </div>
{/if}
```

### 11.9 Document List API Endpoint

**File:** `src/routes/api/memory/documents/+server.ts` (CREATE)

```typescript
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { ADMIN_USER_ID } from "$lib/server/constants";

export const GET: RequestHandler = async () => {
	try {
		const documents = await collections.documentRegistry
			.find({ userId: ADMIN_USER_ID, processingStatus: "completed" })
			.sort({ createdAt: -1 })
			.project({
				parsedMarkdown: 0, // Exclude large content from list
			})
			.toArray();

		return json({
			success: true,
			documents: documents.map((d) => ({
				id: d._id.toString(),
				type: d.sourceType,
				title: d.summary?.titleAuto || d.filename || "Untitled",
				url: d.originalUrl,
				charCount: d.charCount,
				wordCount: d.wordCount,
				pageCount: d.pageCount,
				chunkCount: d.chunkCount,
				summary: d.summary,
				status: d.processingStatus,
				createdAt: d.createdAt.toISOString(),
			})),
		});
	} catch (err) {
		console.error("[API] Failed to list documents:", err);
		return json({ success: false, error: "Failed to list documents" }, { status: 500 });
	}
};
```

### 11.10 Document Content API Endpoint

**File:** `src/routes/api/memory/documents/[id]/content/+server.ts` (CREATE)

```typescript
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { ADMIN_USER_ID } from "$lib/server/constants";

export const GET: RequestHandler = async ({ params }) => {
	try {
		const doc = await collections.documentRegistry.findOne({
			_id: new ObjectId(params.id),
			userId: ADMIN_USER_ID,
		});

		if (!doc) {
			return error(404, "Document not found");
		}

		return json({
			success: true,
			parsedMarkdown: doc.parsedMarkdown,
			charCount: doc.charCount,
			wordCount: doc.wordCount,
		});
	} catch (err) {
		console.error("[API] Failed to get document content:", err);
		return json({ success: false, error: "Failed to get content" }, { status: 500 });
	}
};
```

### Verification (Phase 11):

- [ ] URL in chat: First time → queued for background processing
- [ ] URL in chat: Second time → instant context injection (< 50ms)
- [ ] Background processing completes without blocking chat
- [ ] Document registry stores: URL hash, content hash, parsed markdown
- [ ] Summary generated with Hebrew key points
- [ ] Enhanced modal shows web articles alongside uploaded books
- [ ] Click document → view full parsed markdown
- [ ] Click document → see summary and key points
- [ ] Duplicate URL detection works (same URL = instant answer)
- [ ] Duplicate content detection works (different URL, same content)

---

## Phase 12: Chat-Integrated Document Feedback (ENHANCEMENT)

**Goal:** Assistant acknowledges background document processing
**Effort:** 1-2 days

### 12.1 Emit Document Status in Response

When user shares a link that gets queued:

```typescript
// In response generation
if (queuedUrls.length > 0) {
  yield {
    type: MessageUpdateType.DocumentQueued,
    data: {
      urls: queuedUrls,
      message: "המסמך נוסף לתור העיבוד. אעבד אותו ברקע."
    }
  };
}

// When processing completes (WebSocket/SSE notification)
if (processedDocument) {
  yield {
    type: MessageUpdateType.DocumentReady,
    data: {
      url: processedDocument.url,
      title: processedDocument.summary?.titleAuto,
      message: "המסמך עובד בהצלחה ומוכן לשימוש."
    }
  };
}
```

### 12.2 Toast Notification Component

**File:** `src/lib/components/DocumentProcessingToast.svelte` (CREATE)

```svelte
<script lang="ts">
	import { onMount } from "svelte";

	export let message: string;
	export let type: "queued" | "ready" | "error" = "queued";
	export let duration = 3000;
	export let onClose: () => void;

	const icons = {
		queued: "⏳",
		ready: "✅",
		error: "❌",
	};

	onMount(() => {
		const timer = setTimeout(onClose, duration);
		return () => clearTimeout(timer);
	});
</script>

<div class="animate-slide-up fixed bottom-4 left-4 z-50">
	<div
		class="flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg
              {type === 'ready' ? 'bg-green-900/90' : 'bg-gray-800/90'}"
		dir="rtl"
	>
		<span class="text-xl">{icons[type]}</span>
		<p class="text-sm text-gray-200">{message}</p>
		<button onclick={onClose} class="text-gray-400 hover:text-gray-200">×</button>
	</div>
</div>
```

### Verification (Phase 12):

- [ ] Toast shows when document queued
- [ ] Toast shows when document ready
- [ ] No blocking of chat flow
- [ ] Hebrew messages displayed correctly

---

## Updated Implementation Order (Complete)

**Week 1:**

- Day 1-2: Phase 1 (Memory steps in TracePanel)
- Day 3-4: Phase 2 (Memory Detail Modal)
- Day 5: Testing

**Week 2:**

- Day 1-3: Phase 3 (D3.js Knowledge Graph)
- Day 4-5: Phase 4 (Virtual Scrolling)

**Week 3:**

- Day 1-2: Phase 5 (Cross-Personality Memory)
- Day 3-4: Phase 6 (Bilingual Memory System)
- Day 5: Integration testing

**Week 4:**

- Day 1-2: Phase 7 (DataGov/MCP Pre-seeding)
- Day 3-4: Phase 8 (Personality UI)
- Day 5: Testing

**Week 5:**

- Day 1-3: Phase 9 (Source Attribution & Enhanced Modals)
- Day 4-5: Phase 10 (Personality-Aware Modals)

**Week 6:**

- Day 1-4: Phase 11 (Enterprise Document Processing)
- Day 5: Phase 12 (Document Feedback) + Final testing

---

## Updated Success Criteria (Final)

1. TracePanel shows memory search/found steps during inference
2. Users can click memories to see full details and manage them
3. Knowledge graph visualizes concept relationships
4. UI remains responsive with 1000+ memories
5. Hebrew RTL works throughout
6. No TypeScript errors
7. Memories from "Teacher" personality visible in "Default" chat
8. Hebrew query finds English memories (and vice versa)
9. System knows about all MCP tools and DataGov categories
10. Personality badges appear next to chat titles
11. Memory bank shows tool used + URL + description for each memory
12. User can see knowledge growth timeline
13. Bilingual source badges (Hebrew + English)
14. Modals filter by active personality with toggle for all
15. **NEW:** URL in chat instantly checks document registry (< 50ms)
16. **NEW:** Already-processed URLs inject context without tool call
17. **NEW:** New URLs queue for background Docling processing
18. **NEW:** Document modal shows full parsed markdown in Hebrew inside a scrollable container tab called "view Document"
19. **NEW:** Document modal shows LLM-generated summary + key points in a scrollable container tab called "Summary"
20. **NEW:** Web articles and uploads unified in document library
