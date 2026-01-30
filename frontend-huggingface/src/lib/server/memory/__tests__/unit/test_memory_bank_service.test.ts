/**
 * Unit Tests for MemoryMongoStore (Memory Bank)
 *
 * Tests MongoDB CRUD operations for the memory system including:
 * - Store operations (create with metadata)
 * - Update operations (with versioning)
 * - Query operations (with filters)
 * - Archive operations (soft delete)
 * - Outcome recording (Wilson score updates)
 * - Version history
 *
 * Adapted from: roampal/backend/tests/unit/test_memory_bank_service.py
 *
 * Usage:
 *     npx vitest run src/lib/server/memory/__tests__/unit/test_memory_bank_service.test.ts
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

// Mock MongoDB collections
const mockItemsCollection = {
	createIndex: vi.fn().mockResolvedValue(undefined),
	insertOne: vi.fn().mockResolvedValue({ insertedId: "test_id" }),
	findOne: vi.fn().mockResolvedValue(null),
	findOneAndUpdate: vi.fn().mockResolvedValue(null),
	updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
	deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
	find: vi.fn().mockReturnValue({
		sort: vi.fn().mockReturnThis(),
		skip: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		maxTimeMS: vi.fn().mockReturnThis(),
		toArray: vi.fn().mockResolvedValue([]),
	}),
	aggregate: vi.fn().mockReturnValue({
		maxTimeMS: vi.fn().mockReturnThis(),
		toArray: vi.fn().mockResolvedValue([]),
	}),
};

const mockVersionsCollection = {
	createIndex: vi.fn().mockResolvedValue(undefined),
	insertOne: vi.fn().mockResolvedValue({ insertedId: "version_id" }),
	find: vi.fn().mockReturnValue({
		sort: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		toArray: vi.fn().mockResolvedValue([]),
	}),
};

const mockOutcomesCollection = {
	createIndex: vi.fn().mockResolvedValue(undefined),
	insertOne: vi.fn().mockResolvedValue({ insertedId: "outcome_id" }),
};

const mockActionOutcomesCollection = {
	createIndex: vi.fn().mockResolvedValue(undefined),
	insertOne: vi.fn().mockResolvedValue({ insertedId: "action_id" }),
	aggregate: vi.fn().mockReturnValue({
		maxTimeMS: vi.fn().mockReturnThis(),
		toArray: vi.fn().mockResolvedValue([]),
	}),
};

const mockDb = {
	collection: vi.fn((name: string) => {
		switch (name) {
			case "memory_items":
				return mockItemsCollection;
			case "memory_versions":
				return mockVersionsCollection;
			case "memory_outcomes":
				return mockOutcomesCollection;
			case "memory_action_outcomes":
				return mockActionOutcomesCollection;
			default:
				return {
					createIndex: vi.fn().mockResolvedValue(undefined),
				};
		}
	}),
};

const mockMongoClient = {
	db: vi.fn().mockReturnValue(mockDb),
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

vi.mock("mongodb", async () => {
	const actual = await vi.importActual("mongodb");
	return {
		...actual,
		ObjectId: vi.fn().mockImplementation(() => ({ toString: () => "mock_object_id" })),
	};
});

vi.mock("uuid", () => ({
	v4: vi.fn().mockReturnValue("mock_uuid"),
}));

// =============================================================================
// TestMemoryMongoStoreInit: Test initialization
// =============================================================================

describe("TestMemoryMongoStoreInit", () => {
	/**
	 * test_init_with_defaults
	 *
	 * Should initialize with default config.
	 */
	it("should initialize with default config", async () => {
		const testName = "test_init_with_defaults";
		try {
			const { MemoryMongoStore } = await import("../../stores/MemoryMongoStore");

			const store = new MemoryMongoStore({
				client: mockMongoClient as any,
				dbName: "test_db",
			});

			expect(store).toBeDefined();
			expect(store.initialize).toBeDefined();
			expect(store.store).toBeDefined();

			recordResult(testName, true, "Store initialized with defaults");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_init_creates_indexes
	 *
	 * Should create indexes on initialization.
	 */
	it("should create indexes on initialization", async () => {
		const testName = "test_init_creates_indexes";
		try {
			const { MemoryMongoStore } = await import("../../stores/MemoryMongoStore");

			const store = new MemoryMongoStore({
				client: mockMongoClient as any,
				dbName: "test_db",
			});

			await store.initialize();

			// Should have called createIndex on items collection
			expect(mockItemsCollection.createIndex).toHaveBeenCalled();

			recordResult(testName, true, "Indexes created on initialization");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestStore: Test memory storage
// =============================================================================

describe("TestStore", () => {
	let store: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { MemoryMongoStore } = await import("../../stores/MemoryMongoStore");
		store = new MemoryMongoStore({
			client: mockMongoClient as any,
			dbName: "test_db",
		});
		await store.initialize();
	});

	/**
	 * test_store_basic
	 *
	 * Should store memory with correct metadata.
	 */
	it("should store memory with correct metadata", async () => {
		const testName = "test_store_basic";
		try {
			const result = await store.store({
				userId: "user_123",
				tier: "memory_bank",
				text: "User prefers dark mode",
				tags: ["preference"],
				source: { type: "user_input" },
			});

			expect(mockItemsCollection.insertOne).toHaveBeenCalled();

			const insertCall = mockItemsCollection.insertOne.mock.calls[0][0];
			expect(insertCall.text).toBe("User prefers dark mode");
			expect(insertCall.tier).toBe("memory_bank");
			expect(insertCall.status).toBe("active");
			expect(insertCall.tags).toEqual(["preference"]);

			recordResult(testName, true, "Memory stored with correct metadata");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_store_with_quality
	 *
	 * Should store with custom quality parameters.
	 */
	it("should store with custom quality parameters", async () => {
		const testName = "test_store_with_quality";
		try {
			await store.store({
				userId: "user_123",
				tier: "memory_bank",
				text: "Critical info",
				tags: ["identity"],
				source: { type: "user_input" },
				quality: {
					importance: 0.95,
					confidence: 0.9,
					mentioned_count: 1,
					quality_score: 0.9,
				},
			});

			const insertCall = mockItemsCollection.insertOne.mock.calls[0][0];
			expect(insertCall.quality.importance).toBe(0.95);
			expect(insertCall.quality.confidence).toBe(0.9);

			recordResult(testName, true, "Memory stored with quality parameters");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_store_initializes_stats
	 *
	 * Should initialize stats with correct defaults.
	 */
	it("should initialize stats with correct defaults", async () => {
		const testName = "test_store_initializes_stats";
		try {
			await store.store({
				userId: "user_123",
				tier: "working",
				text: "Test memory",
				source: { type: "conversation" },
			});

			const insertCall = mockItemsCollection.insertOne.mock.calls[0][0];
			expect(insertCall.stats.uses).toBe(0);
			expect(insertCall.stats.wilson_score).toBe(0.5);
			expect(insertCall.stats.success_rate).toBe(0.5);
			expect(insertCall.stats.worked_count).toBe(0);
			expect(insertCall.stats.failed_count).toBe(0);

			recordResult(testName, true, "Stats initialized with defaults");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestQuery: Test memory queries
// =============================================================================

describe("TestQuery", () => {
	let store: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { MemoryMongoStore } = await import("../../stores/MemoryMongoStore");
		store = new MemoryMongoStore({
			client: mockMongoClient as any,
			dbName: "test_db",
		});
		await store.initialize();
	});

	/**
	 * test_query_defaults_to_active
	 *
	 * Should filter to active status by default.
	 */
	it("should filter to active status by default", async () => {
		const testName = "test_query_defaults_to_active";
		try {
			await store.query({ userId: "user_123" });

			const findCall = mockItemsCollection.find.mock.calls[0][0];
			expect(findCall.status).toBe("active");

			recordResult(testName, true, "Query defaults to active status");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_query_filters_by_tier
	 *
	 * Should filter by tiers.
	 */
	it("should filter by tiers", async () => {
		const testName = "test_query_filters_by_tier";
		try {
			await store.query({
				userId: "user_123",
				tiers: ["working", "history"],
			});

			const findCall = mockItemsCollection.find.mock.calls[0][0];
			expect(findCall.tier).toEqual({ $in: ["working", "history"] });

			recordResult(testName, true, "Query filters by tiers");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_query_filters_by_tags
	 *
	 * Should filter by tags.
	 */
	it("should filter by tags", async () => {
		const testName = "test_query_filters_by_tags";
		try {
			await store.query({
				userId: "user_123",
				tags: ["identity", "preference"],
			});

			const findCall = mockItemsCollection.find.mock.calls[0][0];
			expect(findCall.tags).toEqual({ $in: ["identity", "preference"] });

			recordResult(testName, true, "Query filters by tags");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_query_filters_by_score
	 *
	 * Should filter by minimum score.
	 */
	it("should filter by minimum score", async () => {
		const testName = "test_query_filters_by_score";
		try {
			await store.query({
				userId: "user_123",
				minScore: 0.7,
			});

			const findCall = mockItemsCollection.find.mock.calls[0][0];
			expect(findCall["stats.wilson_score"]).toEqual({ $gte: 0.7 });

			recordResult(testName, true, "Query filters by score");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_query_respects_limit
	 *
	 * Should respect query limit.
	 */
	it("should respect query limit", async () => {
		const testName = "test_query_respects_limit";
		try {
			await store.query({
				userId: "user_123",
				limit: 5,
			});

			const findChain = mockItemsCollection.find();
			expect(findChain.limit).toHaveBeenCalledWith(5);

			recordResult(testName, true, "Query respects limit");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestUpdate: Test memory updates
// =============================================================================

describe("TestUpdate", () => {
	let store: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { MemoryMongoStore } = await import("../../stores/MemoryMongoStore");
		store = new MemoryMongoStore({
			client: mockMongoClient as any,
			dbName: "test_db",
		});
		await store.initialize();
	});

	/**
	 * test_update_increments_version
	 *
	 * Should increment version on update.
	 */
	it("should increment version on update", async () => {
		const testName = "test_update_increments_version";
		try {
			// Mock existing document
			mockItemsCollection.findOne.mockResolvedValueOnce({
				memory_id: "mem_123",
				user_id: "user_123",
				versioning: { current_version: 1 },
			});

			mockItemsCollection.findOneAndUpdate.mockResolvedValueOnce({
				memory_id: "mem_123",
				user_id: "user_123",
				text: "Updated text",
				versioning: { current_version: 2 },
			});

			await store.update({
				memoryId: "mem_123",
				userId: "user_123",
				text: "Updated text",
			});

			const updateCall = mockItemsCollection.findOneAndUpdate.mock.calls[0];
			expect(updateCall[1].$inc["versioning.current_version"]).toBe(1);

			recordResult(testName, true, "Version incremented on update");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_update_returns_null_not_found
	 *
	 * Should return null if memory not found.
	 */
	it("should return null if memory not found", async () => {
		const testName = "test_update_not_found";
		try {
			mockItemsCollection.findOne.mockResolvedValueOnce(null);

			const result = await store.update({
				memoryId: "nonexistent",
				userId: "user_123",
				text: "Updated text",
			});

			expect(result).toBeNull();

			recordResult(testName, true, "Returns null for not found");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_update_creates_version_record
	 *
	 * Should create version record on update.
	 */
	it("should create version record on update", async () => {
		const testName = "test_update_creates_version";
		try {
			const baseDocument = {
				memory_id: "mem_123",
				user_id: "user_123",
				org_id: null,
				tier: "working",
				status: "active",
				tags: [],
				always_inject: false,
				text: "Original text",
				summary: null,
				entities: [],
				source: {
					type: "user",
					conversation_id: null,
					message_id: null,
					tool_name: null,
					tool_run_id: null,
					doc_id: null,
					chunk_id: null,
				},
				quality: { importance: 0.5, confidence: 0.5, mentioned_count: 0, quality_score: 0.5 },
				stats: {
					uses: 0,
					last_used_at: null,
					worked_count: 0,
					failed_count: 0,
					partial_count: 0,
					unknown_count: 0,
					success_rate: 0,
					wilson_score: 0,
				},
				created_at: new Date(),
				updated_at: new Date(),
				archived_at: null,
				expires_at: null,
				versioning: { current_version: 1, supersedes_memory_id: null },
			};

			mockItemsCollection.findOne.mockResolvedValueOnce(baseDocument);

			mockItemsCollection.findOneAndUpdate.mockResolvedValueOnce({
				...baseDocument,
				text: "Updated text",
				updated_at: new Date(),
				versioning: { current_version: 2, supersedes_memory_id: null },
			});

			await store.update({
				memoryId: "mem_123",
				userId: "user_123",
				text: "Updated text",
			});

			// Wait for async version creation
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockVersionsCollection.insertOne).toHaveBeenCalled();

			recordResult(testName, true, "Version record created");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestArchive: Test memory archiving
// =============================================================================

describe("TestArchive", () => {
	let store: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { MemoryMongoStore } = await import("../../stores/MemoryMongoStore");
		store = new MemoryMongoStore({
			client: mockMongoClient as any,
			dbName: "test_db",
		});
		await store.initialize();
	});

	/**
	 * test_archive_sets_status
	 *
	 * Should set status to archived.
	 */
	it("should set status to archived", async () => {
		const testName = "test_archive_sets_status";
		try {
			// Document structure must match MemoryItemDocument (flat fields, not nested timestamps)
			const fullDocument = {
				memory_id: "mem_123",
				user_id: "user_123",
				org_id: null,
				tier: "working",
				status: "active",
				tags: [],
				always_inject: false,
				text: "test memory",
				summary: null,
				entities: [],
				source: {
					type: "user",
					conversation_id: null,
					message_id: null,
					tool_name: null,
					tool_run_id: null,
					doc_id: null,
					chunk_id: null,
				},
				quality: { importance: 0.5, confidence: 0.5, mentioned_count: 0, quality_score: 0.5 },
				stats: {
					uses: 0,
					last_used_at: null,
					worked_count: 0,
					failed_count: 0,
					partial_count: 0,
					unknown_count: 0,
					success_rate: 0,
					wilson_score: 0,
				},
				created_at: new Date(),
				updated_at: new Date(),
				archived_at: null,
				expires_at: null,
				versioning: { current_version: 1, supersedes_memory_id: null },
			};

			mockItemsCollection.findOne.mockResolvedValueOnce(fullDocument);

			mockItemsCollection.findOneAndUpdate.mockResolvedValueOnce({
				...fullDocument,
				status: "archived",
				archived_at: new Date(),
			});

			const result = await store.archive("mem_123", "user_123", "outdated");

			expect(result).toBe(true);

			const updateCall = mockItemsCollection.findOneAndUpdate.mock.calls[0];
			expect(updateCall[1].$set.status).toBe("archived");

			recordResult(testName, true, "Status set to archived");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_archive_sets_timestamp
	 *
	 * Should set archived_at timestamp.
	 */
	it("should set archived_at timestamp", async () => {
		const testName = "test_archive_sets_timestamp";
		try {
			mockItemsCollection.findOne.mockResolvedValueOnce({
				memory_id: "mem_123",
				user_id: "user_123",
				status: "active",
				versioning: { current_version: 1 },
			});

			mockItemsCollection.findOneAndUpdate.mockResolvedValueOnce({
				memory_id: "mem_123",
				status: "archived",
			});

			await store.archive("mem_123", "user_123");

			const updateCall = mockItemsCollection.findOneAndUpdate.mock.calls[0];
			expect(updateCall[1].$set.archived_at).toBeDefined();

			recordResult(testName, true, "Archived_at timestamp set");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestOutcomeRecording: Test outcome recording and Wilson scores
// =============================================================================

describe("TestOutcomeRecording", () => {
	let store: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { MemoryMongoStore } = await import("../../stores/MemoryMongoStore");
		store = new MemoryMongoStore({
			client: mockMongoClient as any,
			dbName: "test_db",
		});
		await store.initialize();
	});

	/**
	 * test_record_outcome_increments_uses
	 *
	 * Should increment uses count.
	 */
	it("should increment uses count", async () => {
		const testName = "test_record_outcome_increments_uses";
		try {
			mockItemsCollection.findOneAndUpdate.mockResolvedValueOnce({
				memory_id: "mem_123",
				stats: {
					uses: 1,
					worked_count: 1,
					failed_count: 0,
					partial_count: 0,
				},
			});

			await store.recordOutcome({
				memoryId: "mem_123",
				userId: "user_123",
				outcome: "worked",
				contextType: "general",
			});

			const updateCall = mockItemsCollection.findOneAndUpdate.mock.calls[0];
			expect(updateCall[1][0].$set["stats.uses"]).toBeDefined();

			recordResult(testName, true, "Uses count incremented");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_record_outcome_increments_outcome_count
	 *
	 * Should increment specific outcome count.
	 */
	it("should increment specific outcome count", async () => {
		const testName = "test_record_outcome_increments_outcome_count";
		try {
			mockItemsCollection.findOneAndUpdate.mockResolvedValueOnce({
				memory_id: "mem_123",
				stats: {
					uses: 1,
					worked_count: 0,
					failed_count: 1,
					partial_count: 0,
				},
			});

			await store.recordOutcome({
				memoryId: "mem_123",
				userId: "user_123",
				outcome: "failed",
				contextType: "general",
			});

			const updateCall = mockItemsCollection.findOneAndUpdate.mock.calls[0];
			expect(updateCall[1][0].$set["stats.failed_count"]).toBeDefined();

			recordResult(testName, true, "Outcome count incremented");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_record_outcome_updates_wilson_score
	 *
	 * Should recalculate Wilson score.
	 */
	it("should recalculate Wilson score", async () => {
		const testName = "test_record_outcome_updates_wilson";
		try {
			mockItemsCollection.findOneAndUpdate.mockResolvedValueOnce({
				memory_id: "mem_123",
				stats: {
					uses: 5,
					worked_count: 4,
					failed_count: 1,
					partial_count: 0,
					unknown_count: 0,
				},
			});

			await store.recordOutcome({
				memoryId: "mem_123",
				userId: "user_123",
				outcome: "worked",
				contextType: "general",
			});

			// Second updateOne should update Wilson score
			expect(mockItemsCollection.updateOne).toHaveBeenCalled();

			const wilsonUpdate = mockItemsCollection.updateOne.mock.calls[0];
			expect(wilsonUpdate[1].$set["stats.wilson_score"]).toBeDefined();

			recordResult(testName, true, "Wilson score updated");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_record_outcome_creates_event
	 *
	 * Should create outcome event record.
	 */
	it("should create outcome event record", async () => {
		const testName = "test_record_outcome_creates_event";
		try {
			mockItemsCollection.findOneAndUpdate.mockResolvedValueOnce({
				memory_id: "mem_123",
				stats: {
					uses: 1,
					worked_count: 1,
					failed_count: 0,
					partial_count: 0,
				},
			});

			await store.recordOutcome({
				memoryId: "mem_123",
				userId: "user_123",
				outcome: "worked",
				contextType: "coding_help",
			});

			expect(mockOutcomesCollection.insertOne).toHaveBeenCalled();

			const outcomeDoc = mockOutcomesCollection.insertOne.mock.calls[0][0];
			expect(outcomeDoc.memory_id).toBe("mem_123");
			expect(outcomeDoc.outcome).toBe("worked");
			expect(outcomeDoc.context_type).toBe("coding_help");

			recordResult(testName, true, "Outcome event created");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestCountByTier: Test tier counting
// =============================================================================

describe("TestCountByTier", () => {
	let store: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { MemoryMongoStore } = await import("../../stores/MemoryMongoStore");
		store = new MemoryMongoStore({
			client: mockMongoClient as any,
			dbName: "test_db",
		});
		await store.initialize();
	});

	/**
	 * test_count_by_tier
	 *
	 * Should return counts per tier.
	 */
	it("should return counts per tier", async () => {
		const testName = "test_count_by_tier";
		try {
			mockItemsCollection.aggregate.mockReturnValueOnce({
				maxTimeMS: vi.fn().mockReturnThis(),
				toArray: vi.fn().mockResolvedValue([
					{ _id: "working", count: 10 },
					{ _id: "history", count: 25 },
					{ _id: "patterns", count: 5 },
				]),
			});

			const counts = await store.countByTier("user_123");

			expect(counts.working).toBe(10);
			expect(counts.history).toBe(25);
			expect(counts.patterns).toBe(5);
			expect(counts.documents).toBe(0);
			expect(counts.memory_bank).toBe(0);

			recordResult(testName, true, `Counts: working=${counts.working}, history=${counts.history}`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});

	/**
	 * test_count_by_tier_empty
	 *
	 * Should return zeros for new user.
	 */
	it("should return zeros for new user", async () => {
		const testName = "test_count_by_tier_empty";
		try {
			mockItemsCollection.aggregate.mockReturnValueOnce({
				maxTimeMS: vi.fn().mockReturnThis(),
				toArray: vi.fn().mockResolvedValue([]),
			});

			const counts = await store.countByTier("new_user");

			expect(counts.working).toBe(0);
			expect(counts.history).toBe(0);
			expect(counts.patterns).toBe(0);
			expect(counts.documents).toBe(0);
			expect(counts.memory_bank).toBe(0);

			recordResult(testName, true, "Returns zeros for new user");
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestVersionHistory: Test version history retrieval
// =============================================================================

describe("TestVersionHistory", () => {
	let store: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { MemoryMongoStore } = await import("../../stores/MemoryMongoStore");
		store = new MemoryMongoStore({
			client: mockMongoClient as any,
			dbName: "test_db",
		});
		await store.initialize();
	});

	/**
	 * test_get_version_history
	 *
	 * Should return version history.
	 */
	it("should return version history", async () => {
		const testName = "test_get_version_history";
		try {
			mockVersionsCollection.find.mockReturnValueOnce({
				sort: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				toArray: vi.fn().mockResolvedValue([
					{
						version_number: 2,
						text: "Updated text",
						change_type: "update",
						created_at: new Date(),
					},
					{
						version_number: 1,
						text: "Original text",
						change_type: "create",
						created_at: new Date(),
					},
				]),
			});

			const history = await store.getVersionHistory("mem_123", "user_123");

			expect(history.length).toBe(2);
			expect(history[0].versionNumber).toBe(2);
			expect(history[1].versionNumber).toBe(1);

			recordResult(testName, true, `Found ${history.length} versions`);
		} catch (error) {
			recordResult(testName, false, undefined, String(error));
			throw error;
		}
	});
});

// =============================================================================
// TestAlwaysInject: Test always-inject functionality
// =============================================================================

describe("TestAlwaysInject", () => {
	let store: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		const { MemoryMongoStore } = await import("../../stores/MemoryMongoStore");
		store = new MemoryMongoStore({
			client: mockMongoClient as any,
			dbName: "test_db",
		});
		await store.initialize();
	});

	/**
	 * test_get_always_inject
	 *
	 * Should return always-inject memories.
	 */
	it("should return always-inject memories", async () => {
		const testName = "test_get_always_inject";
		try {
			await store.getAlwaysInject("user_123");

			const findCall = mockItemsCollection.find.mock.calls[0][0];
			expect(findCall.always_inject).toBe(true);
			expect(findCall.status).toEqual({ $in: ["active"] });

			recordResult(testName, true, "Always-inject query correct");
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
	it("should generate memory bank service test summary", () => {
		console.log("\n=== MEMORY BANK SERVICE TEST SUMMARY ===\n");

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

		console.log("\n========================================\n");

		expect(true).toBe(true);
	});
});
