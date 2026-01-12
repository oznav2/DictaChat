/**
 * Smoke Tests for BricksLLM Memory System
 *
 * Quick end-to-end tests to verify the memory system works after deployment.
 * Run these after building to catch obvious breakage.
 *
 * Adapted from: roampal/backend/tests/integration/test_smoke.py
 *
 * Usage:
 *     npx vitest run src/lib/server/memory/__tests__/integration/test_smoke.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// =============================================================================
// Test Result Tracking (for characterization)
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
// Mock Setup for Integration Tests
// =============================================================================

// Mock the external dependencies
vi.mock("$lib/server/database", () => ({
	collections: {
		memories: {
			find: vi.fn().mockReturnValue({
				toArray: vi.fn().mockResolvedValue([]),
			}),
			findOne: vi.fn().mockResolvedValue(null),
			insertOne: vi.fn().mockResolvedValue({ insertedId: "test_id" }),
			updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
			deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
			countDocuments: vi.fn().mockResolvedValue(0),
		},
		users: {
			findOne: vi.fn().mockResolvedValue(null),
			updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
		},
		memoryBank: {
			find: vi.fn().mockReturnValue({
				sort: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				toArray: vi.fn().mockResolvedValue([]),
			}),
			countDocuments: vi.fn().mockResolvedValue(0),
		},
		books: {
			find: vi.fn().mockReturnValue({
				sort: vi.fn().mockReturnThis(),
				toArray: vi.fn().mockResolvedValue([]),
			}),
		},
	},
}));

vi.mock("$env/dynamic/private", () => ({
	env: {
		QDRANT_URL: "http://localhost:6333",
		QDRANT_API_KEY: "test_key",
		MONGODB_URL: "mongodb://localhost:27017",
		EMBEDDING_ENDPOINT: "http://localhost:5005",
	},
}));

// =============================================================================
// TestBackendSmoke: Smoke tests for backend startup and basic operations
// =============================================================================

describe("TestBackendSmoke", () => {
	/**
	 * test_backend_modules_import
	 *
	 * Verify all critical backend modules import without error.
	 * These imports will fail if dependencies are broken.
	 */
	describe("Module Imports", () => {
		it("should import UnifiedMemoryFacade without error", async () => {
			const testName = "test_unified_memory_facade_import";
			try {
				const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

				expect(UnifiedMemoryFacade).toBeDefined();
				expect(typeof UnifiedMemoryFacade).toBe("function");

				recordResult(testName, true, "UnifiedMemoryFacade imported successfully");
			} catch (error) {
				recordResult(testName, false, undefined, String(error));
				throw error;
			}
		});

		it("should import SearchService without error", async () => {
			const testName = "test_search_service_import";
			try {
				const { SearchServiceImpl } = await import("../../services/SearchServiceImpl");

				expect(SearchServiceImpl).toBeDefined();
				expect(typeof SearchServiceImpl).toBe("function");

				recordResult(testName, true, "SearchServiceImpl imported successfully");
			} catch (error) {
				recordResult(testName, false, undefined, String(error));
				throw error;
			}
		});

		it("should import OutcomeService without error", async () => {
			const testName = "test_outcome_service_import";
			try {
				const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

				expect(OutcomeServiceImpl).toBeDefined();
				expect(typeof OutcomeServiceImpl).toBe("function");

				recordResult(testName, true, "OutcomeServiceImpl imported successfully");
			} catch (error) {
				recordResult(testName, false, undefined, String(error));
				throw error;
			}
		});

		it("should import PromotionService without error", async () => {
			const testName = "test_promotion_service_import";
			try {
				const { PromotionServiceImpl } = await import("../../services/PromotionServiceImpl");

				expect(PromotionServiceImpl).toBeDefined();
				expect(typeof PromotionServiceImpl).toBe("function");

				recordResult(testName, true, "PromotionServiceImpl imported successfully");
			} catch (error) {
				recordResult(testName, false, undefined, String(error));
				throw error;
			}
		});

		it("should import ContextService without error", async () => {
			const testName = "test_context_service_import";
			try {
				const { ContextServiceImpl } = await import("../../services/ContextServiceImpl");

				expect(ContextServiceImpl).toBeDefined();
				expect(typeof ContextServiceImpl).toBe("function");

				recordResult(testName, true, "ContextServiceImpl imported successfully");
			} catch (error) {
				recordResult(testName, false, undefined, String(error));
				throw error;
			}
		});

		it("should import KnowledgeGraphService without error", async () => {
			const testName = "test_kg_service_import";
			try {
				const { KnowledgeGraphService } = await import("../../kg/KnowledgeGraphService");

				expect(KnowledgeGraphService).toBeDefined();
				expect(typeof KnowledgeGraphService).toBe("function");

				recordResult(testName, true, "KnowledgeGraphService imported successfully");
			} catch (error) {
				recordResult(testName, false, undefined, String(error));
				throw error;
			}
		});
	});

	/**
	 * test_service_instantiation
	 *
	 * Verify services can be instantiated with mock dependencies.
	 */
	describe("Service Instantiation", () => {
		it("should instantiate UnifiedMemoryFacade", async () => {
			const testName = "test_facade_instantiation";
			try {
				const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

				// Reset singleton for testing
				UnifiedMemoryFacade.resetInstance();

				const facade = UnifiedMemoryFacade.getInstance();

				expect(facade).toBeDefined();
				expect(facade.getConfig).toBeDefined();
				expect(facade.search).toBeDefined();
				expect(facade.store).toBeDefined();

				// Cleanup
				UnifiedMemoryFacade.resetInstance();

				recordResult(testName, true, "UnifiedMemoryFacade instantiated successfully");
			} catch (error) {
				recordResult(testName, false, undefined, String(error));
				throw error;
			}
		});
	});
});

// =============================================================================
// TestRequiredDependencies: Verify all required modules are available
// =============================================================================

describe("TestRequiredDependencies", () => {
	/**
	 * test_required_packages_available
	 *
	 * Verify all required packages can be imported.
	 */
	it("should have all required TypeScript types available", async () => {
		const testName = "test_required_types";
		try {
			// Types are compile-time only in TypeScript, so we test runtime exports
			// Import defaultMemoryConfig as a runtime check that types module loads
			const { defaultMemoryConfig } = await import("../../memory_config");

			// Verify the default config is exported and has expected structure
			expect(defaultMemoryConfig).toBeDefined();
			expect(defaultMemoryConfig.timeouts).toBeDefined();
			expect(defaultMemoryConfig.caps).toBeDefined();

			recordResult(testName, true, "All required types available");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	it("should have mock utilities available", async () => {
		const testName = "test_mock_utilities";
		try {
			const { TestHarness, MockTimeManager } = await import("../mock-utilities");

			expect(TestHarness).toBeDefined();
			expect(MockTimeManager).toBeDefined();

			const harness = new TestHarness();
			expect(harness.facade).toBeDefined();

			recordResult(testName, true, "Mock utilities available and working");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestMemoryOperations: Test core memory operations work correctly
// =============================================================================

describe("TestMemoryOperations", () => {
	let harness: any;

	beforeEach(async () => {
		const { TestHarness } = await import("../mock-utilities");
		harness = new TestHarness();
	});

	afterEach(() => {
		harness?.cleanup?.();
	});

	/**
	 * test_add_and_search_memory
	 *
	 * Test adding a memory and searching for it.
	 */
	it("should add and search for memories", async () => {
		const testName = "test_add_and_search_memory";
		try {
			const { facade, mockSearch } = harness;

			// Configure mock to return test memories
			const testMemories = [
				{ id: "mem_1", text: "Python programming tips", tier: "working", wilson_score: 0.7 },
				{ id: "mem_2", text: "JavaScript async patterns", tier: "working", wilson_score: 0.6 },
				{ id: "mem_3", text: "Rust memory safety", tier: "working", wilson_score: 0.8 },
			];

			mockSearch.search.mockResolvedValueOnce({
				results: testMemories,
				debug: { query: "programming" },
			});

			// Search for memories
			const results = await facade.search({
				userId: "user_123",
				query: "programming",
			});

			expect(results.results).toBeDefined();
			expect(Array.isArray(results.results)).toBe(true);

			recordResult(testName, true, `Found ${results.results.length} memories`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_store_memory
	 *
	 * Test storing a new memory.
	 */
	it("should store a new memory", async () => {
		const testName = "test_store_memory";
		try {
			const { facade, mockStore } = harness;

			// Configure mock to return success
			mockStore.store.mockResolvedValueOnce({
				success: true,
				memoryId: "new_mem_123",
			});

			// Store a memory
			const result = await facade.store({
				userId: "user_123",
				tier: "working",
				text: "Test memory content",
				metadata: { source: "smoke_test" },
			});

			expect(result.success).toBe(true);
			expect(result.memoryId).toBeDefined();

			recordResult(testName, true, `Stored memory with ID: ${result.memoryId}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_record_outcome
	 *
	 * Test recording an outcome for memories.
	 */
	it("should record outcome for memories", async () => {
		const testName = "test_record_outcome";
		try {
			const { facade, mockOutcome } = harness;

			// Configure mock to return success
			mockOutcome.recordOutcome.mockResolvedValueOnce({
				success: true,
				updated_count: 2,
			});

			// Record outcome
			const result = await facade.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: ["mem_1", "mem_2"],
			});

			expect(result.success).toBe(true);

			recordResult(testName, true, `Recorded outcome for ${result.updated_count} memories`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_get_context
	 *
	 * Test prefetching context for a conversation.
	 */
	it("should prefetch context for conversation", async () => {
		const testName = "test_prefetch_context";
		try {
			const { facade, mockContext } = harness;

			// Configure mock to return context
			mockContext.prefetchContext.mockResolvedValueOnce({
				context: "<memory>\nRelevant context here\n</memory>",
				insights: {
					matched_concepts: ["programming", "typescript"],
					confidence: 0.85,
				},
			});

			// Prefetch context
			const result = await facade.prefetchContext({
				userId: "user_123",
				query: "How do I handle async operations?",
				conversationHistory: [],
			});

			expect(result.context).toBeDefined();
			expect(result.context).toContain("<memory>");

			recordResult(testName, true, "Context prefetched successfully");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestHealthCheck: Test health check and basic endpoint functionality
// =============================================================================

describe("TestHealthCheck", () => {
	/**
	 * test_facade_health
	 *
	 * Verify facade can report its status.
	 */
	it("should report facade health status", async () => {
		const testName = "test_facade_health";
		try {
			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			// Reset for clean test
			UnifiedMemoryFacade.resetInstance();

			// Use create() not getInstance() - getInstance ignores parameters
			const facade = UnifiedMemoryFacade.create({
				enabled: true,
			});

			// Should be able to get config
			const config = facade.getConfig();
			expect(config).toBeDefined();
			// Config has timeouts and caps, verify structure exists
			expect(config.timeouts).toBeDefined();
			expect(config.caps).toBeDefined();

			// Cleanup
			UnifiedMemoryFacade.resetInstance();

			recordResult(testName, true, "Facade health check passed");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_noop_mode
	 *
	 * Verify noop mode works when memory is disabled.
	 */
	it("should work in noop mode when disabled", async () => {
		const testName = "test_noop_mode";
		try {
			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			// Reset for clean test
			UnifiedMemoryFacade.resetInstance();

			// Use create() not getInstance() - getInstance ignores parameters
			const facade = UnifiedMemoryFacade.create({
				enabled: false, // Disabled - creates facade with noop services
			});

			// Search should return empty results with noop fallback
			const results = await facade.search({
				userId: "user_123",
				query: "test",
			});

			expect(results.results).toEqual([]);
			// fallbacks_used is in the debug object
			expect(results.debug.fallbacks_used).toContain("noop");

			// Cleanup
			UnifiedMemoryFacade.resetInstance();

			recordResult(testName, true, "Noop mode working correctly");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestEdgeCases: Test edge cases and error handling
// =============================================================================

describe("TestEdgeCases", () => {
	let harness: any;

	beforeEach(async () => {
		const { TestHarness } = await import("../mock-utilities");
		harness = new TestHarness();
	});

	afterEach(() => {
		harness?.cleanup?.();
	});

	/**
	 * test_empty_query
	 *
	 * Test handling of empty query.
	 */
	it("should handle empty query gracefully", async () => {
		const testName = "test_empty_query";
		try {
			const { facade, mockSearch } = harness;

			mockSearch.search.mockResolvedValueOnce({
				results: [],
				debug: { query: "" },
			});

			const results = await facade.search({
				userId: "user_123",
				query: "",
			});

			expect(results.results).toEqual([]);

			recordResult(testName, true, "Empty query handled gracefully");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_unicode_content
	 *
	 * Test handling of Unicode/Hebrew content.
	 */
	it("should handle Hebrew and Unicode content", async () => {
		const testName = "test_unicode_content";
		try {
			const { facade, mockSearch } = harness;

			// Hebrew content
			const hebrewMemories = [
				{ id: "mem_he_1", text: "עברית עם ניקוד: בְּרֵאשִׁית", tier: "working", wilson_score: 0.7 },
				{ id: "mem_he_2", text: "טקסט בעברית לבדיקה", tier: "working", wilson_score: 0.6 },
			];

			mockSearch.search.mockResolvedValueOnce({
				results: hebrewMemories,
				debug: { query: "עברית" },
			});

			const results = await facade.search({
				userId: "user_123",
				query: "עברית",
			});

			expect(results.results.length).toBe(2);
			expect(results.results[0].text).toContain("עברית");

			recordResult(testName, true, "Hebrew content handled correctly");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_service_error_handling
	 *
	 * Test that service errors are handled gracefully.
	 */
	it("should handle service errors gracefully", async () => {
		const testName = "test_service_error_handling";
		try {
			const { facade, mockSearch } = harness;

			// Simulate service error
			mockSearch.search.mockRejectedValueOnce(new Error("Service unavailable"));

			// Should not throw, should return empty with error info
			try {
				const results = await facade.search({
					userId: "user_123",
					query: "test",
				});

				// If facade handles errors gracefully, we get empty results
				expect(results.results).toEqual([]);
				recordResult(testName, true, "Service error handled gracefully");
			} catch (error) {
				// If facade propagates errors, that's also acceptable
				expect(error).toBeDefined();
				recordResult(testName, true, "Service error propagated correctly");
			}
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_invalid_user_id
	 *
	 * Test handling of invalid user ID.
	 */
	it("should handle missing user ID", async () => {
		const testName = "test_invalid_user_id";
		try {
			const { facade, mockSearch } = harness;

			mockSearch.search.mockResolvedValueOnce({
				results: [],
				debug: { query: "test" },
			});

			// Empty user ID should still work (return empty)
			const results = await facade.search({
				userId: "",
				query: "test",
			});

			expect(results.results).toEqual([]);

			recordResult(testName, true, "Missing user ID handled gracefully");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestAPIEndpointShapes: Verify API response shapes match expected formats
// =============================================================================

describe("TestAPIEndpointShapes", () => {
	/**
	 * test_search_response_shape
	 *
	 * Verify search API response has expected shape.
	 */
	it("should return correct search response shape", async () => {
		const testName = "test_search_response_shape";
		try {
			const { TestHarness } = await import("../mock-utilities");
			const harness = new TestHarness();

			const { facade, mockSearch } = harness;

			mockSearch.search.mockResolvedValueOnce({
				results: [{ id: "mem_1", text: "Test", tier: "working", wilson_score: 0.7 }],
				debug: { query: "test", took_ms: 50 },
			});

			const response = await facade.search({
				userId: "user_123",
				query: "test",
			});

			// Verify shape
			expect(response).toHaveProperty("results");
			expect(Array.isArray(response.results)).toBe(true);

			if (response.results.length > 0) {
				const result = response.results[0];
				expect(result).toHaveProperty("id");
				expect(result).toHaveProperty("text");
			}

			harness.cleanup?.();

			recordResult(testName, true, "Search response shape is correct");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_store_response_shape
	 *
	 * Verify store API response has expected shape.
	 */
	it("should return correct store response shape", async () => {
		const testName = "test_store_response_shape";
		try {
			const { TestHarness } = await import("../mock-utilities");
			const harness = new TestHarness();

			const { facade, mockStore } = harness;

			mockStore.store.mockResolvedValueOnce({
				success: true,
				memoryId: "new_mem_456",
			});

			const response = await facade.store({
				userId: "user_123",
				tier: "working",
				text: "Test content",
			});

			// Verify shape
			expect(response).toHaveProperty("success");
			expect(typeof response.success).toBe("boolean");

			if (response.success) {
				expect(response).toHaveProperty("memoryId");
				expect(typeof response.memoryId).toBe("string");
			}

			harness.cleanup?.();

			recordResult(testName, true, "Store response shape is correct");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_stats_response_shape
	 *
	 * Verify stats API response has expected shape.
	 */
	it("should return correct stats response shape", async () => {
		const testName = "test_stats_response_shape";
		try {
			const { TestHarness } = await import("../mock-utilities");
			const harness = new TestHarness();

			const { facade, mockOps } = harness;

			mockOps.getStats.mockResolvedValueOnce({
				total_memories: 100,
				memories_by_tier: {
					working: 50,
					history: 30,
					patterns: 15,
					books: 5,
				},
				avg_score: 0.65,
			});

			const response = await facade.getStats("user_123");

			// Verify shape
			expect(response).toHaveProperty("total_memories");
			expect(typeof response.total_memories).toBe("number");

			harness.cleanup?.();

			recordResult(testName, true, "Stats response shape is correct");
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
	it("should generate smoke test summary", () => {
		console.log("\n=== SMOKE TEST SUMMARY ===\n");

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

		console.log("\n=========================\n");

		// This test always passes - it's just for reporting
		expect(true).toBe(true);
	});
});
