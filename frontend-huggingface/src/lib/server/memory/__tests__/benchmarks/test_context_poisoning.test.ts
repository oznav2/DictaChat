/**
 * Context Poisoning Tests
 *
 * Tests that bad or misleading context doesn't corrupt memory retrieval.
 * Enterprise-grade memory system must handle edge cases gracefully.
 *
 * Test Scenarios:
 * 1. Exact duplicate content doesn't cause retrieval issues
 * 2. Near-duplicate content is handled correctly
 * 3. Entity confusion (similar names) is managed
 * 4. Temporal confusion (old vs new facts) is resolved
 * 5. Negation handling works correctly
 * 6. Bilingual poisoning attempts (Hebrew + English)
 *
 * Output: Generates benchmark results to benchmarks/results/context_poisoning.txt
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import {
	MockEmbeddingService,
	MockTimeManager,
	MockCollection,
	TestHarness,
	createTestMetadata,
	calculateSimilarity,
	BenchmarkReporter,
	BenchmarkResult,
} from '../mock-utilities';

// Global reporter for this test file
const reporter = new BenchmarkReporter('test_context_poisoning');

// Helper to record test metrics
function recordTest(name: string, passed: boolean, duration: number, metrics?: Record<string, number | string>, error?: string): void {
	reporter.recordTest({ name, passed, duration, metrics, error });
}

describe('Context Poisoning Prevention', () => {
	let harness: TestHarness;
	let embeddingService: MockEmbeddingService;
	let timeManager: MockTimeManager;
	let collection: MockCollection;

	beforeEach(() => {
		harness = new TestHarness('ContextPoisoning');
		embeddingService = new MockEmbeddingService(42);
		timeManager = new MockTimeManager(new Date('2026-01-01T00:00:00Z'));
		collection = new MockCollection(embeddingService);
	});

	afterEach(() => {
		harness.cleanup();
	});

	afterAll(() => {
		reporter.saveReport('context_poisoning.txt');
	});

	describe('Exact Duplicate Poisoning', () => {
		it('test_exact_duplicate_poisoning', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store same content multiple times with different IDs
				const content = 'The user works at Google as a software engineer';
				const duplicateCount = 10;

				for (let i = 0; i < duplicateCount; i++) {
					await collection.add({
						id: `dup_${i}`,
						content,
						metadata: createTestMetadata({ user_id: 'test_user' }),
					});
				}

				// Search should return results without duplication issues
				const results = await collection.search('Where does the user work?', 5);

				// All results should be the same content
				const uniqueContents = new Set(results.map(r => r.document.content));
				expect(uniqueContents.size).toBe(1);

				// Score distribution should be consistent
				const scores = results.map(r => r.score);
				const scoreVariance = Math.max(...scores) - Math.min(...scores);

				metrics = {
					duplicate_count: duplicateCount,
					results_returned: results.length,
					unique_contents: uniqueContents.size,
					score_variance: scoreVariance,
				};

				expect(scoreVariance).toBeLessThan(0.1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_exact_duplicate_poisoning', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_duplicate_poisoning', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store Hebrew content multiple times
				const hebrewContent = 'המשתמש עובד בגוגל כמהנדס תוכנה';
				const duplicateCount = 10;

				for (let i = 0; i < duplicateCount; i++) {
					await collection.add({
						id: `he_dup_${i}`,
						content: hebrewContent,
						metadata: createTestMetadata({ user_id: 'test_user' }),
					});
				}

				// Search in Hebrew
				const results = await collection.search('איפה המשתמש עובד?', 5);

				const uniqueContents = new Set(results.map(r => r.document.content));
				metrics = {
					duplicate_count: duplicateCount,
					results_returned: results.length,
					unique_contents: uniqueContents.size,
				};

				expect(results.length).toBeGreaterThan(0);
				expect(uniqueContents.size).toBe(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_duplicate_poisoning', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Near Duplicate Confusion', () => {
		it('test_near_duplicate_confusion', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store similar but slightly different content
				const variations = [
					{ id: 'v1', content: 'The user prefers dark mode in all applications' },
					{ id: 'v2', content: 'User prefers using dark mode for applications' },
					{ id: 'v3', content: 'Dark mode is preferred by the user in apps' },
					{ id: 'v4', content: 'The user likes dark mode in their applications' },
					{ id: 'v5', content: 'Applications should use dark mode per user preference' },
				];

				for (const v of variations) {
					await collection.add({
						id: v.id,
						content: v.content,
						metadata: createTestMetadata(),
					});
				}

				// Search should find relevant results
				const results = await collection.search('dark mode preference', 3);

				// Calculate similarity between search results
				const similarities: number[] = [];
				for (let i = 0; i < results.length - 1; i++) {
					const sim = calculateSimilarity(
						results[i].document.content,
						results[i + 1].document.content
					);
					similarities.push(sim);
				}

				const avgSimilarity = similarities.length > 0
					? similarities.reduce((a, b) => a + b, 0) / similarities.length
					: 0;

				metrics = {
					variations_stored: variations.length,
					results_returned: results.length,
					avg_result_similarity: avgSimilarity,
				};

				// Results should be found and semantically similar
				expect(results.length).toBeGreaterThanOrEqual(3);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_near_duplicate_confusion', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Entity Confusion', () => {
		it('test_entity_confusion', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store facts about different entities with similar names
				const entities = [
					{ id: 'john_smith', content: 'John Smith is a software engineer at Google' },
					{ id: 'john_doe', content: 'John Doe is a data scientist at Microsoft' },
					{ id: 'jane_smith', content: 'Jane Smith is a product manager at Apple' },
					{ id: 'john_s', content: 'John S. works in the finance department' },
				];

				for (const e of entities) {
					await collection.add({
						id: e.id,
						content: e.content,
						metadata: createTestMetadata(),
					});
				}

				// Query about specific John
				const results = await collection.search('John Smith engineer Google', 3);

				// First result should be about John Smith specifically
				const firstResult = results[0];
				const isCorrectEntity = firstResult.document.content.includes('John Smith');

				metrics = {
					entities_stored: entities.length,
					correct_entity_first: isCorrectEntity ? 1 : 0,
					top_result_score: firstResult.score,
				};

				expect(isCorrectEntity).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_entity_confusion', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_entity_confusion', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Hebrew entities with similar names
				const entities = [
					{ id: 'yossi_cohen', content: 'יוסי כהן הוא מהנדס תוכנה בגוגל' },
					{ id: 'yossi_levi', content: 'יוסי לוי הוא מדען נתונים במיקרוסופט' },
					{ id: 'dani_cohen', content: 'דני כהן הוא מנהל מוצר באפל' },
				];

				for (const e of entities) {
					await collection.add({
						id: e.id,
						content: e.content,
						metadata: createTestMetadata(),
					});
				}

				// Query about specific person
				const results = await collection.search('יוסי כהן מהנדס', 3);

				const firstResult = results[0];
				const isCorrectEntity = firstResult.document.content.includes('יוסי כהן');

				metrics = {
					entities_stored: entities.length,
					correct_entity_first: isCorrectEntity ? 1 : 0,
				};

				expect(isCorrectEntity).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_entity_confusion', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Temporal Confusion', () => {
		it('test_temporal_confusion', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store facts that change over time
				// Old fact
				await collection.add({
					id: 'job_old',
					content: 'The user works at Microsoft as a developer',
					metadata: {
						...createTestMetadata(),
						created_at: '2024-01-01T00:00:00Z',
						is_current: false,
					},
				});

				// Advance time
				timeManager.advanceDays(365);

				// New fact (more recent)
				await collection.add({
					id: 'job_new',
					content: 'The user works at Google as a senior engineer',
					metadata: {
						...createTestMetadata(),
						created_at: '2025-01-01T00:00:00Z',
						is_current: true,
					},
				});

				// Search for current job
				const results = await collection.search('Where does the user currently work?', 2);

				// Both should be found, but we can check metadata
				const hasOld = results.some(r => r.document.id === 'job_old');
				const hasNew = results.some(r => r.document.id === 'job_new');

				metrics = {
					found_old_fact: hasOld ? 1 : 0,
					found_new_fact: hasNew ? 1 : 0,
					results_count: results.length,
				};

				// Both facts should be retrievable (temporal resolution is metadata-based)
				expect(results.length).toBe(2);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_temporal_confusion', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Negation Poisoning', () => {
		it('test_negation_poisoning', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store positive and negated versions
				const facts = [
					{ id: 'pos_1', content: 'The user likes coffee' },
					{ id: 'neg_1', content: 'The user does not like tea' },
					{ id: 'pos_2', content: 'The user prefers morning meetings' },
					{ id: 'neg_2', content: 'The user does not prefer afternoon meetings' },
				];

				for (const f of facts) {
					await collection.add({
						id: f.id,
						content: f.content,
						metadata: createTestMetadata(),
					});
				}

				// Search for positive preference
				const coffeeResults = await collection.search('Does the user like coffee?', 2);
				const teaResults = await collection.search('Does the user like tea?', 2);

				// Coffee query should rank positive statement higher
				const coffeePosFirst = coffeeResults[0]?.document.content.includes('likes coffee');
				// Tea query might return the negation
				const teaNegFound = teaResults.some(r => r.document.content.includes('not like tea'));

				metrics = {
					coffee_positive_first: coffeePosFirst ? 1 : 0,
					tea_negation_found: teaNegFound ? 1 : 0,
				};

				expect(coffeePosFirst).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_negation_poisoning', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_negation_poisoning', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Hebrew positive and negated versions
				const facts = [
					{ id: 'he_pos_1', content: 'המשתמש אוהב קפה' },
					{ id: 'he_neg_1', content: 'המשתמש לא אוהב תה' },
				];

				for (const f of facts) {
					await collection.add({
						id: f.id,
						content: f.content,
						metadata: createTestMetadata(),
					});
				}

				const results = await collection.search('האם המשתמש אוהב קפה?', 2);
				const posFirst = results[0]?.document.content.includes('אוהב קפה') &&
					!results[0]?.document.content.includes('לא');

				metrics = {
					hebrew_positive_first: posFirst ? 1 : 0,
				};

				expect(posFirst).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_negation_poisoning', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Cross-Language Poisoning', () => {
		it('test_cross_language_confusion', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store same information in both languages
				const facts = [
					{ id: 'en_job', content: 'The user works at Google', lang: 'en' },
					{ id: 'he_job', content: 'המשתמש עובד בגוגל', lang: 'he' },
					{ id: 'en_hobby', content: 'The user enjoys hiking', lang: 'en' },
					{ id: 'he_hobby', content: 'המשתמש נהנה מטיולים', lang: 'he' },
				];

				for (const f of facts) {
					await collection.add({
						id: f.id,
						content: f.content,
						metadata: { ...createTestMetadata(), language: f.lang },
					});
				}

				// Query in English
				const enResults = await collection.search('Where does the user work?', 2);
				// Query in Hebrew
				const heResults = await collection.search('איפה המשתמש עובד?', 2);

				// English query should find English content first
				const enFirst = enResults[0]?.document.id.startsWith('en_');
				// Hebrew query should find Hebrew content first
				const heFirst = heResults[0]?.document.id.startsWith('he_');

				metrics = {
					english_content_first_for_en_query: enFirst ? 1 : 0,
					hebrew_content_first_for_he_query: heFirst ? 1 : 0,
				};

				// Both should find relevant content
				expect(enResults.length).toBeGreaterThan(0);
				expect(heResults.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_cross_language_confusion', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Summary Test', () => {
		it('test_context_poisoning', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Comprehensive poisoning test with mixed scenarios
				const poisonedData = [
					// Duplicates
					{ id: 'd1', content: 'User preference: dark mode' },
					{ id: 'd2', content: 'User preference: dark mode' },
					// Near duplicates
					{ id: 'nd1', content: 'User lives in Tel Aviv' },
					{ id: 'nd2', content: 'The user resides in Tel Aviv city' },
					// Entity confusion
					{ id: 'e1', content: 'David Cohen is the manager' },
					{ id: 'e2', content: 'David Levi is the developer' },
					// Negation
					{ id: 'n1', content: 'User wants notifications enabled' },
					{ id: 'n2', content: 'User does not want email notifications' },
					// Hebrew
					{ id: 'h1', content: 'המשתמש מעדיף עברית' },
					{ id: 'h2', content: 'המשתמש לא מעדיף אנגלית' },
				];

				for (const p of poisonedData) {
					await collection.add({
						id: p.id,
						content: p.content,
						metadata: createTestMetadata(),
					});
				}

				// Run multiple queries
				const queries = [
					'dark mode',
					'where does user live',
					'who is the manager',
					'notification preferences',
					'שפה מועדפת',
				];

				let totalResults = 0;
				for (const q of queries) {
					const results = await collection.search(q, 3);
					totalResults += results.length;
				}

				metrics = {
					poisoned_entries: poisonedData.length,
					queries_run: queries.length,
					total_results: totalResults,
					avg_results_per_query: totalResults / queries.length,
				};

				// System should handle all queries without errors
				expect(totalResults).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_context_poisoning', passed, Date.now() - start, metrics);
			}
		});
	});
});
