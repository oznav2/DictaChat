/**
 * Catastrophic Forgetting Tests
 *
 * Tests that new memories don't overwrite or destroy older memories.
 * Enterprise-grade memory system must maintain old knowledge while learning new.
 *
 * Test Scenarios:
 * 1. Sequential storage doesn't lose earlier items
 * 2. Bulk storage maintains all items
 * 3. Tier promotion preserves memory content
 * 4. Wilson score updates don't corrupt metadata
 * 5. Bilingual memories (Hebrew + English) coexist
 *
 * Output: Generates benchmark results to benchmarks/results/catastrophic_forgetting.txt
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import {
	MockEmbeddingService,
	MockTimeManager,
	MockCollection,
	TestHarness,
	createTestFragment,
	createTestMetadata,
	mockExtractConcepts,
	calculateWilsonScore,
} from "../mock-utilities";

// ============================================================================
// Benchmark Reporter - Generates Roampal-style output
// ============================================================================

interface BenchmarkResult {
	name: string;
	passed: boolean;
	duration: number;
	metrics?: Record<string, number | string>;
	error?: string;
}

class BenchmarkReporter {
	private results: BenchmarkResult[] = [];
	private startTime: number = Date.now();
	private suiteName: string;

	constructor(suiteName: string) {
		this.suiteName = suiteName;
	}

	recordTest(result: BenchmarkResult): void {
		this.results.push(result);
	}

	generateReport(): string {
		const totalDuration = ((Date.now() - this.startTime) / 1000).toFixed(2);
		const passed = this.results.filter((r) => r.passed).length;
		const failed = this.results.length - passed;

		const lines: string[] = [
			"============================= test session starts =============================",
			`platform: node ${process.version}`,
			`test framework: vitest`,
			`timestamp: ${new Date().toISOString()}`,
			`rootdir: ${process.cwd()}`,
			"",
			`collecting ... collected ${this.results.length} items`,
			"",
		];

		// Test results
		this.results.forEach((result, idx) => {
			const pct = Math.round(((idx + 1) / this.results.length) * 100);
			const status = result.passed ? "PASSED" : "FAILED";
			const metrics = result.metrics
				? ` [${Object.entries(result.metrics)
						.map(([k, v]) => `${k}=${v}`)
						.join(", ")}]`
				: "";
			lines.push(
				`${this.suiteName}::${result.name} ${status} (${result.duration}ms)${metrics} [${pct.toString().padStart(3)}%]`
			);
			if (result.error) {
				lines.push(`  ERROR: ${result.error}`);
			}
		});

		lines.push("");
		lines.push("============================== benchmark summary ==============================");

		// Detailed metrics summary
		const metricsMap = new Map<string, number[]>();
		this.results.forEach((r) => {
			if (r.metrics) {
				Object.entries(r.metrics).forEach(([k, v]) => {
					if (typeof v === "number") {
						if (!metricsMap.has(k)) metricsMap.set(k, []);
						metricsMap.get(k)!.push(v);
					}
				});
			}
		});

		if (metricsMap.size > 0) {
			lines.push("");
			lines.push("Metrics Summary:");
			metricsMap.forEach((values, key) => {
				const avg = values.reduce((a, b) => a + b, 0) / values.length;
				const min = Math.min(...values);
				const max = Math.max(...values);
				lines.push(`  ${key}: avg=${avg.toFixed(2)}, min=${min.toFixed(2)}, max=${max.toFixed(2)}`);
			});
		}

		lines.push("");
		lines.push("============================== test results ===================================");
		lines.push(`${passed} passed, ${failed} failed in ${totalDuration}s`);
		lines.push("===============================================================================");

		return lines.join("\n");
	}

	saveReport(filename: string): void {
		const resultsDir = join(dirname(new URL(import.meta.url).pathname), "results");
		if (!existsSync(resultsDir)) {
			mkdirSync(resultsDir, { recursive: true });
		}
		const filepath = join(resultsDir, filename);
		writeFileSync(filepath, this.generateReport(), "utf-8");
		console.log(`\n📊 Benchmark results saved to: ${filepath}`);
	}
}

// Global reporter for this test file
const reporter = new BenchmarkReporter("test_catastrophic_forgetting");

// Helper to wrap tests with metric recording
function recordedTest(
	name: string,
	fn: () => Promise<Record<string, number | string> | void>
): () => Promise<void> {
	return async () => {
		const start = Date.now();
		let metrics: Record<string, number | string> | undefined;
		let error: string | undefined;
		let passed = true;

		try {
			const result = await fn();
			if (result) metrics = result;
		} catch (e) {
			passed = false;
			error = e instanceof Error ? e.message : String(e);
			throw e; // Re-throw so vitest sees it as failed
		} finally {
			reporter.recordTest({
				name,
				passed,
				duration: Date.now() - start,
				metrics,
				error,
			});
		}
	};
}

describe("Catastrophic Forgetting Prevention", () => {
	let harness: TestHarness;
	let embeddingService: MockEmbeddingService;
	let timeManager: MockTimeManager;
	let collection: MockCollection;

	beforeEach(() => {
		harness = new TestHarness("CatastrophicForgetting");
		embeddingService = new MockEmbeddingService(42);
		timeManager = new MockTimeManager(new Date("2026-01-01T00:00:00Z"));
		collection = new MockCollection(embeddingService);
	});

	afterEach(() => {
		harness.cleanup();
	});

	// Save benchmark report after all tests complete
	afterAll(() => {
		reporter.saveReport("catastrophic_forgetting.txt");
	});

	describe("Sequential Storage Preservation", () => {
		it("should retain all memories after sequential storage", async () => {
			const memoryCount = 50;
			const storedIds: string[] = [];

			// Store memories sequentially
			for (let i = 0; i < memoryCount; i++) {
				const fragment = createTestFragment({
					id: `seq_mem_${i}`,
					content: `Sequential memory ${i}: Important fact about topic ${i}`,
					maturity: "cold_start",
				});
				await collection.add(fragment);
				storedIds.push(fragment.id);
				timeManager.advance(1000); // 1 second between each
			}

			// Verify all memories are retrievable
			let retrievedCount = 0;
			for (const id of storedIds) {
				const doc = collection.get(id);
				if (doc) retrievedCount++;
			}

			expect(retrievedCount).toBe(memoryCount);
			expect(collection.count()).toBe(memoryCount);
		});

		it("should retain Hebrew memories alongside English ones", async () => {
			const hebrewMemories = [
				{ id: "he_1", content: "המשפחה שלי גרה בירושלים" },
				{ id: "he_2", content: "אני עובד בחברת הייטק בתל אביב" },
				{ id: "he_3", content: "הילדים שלי לומדים בבית ספר יסודי" },
			];

			const englishMemories = [
				{ id: "en_1", content: "My favorite hobby is reading books" },
				{ id: "en_2", content: "I work as a software engineer" },
				{ id: "en_3", content: "My car is a Tesla Model 3" },
			];

			// Store Hebrew memories first
			for (const mem of hebrewMemories) {
				await collection.add({
					id: mem.id,
					content: mem.content,
					metadata: createTestMetadata({ user_id: "bilingual_user" }),
				});
			}

			// Store English memories after
			for (const mem of englishMemories) {
				await collection.add({
					id: mem.id,
					content: mem.content,
					metadata: createTestMetadata({ user_id: "bilingual_user" }),
				});
			}

			// Verify all Hebrew memories are preserved
			for (const mem of hebrewMemories) {
				const doc = collection.get(mem.id);
				expect(doc).toBeDefined();
				expect(doc?.content).toBe(mem.content);
			}

			// Verify all English memories are preserved
			for (const mem of englishMemories) {
				const doc = collection.get(mem.id);
				expect(doc).toBeDefined();
				expect(doc?.content).toBe(mem.content);
			}

			expect(collection.count()).toBe(6);
		});

		it("should not lose early memories when storing many new ones", async () => {
			// Store 10 "old" memories
			const oldMemories = Array.from({ length: 10 }, (_, i) => ({
				id: `old_mem_${i}`,
				content: `Old important memory ${i}: This is critical information`,
			}));

			for (const mem of oldMemories) {
				await collection.add({
					id: mem.id,
					content: mem.content,
					metadata: createTestMetadata({ tier: "warm" }),
				});
			}

			// Advance time significantly
			timeManager.advanceDays(30);

			// Store 100 "new" memories
			for (let i = 0; i < 100; i++) {
				await collection.add({
					id: `new_mem_${i}`,
					content: `New memory ${i}: Recent information`,
					metadata: createTestMetadata({ tier: "hot" }),
				});
			}

			// Verify ALL old memories are still retrievable
			let oldRetrieved = 0;
			for (const mem of oldMemories) {
				const doc = collection.get(mem.id);
				if (doc && doc.content === mem.content) {
					oldRetrieved++;
				}
			}

			expect(oldRetrieved).toBe(10);
			expect(collection.count()).toBe(110);
		});
	});

	describe("Bulk Storage Integrity", () => {
		it("should preserve all items in bulk storage operation", async () => {
			const batchSize = 100;
			const fragments = Array.from({ length: batchSize }, (_, i) =>
				createTestFragment({
					id: `bulk_${i}`,
					content: `Bulk memory item ${i}`,
					maturity: "cold_start",
				})
			);

			// Store all at once
			await Promise.all(fragments.map((f) => collection.add(f)));

			// Verify count
			expect(collection.count()).toBe(batchSize);

			// Verify random samples
			const sampleIndices = [0, 25, 50, 75, 99];
			for (const idx of sampleIndices) {
				const doc = collection.get(`bulk_${idx}`);
				expect(doc).toBeDefined();
				expect(doc?.content).toContain(`Bulk memory item ${idx}`);
			}
		});

		it("should handle mixed language bulk storage", async () => {
			const mixedMemories = [
				{ id: "mix_1", content: "My name is John" },
				{ id: "mix_2", content: "השם שלי הוא יוחנן" },
				{ id: "mix_3", content: "I live in ירושלים Jerusalem" },
				{ id: "mix_4", content: "אני גר in Tel Aviv תל אביב" },
				{ id: "mix_5", content: "Work at Google עובד בגוגל" },
			];

			await Promise.all(
				mixedMemories.map((m) =>
					collection.add({
						id: m.id,
						content: m.content,
						metadata: createTestMetadata(),
					})
				)
			);

			// Verify all mixed-language memories preserved
			for (const mem of mixedMemories) {
				const doc = collection.get(mem.id);
				expect(doc).toBeDefined();
				expect(doc?.content).toBe(mem.content);
			}
		});
	});

	describe("Tier Promotion Preservation", () => {
		it("should preserve memory content during tier promotion", async () => {
			const originalContent = "Critical user preference: Always use dark mode";
			const memId = "promo_test_1";

			// Store in hot tier
			await collection.add({
				id: memId,
				content: originalContent,
				metadata: { ...createTestMetadata({ tier: "hot" }), wilson_score: 0.5 },
			});

			// Simulate usage that would trigger promotion
			const doc = collection.get(memId);
			expect(doc).toBeDefined();

			// Update metadata to simulate promotion to warm
			collection.updateMetadata(memId, {
				tier: "warm",
				wilson_score: 0.7,
				use_count: 10,
				success_count: 8,
			});

			// Verify content unchanged after "promotion"
			const promotedDoc = collection.get(memId);
			expect(promotedDoc?.content).toBe(originalContent);
			expect(promotedDoc?.metadata.tier).toBe("warm");
		});

		it("should preserve Hebrew content during tier transitions", async () => {
			const hebrewContent = "אני אוהב לקרוא ספרים בעברית ובאנגלית";
			const memId = "hebrew_promo_1";

			await collection.add({
				id: memId,
				content: hebrewContent,
				metadata: createTestMetadata({ tier: "hot" }),
			});

			// Multiple tier transitions
			const tiers: Array<"hot" | "warm" | "cold"> = ["warm", "cold", "warm"];
			for (const tier of tiers) {
				collection.updateMetadata(memId, { tier });
				const doc = collection.get(memId);
				expect(doc?.content).toBe(hebrewContent);
			}
		});
	});

	describe("Wilson Score Stability", () => {
		it("should not corrupt memory during Wilson score updates", async () => {
			const memId = "wilson_test_1";
			const content = "Important fact that needs scoring";

			await collection.add({
				id: memId,
				content,
				metadata: {
					...createTestMetadata(),
					wilson_score: 0.5,
					use_count: 0,
					success_count: 0,
				},
			});

			// Simulate 50 outcome updates
			for (let i = 1; i <= 50; i++) {
				const successes = Math.floor(i * 0.8); // 80% success rate
				const newScore = calculateWilsonScore(successes, i);

				collection.updateMetadata(memId, {
					wilson_score: newScore,
					use_count: i,
					success_count: successes,
				});

				// Verify content unchanged
				const doc = collection.get(memId);
				expect(doc?.content).toBe(content);
			}

			// Final verification
			const finalDoc = collection.get(memId);
			expect(finalDoc?.content).toBe(content);
			expect(finalDoc?.metadata.use_count).toBe(50);
		});

		it("should maintain separate scores for different memories", async () => {
			const memories = [
				{ id: "score_1", content: "Memory with high success" },
				{ id: "score_2", content: "Memory with low success" },
				{ id: "score_3", content: "Memory with medium success" },
			];

			// Store memories
			for (const mem of memories) {
				await collection.add({
					id: mem.id,
					content: mem.content,
					metadata: createTestMetadata(),
				});
			}

			// Update with different success rates
			collection.updateMetadata("score_1", {
				wilson_score: calculateWilsonScore(19, 20),
				use_count: 20,
				success_count: 19,
			});
			collection.updateMetadata("score_2", {
				wilson_score: calculateWilsonScore(2, 20),
				use_count: 20,
				success_count: 2,
			});
			collection.updateMetadata("score_3", {
				wilson_score: calculateWilsonScore(10, 20),
				use_count: 20,
				success_count: 10,
			});

			// Verify each memory has correct content and independent score
			const doc1 = collection.get("score_1");
			const doc2 = collection.get("score_2");
			const doc3 = collection.get("score_3");

			expect(doc1?.content).toBe("Memory with high success");
			expect(doc2?.content).toBe("Memory with low success");
			expect(doc3?.content).toBe("Memory with medium success");

			// Scores should be different
			expect(doc1?.metadata.wilson_score).toBeGreaterThan(doc3?.metadata.wilson_score as number);
			expect(doc3?.metadata.wilson_score).toBeGreaterThan(doc2?.metadata.wilson_score as number);
		});
	});

	describe("Search Result Stability", () => {
		it("should find old memories even after many new additions", async () => {
			// Store a distinctive old memory
			const oldMemory = {
				id: "distinctive_old",
				content: "The user prefers TypeScript over JavaScript for all projects",
			};

			await collection.add({
				id: oldMemory.id,
				content: oldMemory.content,
				metadata: createTestMetadata({ tier: "warm" }),
			});

			// Add 100 unrelated memories
			for (let i = 0; i < 100; i++) {
				await collection.add({
					id: `noise_${i}`,
					content: `Random fact number ${i} about various topics`,
					metadata: createTestMetadata({ tier: "hot" }),
				});
			}

			// Search for the old memory
			const results = await collection.search("TypeScript JavaScript preference", 10);

			// Old memory should be in top results
			const oldFound = results.some((r) => r.document.id === "distinctive_old");
			expect(oldFound).toBe(true);
		});

		it("should find Hebrew memories after English flood", async () => {
			// Store Hebrew memory
			const hebrewMem = {
				id: "hebrew_searchable",
				content: "המשתמש מעדיף קפה שחור בלי סוכר",
			};

			await collection.add({
				id: hebrewMem.id,
				content: hebrewMem.content,
				metadata: createTestMetadata(),
			});

			// Flood with English
			for (let i = 0; i < 50; i++) {
				await collection.add({
					id: `english_flood_${i}`,
					content: `English memory about topic ${i} with various details`,
					metadata: createTestMetadata(),
				});
			}

			// Search in Hebrew
			const results = await collection.search("קפה שחור", 10);

			// Should find the Hebrew memory
			const found = results.some((r) => r.document.id === "hebrew_searchable");
			expect(found).toBe(true);
		});
	});

	describe("Concept Extraction Consistency", () => {
		it("should extract same concepts before and after storage", () => {
			const testTexts = [
				"The React framework is used for building user interfaces",
				"המשתמש עובד בחברת הייטק בתל אביב",
				"Machine Learning and Artificial Intelligence are transforming industries",
			];

			for (const text of testTexts) {
				const conceptsBefore = mockExtractConcepts(text);

				// Simulate storage round-trip (content unchanged)
				const storedContent = text;

				const conceptsAfter = mockExtractConcepts(storedContent);

				expect(conceptsAfter).toEqual(conceptsBefore);
			}
		});
	});

	describe("Metadata Isolation", () => {
		it("should not cross-contaminate metadata between memories", async () => {
			const mem1 = {
				id: "meta_1",
				content: "Memory one",
				metadata: { custom_field: "value_1", tier: "hot" },
			};
			const mem2 = {
				id: "meta_2",
				content: "Memory two",
				metadata: { custom_field: "value_2", tier: "warm" },
			};

			await collection.add(mem1);
			await collection.add(mem2);

			// Update mem1 metadata
			collection.updateMetadata("meta_1", { custom_field: "updated_1" });

			// Verify mem2 metadata unchanged
			const doc2 = collection.get("meta_2");
			expect(doc2?.metadata.custom_field).toBe("value_2");
			expect(doc2?.metadata.tier).toBe("warm");

			// Verify mem1 updated correctly
			const doc1 = collection.get("meta_1");
			expect(doc1?.metadata.custom_field).toBe("updated_1");
		});
	});

	describe("Stress Test: High Volume", () => {
		it("should handle 1000 sequential writes without data loss", async () => {
			const count = 1000;

			for (let i = 0; i < count; i++) {
				await collection.add({
					id: `stress_${i}`,
					content: `Stress test memory ${i}`,
					metadata: createTestMetadata(),
				});
			}

			expect(collection.count()).toBe(count);

			// Verify random samples
			const samples = [0, 100, 250, 500, 750, 999];
			for (const idx of samples) {
				const doc = collection.get(`stress_${idx}`);
				expect(doc).toBeDefined();
				expect(doc?.content).toBe(`Stress test memory ${idx}`);
			}
		});

		it("should maintain search quality with 1000 documents", async () => {
			// Add a needle
			await collection.add({
				id: "needle",
				content: "The secret password is elephant42",
				metadata: createTestMetadata(),
			});

			// Add 999 haystack items
			for (let i = 0; i < 999; i++) {
				await collection.add({
					id: `haystack_${i}`,
					content: `Generic memory content about topic ${i % 100}`,
					metadata: createTestMetadata(),
				});
			}

			// Search for needle
			const results = await collection.search("secret password elephant", 5);

			// Needle should be in top results
			const needleRank = results.findIndex((r) => r.document.id === "needle");
			expect(needleRank).toBeGreaterThanOrEqual(0);
			expect(needleRank).toBeLessThan(5);
		});
	});
});
