/**
 * Unit Tests for Context/Prefetch Service
 *
 * Tests context analysis and prefetch logic including:
 * - Always-inject memory fetching (identity, preferences)
 * - Tier plan determination
 * - Context limit estimation
 * - Context injection formatting
 * - Retrieval confidence calculation
 *
 * Adapted from: roampal/backend/tests/unit/test_context_service.py
 *
 * Usage:
 *     npx vitest run src/lib/server/memory/__tests__/unit/test_context_service.test.ts
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

// Mock hybrid search service
const mockHybridSearch = {
	search: vi.fn().mockResolvedValue({
		results: [],
		debug: {
			query_analysis: {},
			stage_timings_ms: {},
			confidence: "medium",
			errors: [],
			fallbacks_used: [],
		},
	}),
};

// Mock Qdrant adapter
const mockQdrantAdapter = {
	isCircuitOpen: vi.fn().mockReturnValue(false),
	search: vi.fn().mockResolvedValue([]),
};

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
// TestPrefetchServiceInit: Test service initialization
// =============================================================================

describe("TestPrefetchServiceInit", () => {
	/**
	 * test_init_with_defaults
	 *
	 * Should initialize with default config.
	 */
	it("should initialize with default config", async () => {
		const testName = "test_init_with_defaults";
		try {
			const { PrefetchServiceImpl } = await import("../../services/PrefetchServiceImpl");

			const service = new PrefetchServiceImpl({
				hybridSearch: mockHybridSearch as any,
				qdrantAdapter: mockQdrantAdapter as any,
			});

			expect(service).toBeDefined();
			expect(service.prefetchContext).toBeDefined();

			recordResult(testName, true, "Service initialized with defaults");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_init_with_custom_config
	 *
	 * Should accept custom config.
	 */
	it("should accept custom config", async () => {
		const testName = "test_init_with_custom_config";
		try {
			const { PrefetchServiceImpl } = await import("../../services/PrefetchServiceImpl");

			const customConfig = {
				caps: {
					search_limit_default: 15,
					search_limit_max: 30,
				},
			};

			const service = new PrefetchServiceImpl({
				hybridSearch: mockHybridSearch as any,
				qdrantAdapter: mockQdrantAdapter as any,
				config: customConfig as any,
			});

			expect(service).toBeDefined();

			recordResult(testName, true, "Service initialized with custom config");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestAlwaysInjectMemories: Test always-inject memory fetching
// =============================================================================

describe("TestAlwaysInjectMemories", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { PrefetchServiceImpl } = await import("../../services/PrefetchServiceImpl");
		service = new PrefetchServiceImpl({
			hybridSearch: mockHybridSearch as any,
			qdrantAdapter: mockQdrantAdapter as any,
		});
	});

	/**
	 * test_fetches_identity_memories
	 *
	 * Should fetch always-inject memories with identity tag.
	 */
	it("should fetch identity memories", async () => {
		const testName = "test_fetches_identity_memories";
		try {
			// Mock identity memories
			mockQdrantAdapter.search.mockResolvedValueOnce([
				{
					id: "mem_1",
					payload: {
						content: "User prefers Hebrew responses",
						tier: "memory_bank",
						tags: ["identity"],
						always_inject: true,
					},
				},
				{
					id: "mem_2",
					payload: {
						content: "User is a software developer",
						tier: "memory_bank",
						tags: ["identity", "profession"],
						always_inject: true,
					},
				},
			]);

			const result = await service.prefetchContext({
				userId: "user_123",
				query: "Tell me about Python",
				recentMessages: [],
				hasDocuments: false,
			});

			expect(mockQdrantAdapter.search).toHaveBeenCalled();
			expect(result.memoryContextInjection).toContain("User Identity");

			recordResult(testName, true, "Identity memories fetched");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_handles_circuit_breaker_open
	 *
	 * Should return empty when circuit breaker is open.
	 */
	it("should return empty when circuit breaker is open", async () => {
		const testName = "test_circuit_breaker_open";
		try {
			mockQdrantAdapter.isCircuitOpen.mockReturnValueOnce(true);

			const result = await service.prefetchContext({
				userId: "user_123",
				query: "Test query",
				recentMessages: [],
				hasDocuments: false,
			});

			// Should not call scroll when circuit is open
			expect(mockQdrantAdapter.search).not.toHaveBeenCalled();

			recordResult(testName, true, "Circuit breaker handled correctly");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_handles_scroll_error
	 *
	 * Should handle scroll errors gracefully.
	 */
	it("should handle scroll errors gracefully", async () => {
		const testName = "test_scroll_error";
		try {
			mockQdrantAdapter.search.mockRejectedValueOnce(new Error("Qdrant unavailable"));

			// Should not throw
			const result = await service.prefetchContext({
				userId: "user_123",
				query: "Test query",
				recentMessages: [],
				hasDocuments: false,
			});

			expect(result).toBeDefined();

			recordResult(testName, true, "Scroll error handled gracefully");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestTierPlanDetermination: Test tier selection logic
// =============================================================================

describe("TestTierPlanDetermination", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { PrefetchServiceImpl } = await import("../../services/PrefetchServiceImpl");
		service = new PrefetchServiceImpl({
			hybridSearch: mockHybridSearch as any,
			qdrantAdapter: mockQdrantAdapter as any,
		});
	});

	/**
	 * test_includes_working_and_memory_bank
	 *
	 * Should always include working and memory_bank tiers.
	 */
	it("should always include working and memory_bank", async () => {
		const testName = "test_basic_tiers";
		try {
			await service.prefetchContext({
				userId: "user_123",
				query: "Test",
				recentMessages: [],
				hasDocuments: false,
			});

			const searchCall = mockHybridSearch.search.mock.calls[0][0];
			expect(searchCall.tiers).toContain("working");
			expect(searchCall.tiers).toContain("memory_bank");

			recordResult(testName, true, `Tiers: ${searchCall.tiers.join(", ")}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_includes_books_with_documents
	 *
	 * Should include books tier when documents are attached.
	 */
	it("should include books tier when documents attached", async () => {
		const testName = "test_books_with_documents";
		try {
			await service.prefetchContext({
				userId: "user_123",
				query: "Test",
				recentMessages: [],
				hasDocuments: true,
			});

			const searchCall = mockHybridSearch.search.mock.calls[0][0];
			expect(searchCall.tiers).toContain("books");

			recordResult(testName, true, "Books tier included with documents");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_includes_patterns_tier
	 *
	 * Should include patterns tier for learned behaviors.
	 */
	it("should include patterns tier", async () => {
		const testName = "test_patterns_tier";
		try {
			await service.prefetchContext({
				userId: "user_123",
				query: "Test",
				recentMessages: [],
				hasDocuments: false,
			});

			const searchCall = mockHybridSearch.search.mock.calls[0][0];
			expect(searchCall.tiers).toContain("patterns");

			recordResult(testName, true, "Patterns tier included");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestContextLimitEstimation: Test context limit calculation
// =============================================================================

describe("TestContextLimitEstimation", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { PrefetchServiceImpl } = await import("../../services/PrefetchServiceImpl");
		service = new PrefetchServiceImpl({
			hybridSearch: mockHybridSearch as any,
			qdrantAdapter: mockQdrantAdapter as any,
			config: {
				caps: {
					search_limit_default: 10,
					search_limit_max: 25,
				},
			} as any,
		});
	});

	/**
	 * test_default_limit
	 *
	 * Should use default limit for simple queries.
	 */
	it("should use default limit for simple queries", async () => {
		const testName = "test_default_limit";
		try {
			await service.prefetchContext({
				userId: "user_123",
				query: "Short query",
				recentMessages: [],
				hasDocuments: false,
			});

			const searchCall = mockHybridSearch.search.mock.calls[0][0];
			expect(searchCall.limit).toBe(10);

			recordResult(testName, true, `Limit: ${searchCall.limit}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_reduced_limit_with_documents
	 *
	 * Should reduce limit when documents are attached.
	 */
	it("should reduce limit when documents attached", async () => {
		const testName = "test_reduced_limit_documents";
		try {
			await service.prefetchContext({
				userId: "user_123",
				query: "Test query",
				recentMessages: [],
				hasDocuments: true,
			});

			const searchCall = mockHybridSearch.search.mock.calls[0][0];
			// Should be 60% of 10 = 6
			expect(searchCall.limit).toBeLessThan(10);
			expect(searchCall.limit).toBeGreaterThanOrEqual(3);

			recordResult(testName, true, `Reduced limit: ${searchCall.limit}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_increased_limit_complex_query
	 *
	 * Should increase limit for complex queries.
	 */
	it("should increase limit for complex queries", async () => {
		const testName = "test_increased_limit_complex";
		try {
			// Query longer than 200 chars
			const longQuery = "A".repeat(250);

			await service.prefetchContext({
				userId: "user_123",
				query: longQuery,
				recentMessages: [],
				hasDocuments: false,
			});

			const searchCall = mockHybridSearch.search.mock.calls[0][0];
			expect(searchCall.limit).toBeGreaterThan(10);

			recordResult(testName, true, `Increased limit: ${searchCall.limit}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_respects_explicit_limit
	 *
	 * Should respect explicitly passed limit.
	 */
	it("should respect explicitly passed limit", async () => {
		const testName = "test_explicit_limit";
		try {
			await service.prefetchContext({
				userId: "user_123",
				query: "Test",
				recentMessages: [],
				hasDocuments: false,
				limit: 5,
			});

			const searchCall = mockHybridSearch.search.mock.calls[0][0];
			expect(searchCall.limit).toBe(5);

			recordResult(testName, true, `Explicit limit: ${searchCall.limit}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestContextFormatting: Test context injection formatting
// =============================================================================

describe("TestContextFormatting", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { PrefetchServiceImpl } = await import("../../services/PrefetchServiceImpl");
		service = new PrefetchServiceImpl({
			hybridSearch: mockHybridSearch as any,
			qdrantAdapter: mockQdrantAdapter as any,
		});
	});

	/**
	 * test_formats_identity_section
	 *
	 * Should format identity section correctly.
	 */
	it("should format identity section", async () => {
		const testName = "test_identity_section";
		try {
			mockQdrantAdapter.search.mockResolvedValueOnce([
				{
					id: "mem_1",
					payload: {
						content: "User speaks Hebrew",
						tier: "memory_bank",
						tags: ["identity"],
						always_inject: true,
					},
				},
			]);

			const result = await service.prefetchContext({
				userId: "user_123",
				query: "Test",
				recentMessages: [],
				hasDocuments: false,
			});

			expect(result.memoryContextInjection).toContain("User Identity");
			expect(result.memoryContextInjection).toContain("User speaks Hebrew");

			recordResult(testName, true, "Identity section formatted");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_formats_search_results
	 *
	 * Should format search results with positions.
	 */
	it("should format search results with positions", async () => {
		const testName = "test_search_results_format";
		try {
			mockHybridSearch.search.mockResolvedValueOnce({
				results: [
					{
						position: 1,
						tier: "working",
						content: "First result content",
						memory_id: "mem_1",
					},
					{
						position: 2,
						tier: "patterns",
						content: "Second result content",
						memory_id: "mem_2",
					},
				],
				debug: {
					stage_timings_ms: {},
					confidence: "high",
					errors: [],
					fallbacks_used: [],
				},
			});

			const result = await service.prefetchContext({
				userId: "user_123",
				query: "Test",
				recentMessages: [],
				hasDocuments: false,
			});

			expect(result.memoryContextInjection).toContain("Relevant Context");
			expect(result.memoryContextInjection).toContain("[1]");
			expect(result.memoryContextInjection).toContain("[2]");
			expect(result.memoryContextInjection).toContain("[working:mem_1]");
			expect(result.memoryContextInjection).toContain("[patterns:mem_2]");

			recordResult(testName, true, "Search results formatted with positions");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_formats_recent_topic
	 *
	 * Should include recent topic hint.
	 */
	it("should include recent topic hint", async () => {
		const testName = "test_recent_topic";
		try {
			const result = await service.prefetchContext({
				userId: "user_123",
				query: "Follow up question",
				recentMessages: [
					{
						role: "user",
						content:
							"This is a substantial previous message about Python programming and async patterns",
					},
				],
				hasDocuments: false,
			});

			expect(result.memoryContextInjection).toContain("Recent Topic");

			recordResult(testName, true, "Recent topic included");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_empty_context
	 *
	 * Should return empty string when no context.
	 */
	it("should return empty string when no context", async () => {
		const testName = "test_empty_context";
		try {
			mockQdrantAdapter.search.mockResolvedValueOnce([]);
			mockHybridSearch.search.mockResolvedValueOnce({
				results: [],
				debug: {
					stage_timings_ms: {},
					confidence: "low",
					errors: [],
					fallbacks_used: [],
				},
			});

			const result = await service.prefetchContext({
				userId: "user_123",
				query: "Test",
				recentMessages: [],
				hasDocuments: false,
			});

			expect(result.memoryContextInjection).toBe("");

			recordResult(testName, true, "Empty context handled");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestConfidenceCalculation: Test retrieval confidence
// =============================================================================

describe("TestConfidenceCalculation", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { PrefetchServiceImpl } = await import("../../services/PrefetchServiceImpl");
		service = new PrefetchServiceImpl({
			hybridSearch: mockHybridSearch as any,
			qdrantAdapter: mockQdrantAdapter as any,
		});
	});

	/**
	 * test_high_confidence
	 *
	 * Should return high confidence with good context.
	 */
	it("should return high confidence with good context", async () => {
		const testName = "test_high_confidence";
		try {
			// Mock good identity context
			mockQdrantAdapter.search.mockResolvedValueOnce([
				{
					id: "mem_1",
					payload: {
						content: "Identity 1",
						tier: "memory_bank",
						tags: ["identity"],
						always_inject: true,
					},
				},
				{
					id: "mem_2",
					payload: {
						content: "Identity 2",
						tier: "memory_bank",
						tags: ["identity"],
						always_inject: true,
					},
				},
			]);

			// Mock good search results
			mockHybridSearch.search.mockResolvedValueOnce({
				results: [
					{ position: 1, tier: "working", content: "Result 1", memory_id: "mem_3" },
					{ position: 2, tier: "working", content: "Result 2", memory_id: "mem_4" },
					{ position: 3, tier: "patterns", content: "Result 3", memory_id: "mem_5" },
				],
				debug: {
					stage_timings_ms: { total_ms: 50 },
					confidence: "high",
					errors: [],
					fallbacks_used: [],
				},
			});

			const result = await service.prefetchContext({
				userId: "user_123",
				query: "Test",
				recentMessages: [],
				hasDocuments: false,
			});

			expect(result.retrievalConfidence).toBe("high");

			recordResult(testName, true, `Confidence: ${result.retrievalConfidence}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_medium_confidence
	 *
	 * Should return medium confidence with some context.
	 */
	it("should return medium confidence with some context", async () => {
		const testName = "test_medium_confidence";
		try {
			// Mock some identity context
			mockQdrantAdapter.search.mockResolvedValueOnce([
				{
					id: "mem_1",
					payload: {
						content: "Identity 1",
						tier: "memory_bank",
						tags: ["identity"],
						always_inject: true,
					},
				},
			]);

			// Mock some search results
			mockHybridSearch.search.mockResolvedValueOnce({
				results: [{ position: 1, tier: "working", content: "Result 1", memory_id: "mem_2" }],
				debug: {
					stage_timings_ms: {},
					confidence: "medium",
					errors: [],
					fallbacks_used: [],
				},
			});

			const result = await service.prefetchContext({
				userId: "user_123",
				query: "Test",
				recentMessages: [],
				hasDocuments: false,
			});

			expect(result.retrievalConfidence).toBe("medium");

			recordResult(testName, true, `Confidence: ${result.retrievalConfidence}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_low_confidence
	 *
	 * Should return low confidence with no context.
	 */
	it("should return low confidence with no context", async () => {
		const testName = "test_low_confidence";
		try {
			mockQdrantAdapter.search.mockResolvedValueOnce([]);
			mockHybridSearch.search.mockResolvedValueOnce({
				results: [],
				debug: {
					stage_timings_ms: {},
					confidence: "low",
					errors: [],
					fallbacks_used: ["noop"],
				},
			});

			const result = await service.prefetchContext({
				userId: "user_123",
				query: "Test",
				recentMessages: [],
				hasDocuments: false,
			});

			expect(result.retrievalConfidence).toBe("low");

			recordResult(testName, true, `Confidence: ${result.retrievalConfidence}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestDebugInformation: Test debug info in response
// =============================================================================

describe("TestDebugInformation", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { PrefetchServiceImpl } = await import("../../services/PrefetchServiceImpl");
		service = new PrefetchServiceImpl({
			hybridSearch: mockHybridSearch as any,
			qdrantAdapter: mockQdrantAdapter as any,
		});
	});

	/**
	 * test_includes_timing_info
	 *
	 * Should include timing information in debug.
	 */
	it("should include timing information", async () => {
		const testName = "test_timing_info";
		try {
			mockHybridSearch.search.mockResolvedValueOnce({
				results: [],
				debug: {
					stage_timings_ms: {
						embedding_ms: 10,
						search_ms: 20,
					},
					confidence: "low",
					errors: [],
					fallbacks_used: [],
				},
			});

			const result = await service.prefetchContext({
				userId: "user_123",
				query: "Test",
				recentMessages: [],
				hasDocuments: false,
			});

			expect(result.retrievalDebug).toBeDefined();
			expect(result.retrievalDebug.stage_timings_ms).toBeDefined();
			expect(result.retrievalDebug.stage_timings_ms.parallel_prefetch_ms).toBeDefined();
			expect(result.retrievalDebug.stage_timings_ms.format_ms).toBeDefined();

			recordResult(testName, true, "Timing info included");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_includes_stage_timings
	 *
	 * Should include individual stage timings.
	 */
	it("should include individual stage timings", async () => {
		const testName = "test_stage_timings";
		try {
			const result = await service.prefetchContext({
				userId: "user_123",
				query: "Test",
				recentMessages: [],
				hasDocuments: false,
			});

			const timings = result.retrievalDebug.stage_timings_ms;
			expect(timings).toHaveProperty("format_ms");
			expect(timings).toHaveProperty("parallel_prefetch_ms");

			recordResult(testName, true, `Stages: ${Object.keys(timings).join(", ")}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestHebrewContent: Test Hebrew content handling
// =============================================================================

describe("TestHebrewContent", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { PrefetchServiceImpl } = await import("../../services/PrefetchServiceImpl");
		service = new PrefetchServiceImpl({
			hybridSearch: mockHybridSearch as any,
			qdrantAdapter: mockQdrantAdapter as any,
		});
	});

	/**
	 * test_handles_hebrew_identity
	 *
	 * Should handle Hebrew content in identity memories.
	 */
	it("should handle Hebrew identity content", async () => {
		const testName = "test_hebrew_identity";
		try {
			mockQdrantAdapter.search.mockResolvedValueOnce([
				{
					id: "mem_1",
					payload: {
						content: "המשתמש מדבר עברית",
						tier: "memory_bank",
						tags: ["identity"],
						always_inject: true,
					},
				},
			]);

			const result = await service.prefetchContext({
				userId: "user_123",
				query: "מה הפתרון?",
				recentMessages: [],
				hasDocuments: false,
			});

			expect(result.memoryContextInjection).toContain("המשתמש מדבר עברית");

			recordResult(testName, true, "Hebrew identity handled");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_handles_hebrew_search_results
	 *
	 * Should handle Hebrew content in search results.
	 */
	it("should handle Hebrew search results", async () => {
		const testName = "test_hebrew_search_results";
		try {
			mockHybridSearch.search.mockResolvedValueOnce({
				results: [
					{
						position: 1,
						tier: "working",
						content: "תוכן בעברית עם מידע חשוב",
						memory_id: "mem_1",
					},
				],
				debug: {
					stage_timings_ms: {},
					confidence: "medium",
					errors: [],
					fallbacks_used: [],
				},
			});

			const result = await service.prefetchContext({
				userId: "user_123",
				query: "חפש מידע",
				recentMessages: [],
				hasDocuments: false,
			});

			expect(result.memoryContextInjection).toContain("תוכן בעברית");

			recordResult(testName, true, "Hebrew search results handled");
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
	it("should generate context service test summary", () => {
		console.log("\n=== CONTEXT/PREFETCH SERVICE TEST SUMMARY ===\n");

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

		console.log("\n=============================================\n");

		expect(true).toBe(true);
	});
});
