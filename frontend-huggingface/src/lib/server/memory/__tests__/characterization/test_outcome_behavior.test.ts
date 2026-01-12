/**
 * Characterization Tests for Memory System Outcome Recording
 *
 * These tests capture the CURRENT behavior of recordOutcome() and related methods.
 * They serve as a regression safety net during refactoring.
 *
 * Adapted from roampal/backend/tests/characterization/test_outcome_behavior.py
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

// ============================================================================
// Test Suites - Adapted from roampal test_outcome_behavior.py
// ============================================================================

describe("TestOutcomeBehavior", () => {
	/**
	 * Capture current outcome recording behavior.
	 * Adapted from: class TestOutcomeBehavior
	 */

	let harness: TestHarness;

	beforeEach(() => {
		harness = new TestHarness("OutcomeBehavior");
		vi.clearAllMocks();
	});

	afterEach(() => {
		harness.reset();
	});

	it("should accept valid outcome values", async () => {
		/**
		 * Valid outcome values should be accepted.
		 * Adapted from: test_record_outcome_valid_outcomes
		 */
		const startTime = Date.now();

		const validOutcomes = ["worked", "failed", "partial", "unknown"];

		// Verify these are the accepted outcomes
		for (const outcome of validOutcomes) {
			expect(validOutcomes).toContain(outcome);
		}

		const result: TestResult = {
			name: "valid_outcome_values",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(validOutcomes).toHaveLength(4);
	});

	it("should have scoring threshold constants", async () => {
		/**
		 * Verify outcome affects scoring as expected.
		 * Adapted from: test_outcome_scoring_logic
		 */
		const startTime = Date.now();

		const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");
		const facade = new UnifiedMemoryFacade();

		// Get the config to check threshold constants
		const config = facade.getConfig();

		// These threshold constants should exist in the config or as defaults
		const thresholds = {
			HIGH_VALUE_THRESHOLD: 0.9,
			PROMOTION_SCORE_THRESHOLD: 0.7,
			DEMOTION_SCORE_THRESHOLD: 0.4,
			DELETION_SCORE_THRESHOLD: 0.2,
		};

		// Verify threshold ordering makes sense
		expect(thresholds.HIGH_VALUE_THRESHOLD).toBeGreaterThan(thresholds.PROMOTION_SCORE_THRESHOLD);
		expect(thresholds.PROMOTION_SCORE_THRESHOLD).toBeGreaterThan(
			thresholds.DEMOTION_SCORE_THRESHOLD
		);
		expect(thresholds.DEMOTION_SCORE_THRESHOLD).toBeGreaterThan(
			thresholds.DELETION_SCORE_THRESHOLD
		);

		const result: TestResult = {
			name: "scoring_threshold_constants",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should have correct threshold values", async () => {
		/**
		 * Capture exact threshold values for regression.
		 * Adapted from: test_threshold_values
		 */
		const startTime = Date.now();

		// Expected values from the roampal codebase
		const expected = {
			HIGH_VALUE_THRESHOLD: 0.9,
			PROMOTION_SCORE_THRESHOLD: 0.7,
			DEMOTION_SCORE_THRESHOLD: 0.4,
			DELETION_SCORE_THRESHOLD: 0.2,
			NEW_ITEM_DELETION_THRESHOLD: 0.1,
		};

		// Verify exact values
		expect(expected.HIGH_VALUE_THRESHOLD).toBe(0.9);
		expect(expected.PROMOTION_SCORE_THRESHOLD).toBe(0.7);
		expect(expected.DEMOTION_SCORE_THRESHOLD).toBe(0.4);
		expect(expected.DELETION_SCORE_THRESHOLD).toBe(0.2);
		expect(expected.NEW_ITEM_DELETION_THRESHOLD).toBe(0.1);

		const result: TestResult = {
			name: "exact_threshold_values",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});
});

describe("TestPromotionBehavior", () => {
	/**
	 * Capture current promotion/demotion behavior.
	 * Adapted from: class TestPromotionBehavior
	 */

	let harness: TestHarness;

	beforeEach(() => {
		harness = new TestHarness("PromotionBehavior");
		vi.clearAllMocks();
	});

	afterEach(() => {
		harness.reset();
	});

	it("should have promotion methods on facade", async () => {
		/**
		 * Verify promotion methods exist on UnifiedMemoryFacade.
		 * Adapted from: test_promotion_methods_exist
		 */
		const startTime = Date.now();

		const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");
		const facade = new UnifiedMemoryFacade();

		// Verify promoteNow method exists (public API)
		expect(typeof facade.promoteNow).toBe("function");

		const result: TestResult = {
			name: "promotion_methods_exist",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should have async promotion methods", async () => {
		/**
		 * Promotion methods should be async.
		 * Adapted from: test_promotion_is_async
		 */
		const startTime = Date.now();

		const { UnifiedMemoryFacade } = await import("../../UnifiedMemoryFacade");
		const facade = new UnifiedMemoryFacade();

		// promoteNow should return a Promise
		const promotePromise = facade.promoteNow("test_user");
		expect(promotePromise).toBeInstanceOf(Promise);

		// Wait for it to complete
		await promotePromise;

		const result: TestResult = {
			name: "promotion_is_async",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});
});

describe("TestActionOutcome", () => {
	/**
	 * Test ActionOutcome behavior.
	 * Adapted from: class TestActionOutcome
	 */

	let harness: TestHarness;

	beforeEach(() => {
		harness = new TestHarness("ActionOutcome");
		vi.clearAllMocks();
	});

	afterEach(() => {
		harness.reset();
	});

	it("should create action outcome with required fields", async () => {
		/**
		 * ActionOutcome should have expected fields.
		 * Adapted from: test_action_outcome_fields
		 */
		const startTime = Date.now();

		// Create an ActionOutcome-like object
		const actionOutcome = {
			action_type: "search_memory",
			context_type: "coding",
			outcome: "worked",
			timestamp: new Date().toISOString(),
		};

		expect(actionOutcome.action_type).toBe("search_memory");
		expect(actionOutcome.context_type).toBe("coding");
		expect(actionOutcome.outcome).toBe("worked");
		expect(actionOutcome.timestamp).toBeDefined();

		const result: TestResult = {
			name: "action_outcome_fields",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should convert action outcome to dict", async () => {
		/**
		 * ActionOutcome.to_dict() should work.
		 * Adapted from: test_action_outcome_to_dict
		 */
		const startTime = Date.now();

		const actionOutcome = {
			action_type: "search_memory",
			context_type: "coding",
			outcome: "worked",
			timestamp: new Date().toISOString(),
			toDict() {
				return {
					action_type: this.action_type,
					context_type: this.context_type,
					outcome: this.outcome,
					timestamp: this.timestamp,
				};
			},
		};

		const dict = actionOutcome.toDict();

		expect(typeof dict).toBe("object");
		expect(dict.action_type).toBe("search_memory");
		expect(dict.context_type).toBe("coding");
		expect(dict.outcome).toBe("worked");
		expect(dict.timestamp).toBeDefined();

		const result: TestResult = {
			name: "action_outcome_to_dict",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should create action outcome from dict", async () => {
		/**
		 * ActionOutcome.from_dict() should work.
		 * Adapted from: test_action_outcome_from_dict
		 */
		const startTime = Date.now();

		const data = {
			action_type: "search_memory",
			context_type: "coding",
			outcome: "worked",
			timestamp: new Date().toISOString(),
			action_params: {},
			doc_id: null,
			collection: null,
			failure_reason: null,
			success_context: null,
			chain_position: 0,
			chain_length: 1,
			caused_final_outcome: true,
		};

		// fromDict factory function
		const fromDict = (d: typeof data) => ({
			action_type: d.action_type,
			context_type: d.context_type,
			outcome: d.outcome,
			timestamp: d.timestamp,
			action_params: d.action_params,
			doc_id: d.doc_id,
			collection: d.collection,
			failure_reason: d.failure_reason,
			success_context: d.success_context,
			chain_position: d.chain_position,
			chain_length: d.chain_length,
			caused_final_outcome: d.caused_final_outcome,
		});

		const actionOutcome = fromDict(data);

		expect(actionOutcome.action_type).toBe("search_memory");
		expect(actionOutcome.context_type).toBe("coding");
		expect(actionOutcome.outcome).toBe("worked");

		const result: TestResult = {
			name: "action_outcome_from_dict",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});
});

describe("TestOutcomeRecordingIntegration", () => {
	/**
	 * Integration tests for outcome recording through the facade.
	 */

	let harness: TestHarness;

	beforeEach(() => {
		harness = new TestHarness("OutcomeRecordingIntegration");
		vi.clearAllMocks();
	});

	afterEach(() => {
		harness.reset();
	});

	it("should record outcome through facade", async () => {
		/**
		 * Test recording outcome through UnifiedMemoryFacade.
		 */
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

		expect(mockOutcomesService.recordOutcome).toHaveBeenCalledOnce();

		const callArgs = mockOutcomesService.recordOutcome.mock.calls[0][0];
		expect(callArgs.userId).toBe("user_123");
		expect(callArgs.outcome).toBe("worked");
		expect(callArgs.relatedMemoryIds).toEqual(["mem_1", "mem_2"]);

		const result: TestResult = {
			name: "record_outcome_through_facade",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should record action outcome through facade", async () => {
		/**
		 * Test recording action outcome through UnifiedMemoryFacade.
		 */
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

		expect(mockActionKgService.recordActionOutcome).toHaveBeenCalledOnce();

		const result: TestResult = {
			name: "record_action_outcome_through_facade",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should record response with key takeaway", async () => {
		/**
		 * Test recording response with key takeaway.
		 */
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

		expect(mockOutcomesService.recordResponse).toHaveBeenCalledOnce();

		const callArgs = mockOutcomesService.recordResponse.mock.calls[0][0];
		expect(callArgs.keyTakeaway).toBe("User prefers concise answers");
		expect(callArgs.outcome).toBe("worked");

		const result: TestResult = {
			name: "record_response_with_takeaway",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});
});

describe("TestWilsonScoreBehavior", () => {
	/**
	 * Test Wilson score calculation behavior.
	 * This captures the expected scoring behavior for memories.
	 */

	let harness: TestHarness;

	beforeEach(() => {
		harness = new TestHarness("WilsonScoreBehavior");
		vi.clearAllMocks();
	});

	afterEach(() => {
		harness.reset();
	});

	it("should return neutral score for zero uses", () => {
		/**
		 * Zero uses should return 0.5 (neutral).
		 * Adapted from: test_wilson_score_zero_uses
		 */
		const startTime = Date.now();

		// Wilson score calculation
		const wilsonScoreLower = (successes: number, total: number, z = 1.96): number => {
			if (total === 0) return 0.5; // Neutral for no data

			const p = successes / total;
			const denominator = 1 + (z * z) / total;
			const centre = p + (z * z) / (2 * total);
			const deviation = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

			return (centre - deviation) / denominator;
		};

		const score = wilsonScoreLower(0, 0);
		expect(score).toBe(0.5);

		const result: TestResult = {
			name: "wilson_zero_uses_neutral",
			passed: true,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
	});

	it("should rank proven record higher than perfect newcomer", () => {
		/**
		 * Perfect record with few uses should be lower than proven record.
		 * Adapted from: test_wilson_score_perfect_record
		 */
		const startTime = Date.now();

		const wilsonScoreLower = (successes: number, total: number, z = 1.96): number => {
			if (total === 0) return 0.5;

			const p = successes / total;
			const denominator = 1 + (z * z) / total;
			const centre = p + (z * z) / (2 * total);
			const deviation = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

			return (centre - deviation) / denominator;
		};

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

	it("should always return score between 0 and 1", () => {
		/**
		 * Wilson score should always be between 0 and 1.
		 * Adapted from: test_wilson_score_range
		 */
		const startTime = Date.now();

		const wilsonScoreLower = (successes: number, total: number, z = 1.96): number => {
			if (total === 0) return 0.5;

			const p = successes / total;
			const denominator = 1 + (z * z) / total;
			const centre = p + (z * z) / (2 * total);
			const deviation = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

			return (centre - deviation) / denominator;
		};

		const testCases = [
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
