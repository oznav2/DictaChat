/**
 * Unit Tests for PromotionService
 *
 * Tests memory lifecycle management including:
 * - working → history promotion (score ≥ 0.7, uses ≥ 2)
 * - history → patterns promotion (score ≥ 0.9, uses ≥ 3)
 * - TTL-based cleanup (working: 24h, history: 30d)
 * - Garbage cleanup (score < 0.2)
 * - Scheduler management
 *
 * Adapted from: roampal/backend/tests/unit/test_promotion_service.py
 *
 * Usage:
 *     npx vitest run src/lib/server/memory/__tests__/unit/test_promotion_service.test.ts
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

// Mock MongoDB store
const mockMongoStore = {
	query: vi.fn().mockResolvedValue([]),
	getById: vi.fn().mockResolvedValue(null),
	update: vi.fn().mockResolvedValue(undefined),
	archive: vi.fn().mockResolvedValue(undefined),
};

// Mock Qdrant adapter
const mockQdrantAdapter = {
	updatePayload: vi.fn().mockResolvedValue(undefined),
	isCircuitOpen: vi.fn().mockReturnValue(false),
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
// TestPromotionServiceInit: Test initialization
// =============================================================================

describe("TestPromotionServiceInit", () => {
	/**
	 * test_init_with_defaults
	 *
	 * Should initialize with default config.
	 */
	it("should initialize with default config", async () => {
		const testName = "test_init_with_defaults";
		try {
			const { PromotionService } = await import("../../learning/PromotionService");

			const service = new PromotionService({
				mongoStore: mockMongoStore as any,
				qdrantAdapter: mockQdrantAdapter as any,
			});

			expect(service).toBeDefined();
			expect(service.runCycle).toBeDefined();
			expect(service.startScheduler).toBeDefined();

			recordResult(testName, true, "Service initialized with defaults");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_init_with_custom_config
	 *
	 * Should use custom config.
	 */
	it("should use custom config", async () => {
		const testName = "test_init_with_custom_config";
		try {
			const { PromotionService } = await import("../../learning/PromotionService");

			const customConfig = {
				promotion: {
					scheduler_interval_ms: 60000, // 1 minute
				},
			};

			const service = new PromotionService({
				mongoStore: mockMongoStore as any,
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
// TestWorkingToHistoryPromotion: Test working → history
// =============================================================================

describe("TestWorkingToHistoryPromotion", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { PromotionService } = await import("../../learning/PromotionService");
		service = new PromotionService({
			mongoStore: mockMongoStore as any,
			qdrantAdapter: mockQdrantAdapter as any,
		});
	});

	/**
	 * test_promotes_working_to_history
	 *
	 * Should promote working memory with high score and uses.
	 */
	it("should promote working memory with high score and uses", async () => {
		const testName = "test_promotes_working_to_history";
		try {
			// Mock candidate memory
			mockMongoStore.query.mockResolvedValueOnce([
				{
					memory_id: "mem_123",
					user_id: "user_123",
					tier: "working",
					wilson_score: 0.8,
					uses: 3,
					status: "active",
				},
			]);

			// Run for history tier (empty)
			mockMongoStore.query.mockResolvedValueOnce([]);

			// Run for TTL cleanup
			mockMongoStore.query.mockResolvedValueOnce([]);
			mockMongoStore.query.mockResolvedValueOnce([]);

			// Run for garbage cleanup
			mockMongoStore.query.mockResolvedValueOnce([]);
			mockMongoStore.query.mockResolvedValueOnce([]);
			mockMongoStore.query.mockResolvedValueOnce([]);

			const stats = await service.runCycle("user_123");

			// Should have promoted 1 memory
			expect(stats.promoted).toBe(1);
			expect(mockMongoStore.update).toHaveBeenCalled();
			expect(mockQdrantAdapter.updatePayload).toHaveBeenCalled();

			recordResult(testName, true, `Promoted: ${stats.promoted}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_no_promotion_low_score
	 *
	 * Should not promote if score too low.
	 */
	it("should not promote if score too low", async () => {
		const testName = "test_no_promotion_low_score";
		try {
			// Mock candidate memory with low score
			mockMongoStore.query.mockResolvedValueOnce([
				{
					memory_id: "mem_123",
					user_id: "user_123",
					tier: "working",
					wilson_score: 0.5, // Below 0.7 threshold
					uses: 3,
					status: "active",
				},
			]);

			// Run for other queries (return empty)
			mockMongoStore.query.mockResolvedValue([]);

			const stats = await service.runCycle("user_123");

			// Should not have promoted anything
			expect(stats.promoted).toBe(0);

			recordResult(testName, true, "No promotion for low score");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_no_promotion_low_uses
	 *
	 * Should not promote if uses too low.
	 */
	it("should not promote if uses too low", async () => {
		const testName = "test_no_promotion_low_uses";
		try {
			// Mock candidate memory with low uses
			mockMongoStore.query.mockResolvedValueOnce([
				{
					memory_id: "mem_123",
					user_id: "user_123",
					tier: "working",
					wilson_score: 0.8,
					uses: 1, // Below 2 threshold
					status: "active",
				},
			]);

			mockMongoStore.query.mockResolvedValue([]);

			const stats = await service.runCycle("user_123");

			expect(stats.promoted).toBe(0);

			recordResult(testName, true, "No promotion for low uses");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestHistoryToPatternsPromotion: Test history → patterns
// =============================================================================

describe("TestHistoryToPatternsPromotion", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { PromotionService } = await import("../../learning/PromotionService");
		service = new PromotionService({
			mongoStore: mockMongoStore as any,
			qdrantAdapter: mockQdrantAdapter as any,
		});
	});

	/**
	 * test_promotes_history_to_patterns
	 *
	 * Should promote history memory with very high score.
	 */
	it("should promote history memory with very high score", async () => {
		const testName = "test_promotes_history_to_patterns";
		try {
			// Working tier (empty)
			mockMongoStore.query.mockResolvedValueOnce([]);

			// History tier with high-score memory
			mockMongoStore.query.mockResolvedValueOnce([
				{
					memory_id: "mem_456",
					user_id: "user_123",
					tier: "history",
					wilson_score: 0.95, // >= 0.9 threshold
					uses: 5, // >= 3 threshold
					status: "active",
				},
			]);

			// TTL and garbage cleanup (empty)
			mockMongoStore.query.mockResolvedValue([]);

			const stats = await service.runCycle("user_123");

			// Should have promoted to patterns
			expect(stats.promoted).toBe(1);

			const updateCall = mockMongoStore.update.mock.calls[0][0];
			expect(updateCall.updates.tier).toBe("patterns");

			recordResult(testName, true, `Promoted to patterns: ${stats.promoted}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_no_patterns_promotion_low_score
	 *
	 * Should not promote to patterns if score below 0.9.
	 */
	it("should not promote to patterns if score below threshold", async () => {
		const testName = "test_no_patterns_promotion_low_score";
		try {
			mockMongoStore.query.mockResolvedValueOnce([]);

			// History tier with medium score
			mockMongoStore.query.mockResolvedValueOnce([
				{
					memory_id: "mem_456",
					user_id: "user_123",
					tier: "history",
					wilson_score: 0.85, // Below 0.9 threshold
					uses: 5,
					status: "active",
				},
			]);

			mockMongoStore.query.mockResolvedValue([]);

			const stats = await service.runCycle("user_123");

			expect(stats.promoted).toBe(0);

			recordResult(testName, true, "No patterns promotion for medium score");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestTTLCleanup: Test TTL-based archival
// =============================================================================

describe("TestTTLCleanup", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { PromotionService } = await import("../../learning/PromotionService");
		service = new PromotionService({
			mongoStore: mockMongoStore as any,
			qdrantAdapter: mockQdrantAdapter as any,
		});
	});

	/**
	 * test_archives_expired_working_memories
	 *
	 * Should archive working memories older than 24 hours.
	 */
	it("should archive expired working memories", async () => {
		const testName = "test_archives_expired_working";
		try {
			// Promotion queries (empty)
			mockMongoStore.query.mockResolvedValueOnce([]);
			mockMongoStore.query.mockResolvedValueOnce([]);

			// TTL cleanup - working tier with old memory
			const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours old
			mockMongoStore.query.mockResolvedValueOnce([
				{
					memory_id: "old_mem_1",
					user_id: "user_123",
					tier: "working",
					wilson_score: 0.5, // Not high enough to preserve
					created_at: oldDate,
					status: "active",
				},
			]);

			// Mock getById for preservation check
			mockMongoStore.getById.mockResolvedValueOnce({
				wilson_score: 0.5, // Below 0.8 preservation threshold
			});

			// TTL cleanup - history tier (empty)
			mockMongoStore.query.mockResolvedValueOnce([]);

			// Garbage cleanup (empty)
			mockMongoStore.query.mockResolvedValue([]);

			const stats = await service.runCycle("user_123");

			expect(stats.archived).toBe(1);
			expect(mockMongoStore.archive).toHaveBeenCalledWith("old_mem_1", "user_123");

			recordResult(testName, true, `Archived: ${stats.archived}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_preserves_high_value_memories
	 *
	 * Should preserve high-value memories even if expired.
	 */
	it("should preserve high-value expired memories", async () => {
		const testName = "test_preserves_high_value";
		try {
			// Promotion queries (empty)
			mockMongoStore.query.mockResolvedValueOnce([]);
			mockMongoStore.query.mockResolvedValueOnce([]);

			// TTL cleanup - working tier with old but high-value memory
			const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
			mockMongoStore.query.mockResolvedValueOnce([
				{
					memory_id: "high_value_mem",
					user_id: "user_123",
					tier: "working",
					wilson_score: 0.9, // High value
					created_at: oldDate,
					status: "active",
				},
			]);

			// Mock getById for preservation check
			mockMongoStore.getById.mockResolvedValueOnce({
				wilson_score: 0.9, // Above 0.8 preservation threshold
			});

			mockMongoStore.query.mockResolvedValue([]);

			const stats = await service.runCycle("user_123");

			// Should NOT archive high-value memory
			expect(stats.archived).toBe(0);

			recordResult(testName, true, "High-value memory preserved");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestGarbageCleanup: Test low-score cleanup
// =============================================================================

describe("TestGarbageCleanup", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { PromotionService } = await import("../../learning/PromotionService");
		service = new PromotionService({
			mongoStore: mockMongoStore as any,
			qdrantAdapter: mockQdrantAdapter as any,
		});
	});

	/**
	 * test_deletes_very_low_score
	 *
	 * Should archive memory with very low score.
	 */
	it("should archive memory with very low score", async () => {
		const testName = "test_deletes_very_low_score";
		try {
			// Promotion queries (empty)
			mockMongoStore.query.mockResolvedValueOnce([]);
			mockMongoStore.query.mockResolvedValueOnce([]);

			// TTL cleanup (empty)
			mockMongoStore.query.mockResolvedValueOnce([]);
			mockMongoStore.query.mockResolvedValueOnce([]);

			// Garbage cleanup - working tier with low-score memory
			mockMongoStore.query.mockResolvedValueOnce([
				{
					memory_id: "low_score_mem",
					user_id: "user_123",
					tier: "working",
					wilson_score: 0.15, // Below 0.2 threshold
					uses: 2, // Has been used
					status: "active",
				},
			]);

			// history and patterns (empty)
			mockMongoStore.query.mockResolvedValueOnce([]);
			mockMongoStore.query.mockResolvedValueOnce([]);

			const stats = await service.runCycle("user_123");

			expect(stats.archived).toBe(1);
			expect(mockMongoStore.archive).toHaveBeenCalledWith("low_score_mem", "user_123");

			recordResult(testName, true, `Archived low-score: ${stats.archived}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_preserves_unused_low_score
	 *
	 * Should not archive low-score if never used (no feedback yet).
	 */
	it("should preserve unused low-score memories", async () => {
		const testName = "test_preserves_unused_low_score";
		try {
			// Promotion queries (empty)
			mockMongoStore.query.mockResolvedValueOnce([]);
			mockMongoStore.query.mockResolvedValueOnce([]);

			// TTL cleanup (empty)
			mockMongoStore.query.mockResolvedValueOnce([]);
			mockMongoStore.query.mockResolvedValueOnce([]);

			// Garbage cleanup - memory with low score but no uses
			mockMongoStore.query.mockResolvedValueOnce([
				{
					memory_id: "unused_mem",
					user_id: "user_123",
					tier: "working",
					wilson_score: 0.15, // Low score
					uses: 0, // Never used - no outcome recorded
					status: "active",
				},
			]);

			mockMongoStore.query.mockResolvedValue([]);

			const stats = await service.runCycle("user_123");

			// Should NOT archive (uses filter in findLowScoreMemories)
			expect(stats.archived).toBe(0);

			recordResult(testName, true, "Unused low-score memory preserved");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestScheduler: Test scheduler management
// =============================================================================

describe("TestScheduler", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		const { PromotionService } = await import("../../learning/PromotionService");
		service = new PromotionService({
			mongoStore: mockMongoStore as any,
			qdrantAdapter: mockQdrantAdapter as any,
			config: {
				promotion: {
					scheduler_interval_ms: 1000, // 1 second for testing
				},
			} as any,
		});

		// Mock all queries to return empty
		mockMongoStore.query.mockResolvedValue([]);
	});

	afterEach(() => {
		service.stopScheduler();
		vi.useRealTimers();
	});

	/**
	 * test_starts_scheduler
	 *
	 * Should start scheduler and run initial cycle.
	 */
	it("should start scheduler", async () => {
		const testName = "test_starts_scheduler";
		try {
			await service.startScheduler();

			expect(service.isSchedulerRunning()).toBe(true);
			expect(service.getLastRunAt()).toBeDefined();

			recordResult(testName, true, "Scheduler started");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_stops_scheduler
	 *
	 * Should stop scheduler cleanly.
	 */
	it("should stop scheduler", async () => {
		const testName = "test_stops_scheduler";
		try {
			await service.startScheduler();
			expect(service.isSchedulerRunning()).toBe(true);

			service.stopScheduler();
			expect(service.isSchedulerRunning()).toBe(false);

			recordResult(testName, true, "Scheduler stopped");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_prevents_concurrent_runs
	 *
	 * Should prevent concurrent cycle runs.
	 */
	it("should prevent concurrent runs", { timeout: 15000 }, async () => {
		const testName = "test_prevents_concurrent_runs";
		try {
			// Start a long-running cycle - use synchronous delay to avoid fake timer issues
			let queryCallCount = 0;
			mockMongoStore.query.mockImplementation(() => {
				queryCallCount++;
				// Return immediately for concurrent run test
				return Promise.resolve([]);
			});

			const cycle1Promise = service.runCycle("user_123");
			const cycle2Result = await service.runCycle("user_123");

			// Second call should return immediately with 0s (blocked by isRunning flag)
			expect(cycle2Result.promoted).toBe(0);
			expect(cycle2Result.durationMs).toBe(0);

			// Advance fake timers to let first cycle complete
			await vi.runAllTimersAsync();
			await cycle1Promise;

			recordResult(testName, true, "Concurrent runs prevented");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestTriggerForUser: Test on-demand triggering
// =============================================================================

describe("TestTriggerForUser", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { PromotionService } = await import("../../learning/PromotionService");
		service = new PromotionService({
			mongoStore: mockMongoStore as any,
			qdrantAdapter: mockQdrantAdapter as any,
		});

		mockMongoStore.query.mockResolvedValue([]);
	});

	/**
	 * test_trigger_for_user
	 *
	 * Should trigger promotion cycle for specific user.
	 */
	it("should trigger cycle for specific user", async () => {
		const testName = "test_trigger_for_user";
		try {
			const stats = await service.triggerForUser("user_456");

			expect(stats).toBeDefined();
			expect(stats.durationMs).toBeGreaterThanOrEqual(0);

			recordResult(testName, true, `Triggered for user, duration: ${stats.durationMs}ms`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestPromotionStats: Test stats reporting
// =============================================================================

describe("TestPromotionStats", () => {
	let service: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { PromotionService } = await import("../../learning/PromotionService");
		service = new PromotionService({
			mongoStore: mockMongoStore as any,
			qdrantAdapter: mockQdrantAdapter as any,
		});
	});

	/**
	 * test_returns_complete_stats
	 *
	 * Should return complete stats structure.
	 */
	it("should return complete stats structure", async () => {
		const testName = "test_complete_stats";
		try {
			mockMongoStore.query.mockResolvedValue([]);

			const stats = await service.runCycle("user_123");

			expect(stats).toHaveProperty("promoted");
			expect(stats).toHaveProperty("archived");
			expect(stats).toHaveProperty("deleted");
			expect(stats).toHaveProperty("errors");
			expect(stats).toHaveProperty("durationMs");
			expect(typeof stats.promoted).toBe("number");
			expect(typeof stats.archived).toBe("number");
			expect(typeof stats.durationMs).toBe("number");

			recordResult(testName, true, "Complete stats returned");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_tracks_errors
	 *
	 * Should track errors in stats.
	 */
	it("should track errors in stats", async () => {
		const testName = "test_tracks_errors";
		try {
			// First query succeeds with candidate
			mockMongoStore.query.mockResolvedValueOnce([
				{
					memory_id: "mem_123",
					user_id: "user_123",
					tier: "working",
					wilson_score: 0.8,
					uses: 3,
					status: "active",
				},
			]);

			// Update fails
			mockMongoStore.update.mockRejectedValueOnce(new Error("DB error"));

			// Rest returns empty
			mockMongoStore.query.mockResolvedValue([]);

			const stats = await service.runCycle("user_123");

			expect(stats.errors).toBeGreaterThan(0);

			recordResult(testName, true, `Errors tracked: ${stats.errors}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestPromotionRules: Test rule constants
// =============================================================================

describe("TestPromotionRules", () => {
	/**
	 * test_working_to_history_thresholds
	 *
	 * Verify working → history thresholds.
	 */
	it("should have correct working → history thresholds", async () => {
		const testName = "test_working_to_history_thresholds";
		try {
			// From the PROMOTION_RULES constant:
			// working → history: minScore: 0.7, minUses: 2
			const expectedMinScore = 0.7;
			const expectedMinUses = 2;

			// Verify by testing edge cases
			const { PromotionService } = await import("../../learning/PromotionService");
			const service = new PromotionService({
				mongoStore: mockMongoStore as any,
				qdrantAdapter: mockQdrantAdapter as any,
			});

			// Memory at exactly threshold should be promoted
			mockMongoStore.query.mockResolvedValueOnce([
				{
					memory_id: "mem_edge",
					user_id: "user_123",
					tier: "working",
					wilson_score: expectedMinScore, // Exactly 0.7
					uses: expectedMinUses, // Exactly 2
					status: "active",
				},
			]);
			mockMongoStore.query.mockResolvedValue([]);

			const stats = await service.runCycle("user_123");
			expect(stats.promoted).toBe(1);

			recordResult(
				testName,
				true,
				`Thresholds: score=${expectedMinScore}, uses=${expectedMinUses}`
			);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_history_to_patterns_thresholds
	 *
	 * Verify history → patterns thresholds.
	 */
	it("should have correct history → patterns thresholds", async () => {
		const testName = "test_history_to_patterns_thresholds";
		try {
			// From the PROMOTION_RULES constant:
			// history → patterns: minScore: 0.9, minUses: 3
			const expectedMinScore = 0.9;
			const expectedMinUses = 3;

			const { PromotionService } = await import("../../learning/PromotionService");
			const service = new PromotionService({
				mongoStore: mockMongoStore as any,
				qdrantAdapter: mockQdrantAdapter as any,
			});

			mockMongoStore.query.mockResolvedValueOnce([]); // working
			mockMongoStore.query.mockResolvedValueOnce([
				{
					memory_id: "mem_edge",
					user_id: "user_123",
					tier: "history",
					wilson_score: expectedMinScore, // Exactly 0.9
					uses: expectedMinUses, // Exactly 3
					status: "active",
				},
			]);
			mockMongoStore.query.mockResolvedValue([]);

			const stats = await service.runCycle("user_123");
			expect(stats.promoted).toBe(1);

			recordResult(
				testName,
				true,
				`Thresholds: score=${expectedMinScore}, uses=${expectedMinUses}`
			);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_garbage_threshold
	 *
	 * Verify garbage cleanup threshold.
	 */
	it("should have correct garbage threshold", async () => {
		const testName = "test_garbage_threshold";
		try {
			// GARBAGE_SCORE_THRESHOLD = 0.2
			const expectedThreshold = 0.2;

			const { PromotionService } = await import("../../learning/PromotionService");
			const service = new PromotionService({
				mongoStore: mockMongoStore as any,
				qdrantAdapter: mockQdrantAdapter as any,
			});

			// Memory just below threshold
			mockMongoStore.query.mockResolvedValueOnce([]); // working promotion
			mockMongoStore.query.mockResolvedValueOnce([]); // history promotion
			mockMongoStore.query.mockResolvedValueOnce([]); // working TTL
			mockMongoStore.query.mockResolvedValueOnce([]); // history TTL
			mockMongoStore.query.mockResolvedValueOnce([
				{
					memory_id: "garbage_mem",
					user_id: "user_123",
					tier: "working",
					wilson_score: expectedThreshold - 0.01, // Just below
					uses: 2, // Has been used
					status: "active",
				},
			]);
			mockMongoStore.query.mockResolvedValue([]);

			const stats = await service.runCycle("user_123");
			expect(stats.archived).toBe(1);

			recordResult(testName, true, `Garbage threshold: ${expectedThreshold}`);
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
	it("should generate promotion service test summary", () => {
		console.log("\n=== PROMOTION SERVICE TEST SUMMARY ===\n");

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

		console.log("\n======================================\n");

		expect(true).toBe(true);
	});
});
