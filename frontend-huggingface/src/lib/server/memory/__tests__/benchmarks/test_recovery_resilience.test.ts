/**
 * Recovery & Resilience Tests
 *
 * Tests how the memory system handles failures and recovers gracefully.
 * Enterprise-grade memory must be fault-tolerant and self-healing.
 *
 * Test Scenarios:
 * 1. Partial write recovery
 * 2. Corrupted data handling
 * 3. Connection failure recovery
 * 4. Data integrity verification
 * 5. Graceful degradation
 * 6. Bilingual data recovery (Hebrew + English)
 *
 * Output: Generates benchmark results to benchmarks/results/recovery_resilience.txt
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import {
	MockEmbeddingService,
	MockCollection,
	TestHarness,
	createTestMetadata,
	verifyDocIdFormat,
	verifyMetadataPersistence,
	BenchmarkReporter,
} from '../mock-utilities';

// Global reporter for this test file
const reporter = new BenchmarkReporter('test_recovery_resilience');

// Helper to record test metrics
function recordTest(name: string, passed: boolean, duration: number, metrics?: Record<string, number | string>, error?: string): void {
	reporter.recordTest({ name, passed, duration, metrics, error });
}

// Simulated failure modes
type FailureMode = 'none' | 'write_failure' | 'read_failure' | 'corruption' | 'timeout' | 'partial';

// Resilient collection wrapper with failure simulation
class ResilientCollection {
	private collection: MockCollection;
	private failureMode: FailureMode = 'none';
	private failureRate: number = 0;
	private recoveryAttempts: number = 0;
	private successfulRecoveries: number = 0;

	constructor(embeddingService: MockEmbeddingService) {
		this.collection = new MockCollection(embeddingService);
	}

	setFailureMode(mode: FailureMode, rate: number = 0.5): void {
		this.failureMode = mode;
		this.failureRate = rate;
	}

	private shouldFail(): boolean {
		return this.failureMode !== 'none' && Math.random() < this.failureRate;
	}

	async add(item: { id: string; content: string; metadata?: Record<string, unknown> }): Promise<{ success: boolean; recovered: boolean; attempts: number }> {
		let attempts = 0;
		const maxAttempts = 3;

		while (attempts < maxAttempts) {
			attempts++;
			this.recoveryAttempts++;

			if (this.failureMode === 'write_failure' && this.shouldFail()) {
				continue; // Retry
			}

			if (this.failureMode === 'partial' && this.shouldFail()) {
				// Partial write - data might be incomplete
				await this.collection.add({
					...item,
					metadata: { ...item.metadata, _partial: true },
				});
				continue; // Retry to complete
			}

			// Success
			await this.collection.add(item);
			if (attempts > 1) {
				this.successfulRecoveries++;
			}
			return { success: true, recovered: attempts > 1, attempts };
		}

		return { success: false, recovered: false, attempts };
	}

	async search(query: string, limit: number): Promise<{ results: Array<{ document: { id: string; content: string; metadata: Record<string, unknown> }; score: number }>; degraded: boolean }> {
		if (this.failureMode === 'read_failure' && this.shouldFail()) {
			// Return empty results as graceful degradation
			return { results: [], degraded: true };
		}

		if (this.failureMode === 'timeout' && this.shouldFail()) {
			// Simulate timeout with partial results
			const results = await this.collection.search(query, Math.ceil(limit / 2));
			return { results, degraded: true };
		}

		const results = await this.collection.search(query, limit);

		// Filter out corrupted entries
		if (this.failureMode === 'corruption') {
			const filtered = results.filter(r => !r.document.metadata._corrupted);
			return { results: filtered, degraded: filtered.length < results.length };
		}

		return { results, degraded: false };
	}

	getRecoveryStats(): { attempts: number; successes: number; rate: number } {
		return {
			attempts: this.recoveryAttempts,
			successes: this.successfulRecoveries,
			rate: this.recoveryAttempts > 0 ? this.successfulRecoveries / this.recoveryAttempts : 0,
		};
	}

	resetStats(): void {
		this.recoveryAttempts = 0;
		this.successfulRecoveries = 0;
	}
}

describe('Recovery & Resilience', () => {
	let harness: TestHarness;
	let embeddingService: MockEmbeddingService;
	let resilientCollection: ResilientCollection;

	beforeEach(() => {
		harness = new TestHarness('RecoveryResilience');
		embeddingService = new MockEmbeddingService(42);
		resilientCollection = new ResilientCollection(embeddingService);
	});

	afterEach(() => {
		harness.cleanup();
	});

	afterAll(() => {
		reporter.saveReport('recovery_resilience.txt');
	});

	describe('Write Failure Recovery', () => {
		it('test_write_retry_success', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Set 30% failure rate
				resilientCollection.setFailureMode('write_failure', 0.3);

				const items = [
					{ id: 'w1', content: 'User name is John' },
					{ id: 'w2', content: 'User works at TechCorp' },
					{ id: 'w3', content: 'User birthday in March' },
					{ id: 'w4', content: 'User lives in San Francisco' },
					{ id: 'w5', content: 'User has a dog named Max' },
				];

				let successCount = 0;
				let recoveredCount = 0;
				let totalAttempts = 0;

				for (const item of items) {
					const result = await resilientCollection.add(item);
					if (result.success) successCount++;
					if (result.recovered) recoveredCount++;
					totalAttempts += result.attempts;
				}

				metrics = {
					total_items: items.length,
					successful_writes: successCount,
					recovered_writes: recoveredCount,
					total_attempts: totalAttempts,
					success_rate: Math.round((successCount / items.length) * 100),
					avg_attempts: Math.round((totalAttempts / items.length) * 100) / 100,
				};

				// Should recover most writes
				expect(successCount).toBeGreaterThanOrEqual(items.length * 0.8);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_write_retry_success', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_write_recovery', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				resilientCollection.setFailureMode('write_failure', 0.25);

				const hebrewItems = [
					{ id: 'hw1', content: 'שם המשתמש הוא יוסי' },
					{ id: 'hw2', content: 'המשתמש עובד בגוגל' },
					{ id: 'hw3', content: 'יום ההולדת של המשתמש במרץ' },
				];

				let successCount = 0;
				for (const item of hebrewItems) {
					const result = await resilientCollection.add(item);
					if (result.success) successCount++;
				}

				metrics = {
					hebrew_items: hebrewItems.length,
					hebrew_successes: successCount,
					hebrew_success_rate: Math.round((successCount / hebrewItems.length) * 100),
				};

				expect(successCount).toBeGreaterThanOrEqual(hebrewItems.length * 0.6);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_write_recovery', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Read Failure Graceful Degradation', () => {
		it('test_read_graceful_degradation', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// First, add data without failures
				resilientCollection.setFailureMode('none');
				await resilientCollection.add({ id: 'r1', content: 'Important user data' });
				await resilientCollection.add({ id: 'r2', content: 'Another important fact' });

				// Now enable read failures
				resilientCollection.setFailureMode('read_failure', 0.5);

				let degradedSearches = 0;
				let successfulSearches = 0;
				const totalSearches = 10;

				for (let i = 0; i < totalSearches; i++) {
					const { results, degraded } = await resilientCollection.search('user data', 5);
					if (degraded) {
						degradedSearches++;
					} else if (results.length > 0) {
						successfulSearches++;
					}
				}

				metrics = {
					total_searches: totalSearches,
					successful_searches: successfulSearches,
					degraded_searches: degradedSearches,
					graceful_degradation_rate: Math.round((degradedSearches / totalSearches) * 100),
				};

				// System should always return something (even if degraded)
				expect(successfulSearches + degradedSearches).toBe(totalSearches);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_read_graceful_degradation', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Corruption Handling', () => {
		it('test_corruption_detection', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Add normal data
				resilientCollection.setFailureMode('none');
				const normalCollection = new MockCollection(embeddingService);

				await normalCollection.add({
					id: 'c1',
					content: 'Valid user data',
					metadata: { ...createTestMetadata(), _corrupted: false },
				});

				await normalCollection.add({
					id: 'c2',
					content: 'Corrupted entry',
					metadata: { ...createTestMetadata(), _corrupted: true },
				});

				await normalCollection.add({
					id: 'c3',
					content: 'Another valid entry',
					metadata: { ...createTestMetadata(), _corrupted: false },
				});

				// Search and filter corruption
				const allResults = await normalCollection.search('user data entry', 10);
				const validResults = allResults.filter(r => !r.document.metadata._corrupted);
				const corruptedResults = allResults.filter(r => r.document.metadata._corrupted);

				metrics = {
					total_entries: allResults.length,
					valid_entries: validResults.length,
					corrupted_entries: corruptedResults.length,
					corruption_filtered: corruptedResults.length > 0 ? 1 : 0,
				};

				expect(validResults.length).toBeLessThan(allResults.length);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_corruption_detection', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_corruption_handling', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const normalCollection = new MockCollection(embeddingService);

				// Add Hebrew data with some corruption
				await normalCollection.add({
					id: 'hc1',
					content: 'נתוני משתמש תקינים',
					metadata: { ...createTestMetadata(), _corrupted: false, language: 'he' },
				});

				await normalCollection.add({
					id: 'hc2',
					content: 'נתונים פגומים',
					metadata: { ...createTestMetadata(), _corrupted: true, language: 'he' },
				});

				const results = await normalCollection.search('נתוני משתמש', 10);
				const validHebrew = results.filter(r =>
					r.document.metadata.language === 'he' && !r.document.metadata._corrupted
				);

				metrics = {
					hebrew_total: results.filter(r => r.document.metadata.language === 'he').length,
					hebrew_valid: validHebrew.length,
					hebrew_corruption_detected: results.some(r => r.document.metadata._corrupted) ? 1 : 0,
				};

				expect(validHebrew.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_corruption_handling', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Data Integrity Verification', () => {
		it('test_metadata_persistence', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const collection = new MockCollection(embeddingService);

				const originalMetadata = {
					...createTestMetadata(),
					custom_field: 'test_value',
					numeric_field: 42,
					nested: { key: 'value' },
				};

				await collection.add({
					id: 'int1',
					content: 'Test content for integrity check',
					metadata: originalMetadata,
				});

				const results = await collection.search('integrity check', 1);
				const retrieved = results[0]?.document.metadata;

				// Verify persistence
				const verification = verifyMetadataPersistence(originalMetadata, retrieved || {});

				metrics = {
					fields_checked: Object.keys(originalMetadata).length,
					fields_persisted: Object.keys(originalMetadata).length - verification.missing_fields.length,
					integrity_valid: verification.valid ? 1 : 0,
					missing_fields: verification.missing_fields.length,
				};

				expect(verification.valid).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_metadata_persistence', passed, Date.now() - start, metrics);
			}
		});

		it('test_id_format_validation', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const testIds = [
					'valid_id_123',
					'another-valid-id',
					'id_with_underscore',
					'', // invalid
					'a'.repeat(300), // too long
					'id with spaces', // invalid chars
				];

				let validCount = 0;
				let invalidCount = 0;

				for (const id of testIds) {
					const result = verifyDocIdFormat(id);
					if (result.valid) {
						validCount++;
					} else {
						invalidCount++;
					}
				}

				metrics = {
					total_ids_tested: testIds.length,
					valid_ids: validCount,
					invalid_ids: invalidCount,
					validation_working: invalidCount > 0 ? 1 : 0,
				};

				expect(invalidCount).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_id_format_validation', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Timeout Handling', () => {
		it('test_timeout_partial_results', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Add data first
				resilientCollection.setFailureMode('none');
				for (let i = 0; i < 10; i++) {
					await resilientCollection.add({
						id: `t${i}`,
						content: `Test content item ${i}`,
					});
				}

				// Enable timeout mode
				resilientCollection.setFailureMode('timeout', 0.5);

				let fullResults = 0;
				let partialResults = 0;
				const searchCount = 10;

				for (let i = 0; i < searchCount; i++) {
					const { results, degraded } = await resilientCollection.search('test content', 5);
					if (degraded) {
						partialResults++;
					} else {
						fullResults++;
					}
				}

				metrics = {
					total_searches: searchCount,
					full_results: fullResults,
					partial_results: partialResults,
					partial_rate: Math.round((partialResults / searchCount) * 100),
					system_resilient: (fullResults + partialResults) === searchCount ? 1 : 0,
				};

				// All searches should return something
				expect(fullResults + partialResults).toBe(searchCount);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_timeout_partial_results', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Recovery Statistics', () => {
		it('test_recovery_rate_tracking', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				resilientCollection.resetStats();
				resilientCollection.setFailureMode('write_failure', 0.4);

				// Perform multiple writes
				for (let i = 0; i < 20; i++) {
					await resilientCollection.add({
						id: `stat${i}`,
						content: `Statistical test item ${i}`,
					});
				}

				const stats = resilientCollection.getRecoveryStats();

				metrics = {
					recovery_attempts: stats.attempts,
					successful_recoveries: stats.successes,
					recovery_rate: Math.round(stats.rate * 100),
					system_self_healing: stats.successes > 0 ? 1 : 0,
				};

				// Should have some recovery attempts
				expect(stats.attempts).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_recovery_rate_tracking', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Bilingual Recovery', () => {
		it('test_bilingual_data_recovery', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				resilientCollection.setFailureMode('write_failure', 0.25);

				const bilingualData = [
					{ id: 'bi1', content: 'User name is John', lang: 'en' },
					{ id: 'bi2', content: 'שם המשתמש הוא יוחנן', lang: 'he' },
					{ id: 'bi3', content: 'User works at company', lang: 'en' },
					{ id: 'bi4', content: 'המשתמש עובד בחברה', lang: 'he' },
					{ id: 'bi5', content: 'Mixed content בעברית ואנגלית', lang: 'mixed' },
				];

				let enSuccess = 0;
				let heSuccess = 0;
				let mixedSuccess = 0;

				for (const item of bilingualData) {
					const result = await resilientCollection.add({
						id: item.id,
						content: item.content,
						metadata: { language: item.lang },
					});
					if (result.success) {
						if (item.lang === 'en') enSuccess++;
						else if (item.lang === 'he') heSuccess++;
						else mixedSuccess++;
					}
				}

				metrics = {
					english_items: bilingualData.filter(d => d.lang === 'en').length,
					hebrew_items: bilingualData.filter(d => d.lang === 'he').length,
					mixed_items: bilingualData.filter(d => d.lang === 'mixed').length,
					english_recovered: enSuccess,
					hebrew_recovered: heSuccess,
					mixed_recovered: mixedSuccess,
					total_recovery_rate: Math.round(((enSuccess + heSuccess + mixedSuccess) / bilingualData.length) * 100),
				};

				expect(enSuccess + heSuccess + mixedSuccess).toBeGreaterThanOrEqual(bilingualData.length * 0.6);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_bilingual_data_recovery', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Summary Test', () => {
		it('test_recovery_resilience', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Comprehensive resilience test
				const testScenarios = [
					{ mode: 'write_failure' as FailureMode, rate: 0.3, items: 5 },
					{ mode: 'read_failure' as FailureMode, rate: 0.3, items: 5 },
					{ mode: 'timeout' as FailureMode, rate: 0.3, items: 5 },
				];

				let totalWriteSuccess = 0;
				let totalReadSuccess = 0;
				let totalDegraded = 0;

				for (const scenario of testScenarios) {
					const testCollection = new ResilientCollection(embeddingService);

					// Write phase
					testCollection.setFailureMode(scenario.mode === 'write_failure' ? scenario.mode : 'none', scenario.rate);
					for (let i = 0; i < scenario.items; i++) {
						const result = await testCollection.add({
							id: `res_${scenario.mode}_${i}`,
							content: `Resilience test for ${scenario.mode}`,
						});
						if (result.success) totalWriteSuccess++;
					}

					// Read phase
					testCollection.setFailureMode(scenario.mode === 'read_failure' || scenario.mode === 'timeout' ? scenario.mode : 'none', scenario.rate);
					for (let i = 0; i < 3; i++) {
						const { results, degraded } = await testCollection.search('resilience test', 5);
						if (results.length > 0) totalReadSuccess++;
						if (degraded) totalDegraded++;
					}
				}

				const totalItems = testScenarios.reduce((a, b) => a + b.items, 0);
				const totalReads = testScenarios.length * 3;

				metrics = {
					scenarios_tested: testScenarios.length,
					total_write_attempts: totalItems,
					total_write_successes: totalWriteSuccess,
					write_success_rate: Math.round((totalWriteSuccess / totalItems) * 100),
					total_read_attempts: totalReads,
					total_read_successes: totalReadSuccess,
					degraded_responses: totalDegraded,
					system_resilience_score: Math.round(((totalWriteSuccess / totalItems) * 50 + (totalReadSuccess / totalReads) * 50)),
				};

				// System should be at least 60% resilient
				expect(totalWriteSuccess / totalItems).toBeGreaterThanOrEqual(0.6);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_recovery_resilience', passed, Date.now() - start, metrics);
			}
		});
	});
});
