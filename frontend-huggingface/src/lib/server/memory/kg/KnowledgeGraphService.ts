/**
 * KnowledgeGraphService - Triple KG management
 *
 * Manages three knowledge graphs:
 * - Routing KG: concept → tier routing with success rates
 * - Content KG: entity nodes/edges with quality scoring
 * - Action KG: action effectiveness per context
 */

import type { Collection, Db } from "mongodb";
import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { MemoryTier, Outcome } from "../types";
import type {
	RoutingConcept,
	RoutingStats,
	TierStats,
	TierPlan,
	KgNode,
	KgEdge,
	ExtractedEntity,
	EntityBoost,
	ContextType,
	ActionEffectiveness,
	ActionExample,
	ContextInsightsResult,
	TurnContext,
	CachedAction,
} from "./types";

export interface KnowledgeGraphServiceConfig {
	db: Db;
	config?: MemoryConfig;
}

/**
 * Wilson score calculation for confidence intervals
 */
function calculateWilsonScore(successes: number, total: number, z = 1.96): number {
	if (total === 0) return 0.5;
	const p = successes / total;
	const denominator = 1 + (z * z) / total;
	const center = p + (z * z) / (2 * total);
	const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
	return (center - spread) / denominator;
}

/**
 * Default tier stats
 */
function defaultTierStats(): TierStats {
	return {
		success_rate: 0.5,
		wilson_score: 0.5,
		uses: 0,
		worked: 0,
		failed: 0,
		partial: 0,
		unknown: 0,
		last_used_at: null,
	};
}

/**
 * All memory tiers
 */
const ALL_TIERS: MemoryTier[] = ["working", "history", "patterns", "books", "memory_bank"];

/**
 * Max examples to keep per action (bounded growth)
 */
const MAX_ACTION_EXAMPLES = 20;

export class KnowledgeGraphService {
	private db: Db;
	private config: MemoryConfig;

	// Collections
	private routingConcepts!: Collection<RoutingConcept>;
	private routingStats!: Collection<RoutingStats>;
	private kgNodes!: Collection<KgNode>;
	private kgEdges!: Collection<KgEdge>;
	private actionEffectiveness!: Collection<ActionEffectiveness>;

	// Per-turn action cache (keyed by conversation_id:turn_id)
	private turnCache = new Map<string, TurnContext>();

	constructor(params: KnowledgeGraphServiceConfig) {
		this.db = params.db;
		this.config = params.config ?? defaultMemoryConfig;
	}

	/**
	 * Initialize collections
	 */
	async initialize(): Promise<void> {
		this.routingConcepts = this.db.collection("kg_routing_concepts");
		this.routingStats = this.db.collection("kg_routing_stats");
		this.kgNodes = this.db.collection("kg_nodes");
		this.kgEdges = this.db.collection("kg_edges");
		this.actionEffectiveness = this.db.collection("kg_action_effectiveness");

		// Create indexes
		await this.createIndexes();

		logger.info("KnowledgeGraphService initialized");
	}

	/**
	 * Create indexes for KG collections
	 */
	private async createIndexes(): Promise<void> {
		// Routing indexes
		await this.routingConcepts.createIndex({ user_id: 1, concept_id: 1 }, { unique: true });
		await this.routingConcepts.createIndex({ user_id: 1, label: 1 });
		await this.routingStats.createIndex({ user_id: 1, concept_id: 1 }, { unique: true });

		// Content KG indexes
		await this.kgNodes.createIndex({ user_id: 1, node_id: 1 }, { unique: true });
		await this.kgNodes.createIndex({ user_id: 1, label: 1 });
		await this.kgNodes.createIndex({ user_id: 1, avg_quality: -1 });
		await this.kgEdges.createIndex({ user_id: 1, edge_id: 1 }, { unique: true });
		await this.kgEdges.createIndex({ user_id: 1, source_id: 1 });
		await this.kgEdges.createIndex({ user_id: 1, target_id: 1 });

		// Action KG indexes
		await this.actionEffectiveness.createIndex(
			{ user_id: 1, context_type: 1, action: 1, tier: 1 },
			{ unique: true }
		);
	}

	// ============================================
	// Routing KG Methods
	// ============================================

	/**
	 * Get tier plan for a query based on routing KG
	 */
	async getTierPlan(userId: string, concepts: string[]): Promise<TierPlan> {
		if (concepts.length === 0) {
			return { tiers: ALL_TIERS, source: "default", confidence: 0.3 };
		}

		// Get stats for all concepts
		const conceptStats = await this.routingStats
			.find({
				user_id: userId,
				concept_id: { $in: concepts },
			})
			.toArray();

		if (conceptStats.length === 0) {
			// Cold start - return all tiers
			return { tiers: ALL_TIERS, source: "default", confidence: 0.3 };
		}

		// Aggregate tier scores across concepts
		const tierScores = new Map<MemoryTier, number>();
		for (const tier of ALL_TIERS) {
			tierScores.set(tier, 0);
		}

		for (const stats of conceptStats) {
			for (const tier of ALL_TIERS) {
				const tierStats = stats.tier_success_rates[tier];
				if (tierStats && tierStats.uses > 0) {
					const current = tierScores.get(tier) ?? 0;
					tierScores.set(tier, current + tierStats.wilson_score);
				}
			}
		}

		// Always include working tier
		const recommendedTiers: MemoryTier[] = ["working"];

		// Sort by score and add top tiers
		const sortedTiers = Array.from(tierScores.entries())
			.filter(([tier]) => tier !== "working")
			.sort((a, b) => b[1] - a[1]);

		for (const [tier, score] of sortedTiers) {
			if (score > 0.3 && recommendedTiers.length < 4) {
				recommendedTiers.push(tier);
			}
		}

		// If we didn't find enough good tiers, include all
		if (recommendedTiers.length < 2) {
			return { tiers: ALL_TIERS, source: "default", confidence: 0.4 };
		}

		// Wilson-based confidence: aggregate total uses and successes across all concepts/tiers
		let totalUses = 0;
		let totalWorked = 0;
		for (const stats of conceptStats) {
			for (const tier of ALL_TIERS) {
				const tierStats = stats.tier_success_rates[tier];
				if (tierStats) {
					totalUses += tierStats.uses;
					totalWorked += tierStats.worked;
				}
			}
		}
		const wilsonConfidence = calculateWilsonScore(totalWorked, totalUses);

		return {
			tiers: recommendedTiers,
			source: "routing_kg",
			confidence: Math.min(0.95, wilsonConfidence), // Cap at 0.95 (Roampal-aligned)
		};
	}

	/**
	 * Update routing stats after outcome
	 */
	async updateRoutingStats(
		userId: string,
		concepts: string[],
		tiers: MemoryTier[],
		outcome: Outcome
	): Promise<void> {
		const now = new Date();

		for (const conceptId of concepts) {
			// Ensure concept exists
			await this.routingConcepts.updateOne(
				{ user_id: userId, concept_id: conceptId },
				{
					$setOnInsert: {
						label: conceptId,
						aliases: [],
						first_seen_at: now,
					},
					$set: { last_seen_at: now },
				},
				{ upsert: true }
			);

			// Get or create stats
			let stats = await this.routingStats.findOne({
				user_id: userId,
				concept_id: conceptId,
			});

			if (!stats) {
				const tierRates: Record<string, TierStats> = {};
				for (const tier of ALL_TIERS) {
					tierRates[tier] = defaultTierStats();
				}
				stats = {
					user_id: userId,
					concept_id: conceptId,
					tier_success_rates: tierRates as Record<MemoryTier, TierStats>,
					best_tiers_cached: [],
				};
			}

			// Update stats for each tier that was searched
			for (const tier of tiers) {
				const tierStats = stats.tier_success_rates[tier];
				tierStats.uses++;
				tierStats[outcome]++;
				tierStats.last_used_at = now;

				// Recalculate success rate (worked / (worked + failed))
				const total = tierStats.worked + tierStats.failed;
				tierStats.success_rate = total > 0 ? tierStats.worked / total : 0.5;
				tierStats.wilson_score = calculateWilsonScore(tierStats.worked, total);
			}

			// Update best tiers cache
			stats.best_tiers_cached = ALL_TIERS.filter(
				(t) => stats!.tier_success_rates[t].wilson_score > 0.5
			).sort(
				(a, b) =>
					stats!.tier_success_rates[b].wilson_score - stats!.tier_success_rates[a].wilson_score
			);

			// Save
			await this.routingStats.updateOne(
				{ user_id: userId, concept_id: conceptId },
				{ $set: stats },
				{ upsert: true }
			);
		}
	}

	// ============================================
	// Content KG Methods
	// ============================================

	/**
	 * Extract entities from text (heuristic approach)
	 * Uses word-based extraction (Roampal pattern) instead of phrase-based
	 */
	extractEntities(text: string): ExtractedEntity[] {
		const entities: ExtractedEntity[] = [];
		const seen = new Set<string>();

		// Word-based extraction: split on whitespace and extract individual capitalized words
		const words = text.split(/\s+/);
		for (const word of words) {
			// Clean punctuation from word edges
			const cleanWord = word.replace(/^[^\w\u0590-\u05FF]+|[^\w\u0590-\u05FF]+$/g, "");
			if (cleanWord.length <= 2) continue;

			// Check for English capitalized words (including CamelCase like TypeScript, JavaScript)
			if (/^[A-Z][a-zA-Z]*$/.test(cleanWord) && !isCommonWord(cleanWord) && !seen.has(cleanWord)) {
				seen.add(cleanWord);
				entities.push({
					label: cleanWord,
					type: "concept",
					confidence: 0.6,
				});
			}
		}

		// Extract Hebrew words (individual words, not phrases)
		const hebrewPattern = /[\u0590-\u05FF]+/g;
		const hebrewMatches = text.match(hebrewPattern) ?? [];

		for (const match of hebrewMatches) {
			if (match.length > 2 && !isCommonWord(match) && !seen.has(match)) {
				seen.add(match);
				entities.push({
					label: match,
					type: "concept",
					confidence: 0.5,
				});
			}
		}

		return entities.slice(0, 10); // Limit to 10 entities
	}

	/**
	 * Update Content KG with entities from a memory
	 */
	async updateContentKg(
		userId: string,
		memoryId: string,
		entities: ExtractedEntity[],
		importance: number,
		confidence: number
	): Promise<void> {
		const now = new Date();
		const quality = importance * confidence;

		// Update/create nodes
		for (const entity of entities) {
			const nodeId = generateNodeId(entity.label);

			await this.kgNodes.updateOne(
				{ user_id: userId, node_id: nodeId },
				{
					$setOnInsert: {
						label: entity.label,
						node_type: entity.type === "concept" ? "concept" : "entity",
						aliases: [],
						first_seen_at: now,
					},
					$set: { last_seen_at: now },
					$inc: {
						mentions: 1,
						quality_sum: quality,
					},
					$addToSet: { memory_ids: memoryId },
				},
				{ upsert: true }
			);

			// Update avg_quality
			const node = await this.kgNodes.findOne({ user_id: userId, node_id: nodeId });
			if (node && node.mentions > 0) {
				await this.kgNodes.updateOne(
					{ user_id: userId, node_id: nodeId },
					{ $set: { avg_quality: node.quality_sum / node.mentions } }
				);
			}
		}

		// Create edges for co-occurring entities
		for (let i = 0; i < entities.length; i++) {
			for (let j = i + 1; j < entities.length; j++) {
				const sourceId = generateNodeId(entities[i].label);
				const targetId = generateNodeId(entities[j].label);
				const edgeId = `${sourceId}:${targetId}`;

				await this.kgEdges.updateOne(
					{ user_id: userId, edge_id: edgeId },
					{
						$setOnInsert: {
							source_id: sourceId,
							target_id: targetId,
							relation_type: "co_occurs",
							first_seen_at: now,
						},
						$set: { last_seen_at: now },
						$inc: { weight: 1 },
					},
					{ upsert: true }
				);
			}
		}
	}

	/**
	 * Get entity boost for memory_bank search
	 */
	async getEntityBoosts(userId: string, memoryIds: string[]): Promise<EntityBoost[]> {
		const boosts: EntityBoost[] = [];

		for (const memoryId of memoryIds) {
			// Find entities that mention this memory
			const nodes = await this.kgNodes
				.find({
					user_id: userId,
					memory_ids: memoryId,
				})
				.toArray();

			if (nodes.length > 0) {
				const totalBoost = nodes.reduce((sum, node) => sum + node.avg_quality * 0.2, 0);
				boosts.push({
					memory_id: memoryId,
					boost: Math.min(0.5, totalBoost), // Cap at 50%
					matched_entities: nodes.map((n) => n.label),
				});
			}
		}

		return boosts;
	}

	/**
	 * Get related entities for a concept
	 */
	async getRelatedEntities(userId: string, labels: string[], limit = 10): Promise<KgNode[]> {
		const nodeIds = labels.map(generateNodeId);

		// Get edges from these nodes
		const edges = await this.kgEdges
			.find({
				user_id: userId,
				$or: [{ source_id: { $in: nodeIds } }, { target_id: { $in: nodeIds } }],
			})
			.sort({ weight: -1 })
			.limit(limit * 2)
			.toArray();

		// Get target node IDs
		const relatedIds = new Set<string>();
		for (const edge of edges) {
			if (!nodeIds.includes(edge.source_id)) relatedIds.add(edge.source_id);
			if (!nodeIds.includes(edge.target_id)) relatedIds.add(edge.target_id);
		}

		// Fetch related nodes
		return this.kgNodes
			.find({
				user_id: userId,
				node_id: { $in: Array.from(relatedIds) },
			})
			.sort({ avg_quality: -1 })
			.limit(limit)
			.toArray();
	}

	// ============================================
	// Action KG Methods
	// ============================================

	/**
	 * Start tracking a turn's actions
	 */
	startTurn(conversationId: string, turnId: string, contextType: ContextType, query: string): void {
		const key = `${conversationId}:${turnId}`;
		this.turnCache.set(key, {
			conversation_id: conversationId,
			turn_id: turnId,
			context_type: contextType,
			actions: [],
			query,
		});
	}

	/**
	 * Record an action in the current turn
	 */
	recordAction(
		conversationId: string,
		turnId: string,
		action: string,
		tier: MemoryTier | null,
		memoryIds?: string[],
		toolName?: string
	): void {
		const key = `${conversationId}:${turnId}`;
		const turn = this.turnCache.get(key);

		if (turn) {
			turn.actions.push({
				action,
				tier,
				timestamp: new Date(),
				memory_ids: memoryIds,
				tool_name: toolName,
			});
		}
	}

	/**
	 * Apply outcome to turn's cached actions
	 */
	async applyOutcomeToTurn(
		userId: string,
		conversationId: string,
		turnId: string,
		outcome: Outcome
	): Promise<void> {
		const key = `${conversationId}:${turnId}`;
		const turn = this.turnCache.get(key);

		if (!turn || turn.actions.length === 0) {
			return;
		}

		const now = new Date();

		for (const cachedAction of turn.actions) {
			// Create example
			const example: ActionExample = {
				timestamp: now,
				conversation_id: conversationId,
				query_preview: turn.query.slice(0, 100),
				outcome,
				memory_ids: cachedAction.memory_ids,
				tool_runs: cachedAction.tool_name ? [cachedAction.tool_name] : undefined,
			};

			// Update action effectiveness
			await this.updateActionEffectiveness(
				userId,
				turn.context_type,
				cachedAction.action,
				cachedAction.tier,
				outcome,
				example
			);
		}

		// Clear turn cache
		this.turnCache.delete(key);
	}

	/**
	 * Update action effectiveness stats
	 */
	private async updateActionEffectiveness(
		userId: string,
		contextType: ContextType,
		action: string,
		tier: MemoryTier | null,
		outcome: Outcome,
		example: ActionExample
	): Promise<void> {
		const filter = {
			user_id: userId,
			context_type: contextType,
			action,
			tier,
		};

		// Get existing or create new
		let record = await this.actionEffectiveness.findOne(filter);

		if (!record) {
			record = {
				user_id: userId,
				context_type: contextType,
				action,
				tier,
				success_rate: 0.5,
				wilson_score: 0.5,
				uses: 0,
				worked: 0,
				failed: 0,
				partial: 0,
				unknown: 0,
				examples: [],
			};
		}

		// Update counts
		record.uses++;
		record[outcome]++;

		// Recalculate success rate
		const total = record.worked + record.failed;
		record.success_rate = total > 0 ? record.worked / total : 0.5;
		record.wilson_score = calculateWilsonScore(record.worked, total);

		// Add example (bounded)
		record.examples.push(example);
		if (record.examples.length > MAX_ACTION_EXAMPLES) {
			record.examples = record.examples.slice(-MAX_ACTION_EXAMPLES);
		}

		// Save
		await this.actionEffectiveness.updateOne(filter, { $set: record }, { upsert: true });
	}

	/**
	 * Get action effectiveness for a context
	 */
	async getActionEffectiveness(
		userId: string,
		contextType: ContextType
	): Promise<ActionEffectiveness[]> {
		return this.actionEffectiveness
			.find({ user_id: userId, context_type: contextType })
			.sort({ wilson_score: -1 })
			.toArray();
	}

	/**
	 * Get context insights combining all three KGs
	 */
	async getContextInsights(
		userId: string,
		contextType: ContextType,
		concepts: string[]
	): Promise<ContextInsightsResult> {
		// Get tier recommendations from Routing KG
		const tierPlan = await this.getTierPlan(userId, concepts);
		const tierRecommendations = tierPlan.tiers.map((tier) => ({
			tier,
			wilson_score: tierPlan.confidence,
			reason: tierPlan.source === "routing_kg" ? "Based on past success" : "Default recommendation",
		}));

		// Get action stats from Action KG
		const actionRecords = await this.getActionEffectiveness(userId, contextType);
		const actionStats = actionRecords.map((r) => ({
			action: r.action,
			success_rate: r.success_rate,
			uses: r.uses,
			recommendation:
				r.wilson_score > 0.6
					? ("preferred" as const)
					: r.wilson_score < 0.4
						? ("avoid" as const)
						: ("neutral" as const),
		}));

		// Get related entities from Content KG
		const relatedNodes = await this.getRelatedEntities(userId, concepts, 5);
		const relatedEntities = relatedNodes.map((n) => ({
			label: n.label,
			quality: n.avg_quality,
		}));

		return {
			context_type: contextType,
			tier_recommendations: tierRecommendations,
			action_stats: actionStats,
			related_entities: relatedEntities,
		};
	}

	/**
	 * Detect context type from query and recent messages
	 */
	detectContextType(query: string, recentMessages: string[]): ContextType {
		const combined = [query, ...recentMessages].join(" ").toLowerCase();

		if (combined.includes("docker") || combined.includes("container")) {
			return "docker";
		}
		if (
			combined.includes("bug") ||
			combined.includes("error") ||
			combined.includes("debug") ||
			combined.includes("fix")
		) {
			return "debugging";
		}
		if (
			combined.includes("datagov") ||
			combined.includes("ממשלתי") ||
			combined.includes("data.gov")
		) {
			return "datagov_query";
		}
		if (
			combined.includes("document") ||
			combined.includes("pdf") ||
			combined.includes("מסמך") ||
			combined.includes("קובץ")
		) {
			return "doc_rag";
		}
		if (
			combined.includes("code") ||
			combined.includes("function") ||
			combined.includes("implement")
		) {
			return "coding_help";
		}
		if (
			combined.includes("search") ||
			combined.includes("find") ||
			combined.includes("חפש") ||
			combined.includes("מצא")
		) {
			return "web_search";
		}
		if (
			combined.includes("remember") ||
			combined.includes("זכור") ||
			combined.includes("memory") ||
			combined.includes("save")
		) {
			return "memory_management";
		}

		return "general";
	}

	/**
	 * Cleanup stale edges when memory is archived/deleted
	 */
	async cleanupMemoryReferences(userId: string, memoryId: string): Promise<void> {
		// Remove memory from nodes
		await this.kgNodes.updateMany(
			{ user_id: userId, memory_ids: memoryId },
			{ $pull: { memory_ids: memoryId } }
		);

		// Recalculate mentions and quality for affected nodes
		const affectedNodes = await this.kgNodes
			.find({
				user_id: userId,
				memory_ids: { $size: 0 },
			})
			.toArray();

		// Remove nodes with no memories
		if (affectedNodes.length > 0) {
			const nodeIds = affectedNodes.map((n) => n.node_id);
			await this.kgNodes.deleteMany({ user_id: userId, node_id: { $in: nodeIds } });

			// Remove edges connected to deleted nodes
			await this.kgEdges.deleteMany({
				user_id: userId,
				$or: [{ source_id: { $in: nodeIds } }, { target_id: { $in: nodeIds } }],
			});
		}
	}
}

// ============================================
// Utility Functions
// ============================================

/**
 * Generate node ID from label
 */
function generateNodeId(label: string): string {
	return label.toLowerCase().replace(/\s+/g, "_").slice(0, 50);
}

/**
 * Check if word is common (should not be extracted as entity)
 * Includes both English and Hebrew common words for bilingual support
 */
function isCommonWord(word: string): boolean {
	const common = new Set([
		// English common words
		"The",
		"This",
		"That",
		"These",
		"Those",
		"What",
		"When",
		"Where",
		"Which",
		"Who",
		"How",
		"Why",
		"Can",
		"Could",
		"Would",
		"Should",
		"Will",
		"May",
		"Must",
		"Have",
		"Has",
		"Had",
		"Been",
		"Being",
		"Are",
		"Was",
		"Were",
		"And",
		"But",
		"For",
		"Not",
		"You",
		"All",
		"Any",
		"Each",
		"Every",
		"Some",
		"One",
		"Two",
		"Three",
		// Hebrew common words (pronouns, conjunctions, prepositions, question words)
		"זה",     // this
		"זאת",    // this (feminine)
		"את",     // you (feminine) / direct object marker
		"של",     // of
		"על",     // on/about
		"עם",     // with
		"אני",    // I
		"הוא",    // he
		"היא",    // she
		"הם",     // they (masculine)
		"הן",     // they (feminine)
		"אתה",    // you (masculine)
		"אתם",    // you (plural masculine)
		"אתן",    // you (plural feminine)
		"לא",     // no/not
		"כן",     // yes
		"מה",     // what
		"איך",    // how
		"למה",    // why
		"מתי",    // when
		"איפה",   // where
		"כמה",    // how much/many
		"אחד",    // one
		"שני",    // two
		"שלוש",   // three
		"או",     // or
		"גם",     // also
		"רק",     // only
		"אם",     // if
		"כי",     // because
		"אבל",    // but
		"בגלל",   // because of
		"לפני",   // before
		"אחרי",   // after
		"בין",    // between
		"תחת",    // under
		"מעל",    // above
	]);
	return common.has(word);
}
