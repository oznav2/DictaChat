/**
 * Characterization Tests for Memory System Search Behavior
 *
 * These tests capture the CURRENT behavior of the search() method.
 * They serve as a regression safety net during refactoring.
 *
 * Adapted from roampal/backend/tests/characterization/test_search_behavior.py
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MemoryTier } from "../../types";
import { TestHarness, type TestResult } from "../mock-utilities";

// Mock the database module
vi.mock("$lib/server/database", () => ({
	Database: {
		getInstance: vi.fn().mockResolvedValue({
			getClient: () => ({
				db: () => ({
					collection: () => ({
						findOne: vi.fn().mockResolvedValue(null),
						find: vi.fn().mockReturnValue({
							sort: vi.fn().mockReturnThis(),
							toArray: vi.fn().mockResolvedValue([]),
						}),
						updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
						insertOne: vi.fn().mockResolvedValue({ insertedId: "test_id" }),
						deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
					}),
				}),
			}),
		}),
	},
}));

// Mock logger
vi.mock("$lib/server/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Characterization queries from roampal plan
const CHARACTERIZATION_QUERIES = [
	"how do I search memory",
	"python async patterns",
	"", // empty query
	"user preference for dark mode",
	"API rate limiting",
	"remember my name is John",
	"what documents have I read",
	"coding best practices",
];

// ============================================================================
// Test Suites - Adapted from roampal test_search_behavior.py
// ============================================================================

describe("TestSearchBehavior", () => {
	/**
	 * Capture current search() behavior for regression testing.
	 * Adapted from: class TestSearchBehavior
	 */

	let harness: TestHarness;

	beforeEach(() => {
		harness = new TestHarness("SearchBehavior");
		vi.clearAllMocks();
	});

	afterEach(() => {
		harness.reset();
	});

	it("should return array from search", async () => {
		/**
		 * Search should return an array.
		 * Adapted from: test_search_returns_list
		 */
		const startTime = Date.now();

		const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

		const mockSearchService = {
			search: vi.fn().mockResolvedValue({
				results: [],
				debug: { confidence: "low", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
			}),
		};

		const facade = new UnifiedMemoryFacade({
			services: { search: mockSearchService },
		});

		const response = await facade.search({
			userId: "user_123",
			query: "test query",
			limit: 5,
		});

		expect(Array.isArray(response.results)).toBe(true);

		const result: TestResult = {
			name: "search_returns_array",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should respect the limit parameter", async () => {
		/**
		 * Search should respect the limit parameter.
		 * Adapted from: test_search_respects_limit
		 */
		const startTime = Date.now();

		const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

		const createMockResults = (count: number) =>
			Array.from({ length: count }, (_, i) => ({
				memory_id: `mem_${i}`,
				content: `Result ${i}`,
				position: i + 1,
				score_summary: { final_score: 0.9 - i * 0.1 },
				citations: [],
			}));

		const mockSearchService = {
			search: vi.fn().mockImplementation(({ limit }: { limit: number }) =>
				Promise.resolve({
					results: createMockResults(Math.min(limit, 10)),
					debug: { confidence: "high", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				})
			),
		};

		const facade = new UnifiedMemoryFacade({
			services: { search: mockSearchService },
		});

		for (const limit of [1, 3, 5, 10]) {
			const response = await facade.search({
				userId: "user_123",
				query: "python",
				limit,
			});

			expect(response.results.length).toBeLessThanOrEqual(limit);
		}

		const result: TestResult = {
			name: "search_respects_limit",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should return results with expected structure", async () => {
		/**
		 * Each search result should have expected fields.
		 * Adapted from: test_search_result_structure
		 */
		const startTime = Date.now();

		const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

		const mockSearchService = {
			search: vi.fn().mockResolvedValue({
				results: [
					{
						memory_id: "mem_1",
						content: "Test content",
						position: 1,
						score_summary: { final_score: 0.85 },
						citations: [],
					},
				],
				debug: { confidence: "high", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
			}),
		};

		const facade = new UnifiedMemoryFacade({
			services: { search: mockSearchService },
		});

		const response = await facade.search({
			userId: "user_123",
			query: "test",
			limit: 3,
		});

		if (response.results.length > 0) {
			const result = response.results[0];

			// Check for expected fields
			expect(result).toHaveProperty("memory_id");
			expect(result).toHaveProperty("content");
			expect(result).toHaveProperty("score_summary");
		}

		const testResult: TestResult = {
			name: "search_result_structure",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(testResult);
	});

	it("should handle empty query without crashing", async () => {
		/**
		 * Empty query should not crash.
		 * Adapted from: test_search_empty_query
		 */
		const startTime = Date.now();

		const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

		const mockSearchService = {
			search: vi.fn().mockResolvedValue({
				results: [],
				debug: { confidence: "low", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
			}),
		};

		const facade = new UnifiedMemoryFacade({
			services: { search: mockSearchService },
		});

		// Should not throw
		const response = await facade.search({
			userId: "user_123",
			query: "",
			limit: 5,
		});

		expect(Array.isArray(response.results)).toBe(true);

		const result: TestResult = {
			name: "search_empty_query",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should filter by collection when specified", async () => {
		/**
		 * Search with explicit collection should only return from that collection.
		 * Adapted from: test_search_with_collection_filter
		 */
		const startTime = Date.now();

		const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

		const collections: MemoryTier[] = ["memory_bank", "working", "history", "patterns", "documents"];

		for (const coll of collections) {
			const mockSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [
						{
							memory_id: `mem_${coll}_1`,
							content: `Content from ${coll}`,
							position: 1,
							score_summary: { final_score: 0.8 },
							citations: [],
							collection: coll,
						},
					],
					debug: { confidence: "medium", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const facade = new UnifiedMemoryFacade({
				services: { search: mockSearchService },
			});

			const response = await facade.search({
				userId: "user_123",
				query: "test",
				collections: [coll],
				limit: 3,
			});

			// Verify the search was called with the correct collection filter
			const callArgs = mockSearchService.search.mock.calls[0][0];
			expect(callArgs.collections).toContain(coll);
		}

		const result: TestResult = {
			name: "search_with_collection_filter",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should return consistent ranking for same query", async () => {
		/**
		 * Same query should return same ranking (deterministic).
		 * Adapted from: test_search_ranking_consistency
		 */
		const startTime = Date.now();

		const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

		const fixedResults = [
			{
				memory_id: "mem_a",
				content: "A",
				position: 1,
				score_summary: { final_score: 0.9 },
				citations: [],
			},
			{
				memory_id: "mem_b",
				content: "B",
				position: 2,
				score_summary: { final_score: 0.8 },
				citations: [],
			},
			{
				memory_id: "mem_c",
				content: "C",
				position: 3,
				score_summary: { final_score: 0.7 },
				citations: [],
			},
		];

		const mockSearchService = {
			search: vi.fn().mockResolvedValue({
				results: fixedResults,
				debug: { confidence: "high", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
			}),
		};

		const facade = new UnifiedMemoryFacade({
			services: { search: mockSearchService },
		});

		const query = "python async patterns";

		const response1 = await facade.search({ userId: "user_123", query, limit: 5 });
		const response2 = await facade.search({ userId: "user_123", query, limit: 5 });

		const ids1 = response1.results.map((r) => r.memory_id);
		const ids2 = response2.results.map((r) => r.memory_id);

		expect(ids1).toEqual(ids2);

		const result: TestResult = {
			name: "search_ranking_consistency",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});
});

describe("TestWilsonScore", () => {
	/**
	 * Test Wilson score calculation.
	 * Adapted from: class TestWilsonScore
	 */

	let harness: TestHarness;

	beforeEach(() => {
		harness = new TestHarness("WilsonScore");
		vi.clearAllMocks();
	});

	afterEach(() => {
		harness.reset();
	});

	// Wilson score calculation function (same as in roampal)
	const wilsonScoreLower = (successes: number, total: number, z = 1.96): number => {
		if (total === 0) return 0.5; // Neutral for no data

		const p = successes / total;
		const denominator = 1 + (z * z) / total;
		const centre = p + (z * z) / (2 * total);
		const deviation = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

		return (centre - deviation) / denominator;
	};

	it("should be calculable", () => {
		/**
		 * Wilson score function should work.
		 * Adapted from: test_wilson_score_import
		 */
		const startTime = Date.now();

		expect(typeof wilsonScoreLower).toBe("function");

		const result: TestResult = {
			name: "wilson_score_calculable",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should return 0.5 for zero uses", () => {
		/**
		 * Zero uses should return 0.5 (neutral).
		 * Adapted from: test_wilson_score_zero_uses
		 */
		const startTime = Date.now();

		const score = wilsonScoreLower(0, 0);
		expect(score).toBe(0.5);

		const result: TestResult = {
			name: "wilson_zero_uses",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should rank proven higher than perfect newcomer", () => {
		/**
		 * Perfect record with few uses should be lower than proven record.
		 * Adapted from: test_wilson_score_perfect_record
		 */
		const startTime = Date.now();

		// 1/1 = 100% but low confidence
		const newScore = wilsonScoreLower(1, 1);

		// 90/100 = 90% but high confidence
		const provenScore = wilsonScoreLower(90, 100);

		// Proven should beat lucky newcomer
		expect(provenScore).toBeGreaterThan(newScore);

		const result: TestResult = {
			name: "wilson_proven_beats_newcomer",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should always return between 0 and 1", () => {
		/**
		 * Wilson score should always be between 0 and 1.
		 * Adapted from: test_wilson_score_range
		 */
		const startTime = Date.now();

		const testCases: [number, number][] = [
			[0, 1],
			[1, 1],
			[5, 10],
			[50, 100],
			[99, 100],
			[100, 100],
		];

		for (const [successes, total] of testCases) {
			const score = wilsonScoreLower(successes, total);
			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(1);
		}

		const result: TestResult = {
			name: "wilson_score_range",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});
});

describe("TestMCPToolShapes", () => {
	/**
	 * Verify MCP tool response shapes match expected format.
	 * Adapted from: class TestMCPToolShapes
	 */

	let harness: TestHarness;

	beforeEach(() => {
		harness = new TestHarness("MCPToolShapes");
		vi.clearAllMocks();
	});

	afterEach(() => {
		harness.reset();
	});

	it("should return expected shape from search", async () => {
		/**
		 * search_memory MCP tool returns expected shape.
		 * Adapted from: test_search_memory_shape
		 */
		const startTime = Date.now();

		const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

		const mockSearchService = {
			search: vi.fn().mockResolvedValue({
				results: [
					{
						memory_id: "mem_1",
						content: "Test content",
						position: 1,
						score_summary: { final_score: 0.85 },
						citations: [],
					},
				],
				debug: { confidence: "high", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
			}),
		};

		const facade = new UnifiedMemoryFacade({
			services: { search: mockSearchService },
		});

		const response = await facade.search({
			userId: "user_123",
			query: "test",
			limit: 5,
		});

		// Should have results array
		expect(Array.isArray(response.results)).toBe(true);

		// Should have debug info
		expect(response.debug).toBeDefined();

		if (response.results.length > 0) {
			const resultKeys = Object.keys(response.results[0]);
			// Capture shape for baseline
			expect(resultKeys).toContain("memory_id");
		}

		const result: TestResult = {
			name: "search_memory_shape",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should return expected shape from cold start context", async () => {
		/**
		 * get_cold_start_context returns expected shape.
		 * Adapted from: test_get_context_insights_shape
		 */
		const startTime = Date.now();

		const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

		const mockContextService = {
			getColdStartContext: vi.fn().mockResolvedValue({
				text: "Welcome back! Here is what I remember...",
				debug: { confidence: "low" },
			}),
			getContextInsights: vi.fn(),
		};

		const facade = new UnifiedMemoryFacade({
			services: { context: mockContextService },
		});

		const coldStart = await facade.getColdStartContext({
			userId: "user_123",
		});

		// Can be null or object with text property
		expect(coldStart === null || typeof coldStart.text === "string").toBe(true);

		const result: TestResult = {
			name: "cold_start_context_shape",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should have expected parameters for store", async () => {
		/**
		 * store_memory_bank returns expected shape.
		 * Adapted from: test_store_memory_bank_shape
		 */
		const startTime = Date.now();

		const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

		const facade = new UnifiedMemoryFacade();

		// Verify the store method exists and accepts expected parameters
		expect(typeof facade.store).toBe("function");

		// Store should accept these parameters (verify by calling with them)
		const mockStoreService = {
			store: vi.fn().mockResolvedValue({ memory_id: "mem_new" }),
			removeBook: vi.fn(),
		};

		const facadeWithMock = new UnifiedMemoryFacade({
			services: { store: mockStoreService },
		});

		await facadeWithMock.store({
			userId: "user_123",
			tier: "memory_bank",
			text: "Test memory content",
			tags: ["test", "memory"],
			importance: 0.8,
		});

		const callArgs = mockStoreService.store.mock.calls[0][0];

		// Actual API uses 'text' not 'content'
		expect(callArgs).toHaveProperty("text");
		expect(callArgs).toHaveProperty("tags");
		expect(callArgs).toHaveProperty("importance");

		const result: TestResult = {
			name: "store_memory_bank_shape",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});
});

describe("TestCharacterizationQueries", () => {
	/**
	 * Test the characterization queries don't crash the system.
	 */

	let harness: TestHarness;

	beforeEach(() => {
		harness = new TestHarness("CharacterizationQueries");
		vi.clearAllMocks();
	});

	afterEach(() => {
		harness.reset();
	});

	it("should handle all characterization queries", async () => {
		/**
		 * All characterization queries should be handled without error.
		 */
		const startTime = Date.now();

		const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

		const mockSearchService = {
			search: vi.fn().mockResolvedValue({
				results: [],
				debug: { confidence: "low", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
			}),
		};

		const facade = new UnifiedMemoryFacade({
			services: { search: mockSearchService },
		});

		for (const query of CHARACTERIZATION_QUERIES) {
			// Should not throw
			const response = await facade.search({
				userId: "user_123",
				query,
				limit: 5,
			});

			expect(Array.isArray(response.results)).toBe(true);
		}

		const result: TestResult = {
			name: "handle_all_characterization_queries",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});
});
