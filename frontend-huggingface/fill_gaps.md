# Memory System Gap Analysis: Roampal Parity

## Executive Summary

This document identifies all gaps between the current memory system and roampal's implementation, providing concrete solutions for each.

---

## Gap 1: Authentication Pattern Inconsistencies

### Problem

7 API endpoints use the wrong authentication pattern, causing "Authentication required" errors for session-based users.

### Wrong Pattern

```typescript
const userId = locals.user?.id;
if (!userId) {
	return error(401, "Authentication required");
}
```

### Correct Pattern

```typescript
const userId = locals.user?._id ?? locals.sessionId;
if (!userId) {
	return error(401, "Session required");
}
```

### Files Requiring Fix

| File                                        | Location      | Current Code      |
| ------------------------------------------- | ------------- | ----------------- |
| `src/routes/api/memory/search/+server.ts`   | Line 8        | `locals.user?.id` |
| `src/routes/api/memory/kg/+server.ts`       | Lines 7, 52   | `locals.user?.id` |
| `src/routes/api/memory/stats/+server.ts`    | Line 7        | `locals.user?.id` |
| `src/routes/api/hooks/context/+server.ts`   | Lines 43, 108 | `locals.user?.id` |
| `src/routes/api/hooks/exchange/+server.ts`  | Line 35       | `locals.user?.id` |
| `src/routes/api/hooks/score/+server.ts`     | Lines 35, 126 | `locals.user?.id` |
| `src/routes/api/memory/feedback/+server.ts` | Line 7        | `locals.user?.id` |

### Impact

- Session-based users cannot use memory features
- Breaks document upload flow
- Inconsistent behavior across endpoints

---

## Gap 2: PersonalityLoader Missing Methods

### Problem

The API endpoints call methods that don't exist in PersonalityLoader:

- `getPersonality(userId)` - Called but doesn't exist
- `validateYaml(yaml_content)` - Called but doesn't exist
- `reloadPersonality(userId)` - Called but doesn't exist
- `getPresets()` - Expected but doesn't exist

### Current PersonalityLoader Architecture

```
File-based system:
- Loads from /templates/personality/*.yaml
- No per-user customization
- No database integration
```

### Roampal's Architecture

```
Database-first system:
- Per-user personality storage
- YAML validation
- Caching with TTL
- Preset management
```

### Required Implementation

```typescript
// src/lib/server/memory/personality/PersonalityLoader.ts

import { collections } from "$lib/server/database";
import yaml from "yaml";
import type { ObjectId } from "mongodb";

class PersonalityLoader {
	private userCache = new Map<string, { content: string; loadedAt: Date }>();
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	/**
	 * Get personality for a specific user
	 * Priority: Database → Default Template
	 */
	async getPersonality(userId: string | ObjectId): Promise<{
		name: string;
		content: string;
		isDefault: boolean;
	}> {
		const userIdStr = typeof userId === "string" ? userId : userId.toString();

		// Check cache
		const cached = this.userCache.get(userIdStr);
		if (cached && Date.now() - cached.loadedAt.getTime() < this.CACHE_TTL) {
			return { name: "custom", content: cached.content, isDefault: false };
		}

		// Query database
		const doc = await collections.userPersonality.findOne({ userId: userIdStr });

		if (doc?.yaml_content) {
			this.userCache.set(userIdStr, {
				content: doc.yaml_content,
				loadedAt: new Date(),
			});
			return {
				name: doc.preset_name || "custom",
				content: doc.yaml_content,
				isDefault: false,
			};
		}

		// Fallback to default
		return {
			name: "default",
			content: this.getDefaultTemplate(),
			isDefault: true,
		};
	}

	/**
	 * Validate YAML structure and content
	 */
	validateYaml(yamlContent: string): { valid: boolean; error?: string } {
		try {
			const parsed = yaml.parse(yamlContent);

			if (!parsed || typeof parsed !== "object") {
				return { valid: false, error: "YAML must be an object" };
			}

			// Roampal-compatible keys
			const validKeys = ["name", "traits", "style", "preferences", "rules", "tone", "language"];
			const keys = Object.keys(parsed);
			const invalidKeys = keys.filter((k) => !validKeys.includes(k));

			if (invalidKeys.length > 0) {
				return { valid: false, error: `Unknown keys: ${invalidKeys.join(", ")}` };
			}

			return { valid: true };
		} catch (err) {
			return {
				valid: false,
				error: err instanceof Error ? err.message : "Invalid YAML syntax",
			};
		}
	}

	/**
	 * Clear cache and reload personality for user
	 */
	async reloadPersonality(userId: string | ObjectId): Promise<void> {
		const userIdStr = typeof userId === "string" ? userId : userId.toString();
		this.userCache.delete(userIdStr);
		await this.getPersonality(userIdStr);
	}

	/**
	 * Get available personality presets
	 */
	async getPresets(): Promise<
		Array<{
			name: string;
			description: string;
			preview: string;
			yaml_content: string;
		}>
	> {
		return [
			{
				name: "default",
				description: "Standard assistant - helpful and professional",
				preview: "Balanced, clear, efficient",
				yaml_content: this.getDefaultTemplate(),
			},
			{
				name: "friendly",
				description: "Warm and conversational tone",
				preview: "Casual, encouraging, personable",
				yaml_content: `name: friendly
traits:
  - warm
  - encouraging
  - casual
style:
  formality: informal
  verbosity: moderate
  tone: friendly`,
			},
			{
				name: "technical",
				description: "Precise and detail-oriented",
				preview: "Technical, thorough, precise",
				yaml_content: `name: technical
traits:
  - precise
  - thorough
  - analytical
style:
  formality: formal
  verbosity: detailed
  tone: professional`,
			},
			{
				name: "creative",
				description: "Imaginative and expressive",
				preview: "Creative, expressive, innovative",
				yaml_content: `name: creative
traits:
  - imaginative
  - expressive
  - innovative
style:
  formality: casual
  verbosity: moderate
  tone: enthusiastic`,
			},
		];
	}

	private getDefaultTemplate(): string {
		return `name: assistant
traits:
  - helpful
  - concise
  - professional
style:
  formality: neutral
  verbosity: moderate
  tone: balanced
preferences:
  language: auto
  codeStyle: clean`;
	}
}

let instance: PersonalityLoader | null = null;

export function getPersonalityLoader(): PersonalityLoader {
	if (!instance) {
		instance = new PersonalityLoader();
	}
	return instance;
}

export { PersonalityLoader };
```

---

## Gap 3: Missing Wilson Score Ranking

### Roampal Feature

Wilson score confidence interval for statistically ranking memories based on usage patterns.

### Current State

No statistical ranking - memories returned by simple relevance or recency.

### Required Implementation

```typescript
// src/lib/server/memory/services/WilsonScoreService.ts

export class WilsonScoreService {
	/**
	 * Calculate Wilson score lower bound
	 * Used for ranking items with confidence intervals
	 *
	 * @param positive - Number of positive interactions (hits, upvotes)
	 * @param total - Total number of interactions
	 * @param confidence - Confidence level (default 95%)
	 */
	calculate(positive: number, total: number, confidence = 0.95): number {
		if (total === 0) return 0;

		// Z-score for confidence level
		const z = confidence === 0.95 ? 1.96 : confidence === 0.9 ? 1.645 : 1.28;
		const p = positive / total;

		// Wilson score formula
		const denominator = 1 + (z * z) / total;
		const center = p + (z * z) / (2 * total);
		const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

		return (center - spread) / denominator;
	}

	/**
	 * Rank memories by Wilson score
	 */
	rankMemories(
		memories: Array<{
			id: string;
			hits: number;
			misses: number;
		}>
	): Array<{ id: string; score: number }> {
		return memories
			.map((m) => ({
				id: m.id,
				score: this.calculate(m.hits, m.hits + m.misses),
			}))
			.sort((a, b) => b.score - a.score);
	}

	/**
	 * Get confidence rating from score
	 */
	getConfidenceLevel(score: number): "high" | "medium" | "low" {
		if (score >= 0.7) return "high";
		if (score >= 0.4) return "medium";
		return "low";
	}
}
```

---

## Gap 4: Missing Memory Promotion System

### Roampal Feature

Memories automatically promote through tiers based on usage:

- `working` → `history` → `patterns`

### Current State

Static tiers with no automatic promotion.

### Required Implementation

```typescript
// src/lib/server/memory/services/PromotionService.ts

import { collections } from "$lib/server/database";
import { WilsonScoreService } from "./WilsonScoreService";

export interface PromotionCriteria {
	minAccessCount: number;
	minWilsonScore: number;
	minAge: number; // milliseconds
}

export class PromotionService {
	private wilsonScore = new WilsonScoreService();

	private readonly CRITERIA: Record<string, PromotionCriteria> = {
		working_to_history: {
			minAccessCount: 3,
			minWilsonScore: 0.5,
			minAge: 24 * 60 * 60 * 1000, // 1 day
		},
		history_to_patterns: {
			minAccessCount: 5,
			minWilsonScore: 0.7,
			minAge: 7 * 24 * 60 * 60 * 1000, // 7 days
		},
	};

	/**
	 * Check if memory qualifies for promotion
	 */
	async checkEligibility(
		userId: string,
		memoryId: string,
		currentTier: "working" | "history"
	): Promise<{ eligible: boolean; reason?: string; nextTier?: string }> {
		const stats = await this.getMemoryStats(userId, memoryId);
		const criteriaKey = `${currentTier}_to_${currentTier === "working" ? "history" : "patterns"}`;
		const criteria = this.CRITERIA[criteriaKey];

		if (!criteria) {
			return { eligible: false, reason: "invalid_tier" };
		}

		const score = this.wilsonScore.calculate(stats.hits, stats.total);
		const age = Date.now() - stats.createdAt.getTime();

		if (
			stats.accessCount >= criteria.minAccessCount &&
			score >= criteria.minWilsonScore &&
			age >= criteria.minAge
		) {
			return {
				eligible: true,
				reason: "criteria_met",
				nextTier: currentTier === "working" ? "history" : "patterns",
			};
		}

		return { eligible: false, reason: "criteria_not_met" };
	}

	/**
	 * Promote memory to next tier
	 */
	async promote(
		userId: string,
		memoryId: string,
		currentTier: "working" | "history",
		reason: string
	): Promise<{ success: boolean; newTier?: string; error?: string }> {
		const nextTier = currentTier === "working" ? "history" : "patterns";

		try {
			// Get memory from current tier collection
			const memory = await this.getMemoryFromTier(userId, memoryId, currentTier);
			if (!memory) {
				return { success: false, error: "memory_not_found" };
			}

			// Insert into new tier
			await this.insertIntoTier(userId, memory, nextTier);

			// Mark original as promoted
			await this.markAsPromoted(userId, memoryId, currentTier, nextTier, reason);

			return { success: true, newTier: nextTier };
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : "promotion_failed",
			};
		}
	}

	/**
	 * Run batch promotion check for user
	 */
	async runPromotionCheck(userId: string): Promise<{
		promoted: number;
		checked: number;
	}> {
		let promoted = 0;
		let checked = 0;

		// Check working memories
		const workingMemories = await this.getMemoriesInTier(userId, "working");
		for (const memory of workingMemories) {
			checked++;
			const eligibility = await this.checkEligibility(userId, memory.id, "working");
			if (eligibility.eligible) {
				const result = await this.promote(userId, memory.id, "working", eligibility.reason!);
				if (result.success) promoted++;
			}
		}

		// Check history memories
		const historyMemories = await this.getMemoriesInTier(userId, "history");
		for (const memory of historyMemories) {
			checked++;
			const eligibility = await this.checkEligibility(userId, memory.id, "history");
			if (eligibility.eligible) {
				const result = await this.promote(userId, memory.id, "history", eligibility.reason!);
				if (result.success) promoted++;
			}
		}

		return { promoted, checked };
	}

	// Helper methods
	private async getMemoryStats(userId: string, memoryId: string) {
		// Implementation to get memory statistics
		return {
			hits: 0,
			total: 0,
			accessCount: 0,
			createdAt: new Date(),
		};
	}

	private async getMemoryFromTier(userId: string, memoryId: string, tier: string) {
		// Implementation to get memory from specific tier
		return null;
	}

	private async insertIntoTier(userId: string, memory: any, tier: string) {
		// Implementation to insert into tier
	}

	private async markAsPromoted(
		userId: string,
		memoryId: string,
		fromTier: string,
		toTier: string,
		reason: string
	) {
		// Implementation to mark as promoted
	}

	private async getMemoriesInTier(userId: string, tier: string) {
		// Implementation to list memories in tier
		return [];
	}
}
```

---

## Gap 5: Missing Outcome Learning System

### Roampal Feature

Causal learning: tracks context × action × outcome to learn what works.

### Current State

No outcome tracking or learning from feedback.

### Required Implementation

```typescript
// src/lib/server/memory/learning/OutcomeService.ts

import { collections } from "$lib/server/database";
import type { ObjectId } from "mongodb";

export interface Outcome {
	context: string; // What was happening
	action: string; // What was done
	result: "success" | "failure" | "neutral";
	feedback?: string; // Optional user feedback
	confidence: number; // How confident in the outcome
	metadata?: Record<string, unknown>;
}

export interface OutcomePattern {
	context: string;
	successfulActions: string[];
	failedActions: string[];
	successRate: number;
}

export class OutcomeService {
	/**
	 * Record an outcome for learning
	 */
	async recordOutcome(userId: string, outcome: Outcome): Promise<string> {
		const doc = {
			userId,
			...outcome,
			timestamp: new Date(),
			processed: false,
		};

		const result = await collections.memoryOutcomes.insertOne(doc);
		return result.insertedId.toString();
	}

	/**
	 * Get successful patterns for a context
	 */
	async getSuccessfulPatterns(userId: string, context: string, limit = 5): Promise<Outcome[]> {
		return collections.memoryOutcomes
			.find({
				userId,
				result: "success",
				context: { $regex: context, $options: "i" },
			})
			.sort({ timestamp: -1, confidence: -1 })
			.limit(limit)
			.toArray() as Promise<Outcome[]>;
	}

	/**
	 * Get actions to avoid for a context
	 */
	async getFailedPatterns(userId: string, context: string, limit = 3): Promise<Outcome[]> {
		return collections.memoryOutcomes
			.find({
				userId,
				result: "failure",
				context: { $regex: context, $options: "i" },
			})
			.sort({ timestamp: -1 })
			.limit(limit)
			.toArray() as Promise<Outcome[]>;
	}

	/**
	 * Calculate success rate for an action type
	 */
	async getActionSuccessRate(
		userId: string,
		actionPattern: string
	): Promise<{ rate: number; total: number }> {
		const outcomes = await collections.memoryOutcomes
			.find({
				userId,
				action: { $regex: actionPattern, $options: "i" },
			})
			.toArray();

		if (outcomes.length === 0) {
			return { rate: 0, total: 0 };
		}

		const successes = outcomes.filter((o) => o.result === "success").length;
		return {
			rate: successes / outcomes.length,
			total: outcomes.length,
		};
	}

	/**
	 * Get aggregated patterns for context
	 */
	async getContextPatterns(userId: string, context: string): Promise<OutcomePattern> {
		const outcomes = await collections.memoryOutcomes
			.find({
				userId,
				context: { $regex: context, $options: "i" },
			})
			.toArray();

		const successful = outcomes.filter((o) => o.result === "success").map((o) => o.action);

		const failed = outcomes.filter((o) => o.result === "failure").map((o) => o.action);

		const total = outcomes.length;
		const successCount = successful.length;

		return {
			context,
			successfulActions: [...new Set(successful)],
			failedActions: [...new Set(failed)],
			successRate: total > 0 ? successCount / total : 0,
		};
	}

	/**
	 * Learn from conversation feedback
	 */
	async learnFromFeedback(
		userId: string,
		conversationId: string,
		feedback: "positive" | "negative",
		context: string
	): Promise<void> {
		await this.recordOutcome(userId, {
			context,
			action: `conversation:${conversationId}`,
			result: feedback === "positive" ? "success" : "failure",
			feedback: feedback,
			confidence: 0.8,
		});
	}
}
```

---

## Gap 6: Missing Ghost Registry (Soft Delete)

### Roampal Feature

Non-destructive deletion - memories are "ghosted" not deleted, allowing recovery.

### Current State

Hard deletes only.

### Required Implementation

```typescript
// src/lib/server/memory/services/GhostRegistry.ts

import { collections } from "$lib/server/database";
import type { ObjectId } from "mongodb";

export interface GhostRecord {
	userId: string;
	memoryId: string;
	tier: string;
	ghostedAt: Date;
	reason: string;
	expiresAt?: Date; // Optional auto-restore
}

export class GhostRegistry {
	private readonly DEFAULT_RETENTION = 30 * 24 * 60 * 60 * 1000; // 30 days

	/**
	 * Ghost a memory (soft delete)
	 */
	async ghostMemory(
		userId: string,
		memoryId: string,
		tier: string,
		reason: string,
		retentionDays?: number
	): Promise<void> {
		const expiresAt = retentionDays
			? new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000)
			: new Date(Date.now() + this.DEFAULT_RETENTION);

		await collections.memoryGhosts.updateOne(
			{ userId, memoryId },
			{
				$set: {
					userId,
					memoryId,
					tier,
					ghostedAt: new Date(),
					reason,
					expiresAt,
				},
			},
			{ upsert: true }
		);
	}

	/**
	 * Check if memory is ghosted
	 */
	async isGhosted(userId: string, memoryId: string): Promise<boolean> {
		const ghost = await collections.memoryGhosts.findOne({
			userId,
			memoryId,
			expiresAt: { $gt: new Date() },
		});
		return !!ghost;
	}

	/**
	 * Restore a ghosted memory
	 */
	async restoreMemory(userId: string, memoryId: string): Promise<boolean> {
		const result = await collections.memoryGhosts.deleteOne({
			userId,
			memoryId,
		});
		return result.deletedCount > 0;
	}

	/**
	 * Filter ghosted memories from a list
	 */
	async filterGhosted(userId: string, memoryIds: string[]): Promise<string[]> {
		if (memoryIds.length === 0) return [];

		const ghosts = await collections.memoryGhosts
			.find({
				userId,
				memoryId: { $in: memoryIds },
				expiresAt: { $gt: new Date() },
			})
			.toArray();

		const ghostedSet = new Set(ghosts.map((g) => g.memoryId));
		return memoryIds.filter((id) => !ghostedSet.has(id));
	}

	/**
	 * Get all ghosted memories for user
	 */
	async getGhostedMemories(userId: string): Promise<GhostRecord[]> {
		return collections.memoryGhosts
			.find({
				userId,
				expiresAt: { $gt: new Date() },
			})
			.sort({ ghostedAt: -1 })
			.toArray() as Promise<GhostRecord[]>;
	}

	/**
	 * Permanently delete expired ghosts
	 */
	async cleanupExpired(): Promise<number> {
		const result = await collections.memoryGhosts.deleteMany({
			expiresAt: { $lt: new Date() },
		});
		return result.deletedCount;
	}

	/**
	 * Bulk ghost memories
	 */
	async bulkGhost(
		userId: string,
		memoryIds: string[],
		tier: string,
		reason: string
	): Promise<number> {
		const operations = memoryIds.map((memoryId) => ({
			updateOne: {
				filter: { userId, memoryId },
				update: {
					$set: {
						userId,
						memoryId,
						tier,
						ghostedAt: new Date(),
						reason,
						expiresAt: new Date(Date.now() + this.DEFAULT_RETENTION),
					},
				},
				upsert: true,
			},
		}));

		const result = await collections.memoryGhosts.bulkWrite(operations);
		return result.upsertedCount + result.modifiedCount;
	}
}
```

---

## Gap 7: Missing Database Collections

### Required Collections

```typescript
// Add to src/lib/server/database.ts

// Types
export interface MemoryOutcome {
    _id: ObjectId;
    userId: string;
    context: string;
    action: string;
    result: "success" | "failure" | "neutral";
    feedback?: string;
    confidence: number;
    metadata?: Record<string, unknown>;
    timestamp: Date;
    processed: boolean;
}

export interface MemoryGhost {
    _id: ObjectId;
    userId: string;
    memoryId: string;
    tier: string;
    ghostedAt: Date;
    reason: string;
    expiresAt: Date;
}

export interface MemoryStats {
    _id: ObjectId;
    userId: string;
    memoryId: string;
    tier: string;
    hits: number;
    misses: number;
    accessCount: number;
    lastAccessed: Date;
    createdAt: Date;
}

// Collections interface addition
interface DBCollections {
    // ... existing collections ...
    memoryOutcomes: Collection<MemoryOutcome>;
    memoryGhosts: Collection<MemoryGhost>;
    memoryStats: Collection<MemoryStats>;
}

// Collection initialization
memoryOutcomes: db.collection<MemoryOutcome>("memory_outcomes"),
memoryGhosts: db.collection<MemoryGhost>("memory_ghosts"),
memoryStats: db.collection<MemoryStats>("memory_stats"),

// Indexes
await collections.memoryOutcomes.createIndex({ userId: 1, timestamp: -1 });
await collections.memoryOutcomes.createIndex({ userId: 1, context: 1 });
await collections.memoryGhosts.createIndex({ userId: 1, memoryId: 1 }, { unique: true });
await collections.memoryGhosts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
await collections.memoryStats.createIndex({ userId: 1, memoryId: 1 }, { unique: true });
await collections.memoryStats.createIndex({ userId: 1, tier: 1, lastAccessed: -1 });
```

---

## Gap 8: UnifiedMemoryFacade Integration

### Current State

Facade exists but doesn't integrate the new services.

### Required Modifications

```typescript
// src/lib/server/memory/UnifiedMemoryFacade.ts

import { WilsonScoreService } from "./services/WilsonScoreService";
import { PromotionService } from "./services/PromotionService";
import { OutcomeService } from "./learning/OutcomeService";
import { GhostRegistry } from "./services/GhostRegistry";

export class UnifiedMemoryFacade {
	private static instance: UnifiedMemoryFacade | null = null;

	// New services
	private wilsonScore: WilsonScoreService;
	private promotion: PromotionService;
	private outcomes: OutcomeService;
	private ghosts: GhostRegistry;

	private constructor() {
		this.wilsonScore = new WilsonScoreService();
		this.promotion = new PromotionService();
		this.outcomes = new OutcomeService();
		this.ghosts = new GhostRegistry();
	}

	static getInstance(): UnifiedMemoryFacade {
		if (!UnifiedMemoryFacade.instance) {
			UnifiedMemoryFacade.instance = new UnifiedMemoryFacade();
		}
		return UnifiedMemoryFacade.instance;
	}

	// Expose new service methods

	async recordOutcome(userId: string, outcome: Outcome): Promise<string> {
		return this.outcomes.recordOutcome(userId, outcome);
	}

	async getSuccessfulPatterns(userId: string, context: string, limit?: number) {
		return this.outcomes.getSuccessfulPatterns(userId, context, limit);
	}

	async promoteMemory(
		userId: string,
		memoryId: string,
		currentTier: "working" | "history",
		reason: string
	) {
		return this.promotion.promote(userId, memoryId, currentTier, reason);
	}

	async checkPromotionEligibility(
		userId: string,
		memoryId: string,
		currentTier: "working" | "history"
	) {
		return this.promotion.checkEligibility(userId, memoryId, currentTier);
	}

	async runPromotionCheck(userId: string) {
		return this.promotion.runPromotionCheck(userId);
	}

	async ghostMemory(userId: string, memoryId: string, tier: string, reason: string): Promise<void> {
		return this.ghosts.ghostMemory(userId, memoryId, tier, reason);
	}

	async restoreMemory(userId: string, memoryId: string): Promise<boolean> {
		return this.ghosts.restoreMemory(userId, memoryId);
	}

	async getGhostedMemories(userId: string) {
		return this.ghosts.getGhostedMemories(userId);
	}

	// Enhanced search with ghost filtering and Wilson ranking
	async search(params: { userId: string; query: string; tiers?: string[]; limit?: number }) {
		// Perform base search
		const results = await this.performSearch(params);

		// Filter out ghosted memories
		const memoryIds = results.map((r) => r.id);
		const nonGhosted = await this.ghosts.filterGhosted(params.userId, memoryIds);

		// Get stats for Wilson scoring
		const filteredResults = results.filter((r) => nonGhosted.includes(r.id));

		// Rank by Wilson score
		const ranked = this.wilsonScore.rankMemories(
			filteredResults.map((r) => ({
				id: r.id,
				hits: r.stats?.hits || 1,
				misses: r.stats?.misses || 0,
			}))
		);

		// Return in ranked order
		return ranked.map(({ id }) => filteredResults.find((r) => r.id === id)!);
	}

	// Track memory access for stats
	async trackAccess(userId: string, memoryId: string, hit: boolean): Promise<void> {
		await collections.memoryStats.updateOne(
			{ userId, memoryId },
			{
				$inc: hit ? { hits: 1, accessCount: 1 } : { misses: 1, accessCount: 1 },
				$set: { lastAccessed: new Date() },
				$setOnInsert: { createdAt: new Date() },
			},
			{ upsert: true }
		);
	}
}
```

---

## Implementation Checklist

### Phase 1: Auth Fixes (Immediate)

- [ ] Fix `src/routes/api/memory/search/+server.ts`
- [ ] Fix `src/routes/api/memory/kg/+server.ts`
- [ ] Fix `src/routes/api/memory/stats/+server.ts`
- [ ] Fix `src/routes/api/hooks/context/+server.ts`
- [ ] Fix `src/routes/api/hooks/exchange/+server.ts`
- [ ] Fix `src/routes/api/hooks/score/+server.ts`
- [ ] Fix `src/routes/api/memory/feedback/+server.ts`

### Phase 2: PersonalityLoader (Critical)

- [ ] Add `getPersonality(userId)` method
- [ ] Add `validateYaml(yaml_content)` method
- [ ] Add `reloadPersonality(userId)` method
- [ ] Add `getPresets()` method
- [ ] Add user cache with TTL

### Phase 3: Database Schema (Required)

- [ ] Add `MemoryOutcome` type
- [ ] Add `MemoryGhost` type
- [ ] Add `MemoryStats` type
- [ ] Add collections to database.ts
- [ ] Create indexes

### Phase 4: Services (Feature Parity)

- [ ] Create `WilsonScoreService`
- [ ] Create `PromotionService`
- [ ] Create `OutcomeService`
- [ ] Create `GhostRegistry`

### Phase 5: Integration (Final)

- [ ] Integrate services into `UnifiedMemoryFacade`
- [ ] Update search to use ghost filtering
- [ ] Update search to use Wilson ranking
- [ ] Add access tracking

---

## Verification Tests

### 1. Auth Pattern Test

```bash
# Without login, should work with sessionId
curl -X GET http://localhost:8003/api/memory/search?query=test
# Expected: 200 OK (not 401)
```

### 2. Personality Test

```bash
# Save custom personality
curl -X POST http://localhost:8003/api/memory/personality \
  -H "Content-Type: application/json" \
  -d '{"yaml_content": "name: custom\ntraits:\n  - helpful"}'
# Expected: 200 OK with success: true
```

### 3. Ghost Test

```bash
# Delete memory (should ghost, not hard delete)
curl -X DELETE http://localhost:8003/api/memory/memory-bank/123
# Memory should be ghosted, not permanently deleted
# Verify: GET /api/memory/search should not return it
# Verify: Ghost record exists in memory_ghosts collection
```

### 4. Promotion Test

```bash
# Access memory 5+ times
# Check promotion eligibility
curl -X GET http://localhost:8003/api/memory/promotion/check/123
# Expected: eligible: true after criteria met
```

### 5. Outcome Learning Test

```bash
# Record outcome
curl -X POST http://localhost:8003/api/memory/outcome \
  -H "Content-Type: application/json" \
  -d '{"context": "coding", "action": "suggested refactor", "result": "success"}'
# Verify patterns retrieved for similar context
```

---

## Summary Table

| Gap | Roampal Feature      | Current State            | Solution                   |
| --- | -------------------- | ------------------------ | -------------------------- |
| 1   | Session-based auth   | Wrong pattern in 7 files | Fix to `_id ?? sessionId`  |
| 2   | Per-user personality | File-based only          | Add database methods       |
| 3   | Wilson scoring       | No statistical ranking   | Add WilsonScoreService     |
| 4   | Memory promotion     | Static tiers             | Add PromotionService       |
| 5   | Outcome learning     | No feedback loop         | Add OutcomeService         |
| 6   | Soft delete          | Hard delete only         | Add GhostRegistry          |
| 7   | Stats tracking       | No usage stats           | Add MemoryStats collection |
| 8   | Integrated facade    | Services disconnected    | Wire into facade           |

---

## Estimated Effort

| Phase             | Files | Complexity | Priority |
| ----------------- | ----- | ---------- | -------- |
| Auth fixes        | 7     | Low        | Critical |
| PersonalityLoader | 1     | Medium     | Critical |
| Database schema   | 1     | Low        | High     |
| Services          | 4     | Medium     | High     |
| Integration       | 1     | Medium     | High     |

**Total new files**: 4
**Total modified files**: 9
**Lines of code**: ~800
