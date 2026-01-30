/**
 * Unit Tests for OutcomeServiceImpl
 *
 * Tests outcome recording logic for the memory system.
 * Adapted from roampal/backend/modules/memory/tests/unit/test_outcome_service.py
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MockTimeManager, TestHarness, MATURITY_LEVELS, type TestResult } from "../mock-utilities";

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
// Mock Helpers
// ============================================================================

function createMockMongoStore() {
	return {
		getById: vi.fn(),
		store: vi.fn().mockResolvedValue({ memoryId: "mem_new_123" }),
		recordOutcome: vi.fn().mockResolvedValue(undefined),
		updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
	};
}

function createMockQdrantAdapter() {
	return {
		upsert: vi.fn().mockResolvedValue(undefined),
		updatePayload: vi.fn().mockResolvedValue(undefined),
		search: vi.fn().mockResolvedValue([]),
	};
}

function createMockEmbeddingClient() {
	return {
		embed: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
	};
}

// ============================================================================
// Test Suites
// ============================================================================

describe("OutcomeServiceImpl", () => {
	let harness: TestHarness;
	let timeManager: MockTimeManager;

	beforeEach(() => {
		harness = new TestHarness("OutcomeService");
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
		it("should create service with required dependencies", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
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

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockMongo.getById.mockResolvedValue({
				id: "mem_123",
				tier: "working",
				wilson_score: 0.6,
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			// Should work without explicit config
			await service.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: ["mem_123"],
			});

			const result: TestResult = {
				name: "default_config",
				passed: mockMongo.recordOutcome.mock.calls.length === 1,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockMongo.recordOutcome).toHaveBeenCalledOnce();
		});
	});

	// ========================================================================
	// Record Outcome Tests
	// ========================================================================

	describe("Record Outcome", () => {
		it("should record worked outcome", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockMongo.getById.mockResolvedValue({
				id: "mem_123",
				tier: "working",
				wilson_score: 0.7,
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: ["mem_123"],
			});

			const outcomeCall = mockMongo.recordOutcome.mock.calls[0][0];

			const result: TestResult = {
				name: "record_worked_outcome",
				passed: outcomeCall.outcome === "worked" && outcomeCall.memoryId === "mem_123",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(outcomeCall.outcome).toBe("worked");
			expect(outcomeCall.memoryId).toBe("mem_123");
		});

		it("should record failed outcome", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockMongo.getById.mockResolvedValue({
				id: "mem_456",
				tier: "working",
				wilson_score: 0.3,
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordOutcome({
				userId: "user_123",
				outcome: "failed",
				relatedMemoryIds: ["mem_456"],
			});

			const outcomeCall = mockMongo.recordOutcome.mock.calls[0][0];

			const result: TestResult = {
				name: "record_failed_outcome",
				passed: outcomeCall.outcome === "failed",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(outcomeCall.outcome).toBe("failed");
		});

		it("should record partial outcome", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockMongo.getById.mockResolvedValue({
				id: "mem_789",
				tier: "history",
				wilson_score: 0.55,
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordOutcome({
				userId: "user_123",
				outcome: "partial",
				relatedMemoryIds: ["mem_789"],
			});

			const outcomeCall = mockMongo.recordOutcome.mock.calls[0][0];

			const result: TestResult = {
				name: "record_partial_outcome",
				passed: outcomeCall.outcome === "partial",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(outcomeCall.outcome).toBe("partial");
		});

		it("should skip empty memory IDs", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: [],
			});

			const result: TestResult = {
				name: "skip_empty_ids",
				passed: mockMongo.recordOutcome.mock.calls.length === 0,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockMongo.recordOutcome).not.toHaveBeenCalled();
		});

		it("should skip undefined memory IDs", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				// relatedMemoryIds is undefined
			});

			const result: TestResult = {
				name: "skip_undefined_ids",
				passed: mockMongo.recordOutcome.mock.calls.length === 0,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockMongo.recordOutcome).not.toHaveBeenCalled();
		});

		it("should record outcome for multiple memories", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockMongo.getById.mockImplementation((id: string) => {
				return Promise.resolve({
					id,
					tier: "working",
					wilson_score: 0.6,
				});
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: ["mem_1", "mem_2", "mem_3"],
			});

			const result: TestResult = {
				name: "record_multiple_outcomes",
				passed: mockMongo.recordOutcome.mock.calls.length === 3,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockMongo.recordOutcome).toHaveBeenCalledTimes(3);
		});
	});

	// ========================================================================
	// Protected Tier Tests
	// ========================================================================

	describe("Protected Tiers", () => {
		it("should not score documents tier", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockMongo.getById.mockResolvedValue({
				id: "mem_book_1",
				tier: "documents",
				wilson_score: 0.5,
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: ["mem_book_1"],
			});

			const result: TestResult = {
				name: "skip_documents_tier",
				passed: mockMongo.recordOutcome.mock.calls.length === 0,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockMongo.recordOutcome).not.toHaveBeenCalled();
		});

		it("should not score memory_bank tier", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockMongo.getById.mockResolvedValue({
				id: "mem_bank_1",
				tier: "memory_bank",
				wilson_score: 0.5,
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: ["mem_bank_1"],
			});

			const result: TestResult = {
				name: "skip_memory_bank_tier",
				passed: mockMongo.recordOutcome.mock.calls.length === 0,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockMongo.recordOutcome).not.toHaveBeenCalled();
		});

		it("should score working tier", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockMongo.getById.mockResolvedValue({
				id: "mem_working_1",
				tier: "working",
				wilson_score: 0.6,
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: ["mem_working_1"],
			});

			const result: TestResult = {
				name: "score_working_tier",
				passed: mockMongo.recordOutcome.mock.calls.length === 1,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockMongo.recordOutcome).toHaveBeenCalledOnce();
		});

		it("should score patterns tier", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockMongo.getById.mockResolvedValue({
				id: "mem_pattern_1",
				tier: "patterns",
				wilson_score: 0.8,
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: ["mem_pattern_1"],
			});

			const result: TestResult = {
				name: "score_patterns_tier",
				passed: mockMongo.recordOutcome.mock.calls.length === 1,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockMongo.recordOutcome).toHaveBeenCalledOnce();
		});

		it("should filter protected tiers in mixed batch", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockMongo.getById.mockImplementation((id: string) => {
				const tiers: Record<string, string> = {
					mem_1: "working",
					mem_2: "documents",
					mem_3: "patterns",
					mem_4: "memory_bank",
				};
				return Promise.resolve({
					id,
					tier: tiers[id] || "working",
					wilson_score: 0.5,
				});
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: ["mem_1", "mem_2", "mem_3", "mem_4"],
			});

			// Only mem_1 (working) and mem_3 (patterns) should be scored
			const result: TestResult = {
				name: "filter_protected_in_batch",
				passed: mockMongo.recordOutcome.mock.calls.length === 2,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockMongo.recordOutcome).toHaveBeenCalledTimes(2);
		});
	});

	// ========================================================================
	// Record Response Tests
	// ========================================================================

	describe("Record Response", () => {
		it("should store key takeaway", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordResponse({
				userId: "user_123",
				keyTakeaway: "User prefers TypeScript over JavaScript",
			});

			const storeCall = mockMongo.store.mock.calls[0][0];

			const result: TestResult = {
				name: "store_key_takeaway",
				passed:
					storeCall.text === "User prefers TypeScript over JavaScript" &&
					storeCall.tier === "working" &&
					storeCall.tags.includes("key_takeaway"),
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(storeCall.text).toBe("User prefers TypeScript over JavaScript");
			expect(storeCall.tier).toBe("working");
			expect(storeCall.tags).toContain("key_takeaway");
		});

		it("should embed key takeaway", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordResponse({
				userId: "user_123",
				keyTakeaway: "Important information",
			});

			const result: TestResult = {
				name: "embed_key_takeaway",
				passed:
					mockEmbedding.embed.mock.calls.length === 1 &&
					mockEmbedding.embed.mock.calls[0][0] === "Important information",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockEmbedding.embed).toHaveBeenCalledWith("Important information");
		});

		it("should index takeaway in Qdrant", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordResponse({
				userId: "user_123",
				keyTakeaway: "Index this content",
			});

			const upsertCall = mockQdrant.upsert.mock.calls[0][0];

			const result: TestResult = {
				name: "index_in_qdrant",
				passed:
					upsertCall.payload.content === "Index this content" &&
					upsertCall.payload.tier === "working",
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(upsertCall.payload.content).toBe("Index this content");
			expect(upsertCall.payload.tier).toBe("working");
		});

		it("should use default unknown outcome", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordResponse({
				userId: "user_123",
				keyTakeaway: "No outcome specified",
			});

			const upsertCall = mockQdrant.upsert.mock.calls[0][0];

			const result: TestResult = {
				name: "default_unknown_outcome",
				passed: upsertCall.payload.composite_score === 0.5,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(upsertCall.payload.composite_score).toBe(0.5);
		});

		it("should use worked outcome score", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordResponse({
				userId: "user_123",
				keyTakeaway: "This worked well",
				outcome: "worked",
			});

			const upsertCall = mockQdrant.upsert.mock.calls[0][0];

			const result: TestResult = {
				name: "worked_outcome_score",
				passed: upsertCall.payload.composite_score === 0.7,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(upsertCall.payload.composite_score).toBe(0.7);
		});

		it("should call clearTurnTracking", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();
			const mockClearTracking = vi.fn();

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
				clearTurnTracking: mockClearTracking,
			});

			await service.recordResponse({
				userId: "user_123",
				keyTakeaway: "Tracking should be cleared",
			});

			const result: TestResult = {
				name: "clear_turn_tracking",
				passed: mockClearTracking.mock.calls.length === 1,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockClearTracking).toHaveBeenCalledOnce();
		});
	});

	// ========================================================================
	// Related Memory Resolution Tests
	// ========================================================================

	describe("Related Memory Resolution", () => {
		it("should resolve positional references", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			const positionMap = new Map<number, string>([
				[1, "mem_first"],
				[2, "mem_second"],
				[3, "mem_third"],
			]);

			mockMongo.getById.mockImplementation((id: string) => {
				return Promise.resolve({
					id,
					tier: "working",
					wilson_score: 0.6,
				});
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
				getSearchPositionMap: () => positionMap,
				getLastSearchResults: () => ["mem_first", "mem_second", "mem_third"],
			});

			await service.recordResponse({
				userId: "user_123",
				keyTakeaway: "Test",
				outcome: "worked",
				related: [1, 3], // Positions 1 and 3
			});

			// Should record outcome for mem_first and mem_third
			const recordedIds = mockMongo.recordOutcome.mock.calls.map((call: any[]) => call[0].memoryId);

			const result: TestResult = {
				name: "resolve_positional_refs",
				passed:
					recordedIds.includes("mem_first") &&
					recordedIds.includes("mem_third") &&
					!recordedIds.includes("mem_second"),
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(recordedIds).toContain("mem_first");
			expect(recordedIds).toContain("mem_third");
			expect(recordedIds).not.toContain("mem_second");
		});

		it("should resolve explicit memory IDs", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockMongo.getById.mockImplementation((id: string) => {
				return Promise.resolve({
					id,
					tier: "working",
					wilson_score: 0.6,
				});
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordResponse({
				userId: "user_123",
				keyTakeaway: "Test",
				outcome: "worked",
				related: ["mem_explicit_1", "mem_explicit_2"],
			});

			const recordedIds = mockMongo.recordOutcome.mock.calls.map((call: any[]) => call[0].memoryId);

			const result: TestResult = {
				name: "resolve_explicit_ids",
				passed: recordedIds.includes("mem_explicit_1") && recordedIds.includes("mem_explicit_2"),
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(recordedIds).toContain("mem_explicit_1");
			expect(recordedIds).toContain("mem_explicit_2");
		});

		it("should handle mixed positional and explicit refs", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			const positionMap = new Map<number, string>([
				[1, "mem_pos_1"],
				[2, "mem_pos_2"],
			]);

			mockMongo.getById.mockImplementation((id: string) => {
				return Promise.resolve({
					id,
					tier: "working",
					wilson_score: 0.6,
				});
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
				getSearchPositionMap: () => positionMap,
				getLastSearchResults: () => ["mem_pos_1", "mem_pos_2"],
			});

			await service.recordResponse({
				userId: "user_123",
				keyTakeaway: "Test",
				outcome: "worked",
				related: [1, "mem_explicit_1"], // Mix of position and ID
			});

			const recordedIds = mockMongo.recordOutcome.mock.calls.map((call: any[]) => call[0].memoryId);

			const result: TestResult = {
				name: "resolve_mixed_refs",
				passed: recordedIds.includes("mem_pos_1") && recordedIds.includes("mem_explicit_1"),
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(recordedIds).toContain("mem_pos_1");
			expect(recordedIds).toContain("mem_explicit_1");
		});

		it("should fall back to all results when no related specified", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			const lastResults = ["mem_all_1", "mem_all_2", "mem_all_3"];

			mockMongo.getById.mockImplementation((id: string) => {
				return Promise.resolve({
					id,
					tier: "working",
					wilson_score: 0.6,
				});
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
				getLastSearchResults: () => lastResults,
			});

			await service.recordResponse({
				userId: "user_123",
				keyTakeaway: "Test",
				outcome: "worked",
				// No 'related' specified
			});

			const result: TestResult = {
				name: "fallback_all_results",
				passed: mockMongo.recordOutcome.mock.calls.length === 3,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockMongo.recordOutcome).toHaveBeenCalledTimes(3);
		});
	});

	// ========================================================================
	// Qdrant Integration Tests
	// ========================================================================

	describe("Qdrant Integration", () => {
		it("should update Qdrant composite score", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockMongo.getById.mockResolvedValue({
				id: "mem_123",
				tier: "working",
				stats: { wilson_score: 0.75 },
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			await service.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: ["mem_123"],
			});

			const updateCall = mockQdrant.updatePayload.mock.calls[0];

			const result: TestResult = {
				name: "update_qdrant_score",
				passed: updateCall[0] === "mem_123" && updateCall[1].composite_score === 0.75,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(updateCall[0]).toBe("mem_123");
			expect(updateCall[1].composite_score).toBe(0.75);
		});
	});

	// ========================================================================
	// Error Handling Tests
	// ========================================================================

	describe("Error Handling", () => {
		it("should handle memory not found gracefully", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockMongo.getById.mockResolvedValue(null);

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			// Should not throw
			await service.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: ["mem_nonexistent"],
			});

			const result: TestResult = {
				name: "handle_not_found",
				passed: mockMongo.recordOutcome.mock.calls.length === 0,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockMongo.recordOutcome).not.toHaveBeenCalled();
		});

		it("should continue processing after individual error", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			let callCount = 0;
			mockMongo.getById.mockImplementation((id: string) => {
				callCount++;
				if (callCount === 2) {
					return Promise.reject(new Error("Database error"));
				}
				return Promise.resolve({
					id,
					tier: "working",
					wilson_score: 0.6,
				});
			});

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			// Should not throw despite error on second memory
			await service.recordOutcome({
				userId: "user_123",
				outcome: "worked",
				relatedMemoryIds: ["mem_1", "mem_2", "mem_3"],
			});

			// Should have attempted to record outcomes for all 3 memories
			// Even though mem_2 fails, mem_1 and mem_3 succeed, and all 3 are attempted
			const result: TestResult = {
				name: "continue_after_error",
				passed: mockMongo.recordOutcome.mock.calls.length === 3,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			expect(mockMongo.recordOutcome).toHaveBeenCalledTimes(3);
		});

		it("should handle embedding failure gracefully", async () => {
			const startTime = Date.now();

			const { OutcomeServiceImpl } = await import("../../services/OutcomeServiceImpl");

			const mockMongo = createMockMongoStore();
			const mockQdrant = createMockQdrantAdapter();
			const mockEmbedding = createMockEmbeddingClient();

			mockEmbedding.embed.mockResolvedValue(null);

			const service = new OutcomeServiceImpl({
				mongoStore: mockMongo as any,
				qdrantAdapter: mockQdrant as any,
				embeddingClient: mockEmbedding as any,
			});

			// Should not throw
			await service.recordResponse({
				userId: "user_123",
				keyTakeaway: "Embedding will fail",
			});

			const result: TestResult = {
				name: "handle_embedding_failure",
				passed:
					mockMongo.store.mock.calls.length === 0 && mockQdrant.upsert.mock.calls.length === 0,
				duration: Date.now() - startTime,
			};

			harness.recordResult(result);
			// Store and upsert should not be called if embedding fails
			expect(mockMongo.store).not.toHaveBeenCalled();
			expect(mockQdrant.upsert).not.toHaveBeenCalled();
		});
	});
});
