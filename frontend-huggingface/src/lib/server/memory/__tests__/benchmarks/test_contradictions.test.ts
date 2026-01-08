/**
 * Contradictions Tests
 *
 * Tests how the memory system handles conflicting information.
 * Enterprise-grade memory must resolve or flag contradictions appropriately.
 *
 * Test Scenarios:
 * 1. Direct contradiction (A vs not-A)
 * 2. Many wrong sources vs one authoritative
 * 3. Temporal updates (old fact vs new fact)
 * 4. Confidence conflicts between sources
 * 5. Implicit contradictions
 * 6. Bilingual contradictions (Hebrew + English)
 *
 * Output: Generates benchmark results to benchmarks/results/contradictions.txt
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import {
	MockEmbeddingService,
	MockTimeManager,
	MockCollection,
	TestHarness,
	createTestMetadata,
	calculateWilsonScore,
	BenchmarkReporter,
} from '../mock-utilities';

// Global reporter for this test file
const reporter = new BenchmarkReporter('test_contradictions');

// Helper to record test metrics
function recordTest(name: string, passed: boolean, duration: number, metrics?: Record<string, number | string>, error?: string): void {
	reporter.recordTest({ name, passed, duration, metrics, error });
}

describe('Contradiction Handling', () => {
	let harness: TestHarness;
	let embeddingService: MockEmbeddingService;
	let timeManager: MockTimeManager;
	let collection: MockCollection;

	beforeEach(() => {
		harness = new TestHarness('Contradictions');
		embeddingService = new MockEmbeddingService(42);
		timeManager = new MockTimeManager(new Date('2026-01-01T00:00:00Z'));
		collection = new MockCollection(embeddingService);
	});

	afterEach(() => {
		harness.cleanup();
	});

	afterAll(() => {
		reporter.saveReport('contradictions.txt');
	});

	describe('Direct Contradiction', () => {
		it('test_direct_contradiction', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store directly contradicting facts
				await collection.add({
					id: 'fact_a',
					content: 'The user is a vegetarian',
					metadata: {
						...createTestMetadata(),
						confidence: 0.9,
						source: 'user_stated',
					},
				});

				await collection.add({
					id: 'fact_not_a',
					content: 'The user eats meat regularly',
					metadata: {
						...createTestMetadata(),
						confidence: 0.6,
						source: 'inferred',
					},
				});

				// Search for dietary preference
				const results = await collection.search('Is the user vegetarian?', 2);

				// Both should be found - contradiction detection is application-level
				const foundBoth = results.length === 2;
				const higherConfidenceFirst = results[0]?.document.id === 'fact_a';

				metrics = {
					found_both_facts: foundBoth ? 1 : 0,
					higher_confidence_ranked_first: higherConfidenceFirst ? 1 : 0,
					result_count: results.length,
				};

				expect(results.length).toBe(2);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_direct_contradiction', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_direct_contradiction', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Hebrew contradicting facts
				await collection.add({
					id: 'he_fact_a',
					content: 'המשתמש צמחוני',
					metadata: { ...createTestMetadata(), confidence: 0.9 },
				});

				await collection.add({
					id: 'he_fact_not_a',
					content: 'המשתמש אוכל בשר באופן קבוע',
					metadata: { ...createTestMetadata(), confidence: 0.6 },
				});

				const results = await collection.search('האם המשתמש צמחוני?', 2);

				metrics = {
					result_count: results.length,
					found_hebrew_facts: results.length > 0 ? 1 : 0,
				};

				expect(results.length).toBe(2);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_direct_contradiction', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Many Wrong vs One Right', () => {
		it('test_many_wrong_vs_one_right', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store multiple wrong facts
				const wrongFacts = [
					'The capital of Israel is Haifa',
					'Israel capital is Haifa city',
					'Haifa is the capital of Israel',
					'The Israeli capital is located in Haifa',
				];

				for (let i = 0; i < wrongFacts.length; i++) {
					await collection.add({
						id: `wrong_${i}`,
						content: wrongFacts[i],
						metadata: {
							...createTestMetadata(),
							confidence: 0.5,
							source: 'unverified',
						},
					});
				}

				// Store one correct fact with high confidence
				await collection.add({
					id: 'correct',
					content: 'Jerusalem is the capital of Israel',
					metadata: {
						...createTestMetadata(),
						confidence: 0.95,
						source: 'verified',
						wilson_score: calculateWilsonScore(95, 100),
					},
				});

				// Search for capital
				const results = await collection.search('capital of Israel', 5);

				// Count how many wrong vs correct in results
				const wrongInResults = results.filter(r => r.document.id.startsWith('wrong_')).length;
				const correctInResults = results.filter(r => r.document.id === 'correct').length;

				metrics = {
					wrong_facts_stored: wrongFacts.length,
					wrong_in_top_5: wrongInResults,
					correct_in_top_5: correctInResults,
					total_results: results.length,
				};

				// Correct fact should be findable
				expect(correctInResults).toBe(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_many_wrong_vs_one_right', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Temporal Update', () => {
		it('test_temporal_update', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Old fact
				await collection.add({
					id: 'old_address',
					content: 'The user lives in New York City',
					metadata: {
						...createTestMetadata(),
						created_at: '2023-01-01T00:00:00Z',
						is_current: false,
						superseded_by: 'new_address',
					},
				});

				// Advance time
				timeManager.advanceDays(730); // 2 years

				// New fact (update)
				await collection.add({
					id: 'new_address',
					content: 'The user lives in San Francisco',
					metadata: {
						...createTestMetadata(),
						created_at: '2025-01-01T00:00:00Z',
						is_current: true,
						supersedes: 'old_address',
					},
				});

				// Search for current address
				const results = await collection.search('Where does the user live?', 2);

				// Both should be found
				const oldFound = results.some(r => r.document.id === 'old_address');
				const newFound = results.some(r => r.document.id === 'new_address');

				metrics = {
					old_fact_found: oldFound ? 1 : 0,
					new_fact_found: newFound ? 1 : 0,
					total_results: results.length,
				};

				// Both facts should be retrievable for timeline context
				expect(results.length).toBe(2);
				expect(newFound).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_temporal_update', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_temporal_update', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Hebrew temporal facts
				await collection.add({
					id: 'he_old_job',
					content: 'המשתמש עבד בגוגל',
					metadata: {
						...createTestMetadata(),
						created_at: '2023-01-01T00:00:00Z',
						is_current: false,
					},
				});

				await collection.add({
					id: 'he_new_job',
					content: 'המשתמש עובד במטא',
					metadata: {
						...createTestMetadata(),
						created_at: '2025-01-01T00:00:00Z',
						is_current: true,
					},
				});

				const results = await collection.search('איפה המשתמש עובד?', 2);

				metrics = {
					hebrew_results: results.length,
				};

				expect(results.length).toBe(2);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_temporal_update', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Confidence Conflict', () => {
		it('test_confidence_conflict', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// High confidence source says A
				await collection.add({
					id: 'high_conf',
					content: 'The user birthday is March 15th',
					metadata: {
						...createTestMetadata(),
						confidence: 0.95,
						wilson_score: calculateWilsonScore(95, 100),
						source: 'user_profile',
					},
				});

				// Low confidence source says B
				await collection.add({
					id: 'low_conf',
					content: 'The user birthday is April 20th',
					metadata: {
						...createTestMetadata(),
						confidence: 0.3,
						wilson_score: calculateWilsonScore(30, 100),
						source: 'chat_inference',
					},
				});

				// Medium confidence source says C
				await collection.add({
					id: 'med_conf',
					content: 'The user was born on March 15, 1990',
					metadata: {
						...createTestMetadata(),
						confidence: 0.7,
						wilson_score: calculateWilsonScore(70, 100),
						source: 'document_extraction',
					},
				});

				const results = await collection.search('When is the user birthday?', 3);

				// Check if results are ordered (we can't guarantee order without re-ranking)
				const confidenceScores = results.map(r => {
					const score = r.document.metadata.confidence;
					return typeof score === 'number' ? score : 0;
				});

				metrics = {
					results_count: results.length,
					highest_confidence_in_results: Math.max(...confidenceScores),
					lowest_confidence_in_results: Math.min(...confidenceScores),
				};

				expect(results.length).toBe(3);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_confidence_conflict', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Implicit Contradiction', () => {
		it('test_implicit_contradiction', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Facts that implicitly contradict
				await collection.add({
					id: 'imp_1',
					content: 'The user goes to bed at 9 PM every night',
					metadata: createTestMetadata(),
				});

				await collection.add({
					id: 'imp_2',
					content: 'The user regularly attends midnight movie premieres',
					metadata: createTestMetadata(),
				});

				await collection.add({
					id: 'imp_3',
					content: 'The user is a night owl who works best after midnight',
					metadata: createTestMetadata(),
				});

				// Search for sleep pattern
				const results = await collection.search('user sleep schedule habits', 3);

				// All should be retrievable
				const foundIds = new Set(results.map(r => r.document.id));

				metrics = {
					implicit_contradictions_found: foundIds.size,
					total_results: results.length,
				};

				// Should find at least 2 of the implicit contradictions
				expect(foundIds.size).toBeGreaterThanOrEqual(2);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_implicit_contradiction', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_implicit_contradiction', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Hebrew implicit contradictions
				await collection.add({
					id: 'he_imp_1',
					content: 'המשתמש הולך לישון בשעה 9 בערב',
					metadata: createTestMetadata(),
				});

				await collection.add({
					id: 'he_imp_2',
					content: 'המשתמש אוהב לצאת למסיבות עד שעות הלילה המאוחרות',
					metadata: createTestMetadata(),
				});

				const results = await collection.search('מתי המשתמש הולך לישון?', 2);

				metrics = {
					hebrew_implicit_found: results.length,
				};

				expect(results.length).toBe(2);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_implicit_contradiction', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Summary Test', () => {
		it('test_contradictions', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Comprehensive contradictions test
				const contradictoryData = [
					// Direct contradiction
					{ id: 'c1', content: 'User is married', conf: 0.8 },
					{ id: 'c2', content: 'User is single', conf: 0.6 },
					// Temporal contradiction
					{ id: 'c3', content: 'User worked at IBM from 2020-2022', conf: 0.9 },
					{ id: 'c4', content: 'User worked at Google from 2021-2023', conf: 0.85 },
					// Value contradiction
					{ id: 'c5', content: 'User favorite color is blue', conf: 0.7 },
					{ id: 'c6', content: 'User hates blue color', conf: 0.5 },
					// Hebrew contradiction
					{ id: 'c7', content: 'המשתמש גר בתל אביב', conf: 0.8 },
					{ id: 'c8', content: 'המשתמש גר בירושלים', conf: 0.75 },
				];

				for (const c of contradictoryData) {
					await collection.add({
						id: c.id,
						content: c.content,
						metadata: {
							...createTestMetadata(),
							confidence: c.conf,
							wilson_score: calculateWilsonScore(Math.floor(c.conf * 100), 100),
						},
					});
				}

				// Run queries to test contradiction handling
				const queries = [
					{ q: 'Is user married?', expected: ['c1', 'c2'] },
					{ q: 'Where did user work?', expected: ['c3', 'c4'] },
					{ q: 'User favorite color', expected: ['c5', 'c6'] },
					{ q: 'איפה המשתמש גר?', expected: ['c7', 'c8'] },
				];

				let correctQueries = 0;
				for (const query of queries) {
					const results = await collection.search(query.q, 2);
					const foundIds = results.map(r => r.document.id);
					const foundExpected = query.expected.some(e => foundIds.includes(e));
					if (foundExpected) correctQueries++;
				}

				metrics = {
					contradictory_entries: contradictoryData.length,
					queries_run: queries.length,
					queries_found_contradictions: correctQueries,
					success_rate: correctQueries / queries.length,
				};

				expect(correctQueries).toBeGreaterThanOrEqual(queries.length * 0.75);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_contradictions', passed, Date.now() - start, metrics);
			}
		});
	});
});
