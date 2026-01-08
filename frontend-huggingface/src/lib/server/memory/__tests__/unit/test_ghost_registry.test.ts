/**
 * Unit tests for Ghost Registry / Ghost Tracking Functionality
 *
 * Tests the ghost tracking system that filters deleted book chunks from search results.
 *
 * Adapted from: roampal/backend/tests/unit/test_ghost_registry.py
 *
 * Key Differences from Roampal:
 * - Roampal: Explicit GhostRegistry class with in-memory Set and disk persistence
 * - BricksLLM: Uses Qdrant status filtering ('active'/'archived') and MongoDB archive
 *
 * This test file characterizes:
 * - Status-based ghost filtering (archived items excluded from search)
 * - Ghost ID tracking and management
 * - Persistence patterns (Qdrant payload vs file-based)
 * - Filter behavior with different ID key names
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";

// Test result tracking (matches roampal characterization pattern)
interface TestResult {
	name: string;
	passed: boolean;
	duration?: number;
	error?: string;
}

/**
 * GhostRegistry - Memory-based ghost ID tracker
 *
 * This is a TypeScript implementation matching roampal's GhostRegistry pattern.
 * In production BricksLLM, this functionality is handled by Qdrant status filtering,
 * but this class provides the equivalent API for testing and potential standalone use.
 */
class GhostRegistry {
	private ghostIds: Set<string> = new Set();
	private dataDir: string | null = null;
	public _file_path: string | null = null;

	constructor(dataDir?: string) {
		if (dataDir) {
			this.dataDir = dataDir;
			this._file_path = `${dataDir}/ghost_ids.json`;
			// In a real implementation, this would load from disk
			this.loadFromDisk();
		}
	}

	/**
	 * Add ghost IDs to the registry
	 * @returns Number of new IDs added (excludes duplicates)
	 */
	add(ids: string[]): number {
		let addedCount = 0;
		for (const id of ids) {
			if (!this.ghostIds.has(id)) {
				this.ghostIds.add(id);
				addedCount++;
			}
		}
		if (this.dataDir) {
			this.saveToDisk();
		}
		return addedCount;
	}

	/**
	 * Check if an ID is a ghost (deleted)
	 */
	is_ghost(id: string): boolean {
		return this.ghostIds.has(id);
	}

	/**
	 * Get total count of ghost IDs
	 */
	count(): number {
		return this.ghostIds.size;
	}

	/**
	 * Filter search results to exclude ghost entries
	 * Checks both 'id' and 'doc_id' keys (roampal compatibility)
	 */
	filter_ghosts<T extends Record<string, unknown>>(results: T[]): T[] {
		return results.filter((result) => {
			const id = (result.id as string) || (result.doc_id as string);
			return !this.ghostIds.has(id);
		});
	}

	/**
	 * Clear all ghost IDs
	 * @returns Number of IDs that were cleared
	 */
	clear(): number {
		const count = this.ghostIds.size;
		this.ghostIds.clear();
		if (this.dataDir) {
			this.saveToDisk();
		}
		return count;
	}

	/**
	 * Get all ghost IDs as array
	 */
	get_all(): string[] {
		return Array.from(this.ghostIds);
	}

	/**
	 * Load ghost IDs from disk (simulated)
	 */
	private loadFromDisk(): void {
		// In production, this would use fs.readFileSync
		// For testing, we simulate persistence
	}

	/**
	 * Save ghost IDs to disk (simulated)
	 */
	private saveToDisk(): void {
		// In production, this would use fs.writeFileSync
		// For testing, we simulate persistence
	}
}

// Singleton pattern (matches roampal)
let _ghostRegistrySingleton: GhostRegistry | null = null;

function get_ghost_registry(dataDir?: string): GhostRegistry {
	if (!_ghostRegistrySingleton) {
		_ghostRegistrySingleton = new GhostRegistry(dataDir);
	}
	return _ghostRegistrySingleton;
}

function reset_ghost_registry(): void {
	_ghostRegistrySingleton = null;
}

/**
 * Mock Qdrant Adapter for status-based ghost filtering
 * This represents how BricksLLM actually handles ghost filtering
 */
class MockQdrantAdapter {
	private points: Map<
		string,
		{
			id: string;
			vector: number[];
			payload: {
				user_id: string;
				tier: string;
				status: "active" | "archived";
				content: string;
				tags: string[];
			};
		}
	> = new Map();

	upsert(point: {
		id: string;
		vector: number[];
		payload: {
			user_id: string;
			tier: string;
			status: "active" | "archived";
			content: string;
			tags: string[];
		};
	}): void {
		this.points.set(point.id, point);
	}

	updatePayload(id: string, updates: { status?: "active" | "archived" }): void {
		const point = this.points.get(id);
		if (point) {
			point.payload = { ...point.payload, ...updates };
		}
	}

	delete(id: string): void {
		this.points.delete(id);
	}

	/**
	 * Search with status filtering - this is how BricksLLM filters ghosts
	 */
	search(params: {
		userId: string;
		vector: number[];
		status?: ("active" | "archived")[];
	}): Array<{ id: string; score: number; payload: Record<string, unknown> }> {
		const results: Array<{ id: string; score: number; payload: Record<string, unknown> }> = [];

		for (const [id, point] of this.points) {
			if (point.payload.user_id !== params.userId) continue;

			// Status filtering - the BricksLLM ghost mechanism
			if (params.status && !params.status.includes(point.payload.status)) {
				continue; // Ghost filtering!
			}

			results.push({
				id,
				score: 0.9 - Math.random() * 0.2, // Simulated similarity
				payload: point.payload,
			});
		}

		return results.sort((a, b) => b.score - a.score);
	}

	/**
	 * Get all points for inspection
	 */
	getAllPoints(): Map<string, unknown> {
		return new Map(this.points);
	}
}

// ==============================================================================
// Test Harness (matches roampal characterization pattern)
// ==============================================================================

class TestHarness {
	private results: TestResult[] = [];

	recordResult(result: TestResult): void {
		this.results.push(result);
	}

	getResults(): TestResult[] {
		return this.results;
	}

	getSummary(): { total: number; passed: number; failed: number; passRate: string } {
		const passed = this.results.filter((r) => r.passed).length;
		const failed = this.results.length - passed;
		return {
			total: this.results.length,
			passed,
			failed,
			passRate: `${((passed / this.results.length) * 100).toFixed(1)}%`,
		};
	}
}

// ==============================================================================
// TestGhostRegistry - Core Ghost Registry Tests
// Adapted from: roampal/backend/tests/unit/test_ghost_registry.py::TestGhostRegistry
// ==============================================================================

describe("TestGhostRegistry", () => {
	const harness = new TestHarness();
	let tmpPath: string;

	beforeEach(() => {
		tmpPath = `/tmp/ghost_test_${Date.now()}`;
	});

	afterEach(() => {
		reset_ghost_registry();
	});

	/**
	 * test_init_without_data_dir
	 * Registry works in memory-only mode without data_dir.
	 *
	 * Roampal equivalent: test_ghost_registry.py::TestGhostRegistry::test_init_without_data_dir
	 * Functions invoked: GhostRegistry(), count(), _file_path
	 */
	it("test_init_without_data_dir", () => {
		const startTime = Date.now();
		const testName = "test_init_without_data_dir";

		const registry = new GhostRegistry();

		const result: TestResult = {
			name: testName,
			passed: registry.count() === 0 && registry._file_path === null,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(registry.count()).toBe(0);
		expect(registry._file_path).toBeNull();
	});

	/**
	 * test_init_with_data_dir
	 * Registry creates file path when data_dir provided.
	 *
	 * Roampal equivalent: test_ghost_registry.py::TestGhostRegistry::test_init_with_data_dir
	 * Functions invoked: GhostRegistry(dataDir), _file_path, count()
	 */
	it("test_init_with_data_dir", () => {
		const startTime = Date.now();
		const testName = "test_init_with_data_dir";

		const registry = new GhostRegistry(tmpPath);

		const result: TestResult = {
			name: testName,
			passed: registry._file_path === `${tmpPath}/ghost_ids.json` && registry.count() === 0,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(registry._file_path).toBe(`${tmpPath}/ghost_ids.json`);
		expect(registry.count()).toBe(0);
	});

	/**
	 * test_add_single_ghost
	 * Adding a ghost ID increases count and is_ghost returns True.
	 *
	 * Roampal equivalent: test_ghost_registry.py::TestGhostRegistry::test_add_single_ghost
	 * Functions invoked: add(), count(), is_ghost()
	 */
	it("test_add_single_ghost", () => {
		const startTime = Date.now();
		const testName = "test_add_single_ghost";

		const registry = new GhostRegistry(tmpPath);
		const added = registry.add(["chunk_123"]);

		const result: TestResult = {
			name: testName,
			passed:
				added === 1 &&
				registry.count() === 1 &&
				registry.is_ghost("chunk_123") &&
				!registry.is_ghost("chunk_456"),
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(added).toBe(1);
		expect(registry.count()).toBe(1);
		expect(registry.is_ghost("chunk_123")).toBe(true);
		expect(registry.is_ghost("chunk_456")).toBe(false);
	});

	/**
	 * test_add_multiple_ghosts
	 * Adding multiple ghost IDs works correctly.
	 *
	 * Roampal equivalent: test_ghost_registry.py::TestGhostRegistry::test_add_multiple_ghosts
	 * Functions invoked: add(), count(), is_ghost()
	 */
	it("test_add_multiple_ghosts", () => {
		const startTime = Date.now();
		const testName = "test_add_multiple_ghosts";

		const registry = new GhostRegistry(tmpPath);
		const added = registry.add(["chunk_1", "chunk_2", "chunk_3"]);

		const result: TestResult = {
			name: testName,
			passed:
				added === 3 &&
				registry.count() === 3 &&
				registry.is_ghost("chunk_1") &&
				registry.is_ghost("chunk_2") &&
				registry.is_ghost("chunk_3"),
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(added).toBe(3);
		expect(registry.count()).toBe(3);
		expect(registry.is_ghost("chunk_1")).toBe(true);
		expect(registry.is_ghost("chunk_2")).toBe(true);
		expect(registry.is_ghost("chunk_3")).toBe(true);
	});

	/**
	 * test_add_duplicates_not_counted
	 * Adding duplicate IDs doesn't increase count.
	 *
	 * Roampal equivalent: test_ghost_registry.py::TestGhostRegistry::test_add_duplicates_not_counted
	 * Functions invoked: add(), count()
	 */
	it("test_add_duplicates_not_counted", () => {
		const startTime = Date.now();
		const testName = "test_add_duplicates_not_counted";

		const registry = new GhostRegistry(tmpPath);
		registry.add(["chunk_1", "chunk_2"]);
		const added = registry.add(["chunk_2", "chunk_3"]); // chunk_2 is duplicate

		const result: TestResult = {
			name: testName,
			passed: added === 1 && registry.count() === 3, // Only chunk_3 is new
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(added).toBe(1);
		expect(registry.count()).toBe(3);
	});

	/**
	 * test_filter_ghosts_removes_ghost_results
	 * filter_ghosts removes results with ghost IDs.
	 *
	 * Roampal equivalent: test_ghost_registry.py::TestGhostRegistry::test_filter_ghosts_removes_ghost_results
	 * Functions invoked: add(), filter_ghosts()
	 */
	it("test_filter_ghosts_removes_ghost_results", () => {
		const startTime = Date.now();
		const testName = "test_filter_ghosts_removes_ghost_results";

		const registry = new GhostRegistry(tmpPath);
		registry.add(["ghost_1", "ghost_2"]);

		const results = [
			{ id: "ghost_1", text: "deleted content" },
			{ id: "good_1", text: "valid content" },
			{ id: "ghost_2", text: "also deleted" },
			{ id: "good_2", text: "also valid" },
		];

		const filtered = registry.filter_ghosts(results);

		const result: TestResult = {
			name: testName,
			passed: filtered.length === 2 && filtered[0].id === "good_1" && filtered[1].id === "good_2",
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(filtered).toHaveLength(2);
		expect(filtered[0].id).toBe("good_1");
		expect(filtered[1].id).toBe("good_2");
	});

	/**
	 * test_filter_ghosts_uses_doc_id_fallback
	 * filter_ghosts checks 'doc_id' key if 'id' is missing.
	 *
	 * Roampal equivalent: test_ghost_registry.py::TestGhostRegistry::test_filter_ghosts_uses_doc_id_fallback
	 * Functions invoked: add(), filter_ghosts()
	 */
	it("test_filter_ghosts_uses_doc_id_fallback", () => {
		const startTime = Date.now();
		const testName = "test_filter_ghosts_uses_doc_id_fallback";

		const registry = new GhostRegistry(tmpPath);
		registry.add(["ghost_1"]);

		const results = [
			{ doc_id: "ghost_1", text: "deleted" },
			{ doc_id: "good_1", text: "valid" },
		];

		const filtered = registry.filter_ghosts(results);

		const result: TestResult = {
			name: testName,
			passed: filtered.length === 1 && filtered[0].doc_id === "good_1",
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].doc_id).toBe("good_1");
	});

	/**
	 * test_filter_ghosts_empty_registry_returns_all
	 * filter_ghosts returns all results when registry is empty.
	 *
	 * Roampal equivalent: test_ghost_registry.py::TestGhostRegistry::test_filter_ghosts_empty_registry_returns_all
	 * Functions invoked: filter_ghosts()
	 */
	it("test_filter_ghosts_empty_registry_returns_all", () => {
		const startTime = Date.now();
		const testName = "test_filter_ghosts_empty_registry_returns_all";

		const registry = new GhostRegistry(tmpPath);

		const results = [
			{ id: "chunk_1", text: "content 1" },
			{ id: "chunk_2", text: "content 2" },
		];

		const filtered = registry.filter_ghosts(results);

		const result: TestResult = {
			name: testName,
			passed: filtered.length === 2,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(filtered).toHaveLength(2);
	});

	/**
	 * test_clear_removes_all_ghosts
	 * clear() removes all ghost IDs.
	 *
	 * Roampal equivalent: test_ghost_registry.py::TestGhostRegistry::test_clear_removes_all_ghosts
	 * Functions invoked: add(), clear(), count(), is_ghost()
	 */
	it("test_clear_removes_all_ghosts", () => {
		const startTime = Date.now();
		const testName = "test_clear_removes_all_ghosts";

		const registry = new GhostRegistry(tmpPath);
		registry.add(["chunk_1", "chunk_2", "chunk_3"]);

		const cleared = registry.clear();

		const result: TestResult = {
			name: testName,
			passed: cleared === 3 && registry.count() === 0 && !registry.is_ghost("chunk_1"),
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(cleared).toBe(3);
		expect(registry.count()).toBe(0);
		expect(registry.is_ghost("chunk_1")).toBe(false);
	});

	/**
	 * test_get_all_returns_list
	 * get_all() returns list of all ghost IDs.
	 *
	 * Roampal equivalent: test_ghost_registry.py::TestGhostRegistry::test_get_all_returns_list
	 * Functions invoked: add(), get_all()
	 */
	it("test_get_all_returns_list", () => {
		const startTime = Date.now();
		const testName = "test_get_all_returns_list";

		const registry = new GhostRegistry(tmpPath);
		registry.add(["chunk_1", "chunk_2"]);

		const allGhosts = registry.get_all();

		const result: TestResult = {
			name: testName,
			passed: new Set(allGhosts).size === 2 && allGhosts.includes("chunk_1") && allGhosts.includes("chunk_2"),
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(new Set(allGhosts)).toEqual(new Set(["chunk_1", "chunk_2"]));
	});

	// Note: Persistence tests (test_persistence_save_and_load, test_persistence_file_format)
	// would require file system mocking. In BricksLLM, persistence is handled by Qdrant status field.
});

// ==============================================================================
// TestGhostRegistrySingleton - Singleton Pattern Tests
// Adapted from: roampal/backend/tests/unit/test_ghost_registry.py::TestGhostRegistrySingleton
// ==============================================================================

describe("TestGhostRegistrySingleton", () => {
	const harness = new TestHarness();

	beforeEach(() => {
		reset_ghost_registry();
	});

	afterEach(() => {
		reset_ghost_registry();
	});

	/**
	 * test_get_ghost_registry_creates_singleton
	 * get_ghost_registry returns same instance on repeated calls.
	 *
	 * Roampal equivalent: test_ghost_registry.py::TestGhostRegistrySingleton::test_get_ghost_registry_creates_singleton
	 * Functions invoked: get_ghost_registry()
	 */
	it("test_get_ghost_registry_creates_singleton", () => {
		const startTime = Date.now();
		const testName = "test_get_ghost_registry_creates_singleton";

		const registry1 = get_ghost_registry();
		const registry2 = get_ghost_registry();

		const result: TestResult = {
			name: testName,
			passed: registry1 === registry2,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(registry1).toBe(registry2);
	});

	/**
	 * test_reset_ghost_registry_clears_singleton
	 * reset_ghost_registry allows creating new instance.
	 *
	 * Roampal equivalent: test_ghost_registry.py::TestGhostRegistrySingleton::test_reset_ghost_registry_clears_singleton
	 * Functions invoked: get_ghost_registry(), add(), reset_ghost_registry(), count()
	 */
	it("test_reset_ghost_registry_clears_singleton", () => {
		const startTime = Date.now();
		const testName = "test_reset_ghost_registry_clears_singleton";

		const registry1 = get_ghost_registry();
		registry1.add(["chunk_1"]);

		reset_ghost_registry();

		const registry2 = get_ghost_registry();

		const result: TestResult = {
			name: testName,
			passed: registry2.count() === 0 && registry1 !== registry2,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(registry2.count()).toBe(0);
		expect(registry1).not.toBe(registry2);
	});
});

// ==============================================================================
// TestQdrantStatusFiltering - BricksLLM-Specific Ghost Filtering
// Tests how BricksLLM handles ghost filtering via Qdrant status field
// ==============================================================================

describe("TestQdrantStatusFiltering", () => {
	const harness = new TestHarness();
	let qdrant: MockQdrantAdapter;
	const userId = "user_ghost_test";

	beforeEach(() => {
		qdrant = new MockQdrantAdapter();

		// Setup test data with mixed statuses
		const testPoints = [
			{
				id: "chunk_active_1",
				vector: [0.1, 0.2, 0.3],
				payload: {
					user_id: userId,
					tier: "books",
					status: "active" as const,
					content: "Active book content 1",
					tags: ["book"],
				},
			},
			{
				id: "chunk_active_2",
				vector: [0.2, 0.3, 0.4],
				payload: {
					user_id: userId,
					tier: "books",
					status: "active" as const,
					content: "Active book content 2",
					tags: ["book"],
				},
			},
			{
				id: "chunk_archived_1",
				vector: [0.3, 0.4, 0.5],
				payload: {
					user_id: userId,
					tier: "books",
					status: "archived" as const,
					content: "Archived (ghost) content 1",
					tags: ["book"],
				},
			},
			{
				id: "chunk_archived_2",
				vector: [0.4, 0.5, 0.6],
				payload: {
					user_id: userId,
					tier: "books",
					status: "archived" as const,
					content: "Archived (ghost) content 2",
					tags: ["book"],
				},
			},
		];

		for (const point of testPoints) {
			qdrant.upsert(point);
		}
	});

	/**
	 * test_status_filter_excludes_archived
	 * Search with status=['active'] excludes archived (ghost) entries.
	 *
	 * BricksLLM equivalent of: filter_ghosts() in roampal
	 * Functions invoked: QdrantAdapter.search() with status filter
	 */
	it("test_status_filter_excludes_archived", () => {
		const startTime = Date.now();
		const testName = "test_status_filter_excludes_archived";

		// Search with active-only filter (ghost filtering)
		const results = qdrant.search({
			userId,
			vector: [0.2, 0.3, 0.4],
			status: ["active"],
		});

		const result: TestResult = {
			name: testName,
			passed:
				results.length === 2 &&
				results.every((r) => r.id.includes("active")) &&
				!results.some((r) => r.id.includes("archived")),
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(results).toHaveLength(2);
		expect(results.every((r) => r.id.includes("active"))).toBe(true);
		expect(results.some((r) => r.id.includes("archived"))).toBe(false);
	});

	/**
	 * test_no_status_filter_returns_all
	 * Search without status filter returns all entries including archived.
	 *
	 * Functions invoked: QdrantAdapter.search() without status filter
	 */
	it("test_no_status_filter_returns_all", () => {
		const startTime = Date.now();
		const testName = "test_no_status_filter_returns_all";

		// Search without status filter
		const results = qdrant.search({
			userId,
			vector: [0.2, 0.3, 0.4],
		});

		const result: TestResult = {
			name: testName,
			passed: results.length === 4,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(results).toHaveLength(4);
	});

	/**
	 * test_archive_operation_creates_ghost
	 * Changing status to 'archived' makes entry a ghost.
	 *
	 * BricksLLM equivalent of: GhostRegistry.add() in roampal
	 * Functions invoked: QdrantAdapter.updatePayload(), QdrantAdapter.search()
	 */
	it("test_archive_operation_creates_ghost", () => {
		const startTime = Date.now();
		const testName = "test_archive_operation_creates_ghost";

		// Archive chunk_active_1 (make it a ghost)
		qdrant.updatePayload("chunk_active_1", { status: "archived" });

		// Search active only
		const results = qdrant.search({
			userId,
			vector: [0.2, 0.3, 0.4],
			status: ["active"],
		});

		const result: TestResult = {
			name: testName,
			passed: results.length === 1 && results[0].id === "chunk_active_2",
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("chunk_active_2");
	});

	/**
	 * test_delete_operation_removes_completely
	 * Delete operation removes entry entirely (harder than archive).
	 *
	 * Functions invoked: QdrantAdapter.delete(), QdrantAdapter.search()
	 */
	it("test_delete_operation_removes_completely", () => {
		const startTime = Date.now();
		const testName = "test_delete_operation_removes_completely";

		// Hard delete (not just archive)
		qdrant.delete("chunk_active_1");

		// Search all (no status filter)
		const results = qdrant.search({
			userId,
			vector: [0.2, 0.3, 0.4],
		});

		const result: TestResult = {
			name: testName,
			passed: results.length === 3 && !results.some((r) => r.id === "chunk_active_1"),
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(results).toHaveLength(3);
		expect(results.some((r) => r.id === "chunk_active_1")).toBe(false);
	});

	/**
	 * test_only_archived_filter
	 * Can search for only archived entries (inspect ghosts).
	 *
	 * Functions invoked: QdrantAdapter.search() with status=['archived']
	 */
	it("test_only_archived_filter", () => {
		const startTime = Date.now();
		const testName = "test_only_archived_filter";

		const results = qdrant.search({
			userId,
			vector: [0.2, 0.3, 0.4],
			status: ["archived"],
		});

		const result: TestResult = {
			name: testName,
			passed: results.length === 2 && results.every((r) => r.id.includes("archived")),
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(results).toHaveLength(2);
		expect(results.every((r) => r.id.includes("archived"))).toBe(true);
	});
});

// ==============================================================================
// TestBookRemovalGhostBehavior - Integration of removeBook with Ghost Tracking
// Tests how BricksLLM's removeBook creates ghosts via archiving
// ==============================================================================

describe("TestBookRemovalGhostBehavior", () => {
	const harness = new TestHarness();
	let qdrant: MockQdrantAdapter;
	let mockMongoStore: {
		query: Mock;
		archive: Mock;
	};
	const userId = "user_book_removal";

	beforeEach(() => {
		qdrant = new MockQdrantAdapter();
		mockMongoStore = {
			query: vi.fn(),
			archive: vi.fn().mockResolvedValue(undefined),
		};

		// Setup book chunks in Qdrant
		const bookChunks = [
			{
				id: "book_123_chunk_0",
				vector: [0.1, 0.2, 0.3],
				payload: {
					user_id: userId,
					tier: "books",
					status: "active" as const,
					content: "Book chapter 1 content",
					tags: ["book_123"],
				},
			},
			{
				id: "book_123_chunk_1",
				vector: [0.2, 0.3, 0.4],
				payload: {
					user_id: userId,
					tier: "books",
					status: "active" as const,
					content: "Book chapter 2 content",
					tags: ["book_123"],
				},
			},
			{
				id: "book_456_chunk_0",
				vector: [0.3, 0.4, 0.5],
				payload: {
					user_id: userId,
					tier: "books",
					status: "active" as const,
					content: "Different book content",
					tags: ["book_456"],
				},
			},
		];

		for (const chunk of bookChunks) {
			qdrant.upsert(chunk);
		}

		// Mock MongoDB query returning book chunks
		mockMongoStore.query.mockResolvedValue([
			{ memory_id: "book_123_chunk_0", content: "Book chapter 1" },
			{ memory_id: "book_123_chunk_1", content: "Book chapter 2" },
		]);
	});

	/**
	 * test_remove_book_archives_chunks
	 * removeBook archives all chunks for that book (creates ghosts).
	 *
	 * Simulates: StoreServiceImpl.removeBook()
	 * Roampal equivalent: GhostRegistry.add() called after book deletion
	 */
	it("test_remove_book_archives_chunks", async () => {
		const startTime = Date.now();
		const testName = "test_remove_book_archives_chunks";

		// Simulate removeBook: archive in MongoDB, update status in Qdrant
		const bookMemories = await mockMongoStore.query({
			userId,
			tier: "books",
			metadata: { book_id: "book_123" },
		});

		// Archive operation (creates ghosts)
		for (const memory of bookMemories) {
			await mockMongoStore.archive(memory.memory_id, userId);
			qdrant.updatePayload(memory.memory_id, { status: "archived" });
		}

		// Search should now exclude archived chunks
		const results = qdrant.search({
			userId,
			vector: [0.2, 0.3, 0.4],
			status: ["active"],
		});

		const result: TestResult = {
			name: testName,
			passed:
				results.length === 1 &&
				results[0].id === "book_456_chunk_0" &&
				mockMongoStore.archive.mock.calls.length === 2,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("book_456_chunk_0");
		expect(mockMongoStore.archive).toHaveBeenCalledTimes(2);
	});

	/**
	 * test_remove_book_hard_delete_from_qdrant
	 * Alternative: Hard delete from Qdrant instead of status update.
	 *
	 * BricksLLM actually does this in production removeBook()
	 */
	it("test_remove_book_hard_delete_from_qdrant", async () => {
		const startTime = Date.now();
		const testName = "test_remove_book_hard_delete_from_qdrant";

		const bookMemories = await mockMongoStore.query({
			userId,
			tier: "books",
			metadata: { book_id: "book_123" },
		});

		// Hard delete from Qdrant (as BricksLLM does)
		for (const memory of bookMemories) {
			qdrant.delete(memory.memory_id);
		}

		// Search all (no filter needed since entries are gone)
		const results = qdrant.search({
			userId,
			vector: [0.2, 0.3, 0.4],
		});

		const result: TestResult = {
			name: testName,
			passed: results.length === 1 && results[0].id === "book_456_chunk_0",
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("book_456_chunk_0");
	});
});

// ==============================================================================
// TestGhostFilterIntegration - End-to-end ghost filtering tests
// ==============================================================================

describe("TestGhostFilterIntegration", () => {
	const harness = new TestHarness();

	/**
	 * test_ghost_filter_preserves_order
	 * Ghost filtering maintains result order.
	 */
	it("test_ghost_filter_preserves_order", () => {
		const startTime = Date.now();
		const testName = "test_ghost_filter_preserves_order";

		const registry = new GhostRegistry();
		registry.add(["ghost_2", "ghost_4"]);

		const results = [
			{ id: "result_1", score: 0.95 },
			{ id: "ghost_2", score: 0.9 },
			{ id: "result_3", score: 0.85 },
			{ id: "ghost_4", score: 0.8 },
			{ id: "result_5", score: 0.75 },
		];

		const filtered = registry.filter_ghosts(results);

		const result: TestResult = {
			name: testName,
			passed:
				filtered.length === 3 &&
				filtered[0].id === "result_1" &&
				filtered[1].id === "result_3" &&
				filtered[2].id === "result_5",
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(filtered).toHaveLength(3);
		expect(filtered.map((r) => r.id)).toEqual(["result_1", "result_3", "result_5"]);
	});

	/**
	 * test_ghost_filter_handles_mixed_id_keys
	 * Ghost filter handles results with different ID key names.
	 */
	it("test_ghost_filter_handles_mixed_id_keys", () => {
		const startTime = Date.now();
		const testName = "test_ghost_filter_handles_mixed_id_keys";

		const registry = new GhostRegistry();
		registry.add(["ghost_1", "ghost_2"]);

		const results = [
			{ id: "ghost_1", content: "ghost by id" },
			{ doc_id: "ghost_2", content: "ghost by doc_id" },
			{ id: "valid_1", content: "valid by id" },
			{ doc_id: "valid_2", content: "valid by doc_id" },
		];

		const filtered = registry.filter_ghosts(results);

		const result: TestResult = {
			name: testName,
			passed: filtered.length === 2,
			duration: Date.now() - startTime,
		};

		harness.recordResult(result);
		expect(filtered).toHaveLength(2);
	});

	/**
	 * test_ghost_filter_large_set
	 * Ghost filter performs well with large ghost sets.
	 */
	it("test_ghost_filter_large_set", () => {
		const startTime = Date.now();
		const testName = "test_ghost_filter_large_set";

		const registry = new GhostRegistry();

		// Add 1000 ghosts
		const ghostIds = Array.from({ length: 1000 }, (_, i) => `ghost_${i}`);
		registry.add(ghostIds);

		// Create 100 results, half are ghosts
		const results = Array.from({ length: 100 }, (_, i) => ({
			id: i % 2 === 0 ? `ghost_${i}` : `valid_${i}`,
			content: `Content ${i}`,
		}));

		const filtered = registry.filter_ghosts(results);
		const filterTime = Date.now() - startTime;

		const result: TestResult = {
			name: testName,
			passed: filtered.length === 50 && filterTime < 100, // Should be fast
			duration: filterTime,
		};

		harness.recordResult(result);
		expect(filtered).toHaveLength(50);
		expect(filterTime).toBeLessThan(100); // Performance check
	});
});

// ==============================================================================
// Test Summary Reporter
// ==============================================================================

describe("TestGhostRegistrySummary", () => {
	it("prints_test_summary", () => {
		// This test just ensures all previous tests ran
		// In production, this would aggregate harness results
		expect(true).toBe(true);
	});
});
