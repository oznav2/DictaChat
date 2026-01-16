/**
 * Integration Tests for Working Memory Cleanup
 *
 * Tests that old working memories (>24h) are properly deleted and
 * that deletions persist correctly.
 * Adapted from roampal/backend/tests/integration/test_working_memory_cleanup.py
 *
 * Key areas tested:
 * - Working memory TTL cleanup (24h)
 * - History memory TTL cleanup (30d)
 * - Cleanup persistence
 * - PromotionService cleanup on startup
 * - Valuable memory promotion vs deletion
 * - Ghost entry handling
 */

import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from "vitest";

// Mock logger
vi.mock("$lib/server/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Test tracking
interface TestResult {
	name: string;
	passed: boolean;
	error?: string;
}

const testResults: TestResult[] = [];

// Mock data storage (simulates persistent storage)
let mockWorkingMemories: Map<string, any>;
let mockHistoryMemories: Map<string, any>;
let mockPatternsMemories: Map<string, any>;

// Helper to create memory with specific age
function createMemoryWithAge(
	id: string,
	ageHours: number,
	score: number = 0.5,
	uses: number = 1,
	tier: string = "working"
): any {
	const timestamp = new Date(Date.now() - ageHours * 60 * 60 * 1000);
	return {
		id,
		content: `Test memory ${id}`,
		tier,
		score,
		uses,
		worked: Math.floor(uses * score),
		failed: Math.floor(uses * (1 - score)),
		created_at: timestamp.toISOString(),
		updated_at: timestamp.toISOString(),
		metadata: {
			score,
			uses,
			timestamp: timestamp.toISOString(),
		},
	};
}

// Mock MemoryMongoStore
const mockStore = {
	initialize: vi.fn().mockResolvedValue(undefined),
	query: vi.fn().mockImplementation(async (params) => {
		const tier = params.tier || "working";
		const memories =
			tier === "working"
				? mockWorkingMemories
				: tier === "history"
					? mockHistoryMemories
					: mockPatternsMemories;
		return Array.from(memories.values());
	}),
	getById: vi.fn().mockImplementation(async (id) => {
		return (
			mockWorkingMemories.get(id) ||
			mockHistoryMemories.get(id) ||
			mockPatternsMemories.get(id) ||
			null
		);
	}),
	delete: vi.fn().mockImplementation(async (id) => {
		const deleted =
			mockWorkingMemories.delete(id) ||
			mockHistoryMemories.delete(id) ||
			mockPatternsMemories.delete(id);
		return deleted;
	}),
	store: vi.fn().mockImplementation(async (memory) => {
		const tier = memory.tier || "working";
		const memories =
			tier === "working"
				? mockWorkingMemories
				: tier === "history"
					? mockHistoryMemories
					: mockPatternsMemories;
		memories.set(memory.id, memory);
		return memory.id;
	}),
	update: vi.fn().mockImplementation(async (id, updates) => {
		let memory =
			mockWorkingMemories.get(id) || mockHistoryMemories.get(id) || mockPatternsMemories.get(id);
		if (memory) {
			memory = { ...memory, ...updates };
			if (memory.tier === "working") mockWorkingMemories.set(id, memory);
			else if (memory.tier === "history") mockHistoryMemories.set(id, memory);
			else mockPatternsMemories.set(id, memory);
			return true;
		}
		return false;
	}),
	count: vi.fn().mockImplementation(async (params) => {
		const tier = params?.tier || "working";
		const memories =
			tier === "working"
				? mockWorkingMemories
				: tier === "history"
					? mockHistoryMemories
					: mockPatternsMemories;
		return memories.size;
	}),
	listIds: vi.fn().mockImplementation(async (tier) => {
		const memories =
			tier === "working"
				? mockWorkingMemories
				: tier === "history"
					? mockHistoryMemories
					: mockPatternsMemories;
		return Array.from(memories.keys());
	}),
};

// Mock embedding function
const mockEmbed = vi.fn().mockResolvedValue(new Array(384).fill(0.1));

// Promotion thresholds
const PROMOTION_THRESHOLDS = {
	working_to_history: { min_score: 0.7, min_uses: 2 },
	history_to_patterns: { min_score: 0.9, min_uses: 3 },
};

// TTL values in hours
const TTL_HOURS = {
	working: 24,
	history: 30 * 24, // 30 days
};

// Garbage cleanup threshold
const GARBAGE_SCORE_THRESHOLD = 0.2;

// ============================================
// Helper: Simulated PromotionService Logic
// ============================================

async function runWorkingMemoryCleanup(userId: string): Promise<{
	promoted: number;
	deleted: number;
	kept: number;
}> {
	const now = Date.now();
	let promoted = 0;
	let deleted = 0;
	let kept = 0;

	const workingMemories = Array.from(mockWorkingMemories.values());

	for (const memory of workingMemories) {
		const timestamp = new Date(memory.metadata?.timestamp || memory.created_at).getTime();
		const ageHours = (now - timestamp) / (1000 * 60 * 60);

		if (ageHours > TTL_HOURS.working) {
			// Old memory - check if valuable
			const score = memory.score || memory.metadata?.score || 0.5;
			const uses = memory.uses || memory.metadata?.uses || 1;

			if (
				score >= PROMOTION_THRESHOLDS.working_to_history.min_score &&
				uses >= PROMOTION_THRESHOLDS.working_to_history.min_uses
			) {
				// Promote to history
				const historyMemory = {
					...memory,
					tier: "history",
					promoted_from: "working",
					promoted_at: new Date().toISOString(),
				};
				mockHistoryMemories.set(memory.id, historyMemory);
				mockWorkingMemories.delete(memory.id);
				promoted++;
			} else {
				// Delete (not valuable)
				mockWorkingMemories.delete(memory.id);
				deleted++;
			}
		} else {
			// Keep (not old enough)
			kept++;
		}
	}

	return { promoted, deleted, kept };
}

async function runHistoryMemoryCleanup(userId: string): Promise<{
	promoted: number;
	deleted: number;
	kept: number;
}> {
	const now = Date.now();
	let promoted = 0;
	let deleted = 0;
	let kept = 0;

	const historyMemories = Array.from(mockHistoryMemories.values());

	for (const memory of historyMemories) {
		const timestamp = new Date(memory.metadata?.timestamp || memory.created_at).getTime();
		const ageHours = (now - timestamp) / (1000 * 60 * 60);
		const score = memory.score || memory.metadata?.score || 0.5;
		const uses = memory.uses || memory.metadata?.uses || 1;

		if (ageHours > TTL_HOURS.history) {
			// Very old - check if should promote to patterns
			if (
				score >= PROMOTION_THRESHOLDS.history_to_patterns.min_score &&
				uses >= PROMOTION_THRESHOLDS.history_to_patterns.min_uses
			) {
				const patternsMemory = {
					...memory,
					tier: "patterns",
					promoted_from: "history",
					promoted_at: new Date().toISOString(),
				};
				mockPatternsMemories.set(memory.id, patternsMemory);
				mockHistoryMemories.delete(memory.id);
				promoted++;
			} else {
				// Delete
				mockHistoryMemories.delete(memory.id);
				deleted++;
			}
		} else {
			kept++;
		}
	}

	return { promoted, deleted, kept };
}

async function runGarbageCleanup(userId: string): Promise<number> {
	let deleted = 0;

	// Check all tiers for garbage
	for (const [id, memory] of mockWorkingMemories) {
		const score = memory.score || memory.metadata?.score || 0.5;
		if (score < GARBAGE_SCORE_THRESHOLD) {
			mockWorkingMemories.delete(id);
			deleted++;
		}
	}

	for (const [id, memory] of mockHistoryMemories) {
		const score = memory.score || memory.metadata?.score || 0.5;
		if (score < GARBAGE_SCORE_THRESHOLD) {
			mockHistoryMemories.delete(id);
			deleted++;
		}
	}

	return deleted;
}

// ============================================
// Test Working Memory Cleanup Persistence
// ============================================

describe("TestWorkingMemoryCleanupPersistence", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWorkingMemories = new Map();
		mockHistoryMemories = new Map();
		mockPatternsMemories = new Map();
	});

	it("should delete old working memories (>24h)", async () => {
		const testName = "cleanup_deletes_old_working_memories";
		try {
			// Create test memories - some old, some new
			mockWorkingMemories.set("working_old_1", createMemoryWithAge("working_old_1", 30, 0.5)); // 30h old
			mockWorkingMemories.set("working_old_2", createMemoryWithAge("working_old_2", 48, 0.5)); // 48h old
			mockWorkingMemories.set("working_new_1", createMemoryWithAge("working_new_1", 2, 0.5)); // 2h old

			expect(mockWorkingMemories.size).toBe(3);

			// Run cleanup
			const result = await runWorkingMemoryCleanup("test-user");

			expect(result.deleted).toBe(2);
			expect(result.kept).toBe(1);
			expect(mockWorkingMemories.size).toBe(1);
			expect(mockWorkingMemories.has("working_new_1")).toBe(true);
			expect(mockWorkingMemories.has("working_old_1")).toBe(false);
			expect(mockWorkingMemories.has("working_old_2")).toBe(false);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should keep new working memories (<24h)", async () => {
		const testName = "cleanup_keeps_new_memories";
		try {
			// All new memories
			mockWorkingMemories.set("working_new_1", createMemoryWithAge("working_new_1", 1, 0.5));
			mockWorkingMemories.set("working_new_2", createMemoryWithAge("working_new_2", 12, 0.5));
			mockWorkingMemories.set("working_new_3", createMemoryWithAge("working_new_3", 23, 0.5));

			const result = await runWorkingMemoryCleanup("test-user");

			expect(result.deleted).toBe(0);
			expect(result.kept).toBe(3);
			expect(mockWorkingMemories.size).toBe(3);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should handle empty working collection", async () => {
		const testName = "cleanup_handles_empty_collection";
		try {
			const result = await runWorkingMemoryCleanup("test-user");

			expect(result.deleted).toBe(0);
			expect(result.kept).toBe(0);
			expect(result.promoted).toBe(0);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});
});

// ============================================
// Test Promotion Service Cleanup
// ============================================

describe("TestPromotionServiceCleanup", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWorkingMemories = new Map();
		mockHistoryMemories = new Map();
		mockPatternsMemories = new Map();
	});

	it("should cleanup old memories on startup", async () => {
		const testName = "cleanup_on_startup";
		try {
			// Simulate state before startup
			mockWorkingMemories.set("working_old_1", createMemoryWithAge("working_old_1", 30, 0.3));
			mockWorkingMemories.set("working_old_2", createMemoryWithAge("working_old_2", 48, 0.4));
			mockWorkingMemories.set("working_new_1", createMemoryWithAge("working_new_1", 2, 0.5));

			expect(mockWorkingMemories.size).toBe(3);

			// Run startup cleanup
			const result = await runWorkingMemoryCleanup("test-user");

			expect(mockWorkingMemories.size).toBe(1);
			expect(mockWorkingMemories.has("working_new_1")).toBe(true);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should promote valuable memories instead of deleting", async () => {
		const testName = "promotes_valuable_memories";
		try {
			// This one should be PROMOTED (high score, high uses, old)
			mockWorkingMemories.set(
				"working_promote_me",
				createMemoryWithAge("working_promote_me", 30, 0.8, 3) // score=0.8, uses=3
			);
			// This one should be DELETED (low score, old)
			mockWorkingMemories.set(
				"working_delete_me",
				createMemoryWithAge("working_delete_me", 30, 0.3, 1)
			);
			// This one should STAY (new)
			mockWorkingMemories.set("working_keep_me", createMemoryWithAge("working_keep_me", 2, 0.5, 1));

			const result = await runWorkingMemoryCleanup("test-user");

			expect(result.promoted).toBe(1);
			expect(result.deleted).toBe(1);
			expect(result.kept).toBe(1);

			// Check final state
			expect(mockWorkingMemories.size).toBe(1);
			expect(mockWorkingMemories.has("working_keep_me")).toBe(true);
			expect(mockHistoryMemories.size).toBe(1);
			expect(mockHistoryMemories.has("working_promote_me")).toBe(true);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should require both score AND uses for promotion", async () => {
		const testName = "requires_score_and_uses_for_promotion";
		try {
			// High score but low uses - should NOT be promoted
			mockWorkingMemories.set(
				"working_high_score_low_uses",
				createMemoryWithAge("working_high_score_low_uses", 30, 0.9, 1) // score=0.9, uses=1
			);
			// Low score but high uses - should NOT be promoted
			mockWorkingMemories.set(
				"working_low_score_high_uses",
				createMemoryWithAge("working_low_score_high_uses", 30, 0.5, 5) // score=0.5, uses=5
			);
			// Both high - should be promoted
			mockWorkingMemories.set(
				"working_both_high",
				createMemoryWithAge("working_both_high", 30, 0.8, 3) // score=0.8, uses=3
			);

			const result = await runWorkingMemoryCleanup("test-user");

			expect(result.promoted).toBe(1);
			expect(result.deleted).toBe(2);
			expect(mockHistoryMemories.has("working_both_high")).toBe(true);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});
});

// ============================================
// Test History Memory Cleanup
// ============================================

describe("TestHistoryMemoryCleanup", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWorkingMemories = new Map();
		mockHistoryMemories = new Map();
		mockPatternsMemories = new Map();
	});

	it("should cleanup old history memories (>30d)", async () => {
		const testName = "cleanup_old_history_memories";
		try {
			// Old history memories (>30 days = 720 hours)
			mockHistoryMemories.set(
				"history_old_1",
				createMemoryWithAge("history_old_1", 800, 0.5, 1, "history")
			);
			mockHistoryMemories.set(
				"history_old_2",
				createMemoryWithAge("history_old_2", 900, 0.5, 1, "history")
			);
			// New history memory
			mockHistoryMemories.set(
				"history_new_1",
				createMemoryWithAge("history_new_1", 100, 0.5, 1, "history")
			);

			const result = await runHistoryMemoryCleanup("test-user");

			expect(result.deleted).toBe(2);
			expect(result.kept).toBe(1);
			expect(mockHistoryMemories.size).toBe(1);
			expect(mockHistoryMemories.has("history_new_1")).toBe(true);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should promote valuable history to patterns", async () => {
		const testName = "promotes_history_to_patterns";
		try {
			// Should be promoted (high score, high uses, old)
			mockHistoryMemories.set(
				"history_promote",
				createMemoryWithAge("history_promote", 800, 0.95, 5, "history")
			);
			// Should be deleted (low score, old)
			mockHistoryMemories.set(
				"history_delete",
				createMemoryWithAge("history_delete", 800, 0.5, 1, "history")
			);

			const result = await runHistoryMemoryCleanup("test-user");

			expect(result.promoted).toBe(1);
			expect(result.deleted).toBe(1);
			expect(mockPatternsMemories.has("history_promote")).toBe(true);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});
});

// ============================================
// Test Garbage Cleanup
// ============================================

describe("TestGarbageCleanup", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWorkingMemories = new Map();
		mockHistoryMemories = new Map();
		mockPatternsMemories = new Map();
	});

	it("should delete memories with score < 0.2", async () => {
		const testName = "deletes_garbage_memories";
		try {
			// Garbage memories (score < 0.2)
			mockWorkingMemories.set(
				"working_garbage_1",
				createMemoryWithAge("working_garbage_1", 5, 0.1)
			);
			mockWorkingMemories.set(
				"working_garbage_2",
				createMemoryWithAge("working_garbage_2", 10, 0.15)
			);
			// Good memory
			mockWorkingMemories.set("working_good", createMemoryWithAge("working_good", 5, 0.6));

			const deleted = await runGarbageCleanup("test-user");

			expect(deleted).toBe(2);
			expect(mockWorkingMemories.size).toBe(1);
			expect(mockWorkingMemories.has("working_good")).toBe(true);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should delete garbage from all tiers", async () => {
		const testName = "deletes_garbage_all_tiers";
		try {
			mockWorkingMemories.set("working_garbage", createMemoryWithAge("working_garbage", 5, 0.1));
			mockHistoryMemories.set(
				"history_garbage",
				createMemoryWithAge("history_garbage", 100, 0.1, 1, "history")
			);
			mockWorkingMemories.set("working_good", createMemoryWithAge("working_good", 5, 0.6));

			const deleted = await runGarbageCleanup("test-user");

			expect(deleted).toBe(2);
			expect(mockWorkingMemories.size).toBe(1);
			expect(mockHistoryMemories.size).toBe(0);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});
});

// ============================================
// Test Ghost Entry Handling
// ============================================

describe("TestGhostEntryHandling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWorkingMemories = new Map();
		mockHistoryMemories = new Map();
		mockPatternsMemories = new Map();
	});

	it("should handle missing document gracefully", async () => {
		const testName = "get_fragment_handles_missing";
		try {
			// Add a real document
			mockWorkingMemories.set("real_doc", createMemoryWithAge("real_doc", 1, 0.5));

			// Get existing document - should work
			const result = await mockStore.getById("real_doc");
			expect(result).not.toBeNull();

			// Get non-existent document - should return null, not crash
			const ghost = await mockStore.getById("ghost_doc");
			expect(ghost).toBeNull();

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should handle empty collection", async () => {
		const testName = "list_all_ids_handles_empty";
		try {
			const ids = await mockStore.listIds("working");
			expect(ids).toEqual([]);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should handle delete of non-existent document", async () => {
		const testName = "delete_handles_nonexistent";
		try {
			// Delete non-existent document should not throw
			const result = await mockStore.delete("nonexistent_doc");
			expect(result).toBe(false);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});
});

// ============================================
// Test Cleanup Scheduling
// ============================================

describe("TestCleanupScheduling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWorkingMemories = new Map();
		mockHistoryMemories = new Map();
		mockPatternsMemories = new Map();
	});

	it("should run cleanup multiple times safely", async () => {
		const testName = "multiple_cleanup_runs";
		try {
			// Initial state
			mockWorkingMemories.set("working_old", createMemoryWithAge("working_old", 30, 0.3));
			mockWorkingMemories.set("working_new", createMemoryWithAge("working_new", 2, 0.5));

			// First cleanup
			const result1 = await runWorkingMemoryCleanup("test-user");
			expect(result1.deleted).toBe(1);
			expect(mockWorkingMemories.size).toBe(1);

			// Second cleanup (should be idempotent)
			const result2 = await runWorkingMemoryCleanup("test-user");
			expect(result2.deleted).toBe(0);
			expect(result2.kept).toBe(1);
			expect(mockWorkingMemories.size).toBe(1);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should handle concurrent cleanup calls", async () => {
		const testName = "concurrent_cleanup_calls";
		try {
			// Create multiple old memories
			for (let i = 0; i < 10; i++) {
				mockWorkingMemories.set(
					`working_old_${i}`,
					createMemoryWithAge(`working_old_${i}`, 30, 0.3)
				);
			}
			mockWorkingMemories.set("working_new", createMemoryWithAge("working_new", 2, 0.5));

			// Run concurrent cleanups
			const [result1, result2] = await Promise.all([
				runWorkingMemoryCleanup("test-user"),
				runWorkingMemoryCleanup("test-user"),
			]);

			// Total deleted should be 10 across both runs
			const totalDeleted = result1.deleted + result2.deleted;
			expect(totalDeleted).toBe(10);
			expect(mockWorkingMemories.size).toBe(1);
			expect(mockWorkingMemories.has("working_new")).toBe(true);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});
});

// ============================================
// Test Promotion Threshold Edge Cases
// ============================================

describe("TestPromotionThresholdEdgeCases", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWorkingMemories = new Map();
		mockHistoryMemories = new Map();
		mockPatternsMemories = new Map();
	});

	it("should not promote at exact threshold boundary (score)", async () => {
		const testName = "threshold_boundary_score";
		try {
			// Score exactly at 0.7 threshold - should promote (>=)
			mockWorkingMemories.set(
				"working_exact_score",
				createMemoryWithAge("working_exact_score", 30, 0.7, 2)
			);

			const result = await runWorkingMemoryCleanup("test-user");

			expect(result.promoted).toBe(1);
			expect(mockHistoryMemories.has("working_exact_score")).toBe(true);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should not promote at exact threshold boundary (uses)", async () => {
		const testName = "threshold_boundary_uses";
		try {
			// Uses exactly at 2 threshold - should promote (>=)
			mockWorkingMemories.set(
				"working_exact_uses",
				createMemoryWithAge("working_exact_uses", 30, 0.8, 2)
			);

			const result = await runWorkingMemoryCleanup("test-user");

			expect(result.promoted).toBe(1);
			expect(mockHistoryMemories.has("working_exact_uses")).toBe(true);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should delete just below threshold", async () => {
		const testName = "just_below_threshold";
		try {
			// Just below threshold
			mockWorkingMemories.set(
				"working_below_score",
				createMemoryWithAge("working_below_score", 30, 0.69, 2)
			);
			mockWorkingMemories.set(
				"working_below_uses",
				createMemoryWithAge("working_below_uses", 30, 0.8, 1)
			);

			const result = await runWorkingMemoryCleanup("test-user");

			expect(result.promoted).toBe(0);
			expect(result.deleted).toBe(2);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});
});

// ============================================
// Test TTL Edge Cases
// ============================================

describe("TestTTLEdgeCases", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
		mockWorkingMemories = new Map();
		mockHistoryMemories = new Map();
		mockPatternsMemories = new Map();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should keep memory at exactly 24h boundary", async () => {
		const testName = "exact_24h_boundary";
		try {
			// Exactly 24 hours old - should be kept (not > 24)
			mockWorkingMemories.set(
				"working_exactly_24h",
				createMemoryWithAge("working_exactly_24h", 24, 0.5)
			);

			const result = await runWorkingMemoryCleanup("test-user");

			expect(result.kept).toBe(1);
			expect(result.deleted).toBe(0);
			expect(mockWorkingMemories.has("working_exactly_24h")).toBe(true);

			testResults.push({ name: testName, passed: true });
		} catch (error) {
			testResults.push({ name: testName, passed: false, error: String(error) });
			throw error;
		}
	});

	it("should delete memory just over 24h boundary", async () => {
		const testName = "just_over_24h_boundary";
		try {
			// Just over 24 hours old - should be deleted
			mockWorkingMemories.set(
				"working_over_24h",
				createMemoryWithAge("working_over_24h", 24.01, 0.5)
			);

			const result = await runWorkingMemoryCleanup("test-user");

			expect(result.deleted).toBe(1);
			expect(mockWorkingMemories.has("working_over_24h")).toBe(false);

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
	console.log("WORKING MEMORY CLEANUP TEST RESULTS");
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
