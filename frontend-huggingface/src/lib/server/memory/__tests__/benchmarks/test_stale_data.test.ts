/**
 * Stale Data Tests
 *
 * Tests how the memory system handles outdated information.
 * Enterprise-grade memory must properly age, expire, and refresh data.
 *
 * Test Scenarios:
 * 1. TTL expiration detection
 * 2. Freshness scoring based on age
 * 3. Automatic staleness flagging
 * 4. Update vs replace decisions
 * 5. Tombstone handling for deleted items
 * 6. Bilingual staleness (Hebrew + English)
 *
 * Output: Generates benchmark results to benchmarks/results/stale_data.txt
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import {
	MockEmbeddingService,
	MockTimeManager,
	MockCollection,
	TestHarness,
	createTestMetadata,
	calculateWilsonScore,
	BenchmarkReporter,
} from "../mock-utilities";

// Global reporter for this test file
const reporter = new BenchmarkReporter("test_stale_data");

// Helper to record test metrics
function recordTest(
	name: string,
	passed: boolean,
	duration: number,
	metrics?: Record<string, number | string>,
	error?: string
): void {
	reporter.recordTest({ name, passed, duration, metrics, error });
}

// TTL constants (in milliseconds)
const TTL_SHORT = 1000 * 60 * 60; // 1 hour
const TTL_MEDIUM = 1000 * 60 * 60 * 24; // 1 day
const TTL_LONG = 1000 * 60 * 60 * 24 * 30; // 30 days

describe("Stale Data Handling", () => {
	let harness: TestHarness;
	let embeddingService: MockEmbeddingService;
	let timeManager: MockTimeManager;
	let collection: MockCollection;

	beforeEach(() => {
		harness = new TestHarness("StaleData");
		embeddingService = new MockEmbeddingService(42);
		timeManager = new MockTimeManager(new Date("2026-01-01T00:00:00Z"));
		collection = new MockCollection(embeddingService);
	});

	afterEach(() => {
		harness.cleanup();
	});

	afterAll(() => {
		reporter.saveReport("stale_data.txt");
	});

	describe("TTL Expiration", () => {
		it("test_ttl_expiration_detection", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const baseTime = new Date("2026-01-01T00:00:00Z").getTime();

				// Store items with different TTLs
				await collection.add({
					id: "short_ttl",
					content: "User prefers email communication",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime).toISOString(),
						ttl_ms: TTL_SHORT,
						expires_at: new Date(baseTime + TTL_SHORT).toISOString(),
					},
				});

				await collection.add({
					id: "medium_ttl",
					content: "User works at TechCorp",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime).toISOString(),
						ttl_ms: TTL_MEDIUM,
						expires_at: new Date(baseTime + TTL_MEDIUM).toISOString(),
					},
				});

				await collection.add({
					id: "long_ttl",
					content: "User birthday is March 15",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime).toISOString(),
						ttl_ms: TTL_LONG,
						expires_at: new Date(baseTime + TTL_LONG).toISOString(),
					},
				});

				// Check at different time points
				const checkExpired = (
					docs: Array<{ document: { id: string; metadata: Record<string, unknown> } }>,
					checkTime: number
				): number => {
					return docs.filter((d) => {
						const expiresAt = d.document.metadata.expires_at;
						if (typeof expiresAt === "string") {
							return new Date(expiresAt).getTime() < checkTime;
						}
						return false;
					}).length;
				};

				const results = await collection.search("user preferences", 10);

				// After 2 hours - short TTL should be expired
				const after2Hours = baseTime + 2 * 60 * 60 * 1000;
				const expiredAt2Hours = checkExpired(results, after2Hours);

				// After 2 days - short and medium TTL should be expired
				const after2Days = baseTime + 2 * 24 * 60 * 60 * 1000;
				const expiredAt2Days = checkExpired(results, after2Days);

				// After 60 days - all should be expired
				const after60Days = baseTime + 60 * 24 * 60 * 60 * 1000;
				const expiredAt60Days = checkExpired(results, after60Days);

				metrics = {
					total_items: results.length,
					expired_at_2_hours: expiredAt2Hours,
					expired_at_2_days: expiredAt2Days,
					expired_at_60_days: expiredAt60Days,
				};

				expect(expiredAt2Hours).toBe(1); // short_ttl
				expect(expiredAt2Days).toBe(2); // short + medium
				expect(expiredAt60Days).toBe(3); // all
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_ttl_expiration_detection", passed, Date.now() - start, metrics);
			}
		});

		it("test_hebrew_ttl_expiration", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const baseTime = new Date("2026-01-01T00:00:00Z").getTime();

				// Hebrew content with TTL
				await collection.add({
					id: "he_short_ttl",
					content: "המשתמש מעדיף תקשורת בעברית",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime).toISOString(),
						ttl_ms: TTL_SHORT,
						expires_at: new Date(baseTime + TTL_SHORT).toISOString(),
						language: "he",
					},
				});

				await collection.add({
					id: "he_long_ttl",
					content: "יום ההולדת של המשתמש בחודש מרץ",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime).toISOString(),
						ttl_ms: TTL_LONG,
						expires_at: new Date(baseTime + TTL_LONG).toISOString(),
						language: "he",
					},
				});

				const results = await collection.search("העדפות משתמש", 10);

				metrics = {
					hebrew_items_found: results.length,
					with_ttl: results.filter((r) => r.document.metadata.ttl_ms).length,
				};

				expect(results.length).toBeGreaterThanOrEqual(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_hebrew_ttl_expiration", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Freshness Scoring", () => {
		it("test_freshness_score_calculation", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const baseTime = new Date("2026-01-01T00:00:00Z").getTime();

				// Calculate freshness score (1.0 = brand new, 0.0 = very stale)
				const calculateFreshnessScore = (createdAt: number, now: number, ttlMs: number): number => {
					const age = now - createdAt;
					if (age >= ttlMs) return 0;
					return 1 - age / ttlMs;
				};

				// Store items at different ages
				const items = [
					{ id: "fresh", content: "Just learned user likes coffee", age: 0 },
					{ id: "recent", content: "User mentioned working late", age: TTL_MEDIUM * 0.25 },
					{ id: "aging", content: "User prefers morning meetings", age: TTL_MEDIUM * 0.5 },
					{ id: "stale", content: "User used to like tea", age: TTL_MEDIUM * 0.75 },
					{ id: "expired", content: "User old preference", age: TTL_MEDIUM * 1.1 },
				];

				for (const item of items) {
					const createdAt = baseTime - item.age;
					await collection.add({
						id: item.id,
						content: item.content,
						metadata: {
							...createTestMetadata(),
							created_at: new Date(createdAt).toISOString(),
							ttl_ms: TTL_MEDIUM,
							freshness_score: calculateFreshnessScore(createdAt, baseTime, TTL_MEDIUM),
						},
					});
				}

				const results = await collection.search("user preferences", 10);

				// Calculate average freshness
				const freshnessScores = results.map((r) => {
					const score = r.document.metadata.freshness_score;
					return typeof score === "number" ? score : 0;
				});
				const avgFreshness = freshnessScores.reduce((a, b) => a + b, 0) / freshnessScores.length;

				// Count items by freshness tier
				const fresh = freshnessScores.filter((s) => s > 0.75).length;
				const aging = freshnessScores.filter((s) => s > 0.25 && s <= 0.75).length;
				const stale = freshnessScores.filter((s) => s > 0 && s <= 0.25).length;
				const expired = freshnessScores.filter((s) => s === 0).length;

				metrics = {
					total_items: results.length,
					avg_freshness: Math.round(avgFreshness * 100) / 100,
					fresh_count: fresh,
					aging_count: aging,
					stale_count: stale,
					expired_count: expired,
				};

				// Verify freshness distribution
				expect(results.length).toBe(5);
				expect(fresh).toBeGreaterThanOrEqual(1);
				expect(expired).toBeGreaterThanOrEqual(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_freshness_score_calculation", passed, Date.now() - start, metrics);
			}
		});

		it("test_freshness_weighted_search", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const baseTime = new Date("2026-01-01T00:00:00Z").getTime();

				// Two semantically similar items with different freshness
				await collection.add({
					id: "old_address",
					content: "User lives in New York",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime - TTL_LONG).toISOString(),
						freshness_score: 0.1,
					},
				});

				await collection.add({
					id: "new_address",
					content: "User moved to San Francisco",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime - TTL_SHORT).toISOString(),
						freshness_score: 0.9,
					},
				});

				const results = await collection.search("where does user live", 2);

				// Both should be found
				const foundOld = results.some((r) => r.document.id === "old_address");
				const foundNew = results.some((r) => r.document.id === "new_address");

				metrics = {
					found_old: foundOld ? 1 : 0,
					found_new: foundNew ? 1 : 0,
					total_results: results.length,
				};

				expect(results.length).toBe(2);
				expect(foundNew).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_freshness_weighted_search", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Automatic Staleness Flagging", () => {
		it("test_auto_staleness_detection", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const baseTime = new Date("2026-01-01T00:00:00Z").getTime();

				// Store items that become stale based on content type
				const contentTypes = [
					{
						id: "weather",
						content: "Weather in Tel Aviv is sunny",
						ttl: TTL_SHORT,
						type: "ephemeral",
					},
					{
						id: "schedule",
						content: "User has meeting at 3pm today",
						ttl: TTL_SHORT,
						type: "ephemeral",
					},
					{
						id: "preference",
						content: "User prefers dark mode",
						ttl: TTL_MEDIUM,
						type: "preference",
					},
					{ id: "fact", content: "User was born in 1990", ttl: TTL_LONG, type: "fact" },
					{ id: "identity", content: "User name is John", ttl: TTL_LONG * 12, type: "identity" },
				];

				for (const item of contentTypes) {
					await collection.add({
						id: item.id,
						content: item.content,
						metadata: {
							...createTestMetadata(),
							created_at: new Date(baseTime - item.ttl * 0.8).toISOString(),
							ttl_ms: item.ttl,
							content_type: item.type,
							is_stale: false,
						},
					});
				}

				// Check staleness after time passes
				const results = await collection.search("user information", 10);

				// Simulate staleness check after 2 days
				const checkTime = baseTime + 2 * 24 * 60 * 60 * 1000;
				const staleItems = results.filter((r) => {
					const createdAt = new Date(r.document.metadata.created_at as string).getTime();
					const ttl = r.document.metadata.ttl_ms as number;
					return checkTime - createdAt > ttl * 0.9; // 90% of TTL = nearly stale
				});

				metrics = {
					total_items: results.length,
					stale_after_2_days: staleItems.length,
					ephemeral_items: contentTypes.filter((c) => c.type === "ephemeral").length,
				};

				expect(staleItems.length).toBeGreaterThanOrEqual(2); // ephemeral items should be stale
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_auto_staleness_detection", passed, Date.now() - start, metrics);
			}
		});

		it("test_hebrew_staleness_flagging", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const baseTime = new Date("2026-01-01T00:00:00Z").getTime();

				// Hebrew content with staleness indicators
				await collection.add({
					id: "he_ephemeral",
					content: "מזג האוויר בתל אביב שמשי",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime - TTL_SHORT * 2).toISOString(),
						ttl_ms: TTL_SHORT,
						content_type: "ephemeral",
						language: "he",
					},
				});

				await collection.add({
					id: "he_fact",
					content: "המשתמש נולד בשנת 1990",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime - TTL_MEDIUM).toISOString(),
						ttl_ms: TTL_LONG,
						content_type: "fact",
						language: "he",
					},
				});

				const results = await collection.search("מידע על המשתמש", 10);

				const staleHebrew = results.filter((r) => {
					const createdAt = new Date(r.document.metadata.created_at as string).getTime();
					const ttl = r.document.metadata.ttl_ms as number;
					return baseTime - createdAt > ttl;
				});

				metrics = {
					hebrew_items: results.length,
					stale_hebrew: staleHebrew.length,
				};

				expect(results.length).toBeGreaterThanOrEqual(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_hebrew_staleness_flagging", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Update vs Replace Decisions", () => {
		it("test_update_vs_replace", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const baseTime = new Date("2026-01-01T00:00:00Z").getTime();

				// Original fact
				await collection.add({
					id: "job_v1",
					content: "User works at Google",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime - TTL_MEDIUM).toISOString(),
						version: 1,
						update_type: "original",
					},
				});

				// Update (same entity, new value) - should replace
				await collection.add({
					id: "job_v2",
					content: "User now works at Meta",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime - TTL_SHORT).toISOString(),
						version: 2,
						update_type: "replacement",
						replaces: "job_v1",
					},
				});

				// Addition (new information) - should coexist
				await collection.add({
					id: "job_side",
					content: "User also freelances on weekends",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime).toISOString(),
						version: 1,
						update_type: "addition",
						related_to: "job_v2",
					},
				});

				const results = await collection.search("user job employment", 5);

				const hasV1 = results.some((r) => r.document.id === "job_v1");
				const hasV2 = results.some((r) => r.document.id === "job_v2");
				const hasSide = results.some((r) => r.document.id === "job_side");

				// Count by update type
				const replacements = results.filter(
					(r) => r.document.metadata.update_type === "replacement"
				).length;
				const additions = results.filter(
					(r) => r.document.metadata.update_type === "addition"
				).length;

				metrics = {
					total_results: results.length,
					has_original: hasV1 ? 1 : 0,
					has_replacement: hasV2 ? 1 : 0,
					has_addition: hasSide ? 1 : 0,
					replacement_count: replacements,
					addition_count: additions,
				};

				// All versions should be retrievable (filtering is application-level)
				expect(results.length).toBeGreaterThanOrEqual(2);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_update_vs_replace", passed, Date.now() - start, metrics);
			}
		});

		it("test_bilingual_update_chain", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const baseTime = new Date("2026-01-01T00:00:00Z").getTime();

				// English original
				await collection.add({
					id: "location_en_v1",
					content: "User lives in Jerusalem",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime - TTL_LONG).toISOString(),
						version: 1,
						language: "en",
					},
				});

				// Hebrew update
				await collection.add({
					id: "location_he_v2",
					content: "המשתמש עבר לתל אביב",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime - TTL_MEDIUM).toISOString(),
						version: 2,
						language: "he",
						replaces: "location_en_v1",
					},
				});

				// English confirmation
				await collection.add({
					id: "location_en_v3",
					content: "User confirmed living in Tel Aviv",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime).toISOString(),
						version: 3,
						language: "en",
						confirms: "location_he_v2",
					},
				});

				// Search in both languages
				const enResults = await collection.search("where does user live", 5);
				const heResults = await collection.search("איפה המשתמש גר", 5);

				metrics = {
					english_search_results: enResults.length,
					hebrew_search_results: heResults.length,
					total_versions: 3,
				};

				expect(enResults.length).toBeGreaterThanOrEqual(1);
				expect(heResults.length).toBeGreaterThanOrEqual(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_bilingual_update_chain", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Tombstone Handling", () => {
		it("test_tombstone_for_deleted_items", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const baseTime = new Date("2026-01-01T00:00:00Z").getTime();

				// Original item
				await collection.add({
					id: "deleted_item",
					content: "User mentioned having a cat",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime - TTL_MEDIUM).toISOString(),
						status: "active",
					},
				});

				// Tombstone for deleted item
				await collection.add({
					id: "deleted_item_tombstone",
					content: "[DELETED] User mentioned having a cat",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime).toISOString(),
						status: "tombstone",
						original_id: "deleted_item",
						deletion_reason: "user_requested",
						deleted_at: new Date(baseTime).toISOString(),
					},
				});

				// Item that should still be active
				await collection.add({
					id: "active_item",
					content: "User has a dog named Max",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime).toISOString(),
						status: "active",
					},
				});

				const results = await collection.search("user pets", 5);

				const activeItems = results.filter((r) => r.document.metadata.status === "active");
				const tombstones = results.filter((r) => r.document.metadata.status === "tombstone");

				metrics = {
					total_results: results.length,
					active_items: activeItems.length,
					tombstones: tombstones.length,
				};

				// Both active and tombstone should be retrievable
				expect(results.length).toBeGreaterThanOrEqual(1);
				expect(activeItems.length).toBeGreaterThanOrEqual(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_tombstone_for_deleted_items", passed, Date.now() - start, metrics);
			}
		});

		it("test_hebrew_tombstone", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const baseTime = new Date("2026-01-01T00:00:00Z").getTime();

				// Hebrew deleted item with tombstone
				await collection.add({
					id: "he_deleted",
					content: "[נמחק] המשתמש הזכיר שיש לו חתול",
					metadata: {
						...createTestMetadata(),
						status: "tombstone",
						language: "he",
						deleted_at: new Date(baseTime).toISOString(),
					},
				});

				await collection.add({
					id: "he_active",
					content: "למשתמש יש כלב בשם מקס",
					metadata: {
						...createTestMetadata(),
						status: "active",
						language: "he",
					},
				});

				const results = await collection.search("חיות מחמד של המשתמש", 5);

				metrics = {
					hebrew_results: results.length,
					hebrew_tombstones: results.filter((r) => r.document.metadata.status === "tombstone")
						.length,
				};

				expect(results.length).toBeGreaterThanOrEqual(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_hebrew_tombstone", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Data Decay Simulation", () => {
		it("test_access_frequency_decay", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const baseTime = new Date("2026-01-01T00:00:00Z").getTime();

				// Items with different access patterns
				await collection.add({
					id: "frequently_accessed",
					content: "User favorite restaurant is Cafe Tel Aviv",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime - TTL_LONG).toISOString(),
						access_count: 50,
						last_accessed: new Date(baseTime - TTL_SHORT * 0.1).toISOString(),
					},
				});

				await collection.add({
					id: "rarely_accessed",
					content: "User once visited a restaurant in Haifa",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime - TTL_LONG).toISOString(),
						access_count: 2,
						last_accessed: new Date(baseTime - TTL_MEDIUM).toISOString(),
					},
				});

				await collection.add({
					id: "never_accessed",
					content: "User mentioned a food place long ago",
					metadata: {
						...createTestMetadata(),
						created_at: new Date(baseTime - TTL_LONG).toISOString(),
						access_count: 0,
						last_accessed: null,
					},
				});

				const results = await collection.search("user restaurant", 5);

				// Calculate decay scores
				const decayScores = results.map((r) => {
					const accessCount = (r.document.metadata.access_count as number) || 0;
					const lastAccessed = r.document.metadata.last_accessed;
					const accessRecency = lastAccessed
						? 1 - (baseTime - new Date(lastAccessed as string).getTime()) / TTL_LONG
						: 0;
					return Math.max(0, (accessCount / 50) * 0.5 + Math.max(0, accessRecency) * 0.5);
				});

				const avgDecayScore = decayScores.reduce((a, b) => a + b, 0) / decayScores.length;

				metrics = {
					total_results: results.length,
					avg_decay_score: Math.round(avgDecayScore * 100) / 100,
					high_access_count: results.filter(
						(r) => (r.document.metadata.access_count as number) > 10
					).length,
					low_access_count: results.filter((r) => (r.document.metadata.access_count as number) <= 2)
						.length,
				};

				expect(results.length).toBeGreaterThanOrEqual(2);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_access_frequency_decay", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Summary Test", () => {
		it("test_stale_data", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const baseTime = new Date("2026-01-01T00:00:00Z").getTime();

				// Comprehensive stale data test
				const testData = [
					// Fresh data
					{ id: "s1", content: "User just said they like pizza", age: 0, ttl: TTL_MEDIUM },
					{ id: "s2", content: "המשתמש אמר שהוא אוהב פיצה", age: 0, ttl: TTL_MEDIUM },
					// Aging data
					{
						id: "s3",
						content: "User mentioned coffee preference",
						age: TTL_MEDIUM * 0.5,
						ttl: TTL_MEDIUM,
					},
					{ id: "s4", content: "המשתמש הזכיר העדפת קפה", age: TTL_MEDIUM * 0.5, ttl: TTL_MEDIUM },
					// Stale data
					{ id: "s5", content: "User used to like tea", age: TTL_MEDIUM * 1.5, ttl: TTL_MEDIUM },
					{ id: "s6", content: "המשתמש פעם אהב תה", age: TTL_MEDIUM * 1.5, ttl: TTL_MEDIUM },
					// Tombstoned
					{
						id: "s7",
						content: "[DELETED] Old preference",
						age: TTL_LONG,
						ttl: TTL_MEDIUM,
						status: "tombstone",
					},
					{
						id: "s8",
						content: "[נמחק] העדפה ישנה",
						age: TTL_LONG,
						ttl: TTL_MEDIUM,
						status: "tombstone",
					},
				];

				for (const item of testData) {
					await collection.add({
						id: item.id,
						content: item.content,
						metadata: {
							...createTestMetadata(),
							created_at: new Date(baseTime - item.age).toISOString(),
							ttl_ms: item.ttl,
							status: item.status || "active",
							freshness_score: Math.max(0, 1 - item.age / item.ttl),
						},
					});
				}

				const results = await collection.search("food preferences", 10);

				// Categorize by freshness
				const fresh = results.filter((r) => (r.document.metadata.freshness_score as number) > 0.5);
				const stale = results.filter(
					(r) =>
						(r.document.metadata.freshness_score as number) <= 0.5 &&
						r.document.metadata.status !== "tombstone"
				);
				const tombstones = results.filter((r) => r.document.metadata.status === "tombstone");

				// Check language distribution
				const hebrewItems = results.filter(
					(r) => (r.document.content as string).match(/[\u0590-\u05FF]/) !== null
				);

				metrics = {
					total_items: testData.length,
					retrieved: results.length,
					fresh_items: fresh.length,
					stale_items: stale.length,
					tombstones: tombstones.length,
					hebrew_items: hebrewItems.length,
					freshness_detection_working: fresh.length > 0 && stale.length > 0 ? 1 : 0,
				};

				// Should retrieve items and properly categorize them
				expect(results.length).toBeGreaterThanOrEqual(4);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_stale_data", passed, Date.now() - start, metrics);
			}
		});
	});
});
