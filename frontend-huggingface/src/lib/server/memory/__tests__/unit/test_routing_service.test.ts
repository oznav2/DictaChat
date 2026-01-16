/**
 * Unit Tests for Routing Service
 *
 * Tests the routing logic for intelligent tier selection.
 * Adapted from roampal/backend/tests/unit/test_routing_service.py
 *
 * Key areas tested:
 * - Query preprocessing and concept extraction
 * - Tier score calculation based on routing patterns
 * - Query routing to appropriate tiers
 * - Tier recommendations with confidence levels
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// Mock logger
vi.mock("$lib/server/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock MongoDB
const mockRoutingConcepts = {
	updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
	findOne: vi.fn(),
	find: vi.fn(() => ({
		toArray: vi.fn().mockResolvedValue([]),
	})),
	createIndex: vi.fn().mockResolvedValue(undefined),
};

const mockRoutingStats = {
	updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
	findOne: vi.fn(),
	find: vi.fn(() => ({
		toArray: vi.fn().mockResolvedValue([]),
	})),
	createIndex: vi.fn().mockResolvedValue(undefined),
};

const mockKgNodes = {
	updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
	updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
	findOne: vi.fn(),
	find: vi.fn(() => ({
		toArray: vi.fn().mockResolvedValue([]),
		sort: vi.fn(() => ({
			limit: vi.fn(() => ({
				toArray: vi.fn().mockResolvedValue([]),
			})),
		})),
	})),
	deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
	createIndex: vi.fn().mockResolvedValue(undefined),
};

const mockKgEdges = {
	updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
	find: vi.fn(() => ({
		toArray: vi.fn().mockResolvedValue([]),
		sort: vi.fn(() => ({
			limit: vi.fn(() => ({
				toArray: vi.fn().mockResolvedValue([]),
			})),
		})),
	})),
	deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
	createIndex: vi.fn().mockResolvedValue(undefined),
};

const mockActionEffectiveness = {
	updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
	findOne: vi.fn(),
	find: vi.fn(() => ({
		toArray: vi.fn().mockResolvedValue([]),
		sort: vi.fn(() => ({
			toArray: vi.fn().mockResolvedValue([]),
		})),
	})),
	createIndex: vi.fn().mockResolvedValue(undefined),
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
			default:
				return mockRoutingConcepts;
		}
	}),
};

// Import service after mocks
import { KnowledgeGraphService } from "../../kg/KnowledgeGraphService";
import type { MemoryTier, Outcome } from "../../types";

// Test tracking
interface TestResult {
	name: string;
	passed: boolean;
	error?: string;
}

const testResults: TestResult[] = [];

const ALL_TIERS: MemoryTier[] = [
	"working",
	"history",
	"patterns",
	"books",
	"memory_bank",
	"datagov_schema",
	"datagov_expansion",
];

// ============================================
// Test Query Preprocessing
// ============================================

describe("TestQueryPreprocessing", () => {
	let service: KnowledgeGraphService;

	beforeEach(async () => {
		vi.clearAllMocks();
		service = new KnowledgeGraphService({ db: mockDb as any });
		await service.initialize();
	});

	it("should extract entities from text", () => {
		const testName = "extract_entities_from_text";
		try {
			const entities = service.extractEntities("Python is a programming language");

			expect(entities).toBeDefined();
			expect(Array.isArray(entities)).toBe(true);
			// Should extract capitalized words
			const labels = entities.map((e) => e.label);
			expect(labels).toContain("Python");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should extract multiple entities", () => {
		const testName = "extract_multiple_entities";
		try {
			const entities = service.extractEntities("React and TypeScript are popular frameworks");

			expect(entities.length).toBeGreaterThanOrEqual(2);
			const labels = entities.map((e) => e.label);
			expect(labels).toContain("React");
			expect(labels).toContain("TypeScript");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should handle empty text", () => {
		const testName = "handle_empty_text";
		try {
			const entities = service.extractEntities("");
			expect(entities).toEqual([]);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should extract Hebrew text", () => {
		const testName = "extract_hebrew_text";
		try {
			const entities = service.extractEntities("פייתון היא שפת תכנות");

			expect(entities.length).toBeGreaterThan(0);
			// Should extract Hebrew words
			const hasHebrew = entities.some((e) => /[\u0590-\u05FF]/.test(e.label));
			expect(hasHebrew).toBe(true);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should limit entities to 10", () => {
		const testName = "limit_entities_to_10";
		try {
			// Create text with many potential entities
			const manyWords = Array.from({ length: 20 }, (_, i) => `Entity${i}`).join(" ");
			const entities = service.extractEntities(manyWords);

			expect(entities.length).toBeLessThanOrEqual(10);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should filter common words", () => {
		const testName = "filter_common_words";
		try {
			const entities = service.extractEntities("The Quick Brown Fox");

			// "The" should be filtered out as common word
			const labels = entities.map((e) => e.label);
			expect(labels).not.toContain("The");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});
});

// ============================================
// Test Tier Score Calculation
// ============================================

describe("TestTierScoreCalculation", () => {
	let service: KnowledgeGraphService;
	const testUserId = "test-user-tier-scores";

	beforeEach(async () => {
		vi.clearAllMocks();
		service = new KnowledgeGraphService({ db: mockDb as any });
		await service.initialize();
	});

	it("should calculate tier scores with no data", async () => {
		const testName = "tier_scores_no_data";
		try {
			// Empty stats
			mockRoutingStats.find.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([]),
			});

			const plan = await service.getTierPlan(testUserId, ["python"]);

			// With no data, should return all tiers as default
			expect(plan.tiers).toEqual(ALL_TIERS);
			expect(plan.source).toBe("default");
			expect(plan.confidence).toBeLessThanOrEqual(0.5);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should calculate tier scores with routing data", async () => {
		const testName = "tier_scores_with_data";
		try {
			// Setup stats with history having high success rate
			mockRoutingStats.find.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([
					{
						user_id: testUserId,
						concept_id: "python",
						tier_success_rates: {
							working: { wilson_score: 0.3, uses: 5, worked: 1, failed: 3, partial: 1, unknown: 0 },
							history: {
								wilson_score: 0.8,
								uses: 10,
								worked: 8,
								failed: 2,
								partial: 0,
								unknown: 0,
							},
							patterns: {
								wilson_score: 0.4,
								uses: 3,
								worked: 1,
								failed: 1,
								partial: 1,
								unknown: 0,
							},
							books: { wilson_score: 0.6, uses: 4, worked: 2, failed: 1, partial: 1, unknown: 0 },
							memory_bank: {
								wilson_score: 0.2,
								uses: 2,
								worked: 0,
								failed: 1,
								partial: 1,
								unknown: 0,
							},
						},
					},
				]),
			});

			const plan = await service.getTierPlan(testUserId, ["python"]);

			// Should include history with high score
			expect(plan.tiers).toContain("working"); // Always included
			expect(plan.tiers).toContain("history"); // High score
			expect(plan.source).toBe("routing_kg");
			expect(plan.confidence).toBeGreaterThan(0.3);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should aggregate scores across multiple concepts", async () => {
		const testName = "tier_scores_aggregation";
		try {
			// Setup stats for multiple concepts
			mockRoutingStats.find.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([
					{
						user_id: testUserId,
						concept_id: "python",
						tier_success_rates: {
							working: { wilson_score: 0.5, uses: 5, worked: 2, failed: 2, partial: 1, unknown: 0 },
							history: {
								wilson_score: 0.7,
								uses: 10,
								worked: 7,
								failed: 3,
								partial: 0,
								unknown: 0,
							},
							patterns: {
								wilson_score: 0.3,
								uses: 3,
								worked: 1,
								failed: 2,
								partial: 0,
								unknown: 0,
							},
							books: { wilson_score: 0.4, uses: 2, worked: 1, failed: 1, partial: 0, unknown: 0 },
							memory_bank: {
								wilson_score: 0.2,
								uses: 1,
								worked: 0,
								failed: 1,
								partial: 0,
								unknown: 0,
							},
						},
					},
					{
						user_id: testUserId,
						concept_id: "django",
						tier_success_rates: {
							working: { wilson_score: 0.6, uses: 4, worked: 3, failed: 1, partial: 0, unknown: 0 },
							history: { wilson_score: 0.8, uses: 8, worked: 7, failed: 1, partial: 0, unknown: 0 },
							patterns: {
								wilson_score: 0.5,
								uses: 2,
								worked: 1,
								failed: 1,
								partial: 0,
								unknown: 0,
							},
							books: { wilson_score: 0.3, uses: 1, worked: 0, failed: 1, partial: 0, unknown: 0 },
							memory_bank: {
								wilson_score: 0.1,
								uses: 1,
								worked: 0,
								failed: 1,
								partial: 0,
								unknown: 0,
							},
						},
					},
				]),
			});

			const plan = await service.getTierPlan(testUserId, ["python", "django"]);

			// History should be high priority due to aggregated high scores
			expect(plan.tiers).toContain("history");
			expect(plan.confidence).toBeGreaterThan(0.4);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should return empty tier scores for empty concepts", async () => {
		const testName = "tier_scores_empty_concepts";
		try {
			const plan = await service.getTierPlan(testUserId, []);

			// Empty concepts should return all tiers as default
			expect(plan.tiers).toEqual(ALL_TIERS);
			expect(plan.source).toBe("default");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should handle unknown concept gracefully", async () => {
		const testName = "tier_scores_unknown_concept";
		try {
			// No stats for unknown concept
			mockRoutingStats.find.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([]),
			});

			const plan = await service.getTierPlan(testUserId, ["unknown_concept"]);

			// Should return default tiers
			expect(plan.tiers).toEqual(ALL_TIERS);
			expect(plan.source).toBe("default");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});
});

// ============================================
// Test Query Routing
// ============================================

describe("TestQueryRouting", () => {
	let service: KnowledgeGraphService;
	const testUserId = "test-user-routing";

	beforeEach(async () => {
		vi.clearAllMocks();
		service = new KnowledgeGraphService({ db: mockDb as any });
		await service.initialize();
	});

	it("should route to all tiers with no patterns (exploration phase)", async () => {
		const testName = "exploration_phase_no_patterns";
		try {
			mockRoutingStats.find.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([]),
			});

			const plan = await service.getTierPlan(testUserId, ["test"]);

			// No patterns should trigger exploration (all tiers)
			expect(plan.tiers).toEqual(ALL_TIERS);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should route to all tiers with low confidence scores", async () => {
		const testName = "exploration_phase_low_score";
		try {
			// Low confidence data
			mockRoutingStats.find.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([
					{
						user_id: testUserId,
						concept_id: "test",
						tier_success_rates: {
							working: { wilson_score: 0.1, uses: 1, worked: 0, failed: 0, partial: 1, unknown: 0 },
							history: {
								wilson_score: 0.15,
								uses: 1,
								worked: 0,
								failed: 0,
								partial: 1,
								unknown: 0,
							},
							patterns: {
								wilson_score: 0.1,
								uses: 1,
								worked: 0,
								failed: 1,
								partial: 0,
								unknown: 0,
							},
							books: { wilson_score: 0.1, uses: 0, worked: 0, failed: 0, partial: 0, unknown: 0 },
							memory_bank: {
								wilson_score: 0.1,
								uses: 0,
								worked: 0,
								failed: 0,
								partial: 0,
								unknown: 0,
							},
						},
					},
				]),
			});

			const plan = await service.getTierPlan(testUserId, ["test"]);

			// Low scores should still return all tiers
			expect(plan.tiers).toEqual(ALL_TIERS);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should select top tiers with medium confidence", async () => {
		const testName = "medium_confidence_phase";
		try {
			mockRoutingStats.find.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([
					{
						user_id: testUserId,
						concept_id: "python",
						tier_success_rates: {
							working: { wilson_score: 0.5, uses: 5, worked: 2, failed: 2, partial: 1, unknown: 0 },
							history: {
								wilson_score: 0.75,
								uses: 10,
								worked: 8,
								failed: 2,
								partial: 0,
								unknown: 0,
							},
							patterns: {
								wilson_score: 0.35,
								uses: 4,
								worked: 2,
								failed: 2,
								partial: 0,
								unknown: 0,
							},
							books: { wilson_score: 0.55, uses: 4, worked: 3, failed: 1, partial: 0, unknown: 0 },
							memory_bank: {
								wilson_score: 0.2,
								uses: 2,
								worked: 0,
								failed: 2,
								partial: 0,
								unknown: 0,
							},
						},
					},
				]),
			});

			const plan = await service.getTierPlan(testUserId, ["python"]);

			// Should include working (always) and top scoring tiers
			expect(plan.tiers).toContain("working");
			expect(plan.tiers).toContain("history"); // Highest score
			expect(plan.tiers.length).toBeLessThanOrEqual(4);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should select fewer tiers with high confidence", async () => {
		const testName = "high_confidence_phase";
		try {
			// Very high confidence in history only
			mockRoutingStats.find.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([
					{
						user_id: testUserId,
						concept_id: "python",
						tier_success_rates: {
							working: { wilson_score: 0.3, uses: 5, worked: 1, failed: 3, partial: 1, unknown: 0 },
							history: {
								wilson_score: 0.95,
								uses: 50,
								worked: 48,
								failed: 2,
								partial: 0,
								unknown: 0,
							},
							patterns: {
								wilson_score: 0.2,
								uses: 3,
								worked: 0,
								failed: 2,
								partial: 1,
								unknown: 0,
							},
							books: { wilson_score: 0.15, uses: 2, worked: 0, failed: 1, partial: 1, unknown: 0 },
							memory_bank: {
								wilson_score: 0.1,
								uses: 1,
								worked: 0,
								failed: 1,
								partial: 0,
								unknown: 0,
							},
						},
					},
				]),
			});

			const plan = await service.getTierPlan(testUserId, ["python"]);

			// Should have high confidence
			expect(plan.confidence).toBeGreaterThan(0.5);
			expect(plan.tiers).toContain("history");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should search all tiers when no concepts found", async () => {
		const testName = "no_concepts_searches_all";
		try {
			const plan = await service.getTierPlan(testUserId, []);

			expect(plan.tiers).toEqual(ALL_TIERS);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});
});

// ============================================
// Test Routing Stats Update
// ============================================

describe("TestRoutingStatsUpdate", () => {
	let service: KnowledgeGraphService;
	const testUserId = "test-user-stats-update";

	beforeEach(async () => {
		vi.clearAllMocks();
		service = new KnowledgeGraphService({ db: mockDb as any });
		await service.initialize();
	});

	it("should update routing stats after worked outcome", async () => {
		const testName = "update_stats_worked";
		try {
			mockRoutingStats.findOne.mockResolvedValue(null);

			await service.updateRoutingStats(testUserId, ["python"], ["history"], "worked");

			// Should have called updateOne to save stats
			expect(mockRoutingStats.updateOne).toHaveBeenCalled();

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should update routing stats after failed outcome", async () => {
		const testName = "update_stats_failed";
		try {
			mockRoutingStats.findOne.mockResolvedValue(null);

			await service.updateRoutingStats(testUserId, ["django"], ["patterns"], "failed");

			expect(mockRoutingStats.updateOne).toHaveBeenCalled();

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should update stats for multiple concepts", async () => {
		const testName = "update_stats_multiple_concepts";
		try {
			mockRoutingStats.findOne.mockResolvedValue(null);

			await service.updateRoutingStats(
				testUserId,
				["python", "django", "web"],
				["history", "books"],
				"worked"
			);

			// Should update for each concept
			expect(mockRoutingStats.updateOne.mock.calls.length).toBeGreaterThanOrEqual(3);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should update existing stats correctly", async () => {
		const testName = "update_existing_stats";
		try {
			// Existing stats
			mockRoutingStats.findOne.mockResolvedValue({
				user_id: testUserId,
				concept_id: "python",
				tier_success_rates: {
					working: { wilson_score: 0.5, uses: 5, worked: 2, failed: 2, partial: 1, unknown: 0 },
					history: {
						wilson_score: 0.7,
						uses: 10,
						worked: 7,
						failed: 3,
						partial: 0,
						unknown: 0,
						last_used_at: null,
					},
					patterns: { wilson_score: 0.3, uses: 3, worked: 1, failed: 2, partial: 0, unknown: 0 },
					books: { wilson_score: 0.4, uses: 2, worked: 1, failed: 1, partial: 0, unknown: 0 },
					memory_bank: { wilson_score: 0.2, uses: 1, worked: 0, failed: 1, partial: 0, unknown: 0 },
				},
				best_tiers_cached: ["history"],
			});

			await service.updateRoutingStats(testUserId, ["python"], ["history"], "worked");

			expect(mockRoutingStats.updateOne).toHaveBeenCalled();

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});
});

// ============================================
// Test Context Type Detection
// ============================================

describe("TestContextTypeDetection", () => {
	let service: KnowledgeGraphService;

	beforeEach(async () => {
		vi.clearAllMocks();
		service = new KnowledgeGraphService({ db: mockDb as any });
		await service.initialize();
	});

	it("should detect docker context", () => {
		const testName = "detect_docker_context";
		try {
			const context = service.detectContextType("How do I run docker compose?", []);
			expect(context).toBe("docker");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should detect debugging context", () => {
		const testName = "detect_debugging_context";
		try {
			const context = service.detectContextType("I have a bug in my code", []);
			expect(context).toBe("debugging");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should detect datagov context", () => {
		const testName = "detect_datagov_context";
		try {
			const context = service.detectContextType("Search datagov for statistics", []);
			expect(context).toBe("datagov_query");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should detect document context", () => {
		const testName = "detect_document_context";
		try {
			const context = service.detectContextType("Analyze this PDF document", []);
			expect(context).toBe("doc_rag");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should detect coding context", () => {
		const testName = "detect_coding_context";
		try {
			const context = service.detectContextType("Implement a function to sort", []);
			expect(context).toBe("coding_help");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should detect web search context", () => {
		const testName = "detect_web_search_context";
		try {
			const context = service.detectContextType("Search for React tutorials", []);
			expect(context).toBe("web_search");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should detect memory context", () => {
		const testName = "detect_memory_context";
		try {
			const context = service.detectContextType("Remember this for later", []);
			expect(context).toBe("memory_management");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should detect Hebrew memory context", () => {
		const testName = "detect_hebrew_memory_context";
		try {
			const context = service.detectContextType("זכור את זה בבקשה", []);
			expect(context).toBe("memory_management");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should default to general context", () => {
		const testName = "default_to_general";
		try {
			const context = service.detectContextType("Hello world", []);
			expect(context).toBe("general");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should use recent messages for context", () => {
		const testName = "use_recent_messages";
		try {
			const context = service.detectContextType("How do I fix it?", [
				"I'm having an error with docker",
			]);
			// Should detect docker from recent messages
			expect(context).toBe("docker");

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});
});

// ============================================
// Test Context Insights
// ============================================

describe("TestContextInsights", () => {
	let service: KnowledgeGraphService;
	const testUserId = "test-user-insights";

	beforeEach(async () => {
		vi.clearAllMocks();
		service = new KnowledgeGraphService({ db: mockDb as any });
		await service.initialize();
	});

	it("should return context insights", async () => {
		const testName = "context_insights_structure";
		try {
			mockRoutingStats.find.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([]),
			});
			mockActionEffectiveness.find.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([]),
				sort: vi.fn(() => ({
					toArray: vi.fn().mockResolvedValue([]),
				})),
			});
			mockKgEdges.find.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([]),
				sort: vi.fn(() => ({
					limit: vi.fn(() => ({
						toArray: vi.fn().mockResolvedValue([]),
					})),
				})),
			});

			const insights = await service.getContextInsights(testUserId, "general", ["test"]);

			expect(insights).toBeDefined();
			expect(insights.context_type).toBe("general");
			expect(insights.tier_recommendations).toBeDefined();
			expect(insights.action_stats).toBeDefined();
			expect(insights.related_entities).toBeDefined();

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});
});

// ============================================
// Summary Report
// ============================================

afterAll(() => {
	console.log("\n" + "=".repeat(60));
	console.log("ROUTING SERVICE TEST RESULTS");
	console.log("=".repeat(60));

	const passed = testResults.filter((r) => r.passed).length;
	const failed = testResults.filter((r) => !r.passed).length;
	const total = testResults.length;

	console.log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${failed}`);
	console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

	if (failed > 0) {
		console.log("Failed Tests:");
		testResults
			.filter((r) => !r.passed)
			.forEach((r) => {
				console.log(`  ❌ ${r.name}: ${r.error}`);
			});
	}

	console.log("=".repeat(60) + "\n");
});
