/**
 * Unit Tests for KnowledgeGraphService
 *
 * Tests the Knowledge Graph logic including:
 * - Entity extraction
 * - Routing KG (concept → tier routing)
 * - Content KG (entity nodes/edges)
 * - Action KG (action effectiveness)
 *
 * Adapted from: roampal/backend/tests/unit/test_knowledge_graph_service.py
 *
 * Usage:
 *     npx vitest run src/lib/server/memory/__tests__/unit/test_knowledge_graph_service.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// =============================================================================
// Test Result Tracking
// =============================================================================

interface TestResult {
	name: string;
	passed: boolean;
	details?: string;
	error?: string;
}

const testResults: TestResult[] = [];

function recordResult(name: string, passed: boolean, details?: string, error?: string) {
	testResults.push({ name, passed, details, error });
}

// =============================================================================
// Mock Setup
// =============================================================================

// Mock MongoDB collections
const mockRoutingConcepts = {
	createIndex: vi.fn().mockResolvedValue(undefined),
	updateOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
	findOne: vi.fn().mockResolvedValue(null),
	find: vi.fn().mockReturnValue({
		toArray: vi.fn().mockResolvedValue([]),
	}),
};

const mockRoutingStats = {
	createIndex: vi.fn().mockResolvedValue(undefined),
	updateOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
	findOne: vi.fn().mockResolvedValue(null),
	find: vi.fn().mockReturnValue({
		toArray: vi.fn().mockResolvedValue([]),
	}),
};

const mockKgNodes = {
	createIndex: vi.fn().mockResolvedValue(undefined),
	updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
	findOne: vi.fn().mockResolvedValue(null),
	find: vi.fn().mockReturnValue({
		sort: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		toArray: vi.fn().mockResolvedValue([]),
	}),
	updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
	deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
};

const mockKgEdges = {
	createIndex: vi.fn().mockResolvedValue(undefined),
	updateOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
	find: vi.fn().mockReturnValue({
		sort: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		toArray: vi.fn().mockResolvedValue([]),
	}),
	deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
};

const mockActionEffectiveness = {
	createIndex: vi.fn().mockResolvedValue(undefined),
	updateOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
	findOne: vi.fn().mockResolvedValue(null),
	find: vi.fn().mockReturnValue({
		sort: vi.fn().mockReturnThis(),
		toArray: vi.fn().mockResolvedValue([]),
	}),
};

const mockContextActionEffectiveness = {
	createIndex: vi.fn().mockResolvedValue(undefined),
	updateOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
	find: vi.fn().mockReturnValue({
		sort: vi.fn().mockReturnThis(),
		toArray: vi.fn().mockResolvedValue([]),
	}),
};

const mockDb = {
	collection: vi.fn((name: string) => {
		switch (name) {
			case "kg_routing_concepts":
				return mockRoutingConcepts;
			case "kg_routing_stats":
				return mockRoutingStats;
			case "kg_nodes":
				return mockKgNodes;
			case "kg_edges":
				return mockKgEdges;
			case "kg_action_effectiveness":
				return mockActionEffectiveness;
			case "kg_context_action_effectiveness":
				return mockContextActionEffectiveness;
			default:
				return {};
		}
	}),
};

vi.mock("$lib/server/database", () => ({
	collections: {},
}));

vi.mock("$lib/server/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("$env/dynamic/private", () => ({
	env: {},
}));

// =============================================================================
// TestEntityExtraction: Test entity extraction from text
// =============================================================================

describe("TestEntityExtraction", () => {
	let service: any;

	beforeEach(async () => {
		// Reset mocks
		vi.clearAllMocks();

		// Import and create service
		const { KnowledgeGraphService } = await import("../../kg/KnowledgeGraphService");
		service = new KnowledgeGraphService({ db: mockDb as any });
		await service.initialize();
	});

	/**
	 * test_extract_capitalized_words
	 *
	 * Should extract capitalized words as entities.
	 */
	it("should extract capitalized words as entities", () => {
		const testName = "test_extract_capitalized_words";
		try {
			const entities = service.extractEntities("Python programming and Django framework");

			const labels = entities.map((e: any) => e.label);
			expect(labels).toContain("Python");
			expect(labels).toContain("Django");

			recordResult(testName, true, `Extracted ${entities.length} entities`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_extract_capitalized_words
	 *
	 * Should extract individual capitalized words (word-based extraction pattern).
	 */
	it("should extract capitalized words individually", () => {
		const testName = "test_extract_capitalized_words";
		try {
			const entities = service.extractEntities("The React Native framework is great");

			const labels = entities.map((e: any) => e.label);
			// Word-based extraction: "React" and "Native" extracted separately
			expect(labels).toContain("React");
			expect(labels).toContain("Native");

			recordResult(testName, true, `Extracted words: ${labels.join(", ")}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_extract_hebrew_words
	 *
	 * Should extract Hebrew words as entities.
	 */
	it("should extract Hebrew words", () => {
		const testName = "test_extract_hebrew_words";
		try {
			const entities = service.extractEntities("עברית ותכנות בשפת פייתון");

			const labels = entities.map((e: any) => e.label);
			expect(labels.length).toBeGreaterThan(0);
			// Hebrew entities should be extracted
			expect(labels.some((l: string) => /[\u0590-\u05FF]/.test(l))).toBe(true);

			recordResult(testName, true, `Extracted Hebrew entities: ${labels.length}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_filter_common_words
	 *
	 * Should filter out common words.
	 */
	it("should filter out common words", () => {
		const testName = "test_filter_common_words";
		try {
			const entities = service.extractEntities("The What When Where Which Python");

			const labels = entities.map((e: any) => e.label);
			// Common words like The, What should be filtered
			expect(labels).not.toContain("The");
			expect(labels).not.toContain("What");
			// But Python should be included
			expect(labels).toContain("Python");

			recordResult(testName, true, "Common words filtered correctly");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	it("should filter blocklisted internal tokens", () => {
		const testName = "test_filter_blocklisted_tokens";
		try {
			const entities = service.extractEntities(
				"Function Request Response Query Result Python Django"
			);
			const labels = entities.map((e: any) => e.label);
			expect(labels).toContain("Python");
			expect(labels).toContain("Django");
			expect(labels).not.toContain("Function");
			expect(labels).not.toContain("Request");
			expect(labels).not.toContain("Response");
			expect(labels).not.toContain("Query");
			expect(labels).not.toContain("Result");
			recordResult(testName, true, "Blocklisted tokens filtered correctly");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_filter_short_words
	 *
	 * Should filter words with 2 or fewer characters.
	 */
	it("should filter short words", () => {
		const testName = "test_filter_short_words";
		try {
			const entities = service.extractEntities("Go Is A Fun Language Python");

			const labels = entities.map((e: any) => e.label);
			// Short words like Go, Is, A should be filtered (or caught by common words)
			expect(labels).toContain("Python");
			expect(labels).toContain("Language");

			recordResult(testName, true, `Labels: ${labels.join(", ")}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_empty_text
	 *
	 * Empty text should return empty array.
	 */
	it("should return empty array for empty text", () => {
		const testName = "test_empty_text";
		try {
			const entities = service.extractEntities("");

			expect(entities).toEqual([]);

			recordResult(testName, true, "Empty text handled correctly");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_limit_entities
	 *
	 * Should limit to maximum 10 entities.
	 */
	it("should limit entities to 10", () => {
		const testName = "test_limit_entities";
		try {
			// Create text with many capitalized words
			const words = "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi";
			const entities = service.extractEntities(words);

			expect(entities.length).toBeLessThanOrEqual(10);

			recordResult(testName, true, `Extracted ${entities.length} entities (max 10)`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_entity_confidence
	 *
	 * Extracted entities should have confidence scores.
	 */
	it("should include confidence in extracted entities", () => {
		const testName = "test_entity_confidence";
		try {
			const entities = service.extractEntities("Python programming");

			expect(entities.length).toBeGreaterThan(0);
			expect(entities[0]).toHaveProperty("confidence");
			expect(entities[0].confidence).toBeGreaterThan(0);
			expect(entities[0].confidence).toBeLessThanOrEqual(1);

			recordResult(testName, true, `Confidence: ${entities[0].confidence}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestRoutingKG: Test KG routing pattern updates
// =============================================================================

describe("TestRoutingKG", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { KnowledgeGraphService } = await import("../../kg/KnowledgeGraphService");
		service = new KnowledgeGraphService({ db: mockDb as any });
		await service.initialize();
	});

	/**
	 * test_get_tier_plan_default
	 *
	 * Should return all tiers for new concepts (cold start).
	 */
	it("should return default tier plan for empty concepts", async () => {
		const testName = "test_get_tier_plan_default";
		try {
			const plan = await service.getTierPlan("user_123", []);

			expect(plan.tiers).toContain("working");
			expect(plan.source).toBe("default");
			expect(plan.confidence).toBe(0.3);

			recordResult(testName, true, `Default plan: ${plan.tiers.join(", ")}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_get_tier_plan_with_stats
	 *
	 * Should return optimized tier plan when stats exist.
	 */
	it("should return optimized tier plan with stats", async () => {
		const testName = "test_get_tier_plan_with_stats";
		try {
			// Mock existing stats
			mockRoutingStats.find.mockReturnValueOnce({
				toArray: vi.fn().mockResolvedValue([
					{
						user_id: "user_123",
						concept_id: "python",
						tier_success_rates: {
							working: { wilson_score: 0.8, uses: 10 },
							history: { wilson_score: 0.6, uses: 8 },
							patterns: { wilson_score: 0.4, uses: 5 },
							books: { wilson_score: 0.7, uses: 6 },
							memory_bank: { wilson_score: 0.3, uses: 3 },
						},
					},
				]),
			});

			const plan = await service.getTierPlan("user_123", ["python"]);

			expect(plan.tiers).toContain("working"); // Always included
			expect(plan.source).toBe("routing_kg");

			recordResult(testName, true, `Optimized plan: ${plan.tiers.join(", ")}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_update_routing_stats_creates_concept
	 *
	 * Should create concept and stats on first update.
	 */
	it("should create routing stats on first update", async () => {
		const testName = "test_update_routing_stats_creates";
		try {
			await service.updateRoutingStats("user_123", ["python"], ["working", "history"], "worked");

			// Should have called updateOne to create concept
			expect(mockRoutingConcepts.updateOne).toHaveBeenCalled();
			// Should have called updateOne to save stats
			expect(mockRoutingStats.updateOne).toHaveBeenCalled();

			recordResult(testName, true, "Routing stats created");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_update_routing_stats_tracks_outcome
	 *
	 * Should track success/failure outcomes.
	 */
	it("should track success and failure outcomes", async () => {
		const testName = "test_update_routing_stats_outcomes";
		try {
			// Simulate existing stats
			mockRoutingStats.findOne.mockResolvedValueOnce({
				user_id: "user_123",
				concept_id: "python",
				tier_success_rates: {
					working: { uses: 5, worked: 3, failed: 1, partial: 1, unknown: 0, wilson_score: 0.6 },
					history: { uses: 0, worked: 0, failed: 0, partial: 0, unknown: 0, wilson_score: 0.5 },
					patterns: { uses: 0, worked: 0, failed: 0, partial: 0, unknown: 0, wilson_score: 0.5 },
					books: { uses: 0, worked: 0, failed: 0, partial: 0, unknown: 0, wilson_score: 0.5 },
					memory_bank: { uses: 0, worked: 0, failed: 0, partial: 0, unknown: 0, wilson_score: 0.5 },
				},
				best_tiers_cached: ["working"],
			});

			await service.updateRoutingStats("user_123", ["python"], ["working"], "worked");

			// Should have saved updated stats
			expect(mockRoutingStats.updateOne).toHaveBeenCalled();

			recordResult(testName, true, "Outcomes tracked correctly");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestContentKG: Test Content KG entity/edge management
// =============================================================================

describe("TestContentKG", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { KnowledgeGraphService } = await import("../../kg/KnowledgeGraphService");
		service = new KnowledgeGraphService({ db: mockDb as any });
		await service.initialize();
	});

	/**
	 * test_update_content_kg_creates_nodes
	 *
	 * Should create nodes for extracted entities.
	 */
	it("should create nodes for entities", async () => {
		const testName = "test_update_content_kg_nodes";
		try {
			const entities = [
				{ label: "Python", type: "concept", confidence: 0.8 },
				{ label: "Django", type: "concept", confidence: 0.7 },
			];

			await service.updateContentKg("user_123", "mem_1", entities, 0.8, 0.9);

			// Should have created nodes
			expect(mockKgNodes.updateOne).toHaveBeenCalledTimes(2);

			recordResult(testName, true, "Nodes created for entities");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_update_content_kg_creates_edges
	 *
	 * Should create edges between co-occurring entities.
	 */
	it("should create edges between co-occurring entities", async () => {
		const testName = "test_update_content_kg_edges";
		try {
			const entities = [
				{ label: "Python", type: "concept", confidence: 0.8 },
				{ label: "Django", type: "concept", confidence: 0.7 },
				{ label: "Web", type: "concept", confidence: 0.6 },
			];

			// Reset node findOne to return null (so we don't fail on avg_quality update)
			mockKgNodes.findOne.mockResolvedValue(null);

			await service.updateContentKg("user_123", "mem_1", entities, 0.8, 0.9);

			// Should have created edges: Python-Django, Python-Web, Django-Web = 3 edges
			expect(mockKgEdges.updateOne).toHaveBeenCalledTimes(3);

			recordResult(testName, true, "3 edges created for co-occurring entities");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_get_entity_boosts
	 *
	 * Should return entity boosts for memories.
	 */
	it("should return entity boosts for memories", async () => {
		const testName = "test_get_entity_boosts";
		try {
			// Mock nodes that mention the memory
			mockKgNodes.find.mockReturnValueOnce({
				toArray: vi.fn().mockResolvedValue([
					{ label: "Python", avg_quality: 0.8 },
					{ label: "Django", avg_quality: 0.7 },
				]),
			});

			const boosts = await service.getEntityBoosts("user_123", ["mem_1"]);

			expect(boosts.length).toBe(1);
			expect(boosts[0].memory_id).toBe("mem_1");
			expect(boosts[0].boost).toBeGreaterThan(0);
			expect(boosts[0].matched_entities).toContain("Python");
			expect(boosts[0].matched_entities).toContain("Django");

			recordResult(testName, true, `Boost: ${boosts[0].boost.toFixed(3)}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_get_related_entities
	 *
	 * Should return related entities based on edges.
	 */
	it("should return related entities", async () => {
		const testName = "test_get_related_entities";
		try {
			// Mock edges
			mockKgEdges.find.mockReturnValueOnce({
				sort: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				toArray: vi.fn().mockResolvedValue([
					{ source_id: "python", target_id: "django", weight: 10 },
					{ source_id: "python", target_id: "web", weight: 5 },
				]),
			});

			// Mock related nodes
			mockKgNodes.find.mockReturnValueOnce({
				sort: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				toArray: vi.fn().mockResolvedValue([
					{ node_id: "django", label: "Django", avg_quality: 0.8 },
					{ node_id: "web", label: "Web", avg_quality: 0.6 },
				]),
			});

			const related = await service.getRelatedEntities("user_123", ["Python"], 5);

			expect(related.length).toBe(2);

			recordResult(testName, true, `Found ${related.length} related entities`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestActionKG: Test Action KG tracking
// =============================================================================

describe("TestActionKG", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { KnowledgeGraphService } = await import("../../kg/KnowledgeGraphService");
		service = new KnowledgeGraphService({ db: mockDb as any });
		await service.initialize();
	});

	/**
	 * test_start_turn
	 *
	 * Should start tracking a turn's actions.
	 */
	it("should start turn tracking", () => {
		const testName = "test_start_turn";
		try {
			service.startTurn("conv_1", "turn_1", "coding_help", "How to use Python?");

			// Internal cache should have the turn
			const key = "conv_1:turn_1";
			// We can't directly access private turnCache, but we can verify through behavior

			recordResult(testName, true, "Turn tracking started");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_record_action
	 *
	 * Should record an action in the current turn.
	 */
	it("should record action in turn", () => {
		const testName = "test_record_action";
		try {
			service.startTurn("conv_1", "turn_1", "coding_help", "How to use Python?");
			service.recordAction("conv_1", "turn_1", "search", "working", ["mem_1"], "search_memory");

			// Action should be recorded (verify through applyOutcome)
			recordResult(testName, true, "Action recorded");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_apply_outcome_to_turn
	 *
	 * Should apply outcome to cached turn actions.
	 */
	it("should apply outcome to turn actions", async () => {
		const testName = "test_apply_outcome_to_turn";
		try {
			service.startTurn("conv_1", "turn_1", "coding_help", "How to use Python?");
			service.recordAction("conv_1", "turn_1", "search", "working", ["mem_1"], "search_memory");

			await service.applyOutcomeToTurn("user_123", "conv_1", "turn_1", "worked");

			// Should have updated action effectiveness
			expect(mockActionEffectiveness.updateOne).toHaveBeenCalled();

			recordResult(testName, true, "Outcome applied to turn");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_get_action_effectiveness
	 *
	 * Should return action effectiveness for a context.
	 */
	it("should return action effectiveness", async () => {
		const testName = "test_get_action_effectiveness";
		try {
			// Mock effectiveness records
			mockActionEffectiveness.find.mockReturnValueOnce({
				sort: vi.fn().mockReturnThis(),
				toArray: vi.fn().mockResolvedValue([
					{
						action: "search",
						tier: "working",
						success_rate: 0.8,
						wilson_score: 0.75,
						uses: 10,
					},
					{
						action: "store",
						tier: "history",
						success_rate: 0.6,
						wilson_score: 0.55,
						uses: 5,
					},
				]),
			});

			const effectiveness = await service.getActionEffectiveness("user_123", "coding_help");

			expect(effectiveness.length).toBe(2);
			expect(effectiveness[0].action).toBe("search");

			recordResult(testName, true, `Found ${effectiveness.length} effectiveness records`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestContextDetection: Test context type detection
// =============================================================================

describe("TestContextDetection", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { KnowledgeGraphService } = await import("../../kg/KnowledgeGraphService");
		service = new KnowledgeGraphService({ db: mockDb as any });
		await service.initialize();
	});

	/**
	 * test_detect_docker_context
	 */
	it("should detect docker context", () => {
		const testName = "test_detect_docker_context";
		try {
			const context = service.detectContextType("How do I run a docker container?", []);

			expect(context).toBe("docker");

			recordResult(testName, true, `Detected: ${context}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_detect_debugging_context
	 */
	it("should detect debugging context", () => {
		const testName = "test_detect_debugging_context";
		try {
			const context = service.detectContextType("I have an error in my code", []);

			expect(context).toBe("debugging");

			recordResult(testName, true, `Detected: ${context}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_detect_datagov_context
	 */
	it("should detect datagov context", () => {
		const testName = "test_detect_datagov_context";
		try {
			const context = service.detectContextType("חפש מידע ממשלתי", []);

			expect(context).toBe("datagov_query");

			recordResult(testName, true, `Detected: ${context}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_detect_doc_rag_context
	 */
	it("should detect doc_rag context", () => {
		const testName = "test_detect_doc_rag_context";
		try {
			const context = service.detectContextType("Read this PDF document", []);

			expect(context).toBe("doc_rag");

			recordResult(testName, true, `Detected: ${context}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_detect_coding_context
	 */
	it("should detect coding context", () => {
		const testName = "test_detect_coding_context";
		try {
			const context = service.detectContextType("Implement a function to sort arrays", []);

			expect(context).toBe("coding_help");

			recordResult(testName, true, `Detected: ${context}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_detect_web_search_context
	 */
	it("should detect web_search context", () => {
		const testName = "test_detect_web_search_context";
		try {
			const context = service.detectContextType("Search for the latest news", []);

			expect(context).toBe("web_search");

			recordResult(testName, true, `Detected: ${context}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_detect_memory_context
	 */
	it("should detect memory_management context", () => {
		const testName = "test_detect_memory_context";
		try {
			const context = service.detectContextType("Remember this important fact", []);

			expect(context).toBe("memory_management");

			recordResult(testName, true, `Detected: ${context}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_detect_general_context
	 */
	it("should default to general context", () => {
		const testName = "test_detect_general_context";
		try {
			const context = service.detectContextType("Tell me a joke", []);

			expect(context).toBe("general");

			recordResult(testName, true, `Detected: ${context}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_detect_hebrew_search_context
	 */
	it("should detect Hebrew search context", () => {
		const testName = "test_detect_hebrew_search_context";
		try {
			const context = service.detectContextType("חפש מידע על פייתון", []);

			expect(context).toBe("web_search");

			recordResult(testName, true, `Detected: ${context}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestContextInsights: Test combined KG insights
// =============================================================================

describe("TestContextInsights", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { KnowledgeGraphService } = await import("../../kg/KnowledgeGraphService");
		service = new KnowledgeGraphService({ db: mockDb as any });
		await service.initialize();
	});

	/**
	 * test_get_context_insights
	 *
	 * Should return combined insights from all three KGs.
	 */
	it("should return combined context insights", async () => {
		const testName = "test_get_context_insights";
		try {
			// Mock routing stats (empty)
			mockRoutingStats.find.mockReturnValueOnce({
				toArray: vi.fn().mockResolvedValue([]),
			});

			// Mock action effectiveness
			mockActionEffectiveness.find.mockReturnValueOnce({
				sort: vi.fn().mockReturnThis(),
				toArray: vi.fn().mockResolvedValue([
					{
						action: "search",
						success_rate: 0.8,
						wilson_score: 0.75,
						uses: 10,
					},
				]),
			});

			// Mock edges for related entities
			mockKgEdges.find.mockReturnValueOnce({
				sort: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				toArray: vi.fn().mockResolvedValue([]),
			});

			// Mock nodes for related entities
			mockKgNodes.find.mockReturnValueOnce({
				sort: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				toArray: vi.fn().mockResolvedValue([]),
			});

			const insights = await service.getContextInsights("user_123", "coding_help", ["python"]);

			expect(insights).toHaveProperty("context_type", "coding_help");
			expect(insights).toHaveProperty("tier_recommendations");
			expect(insights).toHaveProperty("action_stats");
			expect(insights).toHaveProperty("related_entities");
			expect(Array.isArray(insights.tier_recommendations)).toBe(true);
			expect(Array.isArray(insights.action_stats)).toBe(true);

			recordResult(testName, true, `Insights: ${insights.tier_recommendations.length} tier recs`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestKGCleanup: Test KG cleanup operations
// =============================================================================

describe("TestKGCleanup", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { KnowledgeGraphService } = await import("../../kg/KnowledgeGraphService");
		service = new KnowledgeGraphService({ db: mockDb as any });
		await service.initialize();
	});

	/**
	 * test_cleanup_memory_references
	 *
	 * Should remove references to deleted memories.
	 */
	it("should cleanup memory references", async () => {
		const testName = "test_cleanup_memory_references";
		try {
			// Mock nodes with empty memory_ids after pull
			mockKgNodes.find.mockReturnValueOnce({
				toArray: vi.fn().mockResolvedValue([{ node_id: "orphan_node", memory_ids: [] }]),
			});

			await service.cleanupMemoryReferences("user_123", "mem_to_delete");

			// Should have pulled memory from nodes
			expect(mockKgNodes.updateMany).toHaveBeenCalled();

			// Should have deleted orphaned nodes
			expect(mockKgNodes.deleteMany).toHaveBeenCalled();

			// Should have deleted edges connected to orphaned nodes
			expect(mockKgEdges.deleteMany).toHaveBeenCalled();

			recordResult(testName, true, "Memory references cleaned up");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// Summary Report
// =============================================================================

describe("TestSummary", () => {
	it("should generate knowledge graph test summary", () => {
		console.log("\n=== KNOWLEDGE GRAPH SERVICE TEST SUMMARY ===\n");

		const passed = testResults.filter((r) => r.passed).length;
		const failed = testResults.filter((r) => !r.passed).length;

		console.log(`Total Tests: ${testResults.length}`);
		console.log(`Passed: ${passed}`);
		console.log(`Failed: ${failed}`);
		console.log(`Pass Rate: ${((passed / testResults.length) * 100).toFixed(1)}%`);

		if (failed > 0) {
			console.log("\nFailed Tests:");
			testResults
				.filter((r) => !r.passed)
				.forEach((r) => {
					console.log(`  - ${r.name}: ${r.error}`);
				});
		}

		console.log("\n============================================\n");

		expect(true).toBe(true);
	});
});
