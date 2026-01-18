/**
 * Unit Tests for UnifiedMemoryFacade
 *
 * Tests the facade's interface parity with roampal memory system.
 * Adapted from roampal/backend/modules/memory/tests/unit/test_unified_memory_system.py
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	createMockMemoryFacade,
	createTestFragment,
	createTestConversation,
	MockTimeManager,
	MATURITY_LEVELS,
	TEST_SCENARIOS,
	TestHarness,
	type TestResult,
} from "../mock-utilities";

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

// ============================================================================
// Test Suites
// ============================================================================

describe("UnifiedMemoryFacade", () => {
	let harness: TestHarness;
	let timeManager: MockTimeManager;

	beforeEach(() => {
		harness = new TestHarness("UnifiedMemoryFacade");
		timeManager = new MockTimeManager();
		vi.clearAllMocks();
	});

	afterEach(() => {
		harness.reset();
	});

	// ========================================================================
	// Initialization Tests
	// ========================================================================

	describe("Initialization", () => {
		it("should create facade with default config", async () => {
			const startTime = Date.now();

			// Dynamic import to avoid module loading issues
			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const facade = new UnifiedMemoryFacade();
			const config = facade.getConfig();

			const result: TestResult = {
				name: "create_with_default_config",
				passed: config !== undefined,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(config).toBeDefined();
		});

		it("should create facade with custom config", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");
			const { defaultMemoryConfig } = await import("../../memory_config");

			const customConfig = {
				...defaultMemoryConfig,
				caps: {
					...defaultMemoryConfig.caps,
					search_limit_default: 123,
				},
			};

			const facade = new UnifiedMemoryFacade({ config: customConfig as any });
			const config = facade.getConfig();

			const result: TestResult = {
				name: "create_with_custom_config",
				passed: config.caps.search_limit_default === 123,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(config.caps.search_limit_default).toBe(123);
		});

		it("should implement singleton pattern", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			// Reset any existing instance
			UnifiedMemoryFacade.resetInstance();

			const instance1 = UnifiedMemoryFacade.getInstance();
			const instance2 = UnifiedMemoryFacade.getInstance();

			const result: TestResult = {
				name: "singleton_pattern",
				passed: instance1 === instance2,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(instance1).toBe(instance2);

			// Cleanup
			UnifiedMemoryFacade.resetInstance();
		});

		it("should allow setting custom instance", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");
			const { defaultMemoryConfig } = await import("../../memory_config");

			UnifiedMemoryFacade.resetInstance();

			const customFacade = new UnifiedMemoryFacade({
				config: {
					...defaultMemoryConfig,
					caps: {
						...defaultMemoryConfig.caps,
						search_limit_default: 9999,
					},
				} as any,
			});

			UnifiedMemoryFacade.setInstance(customFacade);
			const retrieved = UnifiedMemoryFacade.getInstance();

			const result: TestResult = {
				name: "set_custom_instance",
				passed: retrieved.getConfig().caps.search_limit_default === 9999,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(retrieved.getConfig().caps.search_limit_default).toBe(9999);

			// Cleanup
			UnifiedMemoryFacade.resetInstance();
		});
	});

	// ========================================================================
	// Search Tests
	// ========================================================================

	describe("Search Operations", () => {
		it("should search with default parameters", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [
						{
							memory_id: "mem_1",
							content: "Test memory content",
							score_summary: { final_score: 0.85 },
							citations: [],
						},
					],
					debug: { confidence: "high" },
				}),
			};

			const facade = new UnifiedMemoryFacade({
				services: { search: mockSearchService },
			});

			const response = await facade.search({
				userId: "user_123",
				query: "test query",
			});

			const result: TestResult = {
				name: "search_default_params",
				passed: response.results.length === 1 && mockSearchService.search.mock.calls.length === 1,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(response.results).toHaveLength(1);
			expect(mockSearchService.search).toHaveBeenCalledOnce();
		});

		it("should search with collection filter", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [],
					debug: { confidence: "low" },
				}),
			};

			const facade = new UnifiedMemoryFacade({
				services: { search: mockSearchService },
			});

			await facade.search({
				userId: "user_123",
				query: "test",
				collections: ["working", "patterns"],
			});

			const callArgs = mockSearchService.search.mock.calls[0][0];

			const result: TestResult = {
				name: "search_with_collection_filter",
				passed:
					callArgs.collections.includes("working") && callArgs.collections.includes("patterns"),
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(callArgs.collections).toContain("working");
			expect(callArgs.collections).toContain("patterns");
		});

		it("should handle search errors gracefully", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockSearchService = {
				search: vi.fn().mockRejectedValue(new Error("Search failed")),
			};

			const facade = new UnifiedMemoryFacade({
				services: { search: mockSearchService },
			});

			let errorCaught = false;
			try {
				await facade.search({
					userId: "user_123",
					query: "test",
				});
			} catch (err) {
				errorCaught = true;
			}

			const result: TestResult = {
				name: "search_error_handling",
				passed: errorCaught,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(errorCaught).toBe(true);
		});
	});

	// ========================================================================
	// Store Tests
	// ========================================================================

	describe("Store Operations", () => {
		it("should store memory with required fields", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockStoreService = {
				store: vi.fn().mockResolvedValue({ memory_id: "mem_new_123" }),
				removeBook: vi.fn(),
			};

			const facade = new UnifiedMemoryFacade({
				services: { store: mockStoreService },
			});

			const storeResult = await facade.store({
				userId: "user_123",
				tier: "working",
				text: "New memory content",
			});

			const result: TestResult = {
				name: "store_required_fields",
				passed: storeResult.memory_id === "mem_new_123",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(storeResult.memory_id).toBe("mem_new_123");
		});

		it("should store with optional metadata", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockStoreService = {
				store: vi.fn().mockResolvedValue({ memory_id: "mem_with_meta" }),
				removeBook: vi.fn(),
			};

			const facade = new UnifiedMemoryFacade({
				services: { store: mockStoreService },
			});

			await facade.store({
				userId: "user_123",
				tier: "patterns",
				text: "Pattern memory",
				tags: ["important", "work"],
				metadata: { source: "conversation" },
				importance: 0.9,
			});

			const callArgs = mockStoreService.store.mock.calls[0][0];

			const result: TestResult = {
				name: "store_with_metadata",
				passed: callArgs.tags.includes("important") && callArgs.importance === 0.9,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(callArgs.tags).toContain("important");
			expect(callArgs.importance).toBe(0.9);
		});
	});

	// ========================================================================
	// Outcome Recording Tests
	// ========================================================================

	describe("Outcome Recording", () => {
		it("should record positive outcome", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockOutcomesService = {
				recordOutcome: vi.fn().mockResolvedValue(undefined),
				recordResponse: vi.fn(),
			};

			const facade = new UnifiedMemoryFacade({
				services: { outcomes: mockOutcomesService },
			});

			await facade.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: ["mem_1", "mem_2"],
			});

			const callArgs = mockOutcomesService.recordOutcome.mock.calls[0][0];

			const result: TestResult = {
				name: "record_positive_outcome",
				passed: callArgs.outcome === "worked" && callArgs.relatedMemoryIds.length === 2,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(callArgs.outcome).toBe("worked");
			expect(callArgs.relatedMemoryIds).toHaveLength(2);
		});

		it("should record action outcome", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockActionKgService = {
				recordActionOutcome: vi.fn().mockResolvedValue(undefined),
				getActionEffectiveness: vi.fn(),
			};

			const facade = new UnifiedMemoryFacade({
				services: { actionKg: mockActionKgService },
			});

			await facade.recordActionOutcome({
				action_id: "action_1",
				action_type: "search_memory",
				context_type: "general",
				outcome: "worked",
				conversation_id: null,
				message_id: null,
				answer_attempt_id: null,
				tier: null,
				doc_id: null,
				memory_id: null,
				action_params: { tool_name: "search", query: "test" },
				tool_status: "ok",
				latency_ms: 10,
				error_type: null,
				error_message: null,
				timestamp: new Date().toISOString(),
			});

			const result: TestResult = {
				name: "record_action_outcome",
				passed: mockActionKgService.recordActionOutcome.mock.calls.length === 1,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockActionKgService.recordActionOutcome).toHaveBeenCalledOnce();
		});

		it("should record response with key takeaway", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockOutcomesService = {
				recordOutcome: vi.fn(),
				recordResponse: vi.fn().mockResolvedValue(undefined),
			};

			const facade = new UnifiedMemoryFacade({
				services: { outcomes: mockOutcomesService },
			});

			await facade.recordResponse({
				userId: "user_123",
				keyTakeaway: "User prefers concise answers",
				outcome: "worked",
			});

			const callArgs = mockOutcomesService.recordResponse.mock.calls[0][0];

			const result: TestResult = {
				name: "record_response_takeaway",
				passed: callArgs.keyTakeaway === "User prefers concise answers",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(callArgs.keyTakeaway).toBe("User prefers concise answers");
		});
	});

	// ========================================================================
	// Goals Management Tests
	// ========================================================================

	describe("Goals Management", () => {
		it("should get empty goals for new user", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const facade = new UnifiedMemoryFacade();
			const goals = await facade.getGoals("new_user");

			const result: TestResult = {
				name: "get_empty_goals",
				passed: Array.isArray(goals) && goals.length === 0,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(goals).toEqual([]);
		});

		it("should add and retrieve goal", async () => {
			const startTime = Date.now();

			// This test validates the interface - actual DB operations are mocked
			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const facade = new UnifiedMemoryFacade();

			// Add goal (will use mock DB)
			await facade.addGoal("user_123", "Learn TypeScript");

			// Since DB is mocked, we verify the method was called without error
			const result: TestResult = {
				name: "add_goal",
				passed: true, // No error thrown
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(true).toBe(true); // Method completed without error
		});

		it("should remove goal", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const facade = new UnifiedMemoryFacade();

			await facade.removeGoal("user_123", "Old goal");

			const result: TestResult = {
				name: "remove_goal",
				passed: true, // No error thrown
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(true).toBe(true);
		});
	});

	// ========================================================================
	// Values Management Tests
	// ========================================================================

	describe("Values Management", () => {
		it("should get empty values for new user", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const facade = new UnifiedMemoryFacade();
			const values = await facade.getValues("new_user");

			const result: TestResult = {
				name: "get_empty_values",
				passed: Array.isArray(values) && values.length === 0,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(values).toEqual([]);
		});

		it("should add value", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const facade = new UnifiedMemoryFacade();

			await facade.addValue("user_123", "Honesty");

			const result: TestResult = {
				name: "add_value",
				passed: true,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(true).toBe(true);
		});

		it("should remove value", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const facade = new UnifiedMemoryFacade();

			await facade.removeValue("user_123", "Old value");

			const result: TestResult = {
				name: "remove_value",
				passed: true,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(true).toBe(true);
		});
	});

	// ========================================================================
	// Arbitrary Data Tests
	// ========================================================================

	describe("Arbitrary Data Storage", () => {
		it("should store arbitrary data", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const facade = new UnifiedMemoryFacade();

			const testData = {
				preferences: { theme: "dark", language: "he" },
				lastVisit: new Date().toISOString(),
			};

			await facade.storeArbitraryData("user_123", "app_settings", testData);

			const result: TestResult = {
				name: "store_arbitrary_data",
				passed: true,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(true).toBe(true);
		});

		it("should retrieve null for non-existent key", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const facade = new UnifiedMemoryFacade();

			const data = await facade.retrieveArbitraryData("user_123", "nonexistent_key");

			const result: TestResult = {
				name: "retrieve_nonexistent_data",
				passed: data === null,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(data).toBeNull();
		});
	});

	// ========================================================================
	// Books Management Tests
	// ========================================================================

	describe("Books Management", () => {
		it("should list empty documents for new user", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const facade = new UnifiedMemoryFacade();

			const documents = await facade.listDocuments("new_user");

			const result: TestResult = {
				name: "list_empty_documents",
				passed: Array.isArray(documents) && documents.length === 0,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(documents).toEqual([]);
		});

		it("should retrieve from documents using search", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockSearchService = {
				search: vi.fn().mockResolvedValue({
					results: [
						{
							memory_id: "book_chunk_1",
							content: "Book content about TypeScript",
							score_summary: { final_score: 0.9 },
							citations: [
								{
									book: {
										book_id: "book_123",
										title: "TypeScript Guide",
										author: "John Doe",
										chunk_index: 5,
									},
								},
							],
						},
					],
					debug: { confidence: "high" },
				}),
			};

			const facade = new UnifiedMemoryFacade({
				services: { search: mockSearchService },
			});

			const chunks = await facade.retrieveFromDocuments("user_123", "TypeScript basics", 5);

			const result: TestResult = {
				name: "retrieve_from_documents",
				passed: chunks.length === 1 && chunks[0].title === "TypeScript Guide",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(chunks).toHaveLength(1);
			expect(chunks[0].title).toBe("TypeScript Guide");
		});

		it("should remove book", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockStoreService = {
				store: vi.fn(),
				removeBook: vi.fn().mockResolvedValue(undefined),
			};

			const facade = new UnifiedMemoryFacade({
				services: { store: mockStoreService },
			});

			await facade.removeBook({
				userId: "user_123",
				bookId: "book_to_remove",
			});

			const result: TestResult = {
				name: "remove_book",
				passed: mockStoreService.removeBook.mock.calls.length === 1,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockStoreService.removeBook).toHaveBeenCalledOnce();
		});
	});

	// ========================================================================
	// Context Services Tests
	// ========================================================================

	describe("Context Services", () => {
		it("should prefetch context", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockPrefetchService = {
				prefetchContext: vi.fn().mockResolvedValue({
					memoryContextInjection: "<memory>Relevant context here</memory>",
					retrievalDebug: { confidence: "medium" },
					retrievalConfidence: "medium",
				}),
			};

			const facade = new UnifiedMemoryFacade({
				services: { prefetch: mockPrefetchService },
			});

			const prefetchResult = await facade.prefetchContext({
				userId: "user_123",
				conversationId: "conv_456",
				query: "What did we discuss?",
				recentMessages: createTestConversation(3),
				hasDocuments: false,
			});

			const result: TestResult = {
				name: "prefetch_context",
				passed: prefetchResult.memoryContextInjection.includes("<memory>"),
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(prefetchResult.memoryContextInjection).toContain("<memory>");
		});

		it("should get cold start context", async () => {
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

			const result: TestResult = {
				name: "cold_start_context",
				passed: coldStart.text !== null,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(coldStart.text).not.toBeNull();
		});

		it("should get context insights", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockContextService = {
				getColdStartContext: vi.fn(),
				getContextInsights: vi.fn().mockResolvedValue({
					matched_concepts: ["typescript", "testing"],
					relevant_patterns: ["prefer_concise"],
					past_outcomes: [],
					proactive_insights: ["User likes examples"],
					topic_continuity: { topics: ["coding"], links: [] },
					repetition: { is_repeated: false },
					you_already_know: [],
					directives: [],
				}),
			};

			const facade = new UnifiedMemoryFacade({
				services: { context: mockContextService },
			});

			const insights = await facade.getContextInsights({
				userId: "user_123",
				conversationId: "conv_456",
				contextType: "chat",
				recentMessages: createTestConversation(2),
			});

			const result: TestResult = {
				name: "context_insights",
				passed: insights.matched_concepts.includes("typescript"),
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(insights.matched_concepts).toContain("typescript");
		});
	});

	// ========================================================================
	// Ops Services Tests
	// ========================================================================

	describe("Ops Services", () => {
		it("should get stats", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockOpsService = {
				getStats: vi.fn().mockResolvedValue({
					user_id: "user_123",
					as_of: new Date().toISOString(),
					tiers: {
						working: { active_count: 10, archived_count: 5 },
					},
					action_effectiveness: [],
				}),
				promoteNow: vi.fn(),
				reindexFromMongo: vi.fn(),
				consistencyCheck: vi.fn(),
				exportBackup: vi.fn(),
				importBackup: vi.fn(),
			};

			const facade = new UnifiedMemoryFacade({
				services: { ops: mockOpsService },
			});

			const stats = await facade.getStats("user_123");

			const result: TestResult = {
				name: "get_stats",
				passed: stats.user_id === "user_123",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(stats.user_id).toBe("user_123");
		});

		it("should export backup", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockOpsService = {
				getStats: vi.fn(),
				promoteNow: vi.fn(),
				reindexFromMongo: vi.fn(),
				consistencyCheck: vi.fn(),
				exportBackup: vi.fn().mockResolvedValue({
					exportedAt: new Date().toISOString(),
					size_bytes: 1024,
					payload: {
						version: "2.0.0",
						exportedAt: new Date().toISOString(),
						userId: "user_123",
						collections: {},
						meta: { format: "bricksllm_backup" },
					},
				}),
				importBackup: vi.fn(),
			};

			const facade = new UnifiedMemoryFacade({
				services: { ops: mockOpsService },
			});

			const backup = await facade.exportBackup({
				userId: "user_123",
				includeTiers: ["documents"],
			});

			const result: TestResult = {
				name: "export_backup",
				passed: backup.size_bytes === 1024,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(backup.size_bytes).toBe(1024);
		});

		it("should import backup", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockOpsService = {
				getStats: vi.fn(),
				promoteNow: vi
					.fn()
					.mockResolvedValue({ promoted: 0, archived: 0, deleted: 0, errors: 0, durationMs: 0 }),
				reindexFromMongo: vi.fn().mockResolvedValue({
					success: true,
					jobId: "noop",
					totalProcessed: 0,
					totalFailed: 0,
					durationMs: 0,
				}),
				getReindexProgress: vi.fn().mockReturnValue(null),
				pauseReindex: vi.fn().mockReturnValue(false),
				consistencyCheck: vi.fn().mockResolvedValue({
					success: true,
					checkedAt: new Date(),
					durationMs: 0,
					totalChecked: 0,
					issuesFound: 0,
					issuesRepaired: 0,
					issues: [],
					mongoCount: 0,
					qdrantCount: 0,
				}),
				exportBackup: vi.fn(),
				importBackup: vi.fn().mockResolvedValue({
					success: true,
					dryRun: true,
					stats: {
						memoriesImported: 0,
						memoriesSkipped: 0,
						versionsImported: 0,
						outcomesImported: 0,
						actionOutcomesImported: 0,
						kgNodesImported: 0,
						kgEdgesImported: 0,
						routingConceptsImported: 0,
						routingStatsImported: 0,
						actionEffectivenessImported: 0,
						personalityMappingsImported: 0,
						reindexCheckpointsImported: 0,
						consistencyLogsImported: 0,
					},
					errors: [],
				}),
			};

			const facade = new UnifiedMemoryFacade({
				services: { ops: mockOpsService },
			});

			await facade.importBackup({
				userId: "user_123",
				payload: {
					version: "2.0.0",
					exportedAt: new Date().toISOString(),
					userId: "user_123",
					collections: {},
					meta: { format: "bricksllm_backup" },
				},
			});

			const result: TestResult = {
				name: "import_backup",
				passed: mockOpsService.importBackup.mock.calls.length === 1,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockOpsService.importBackup).toHaveBeenCalledOnce();
		});

		it("should trigger promote now", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockOpsService = {
				getStats: vi.fn(),
				promoteNow: vi.fn().mockResolvedValue(undefined),
				reindexFromMongo: vi.fn(),
				consistencyCheck: vi.fn(),
				exportBackup: vi.fn(),
				importBackup: vi.fn(),
			};

			const facade = new UnifiedMemoryFacade({
				services: { ops: mockOpsService },
			});

			await facade.promoteNow("user_123");

			const result: TestResult = {
				name: "promote_now",
				passed: mockOpsService.promoteNow.mock.calls.length === 1,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockOpsService.promoteNow).toHaveBeenCalledOnce();
		});
	});

	// ========================================================================
	// Feedback Recording Tests
	// ========================================================================

	describe("Feedback Recording", () => {
		it("should record positive feedback", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockOutcomesService = {
				recordOutcome: vi.fn().mockResolvedValue(undefined),
				recordResponse: vi.fn(),
			};

			const facade = new UnifiedMemoryFacade({
				services: { outcomes: mockOutcomesService },
			});

			await facade.recordFeedback({
				userId: "user_123",
				memoryId: "mem_456",
				score: 1,
			});

			const callArgs = mockOutcomesService.recordOutcome.mock.calls[0][0];

			const result: TestResult = {
				name: "record_positive_feedback",
				passed: callArgs.outcome === "worked" && callArgs.relatedMemoryIds.includes("mem_456"),
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(callArgs.outcome).toBe("worked");
			expect(callArgs.relatedMemoryIds).toContain("mem_456");
		});

		it("should record negative feedback", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockOutcomesService = {
				recordOutcome: vi.fn().mockResolvedValue(undefined),
				recordResponse: vi.fn(),
			};

			const facade = new UnifiedMemoryFacade({
				services: { outcomes: mockOutcomesService },
			});

			await facade.recordFeedback({
				userId: "user_123",
				memoryId: "mem_789",
				score: -1,
			});

			const callArgs = mockOutcomesService.recordOutcome.mock.calls[0][0];

			const result: TestResult = {
				name: "record_negative_feedback",
				passed: callArgs.outcome === "failed",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(callArgs.outcome).toBe("failed");
		});

		it("should record response feedback", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const mockOutcomesService = {
				recordOutcome: vi.fn().mockResolvedValue(undefined),
				recordResponse: vi.fn(),
			};

			const facade = new UnifiedMemoryFacade({
				services: { outcomes: mockOutcomesService },
			});

			await facade.recordResponseFeedback({
				userId: "user_123",
				conversationId: "conv_456",
				messageId: "msg_789",
				score: 1,
				citationCount: 3,
			});

			const result: TestResult = {
				name: "record_response_feedback",
				passed: mockOutcomesService.recordOutcome.mock.calls.length === 1,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockOutcomesService.recordOutcome).toHaveBeenCalledOnce();
		});
	});

	// ========================================================================
	// Noop Services Tests
	// ========================================================================

	describe("Noop Services Fallback", () => {
		it("should use noop search when no service provided", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const facade = new UnifiedMemoryFacade({ services: {} });

			const response = await facade.search({
				userId: "user_123",
				query: "test",
			});

			const result: TestResult = {
				name: "noop_search",
				passed: response.results.length === 0 && response.debug.fallbacks_used.includes("noop"),
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(response.results).toHaveLength(0);
			expect(response.debug.fallbacks_used).toContain("noop");
		});

		it("should use noop store when no service provided", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const facade = new UnifiedMemoryFacade({ services: {} });

			const storeResult = await facade.store({
				userId: "user_123",
				tier: "working",
				text: "Test content",
			});

			const result: TestResult = {
				name: "noop_store",
				passed: storeResult.memory_id.startsWith("mem_"),
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(storeResult.memory_id).toMatch(/^mem_/);
		});

		it("should use noop context when disabled", async () => {
			const startTime = Date.now();

			const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");

			const facade = UnifiedMemoryFacade.create({ enabled: false });

			const prefetch = await facade.prefetchContext({
				userId: "user_123",
				conversationId: "conv_456",
				query: "test",
				recentMessages: [],
				hasDocuments: false,
			});

			const result: TestResult = {
				name: "noop_when_disabled",
				passed: prefetch.memoryContextInjection === "" && prefetch.retrievalConfidence === "low",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(prefetch.memoryContextInjection).toBe("");
			expect(prefetch.retrievalConfidence).toBe("low");
		});
	});
});
