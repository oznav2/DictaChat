/**
 * Unit Tests for SearchServiceImpl
 *
 * Tests the search service's hybrid retrieval, sort modes, and position tracking.
 * Adapted from roampal/backend/modules/memory/tests/unit/test_search_service.py
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	MockEmbeddingService,
	MockCollection,
	TestHarness,
	createTestFragment,
	createTestFragmentBatch,
	calculateMRR,
	calculateNDCG,
	calculatePrecisionAtK,
	MATURITY_LEVELS,
	type TestResult,
} from "../mock-utilities";

// Mock logger
vi.mock("$lib/server/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// ============================================================================
// Test Helper Types
// ============================================================================

interface MockSearchResult {
	memory_id: string;
	content: string;
	position: number;
	score_summary: {
		final_score: number;
		wilson_score?: number;
		created_at?: string;
		updated_at?: string;
	};
	citations: unknown[];
}

interface MockHybridSearchService {
	search: ReturnType<typeof vi.fn>;
}

// ============================================================================
// Test Suites
// ============================================================================

describe("SearchServiceImpl", () => {
	let harness: TestHarness;
	let mockEmbedding: MockEmbeddingService;

	beforeEach(() => {
		harness = new TestHarness("SearchService");
		mockEmbedding = new MockEmbeddingService();
		vi.clearAllMocks();
	});

	afterEach(() => {
		harness.reset();
		mockEmbedding.reset();
	});

	// ========================================================================
	// Initialization Tests
	// ========================================================================

	describe("Initialization", () => {
		it("should create service with required dependencies", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [],
					debug: { confidence: "low", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			const result: TestResult = {
				name: "create_with_dependencies",
				passed: service !== undefined,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(service).toBeDefined();
		});

		it("should use default config when not provided", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [],
					debug: { confidence: "low", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			// Service should work without explicit config
			const response = await service.search({
				userId: "user_123",
				query: "test",
			});

			const result: TestResult = {
				name: "default_config",
				passed: response.results !== undefined,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(response.results).toBeDefined();
		});

		it("should use custom config when provided", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const customConfig = {
				caps: {
					search_limit_default: 20,
				},
			};

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [],
					debug: { confidence: "low", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
				config: customConfig as any,
			});

			await service.search({
				userId: "user_123",
				query: "test",
			});

			// Should use custom limit from config
			const callArgs = mockHybridSearch.search.mock.calls[0][0];

			const result: TestResult = {
				name: "custom_config",
				passed: callArgs.limit === 20,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(callArgs.limit).toBe(20);
		});
	});

	describe("Known solutions", () => {
		it("should produce same problem hash for Hebrew/English equivalents", async () => {
			const { buildProblemHash } = await import("../../utils/problemSignature");
			const he = "חיפוש";
			const en = "search";
			expect(buildProblemHash(he)).toBe(buildProblemHash(en));
		});
	});

	// ========================================================================
	// Basic Search Tests
	// ========================================================================

	describe("Basic Search", () => {
		it("should execute search with all tiers by default", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [],
					debug: { confidence: "medium", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			await service.search({
				userId: "user_123",
				query: "test query",
			});

			const callArgs = mockHybridSearch.search.mock.calls[0][0];
			const expectedTiers = ["working", "history", "patterns", "documents", "memory_bank"];

			const result: TestResult = {
				name: "search_all_tiers_default",
				passed: expectedTiers.every((t) => callArgs.tiers.includes(t)),
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(callArgs.tiers).toEqual(expect.arrayContaining(expectedTiers));
		});

		it("should search specific tiers when specified", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [],
					debug: { confidence: "medium", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			await service.search({
				userId: "user_123",
				query: "test",
				collections: ["working", "patterns"],
			});

			const callArgs = mockHybridSearch.search.mock.calls[0][0];

			const result: TestResult = {
				name: "search_specific_tiers",
				passed:
					callArgs.tiers.length === 2 &&
					callArgs.tiers.includes("working") &&
					callArgs.tiers.includes("patterns"),
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(callArgs.tiers).toEqual(["working", "patterns"]);
		});

		it("should return results from hybrid search", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockResults: MockSearchResult[] = [
				{
					memory_id: "mem_1",
					content: "First result",
					position: 1,
					score_summary: { final_score: 0.9 },
					citations: [],
				},
				{
					memory_id: "mem_2",
					content: "Second result",
					position: 2,
					score_summary: { final_score: 0.8 },
					citations: [],
				},
			];

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: mockResults,
					debug: { confidence: "high", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			const response = await service.search({
				userId: "user_123",
				query: "test",
			});

			const result: TestResult = {
				name: "return_results",
				passed: response.results.length === 2,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(response.results).toHaveLength(2);
		});

		it("should include debug information in response", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [],
					debug: {
						confidence: "high",
						stage_timings_ms: { qdrant_query_ms: 50 },
						fallbacks_used: [],
						errors: [],
					},
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			const response = await service.search({
				userId: "user_123",
				query: "test",
			});

			const result: TestResult = {
				name: "include_debug_info",
				passed:
					response.debug !== undefined &&
					response.debug.stage_timings_ms !== undefined &&
					response.debug.stage_timings_ms.qdrant_query_ms !== undefined,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(response.debug).toBeDefined();
			expect(response.debug.stage_timings_ms.qdrant_query_ms).toBeDefined();
		});
	});

	// ========================================================================
	// Sort Mode Detection Tests
	// ========================================================================

	describe("Sort Mode Detection", () => {
		it('should detect recency mode from "last" keyword', async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const now = new Date();
			const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

			const mockResults: MockSearchResult[] = [
				{
					memory_id: "mem_old",
					content: "Older content",
					position: 1,
					score_summary: {
						final_score: 0.9,
						created_at: yesterday.toISOString(),
					},
					citations: [],
				},
				{
					memory_id: "mem_new",
					content: "Newer content",
					position: 2,
					score_summary: {
						final_score: 0.7,
						created_at: now.toISOString(),
					},
					citations: [],
				},
			];

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: mockResults,
					debug: { confidence: "medium", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			const response = await service.search({
				userId: "user_123",
				query: "What did I do last time?",
			});

			// First result should be the newer one
			const result: TestResult = {
				name: "detect_recency_last",
				passed: response.results[0].memory_id === "mem_new",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(response.results[0].memory_id).toBe("mem_new");
		});

		it('should detect recency mode from Hebrew keyword "לאחרונה"', async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const now = new Date();
			const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

			const mockResults: MockSearchResult[] = [
				{
					memory_id: "mem_old",
					content: "תוכן ישן",
					position: 1,
					score_summary: {
						final_score: 0.9,
						updated_at: lastWeek.toISOString(),
					},
					citations: [],
				},
				{
					memory_id: "mem_new",
					content: "תוכן חדש",
					position: 2,
					score_summary: {
						final_score: 0.7,
						updated_at: now.toISOString(),
					},
					citations: [],
				},
			];

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: mockResults,
					debug: { confidence: "medium", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			const response = await service.search({
				userId: "user_123",
				query: "מה עשיתי לאחרונה?",
			});

			const result: TestResult = {
				name: "detect_recency_hebrew",
				passed: response.results[0].memory_id === "mem_new",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(response.results[0].memory_id).toBe("mem_new");
		});

		it("should use relevance mode by default", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockResults: MockSearchResult[] = [
				{
					memory_id: "mem_high_score",
					content: "High relevance",
					position: 1,
					score_summary: { final_score: 0.95 },
					citations: [],
				},
				{
					memory_id: "mem_low_score",
					content: "Low relevance",
					position: 2,
					score_summary: { final_score: 0.6 },
					citations: [],
				},
			];

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: mockResults,
					debug: { confidence: "high", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			const response = await service.search({
				userId: "user_123",
				query: "What is TypeScript?",
			});

			// Should maintain hybrid search ranking (high relevance first)
			const result: TestResult = {
				name: "relevance_mode_default",
				passed: response.results[0].memory_id === "mem_high_score",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(response.results[0].memory_id).toBe("mem_high_score");
		});

		it("should allow explicit sort mode override", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockResults: MockSearchResult[] = [
				{
					memory_id: "mem_low_wilson",
					content: "Low learned score",
					position: 1,
					score_summary: { final_score: 0.9, wilson_score: 0.3 },
					citations: [],
				},
				{
					memory_id: "mem_high_wilson",
					content: "High learned score",
					position: 2,
					score_summary: { final_score: 0.7, wilson_score: 0.9 },
					citations: [],
				},
			];

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: mockResults,
					debug: { confidence: "high", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			const response = await service.search({
				userId: "user_123",
				query: "test query",
				sortBy: "score",
			});

			// Should sort by Wilson score (learned effectiveness)
			const result: TestResult = {
				name: "explicit_sort_override",
				passed: response.results[0].memory_id === "mem_high_wilson",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(response.results[0].memory_id).toBe("mem_high_wilson");
		});
	});

	// ========================================================================
	// Position Tracking Tests
	// ========================================================================

	describe("Position Tracking", () => {
		it("should track position map after search", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockResults: MockSearchResult[] = [
				{
					memory_id: "mem_1",
					content: "First",
					position: 1,
					score_summary: { final_score: 0.9 },
					citations: [],
				},
				{
					memory_id: "mem_2",
					content: "Second",
					position: 2,
					score_summary: { final_score: 0.8 },
					citations: [],
				},
				{
					memory_id: "mem_3",
					content: "Third",
					position: 3,
					score_summary: { final_score: 0.7 },
					citations: [],
				},
			];

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: mockResults,
					debug: { confidence: "high", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			await service.search({
				userId: "user_123",
				query: "test",
			});

			const positionMap = service.getSearchPositionMap();

			const result: TestResult = {
				name: "track_position_map",
				passed:
					positionMap.size === 3 &&
					positionMap.get(1) === "mem_1" &&
					positionMap.get(2) === "mem_2" &&
					positionMap.get(3) === "mem_3",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(positionMap.size).toBe(3);
			expect(positionMap.get(1)).toBe("mem_1");
		});

		it("should track last search results", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockResults: MockSearchResult[] = [
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
			];

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: mockResults,
					debug: { confidence: "high", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			await service.search({
				userId: "user_123",
				query: "test query",
			});

			const lastResults = service.getLastSearchResults();

			const result: TestResult = {
				name: "track_last_results",
				passed:
					lastResults.length === 2 &&
					lastResults.includes("mem_a") &&
					lastResults.includes("mem_b"),
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(lastResults).toEqual(["mem_a", "mem_b"]);
		});

		it("should track last query normalized", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [],
					debug: { confidence: "low", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			await service.search({
				userId: "user_123",
				query: "What is TypeScript?",
			});

			const lastQuery = service.getLastQueryNormalized();

			const result: TestResult = {
				name: "track_last_query",
				passed: lastQuery === "What is TypeScript?",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(lastQuery).toBe("What is TypeScript?");
		});

		it("should clear turn tracking", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockResults: MockSearchResult[] = [
				{
					memory_id: "mem_1",
					content: "Content",
					position: 1,
					score_summary: { final_score: 0.9 },
					citations: [],
				},
			];

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: mockResults,
					debug: { confidence: "high", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			await service.search({
				userId: "user_123",
				query: "test",
			});

			// Verify tracking is populated
			expect(service.getSearchPositionMap().size).toBe(1);

			// Clear tracking
			service.clearTurnTracking();

			const result: TestResult = {
				name: "clear_turn_tracking",
				passed:
					service.getSearchPositionMap().size === 0 &&
					service.getLastSearchResults().length === 0 &&
					service.getLastQueryNormalized() === "",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(service.getSearchPositionMap().size).toBe(0);
			expect(service.getLastSearchResults()).toEqual([]);
			expect(service.getLastQueryNormalized()).toBe("");
		});

		it("should update tracking on each search", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn(async (p: any) => {
					const isFirst = String(p?.query ?? "").includes("first query");
					return {
						results: [
							{
								memory_id: isFirst ? "first_search" : "second_search",
								content: isFirst ? "A" : "B",
								position: 1,
								score_summary: { final_score: isFirst ? 0.9 : 0.8 },
								citations: [],
							},
						],
						debug: { confidence: "high", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
					};
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			// First search
			await service.search({ userId: "user_123", query: "first query" });
			expect(service.getLastQueryNormalized()).toBe("first query");

			// Second search
			await service.search({ userId: "user_123", query: "second query" });

			const result: TestResult = {
				name: "update_tracking_each_search",
				passed:
					service.getLastQueryNormalized() === "second query" &&
					service.getLastSearchResults()[0] === "second_search",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(service.getLastQueryNormalized()).toBe("second query");
			expect(service.getLastSearchResults()[0]).toBe("second_search");
		});
	});

	// ========================================================================
	// Tier Resolution Tests
	// ========================================================================

	describe("Tier Resolution", () => {
		it('should search all tiers when "all" specified', async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [],
					debug: { confidence: "low", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			await service.search({
				userId: "user_123",
				query: "test",
				collections: "all",
			});

			const callArgs = mockHybridSearch.search.mock.calls[0][0];

			const result: TestResult = {
				name: "resolve_all_tiers",
				passed: callArgs.tiers.length === 5,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(callArgs.tiers).toHaveLength(5);
		});

		it("should search only documents tier", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [],
					debug: { confidence: "low", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			await service.search({
				userId: "user_123",
				query: "book content",
				collections: ["documents"],
			});

			const callArgs = mockHybridSearch.search.mock.calls[0][0];

			const result: TestResult = {
				name: "resolve_documents_only",
				passed: callArgs.tiers.length === 1 && callArgs.tiers[0] === "documents",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(callArgs.tiers).toEqual(["documents"]);
		});

		it("should search memory_bank tier", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [],
					debug: { confidence: "low", stage_timings_ms: {}, fallbacks_used: [], errors: [] },
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			await service.search({
				userId: "user_123",
				query: "important fact",
				collections: ["memory_bank"],
			});

			const callArgs = mockHybridSearch.search.mock.calls[0][0];

			const result: TestResult = {
				name: "resolve_memory_bank",
				passed: callArgs.tiers.length === 1 && callArgs.tiers[0] === "memory_bank",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(callArgs.tiers).toEqual(["memory_bank"]);
		});
	});

	// ========================================================================
	// Error Handling Tests
	// ========================================================================

	describe("Error Handling", () => {
		it("should propagate hybrid search errors", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockRejectedValue(new Error("Search service unavailable")),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			let errorCaught = false;
			try {
				await service.search({
					userId: "user_123",
					query: "test",
				});
			} catch (err) {
				errorCaught = true;
			}

			const result: TestResult = {
				name: "propagate_search_errors",
				passed: errorCaught,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(errorCaught).toBe(true);
		});

		it("should handle empty results gracefully", async () => {
			const startTime = Date.now();

			const { ServiceFactory } = await import("../../ServiceFactory");
			ServiceFactory.resetForTests();

			const mockHybridSearch: MockHybridSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [],
					debug: {
						confidence: "low",
						stage_timings_ms: {},
						fallbacks_used: ["no_results"],
						errors: [],
					},
				}),
			};

			const service = ServiceFactory.getSearchService({
				hybridSearch: mockHybridSearch as any,
			});

			const response = await service.search({
				userId: "user_123",
				query: "nonexistent topic",
			});

			const result: TestResult = {
				name: "handle_empty_results",
				passed: response.results.length === 0 && response.debug !== undefined,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(response.results).toHaveLength(0);
			expect(response.debug).toBeDefined();
		});
	});

	// ========================================================================
	// Metrics Calculation Tests (using mock utilities)
	// ========================================================================

	describe("Retrieval Metrics", () => {
		it("should calculate MRR correctly", () => {
			const startTime = Date.now();

			const results = ["mem_3", "mem_1", "mem_5", "mem_2", "mem_4"];
			const relevant = new Set(["mem_1", "mem_2"]);

			const mrr = calculateMRR(results, relevant);

			// First relevant (mem_1) is at position 2, so MRR = 1/2 = 0.5
			const result: TestResult = {
				name: "calculate_mrr",
				passed: Math.abs(mrr - 0.5) < 0.001,
				duration: Date.now() - startTime,
				metrics: { mrr },
			};

			harness.recordResult(result);
			expect(mrr).toBeCloseTo(0.5, 3);
		});

		it("should calculate nDCG@5 correctly", () => {
			const startTime = Date.now();

			const results = ["mem_1", "mem_3", "mem_2", "mem_5", "mem_4"];
			const relevant = new Set(["mem_1", "mem_2"]);

			const ndcg = calculateNDCG(results, relevant, 5);

			const result: TestResult = {
				name: "calculate_ndcg",
				passed: ndcg > 0 && ndcg <= 1,
				duration: Date.now() - startTime,
				metrics: { ndcg },
			};

			harness.recordResult(result);
			expect(ndcg).toBeGreaterThan(0);
			expect(ndcg).toBeLessThanOrEqual(1);
		});

		it("should calculate Precision@K correctly", () => {
			const startTime = Date.now();

			const results = ["mem_1", "mem_2", "mem_3", "mem_4", "mem_5"];
			const relevant = new Set(["mem_1", "mem_3", "mem_5"]);

			const precision = calculatePrecisionAtK(results, relevant, 5);

			// 3 relevant in top 5, so precision = 3/5 = 0.6
			const result: TestResult = {
				name: "calculate_precision",
				passed: Math.abs(precision - 0.6) < 0.001,
				duration: Date.now() - startTime,
				metrics: { precision },
			};

			harness.recordResult(result);
			expect(precision).toBeCloseTo(0.6, 3);
		});

		it("should return 0 MRR when no relevant results", () => {
			const startTime = Date.now();

			const results = ["mem_1", "mem_2", "mem_3"];
			const relevant = new Set(["mem_x", "mem_y"]);

			const mrr = calculateMRR(results, relevant);

			const result: TestResult = {
				name: "mrr_no_relevant",
				passed: mrr === 0,
				duration: Date.now() - startTime,
				metrics: { mrr },
			};

			harness.recordResult(result);
			expect(mrr).toBe(0);
		});
	});
});
