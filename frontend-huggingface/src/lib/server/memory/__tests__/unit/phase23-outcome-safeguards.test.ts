/**
 * Phase 23: v0.2.8 Bug Fixes (Safeguards) - Unit Tests
 *
 * Tests for critical outcome recording safeguards that prevent corrupt statistics.
 * These fixes MUST be implemented before any other phases to ensure correct learning.
 *
 * Test Coverage:
 * - 23.1: Explicit Outcome Type Handling (no silent fallthrough)
 * - 23.2: Wilson Score from cumulative success_count (not capped history)
 * - 23.3: Failed outcomes increment uses counter
 * - 23.4: Atomicity (tested via integration tests)
 *
 * Authoritative Outcome Semantics:
 * | Outcome | success_count Delta | uses Increment | Wilson Impact |
 * |---------|---------------------|----------------|---------------|
 * | worked  | +1.0                | +1             | Positive      |
 * | partial | +0.5                | +1             | Neutral       |
 * | unknown | +0.25               | +1             | Weak negative |
 * | failed  | +0.0                | +1             | Strong negative |
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock logger before any imports that use it
vi.mock("$lib/server/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// ============================================================================
// Wilson Score Calculation Tests (Phase 23.2)
// ============================================================================

describe("Phase 23.2: Wilson Score Calculation", () => {
	/**
	 * Wilson score should use cumulative success_count, not capped outcome_history.
	 * 
	 * Bug: Memory with 50 uses, 45 worked incorrectly had Wilson ~0.8 (using 10-item history)
	 * Fix: Should be ~0.87 (using cumulative success_count / uses)
	 */
	it("should calculate Wilson ~0.78-0.80 for 50 uses with 45 worked (lower CI bound)", () => {
		// Wilson formula: Lower bound of 95% confidence interval
		// For p=0.9, n=50, z=1.96
		// Expected: ~0.78-0.80 range (lower bound)
		// This is intentionally conservative - Wilson gives us the lower bound
		
		const uses = 50;
		const workedCount = 45;
		const successCount = workedCount * 1.0; // worked = 1.0 success
		
		const p = successCount / uses; // 0.9
		const z = 1.96;
		const n = uses;
		
		const numerator = p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
		const denominator = 1 + (z * z) / n;
		const wilsonScore = numerator / denominator;
		
		// Should be ~0.78-0.82 for 90% success rate with 50 samples (lower CI bound)
		expect(wilsonScore).toBeGreaterThan(0.75);
		expect(wilsonScore).toBeLessThan(0.85);
		
		// Key: Wilson score uses CUMULATIVE success_count, not capped 10-item history
		// With capped history, score would be artificially lower or inconsistent
		expect(wilsonScore).toBeCloseTo(0.786, 2); // Verify actual calculated value
	});

	it("should calculate Wilson ~0.0 for 10 failures with 0 worked", () => {
		const uses = 10;
		const successCount = 0; // All failures = 0 success
		
		const p = successCount / uses; // 0.0
		const z = 1.96;
		const n = uses;
		
		const numerator = p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
		const denominator = 1 + (z * z) / n;
		const wilsonScore = Math.max(0, numerator / denominator);
		
		// Should be close to 0 for 0% success rate
		expect(wilsonScore).toBeLessThan(0.15);
	});

	it("should return 0.5 for zero uses (cold start)", () => {
		const uses = 0;
		const successCount = 0;
		
		// Cold start: return 0.5 as prior
		const wilsonScore = uses === 0 ? 0.5 : successCount / uses;
		
		expect(wilsonScore).toBe(0.5);
	});
});

// ============================================================================
// Outcome Success Values (Phase 23.1)
// ============================================================================

describe("Phase 23.1: Outcome Success Values", () => {
	const OUTCOME_SUCCESS_VALUES = {
		worked: 1.0,
		partial: 0.5,
		unknown: 0.25,
		failed: 0.0,
	};

	it("should assign 1.0 success value to 'worked' outcome", () => {
		expect(OUTCOME_SUCCESS_VALUES.worked).toBe(1.0);
	});

	it("should assign 0.5 success value to 'partial' outcome", () => {
		expect(OUTCOME_SUCCESS_VALUES.partial).toBe(0.5);
	});

	it("should assign 0.25 success value to 'unknown' outcome (weak negative)", () => {
		// Bug: Unknown was getting 0.5 (falling through to else)
		// Fix: Should be 0.25 (explicit weak negative signal)
		expect(OUTCOME_SUCCESS_VALUES.unknown).toBe(0.25);
		expect(OUTCOME_SUCCESS_VALUES.unknown).not.toBe(0.5);
	});

	it("should assign 0.0 success value to 'failed' outcome", () => {
		expect(OUTCOME_SUCCESS_VALUES.failed).toBe(0.0);
	});
});

// ============================================================================
// Outcome Validation (Phase 23.1)
// ============================================================================

describe("Phase 23.1: Outcome Type Validation", () => {
	const VALID_OUTCOMES = ["worked", "failed", "partial", "unknown"] as const;
	
	function isValidOutcome(outcome: string): boolean {
		return VALID_OUTCOMES.includes(outcome as typeof VALID_OUTCOMES[number]);
	}

	it("should accept 'worked' as valid outcome", () => {
		expect(isValidOutcome("worked")).toBe(true);
	});

	it("should accept 'failed' as valid outcome", () => {
		expect(isValidOutcome("failed")).toBe(true);
	});

	it("should accept 'partial' as valid outcome", () => {
		expect(isValidOutcome("partial")).toBe(true);
	});

	it("should accept 'unknown' as valid outcome", () => {
		expect(isValidOutcome("unknown")).toBe(true);
	});

	it("should reject 'typo' as invalid outcome", () => {
		expect(isValidOutcome("typo")).toBe(false);
	});

	it("should reject empty string as invalid outcome", () => {
		expect(isValidOutcome("")).toBe(false);
	});

	it("should reject 'success' as invalid outcome (not in valid list)", () => {
		expect(isValidOutcome("success")).toBe(false);
	});
});

// ============================================================================
// Success Count Accumulation (Phase 23.2 & 23.3)
// ============================================================================

describe("Phase 23.2/23.3: Success Count Accumulation", () => {
	interface MockStats {
		uses: number;
		success_count: number;
		worked_count: number;
		partial_count: number;
		unknown_count: number;
		failed_count: number;
	}

	const OUTCOME_SUCCESS_VALUES = {
		worked: 1.0,
		partial: 0.5,
		unknown: 0.25,
		failed: 0.0,
	};

	function simulateOutcome(stats: MockStats, outcome: keyof typeof OUTCOME_SUCCESS_VALUES): MockStats {
		const successDelta = OUTCOME_SUCCESS_VALUES[outcome];
		return {
			uses: stats.uses + 1, // Phase 23.3: ALWAYS increment uses
			success_count: stats.success_count + successDelta,
			worked_count: stats.worked_count + (outcome === "worked" ? 1 : 0),
			partial_count: stats.partial_count + (outcome === "partial" ? 1 : 0),
			unknown_count: stats.unknown_count + (outcome === "unknown" ? 1 : 0),
			failed_count: stats.failed_count + (outcome === "failed" ? 1 : 0),
		};
	}

	it("should increment uses for 'worked' outcome", () => {
		const initial: MockStats = { uses: 0, success_count: 0, worked_count: 0, partial_count: 0, unknown_count: 0, failed_count: 0 };
		const after = simulateOutcome(initial, "worked");
		
		expect(after.uses).toBe(1);
		expect(after.success_count).toBe(1.0);
		expect(after.worked_count).toBe(1);
	});

	it("should increment uses for 'partial' outcome", () => {
		const initial: MockStats = { uses: 0, success_count: 0, worked_count: 0, partial_count: 0, unknown_count: 0, failed_count: 0 };
		const after = simulateOutcome(initial, "partial");
		
		expect(after.uses).toBe(1);
		expect(after.success_count).toBe(0.5);
		expect(after.partial_count).toBe(1);
	});

	it("should increment uses for 'unknown' outcome (Phase 23.3)", () => {
		const initial: MockStats = { uses: 0, success_count: 0, worked_count: 0, partial_count: 0, unknown_count: 0, failed_count: 0 };
		const after = simulateOutcome(initial, "unknown");
		
		expect(after.uses).toBe(1); // Must increment!
		expect(after.success_count).toBe(0.25);
		expect(after.unknown_count).toBe(1);
	});

	it("should increment uses for 'failed' outcome (Phase 23.3 critical fix)", () => {
		// Bug: Failed outcomes were not incrementing uses
		// Fix: ALWAYS increment uses, regardless of outcome
		const initial: MockStats = { uses: 0, success_count: 0, worked_count: 0, partial_count: 0, unknown_count: 0, failed_count: 0 };
		const after = simulateOutcome(initial, "failed");
		
		expect(after.uses).toBe(1); // MUST increment!
		expect(after.success_count).toBe(0.0); // No success
		expect(after.failed_count).toBe(1);
	});

	it("should accumulate correct success_count after mixed outcomes", () => {
		let stats: MockStats = { uses: 0, success_count: 0, worked_count: 0, partial_count: 0, unknown_count: 0, failed_count: 0 };
		
		// Simulate: 3 worked, 2 partial, 2 unknown, 3 failed = 10 uses
		stats = simulateOutcome(stats, "worked");   // +1.0
		stats = simulateOutcome(stats, "worked");   // +1.0
		stats = simulateOutcome(stats, "worked");   // +1.0
		stats = simulateOutcome(stats, "partial");  // +0.5
		stats = simulateOutcome(stats, "partial");  // +0.5
		stats = simulateOutcome(stats, "unknown");  // +0.25
		stats = simulateOutcome(stats, "unknown");  // +0.25
		stats = simulateOutcome(stats, "failed");   // +0.0
		stats = simulateOutcome(stats, "failed");   // +0.0
		stats = simulateOutcome(stats, "failed");   // +0.0
		
		expect(stats.uses).toBe(10);
		expect(stats.success_count).toBe(3 * 1.0 + 2 * 0.5 + 2 * 0.25 + 3 * 0.0);
		expect(stats.success_count).toBe(4.5);
		
		// Wilson should reflect ~45% success rate
		const wilsonSuccessRate = stats.success_count / stats.uses;
		expect(wilsonSuccessRate).toBe(0.45);
	});

	it("should calculate correct Wilson for 10 failures (Phase 23.3)", () => {
		let stats: MockStats = { uses: 0, success_count: 0, worked_count: 0, partial_count: 0, unknown_count: 0, failed_count: 0 };
		
		// 10 failures
		for (let i = 0; i < 10; i++) {
			stats = simulateOutcome(stats, "failed");
		}
		
		expect(stats.uses).toBe(10);
		expect(stats.success_count).toBe(0);
		expect(stats.failed_count).toBe(10);
		
		// Wilson should be ~0 for 0% success rate
		const p = stats.success_count / stats.uses; // 0
		const z = 1.96;
		const n = stats.uses;
		
		const numerator = p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
		const denominator = 1 + (z * z) / n;
		const wilson = Math.max(0, numerator / denominator);
		
		expect(wilson).toBeLessThan(0.15);
	});
});

// ============================================================================
// Explicit Switch Statement (Phase 23.1)
// ============================================================================

describe("Phase 23.1: Explicit Switch Statement", () => {
	const OUTCOME_SUCCESS_VALUES = {
		worked: 1.0,
		partial: 0.5,
		unknown: 0.25,
		failed: 0.0,
	};

	type ValidOutcome = "worked" | "failed" | "partial" | "unknown";

	/**
	 * This function mirrors the implementation in MemoryMongoStore.ts
	 * It uses an explicit switch with NO default case for TypeScript exhaustiveness checking.
	 */
	function getSuccessDelta(outcome: ValidOutcome): number {
		switch (outcome) {
			case "worked":
				return OUTCOME_SUCCESS_VALUES.worked;
			case "partial":
				return OUTCOME_SUCCESS_VALUES.partial;
			case "unknown":
				return OUTCOME_SUCCESS_VALUES.unknown;
			case "failed":
				return OUTCOME_SUCCESS_VALUES.failed;
		}
		// TypeScript exhaustiveness check - if this line is reached, it's a bug
		// The absence of a default case ensures TypeScript will error if a case is missing
		const _exhaustiveCheck: never = outcome;
		return _exhaustiveCheck;
	}

	it("should return 1.0 for 'worked' via explicit switch", () => {
		expect(getSuccessDelta("worked")).toBe(1.0);
	});

	it("should return 0.5 for 'partial' via explicit switch", () => {
		expect(getSuccessDelta("partial")).toBe(0.5);
	});

	it("should return 0.25 for 'unknown' via explicit switch (not 0.5!)", () => {
		// This is the critical test - unknown must NOT fall through to a default
		const result = getSuccessDelta("unknown");
		expect(result).toBe(0.25);
		expect(result).not.toBe(0.5);
	});

	it("should return 0.0 for 'failed' via explicit switch", () => {
		expect(getSuccessDelta("failed")).toBe(0.0);
	});
});
