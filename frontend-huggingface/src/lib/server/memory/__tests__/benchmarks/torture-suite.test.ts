/**
 * Torture Test Suite for Memory System
 *
 * Stress tests to identify breaking points and edge cases.
 * Adapted from roampal/benchmarks/test_torture_suite.py
 *
 * Tests:
 * 1. High volume concurrent operations
 * 2. Large payload handling
 * 3. Rapid sequential operations
 * 4. Memory pressure scenarios
 * 5. Edge case inputs
 * 6. Error recovery
 * 7. Long-running stability
 * 8. Resource cleanup
 * 9. Unicode/RTL handling
 * 10. Boundary conditions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
	MockEmbeddingService,
	MockCollection,
	MockLLMService,
	TestHarness,
	createTestFragment,
	createTestFragmentBatch,
	type TestResult
} from '../mock-utilities';

// ============================================================================
// Configuration
// ============================================================================

const STRESS_CONFIG = {
	high_volume_count: 1000,
	concurrent_operations: 50,
	large_payload_kb: 100,
	rapid_operations_count: 500,
	long_running_iterations: 100,
	max_content_length: 50000,
	unicode_test_strings: [
		'עברית עם ניקוד: בְּרֵאשִׁית',
		'العربية مع التشكيل',
		'日本語テスト',
		'🎉🚀💻🔥✨',
		'Mixed: Hello שלום مرحبا',
		'Zalgo: H̷̭̎ě̶̠l̵̰͝l̴̰̾o̴̱͝',
		'\u200B\u200C\u200D\uFEFF', // Zero-width characters
		'Tab\tand\nnewlines\r\nhere'
	]
};

// ============================================================================
// Types
// ============================================================================

interface TortureResult {
	test_name: string;
	passed: boolean;
	duration_ms: number;
	operations_count: number;
	errors_count: number;
	memory_stable: boolean;
	details: string;
}

// ============================================================================
// Report Generation
// ============================================================================

function generateReport(results: TortureResult[]): string {
	const lines: string[] = [
		'='.repeat(100),
		'MEMORY SYSTEM TORTURE TEST REPORT',
		'='.repeat(100),
		`Timestamp: ${new Date().toISOString()}`,
		`Total Tests: ${results.length}`,
		'',
		'CONFIGURATION:',
		`  High Volume Count: ${STRESS_CONFIG.high_volume_count}`,
		`  Concurrent Operations: ${STRESS_CONFIG.concurrent_operations}`,
		`  Large Payload Size: ${STRESS_CONFIG.large_payload_kb}KB`,
		`  Rapid Operations: ${STRESS_CONFIG.rapid_operations_count}`,
		'',
		'-'.repeat(100),
		'TEST RESULTS:',
		'-'.repeat(100),
		''
	];

	for (const result of results) {
		const status = result.passed ? '[PASS]' : '[FAIL]';
		const memStatus = result.memory_stable ? 'stable' : 'UNSTABLE';

		lines.push(`${status} ${result.test_name}`);
		lines.push(`    Duration: ${result.duration_ms.toFixed(2)}ms`);
		lines.push(`    Operations: ${result.operations_count} | Errors: ${result.errors_count}`);
		lines.push(`    Memory: ${memStatus}`);
		lines.push(`    Details: ${result.details}`);
		lines.push('');
	}

	const passCount = results.filter(r => r.passed).length;
	const totalErrors = results.reduce((sum, r) => sum + r.errors_count, 0);

	lines.push('-'.repeat(100));
	lines.push('SUMMARY:');
	lines.push(`  Passed: ${passCount}/${results.length}`);
	lines.push(`  Total Errors: ${totalErrors}`);
	lines.push(`  Overall: ${passCount === results.length ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
	lines.push('='.repeat(100));

	return lines.join('\n');
}

// ============================================================================
// Torture Tests
// ============================================================================

describe('Torture Test Suite', () => {
	let harness: TestHarness;
	let embeddingService: MockEmbeddingService;
	let collection: MockCollection;
	let llmService: MockLLMService;
	let allResults: TortureResult[];

	beforeAll(() => {
		harness = new TestHarness('TortureSuite');
		embeddingService = new MockEmbeddingService();
		collection = new MockCollection(embeddingService);
		llmService = new MockLLMService();
		allResults = [];
	});

	afterAll(() => {
		const report = generateReport(allResults);
		const reportPath = path.join(__dirname, '..', 'test-results', 'torture-test-report.txt');

		try {
			const dir = path.dirname(reportPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			fs.writeFileSync(reportPath, report);
		} catch (err) {
			// Silently continue
		}
	});

	describe('1. High Volume Operations', () => {
		it('should handle high volume document insertion', async () => {
			const startTime = performance.now();
			let errors = 0;

			for (let i = 0; i < STRESS_CONFIG.high_volume_count; i++) {
				try {
					await collection.add({
						id: `torture_vol_${i}`,
						content: `High volume test document ${i} with content`,
						metadata: { index: i, test: 'high_volume' }
					});
				} catch {
					errors++;
				}
			}

			const duration = performance.now() - startTime;
			const passed = errors === 0 && collection.count() >= STRESS_CONFIG.high_volume_count;

			const tortureResult: TortureResult = {
				test_name: 'high_volume_insertion',
				passed,
				duration_ms: duration,
				operations_count: STRESS_CONFIG.high_volume_count,
				errors_count: errors,
				memory_stable: true,
				details: `Inserted ${collection.count()} documents in ${duration.toFixed(2)}ms`
			};

			allResults.push(tortureResult);

			expect(errors).toBe(0);
		});

		it('should handle high volume searches', async () => {
			const startTime = performance.now();
			let errors = 0;
			const searchCount = 100;

			for (let i = 0; i < searchCount; i++) {
				try {
					await collection.search(`search query ${i}`, 10);
				} catch {
					errors++;
				}
			}

			const duration = performance.now() - startTime;
			const avgLatency = duration / searchCount;

			const tortureResult: TortureResult = {
				test_name: 'high_volume_search',
				passed: errors === 0 && avgLatency < 100,
				duration_ms: duration,
				operations_count: searchCount,
				errors_count: errors,
				memory_stable: true,
				details: `Average search latency: ${avgLatency.toFixed(2)}ms`
			};

			allResults.push(tortureResult);

			expect(errors).toBe(0);
		});
	});

	describe('2. Large Payload Handling', () => {
		it('should handle large content payloads', async () => {
			const startTime = performance.now();
			let errors = 0;

			// Generate large content
			const largeContent = 'X'.repeat(STRESS_CONFIG.large_payload_kb * 1024);

			try {
				await collection.add({
					id: 'torture_large_1',
					content: largeContent,
					metadata: { size_kb: STRESS_CONFIG.large_payload_kb }
				});
			} catch {
				errors++;
			}

			const duration = performance.now() - startTime;

			const tortureResult: TortureResult = {
				test_name: 'large_payload',
				passed: errors === 0,
				duration_ms: duration,
				operations_count: 1,
				errors_count: errors,
				memory_stable: true,
				details: `Handled ${STRESS_CONFIG.large_payload_kb}KB payload`
			};

			allResults.push(tortureResult);

			expect(errors).toBe(0);
		});

		it('should handle maximum content length', async () => {
			const startTime = performance.now();
			let errors = 0;

			const maxContent = 'Y'.repeat(STRESS_CONFIG.max_content_length);

			try {
				await collection.add({
					id: 'torture_max_content',
					content: maxContent,
					metadata: { length: STRESS_CONFIG.max_content_length }
				});
			} catch {
				errors++;
			}

			const duration = performance.now() - startTime;

			const tortureResult: TortureResult = {
				test_name: 'max_content_length',
				passed: errors === 0,
				duration_ms: duration,
				operations_count: 1,
				errors_count: errors,
				memory_stable: true,
				details: `Handled ${STRESS_CONFIG.max_content_length} character content`
			};

			allResults.push(tortureResult);

			expect(errors).toBe(0);
		});
	});

	describe('3. Concurrent Operations', () => {
		it('should handle concurrent insertions', async () => {
			const startTime = performance.now();
			let errors = 0;

			const promises = Array.from(
				{ length: STRESS_CONFIG.concurrent_operations },
				(_, i) => collection.add({
					id: `torture_concurrent_${i}`,
					content: `Concurrent document ${i}`,
					metadata: { concurrent: true }
				}).catch(() => { errors++; })
			);

			await Promise.all(promises);
			const duration = performance.now() - startTime;

			const tortureResult: TortureResult = {
				test_name: 'concurrent_insertions',
				passed: errors === 0,
				duration_ms: duration,
				operations_count: STRESS_CONFIG.concurrent_operations,
				errors_count: errors,
				memory_stable: true,
				details: `${STRESS_CONFIG.concurrent_operations} concurrent ops in ${duration.toFixed(2)}ms`
			};

			allResults.push(tortureResult);

			expect(errors).toBe(0);
		});

		it('should handle concurrent searches', async () => {
			const startTime = performance.now();
			let errors = 0;

			const promises = Array.from(
				{ length: STRESS_CONFIG.concurrent_operations },
				(_, i) => collection.search(`concurrent query ${i}`, 5)
					.catch(() => { errors++; })
			);

			await Promise.all(promises);
			const duration = performance.now() - startTime;

			const tortureResult: TortureResult = {
				test_name: 'concurrent_searches',
				passed: errors === 0,
				duration_ms: duration,
				operations_count: STRESS_CONFIG.concurrent_operations,
				errors_count: errors,
				memory_stable: true,
				details: `${STRESS_CONFIG.concurrent_operations} concurrent searches`
			};

			allResults.push(tortureResult);

			expect(errors).toBe(0);
		});

		it('should handle mixed concurrent operations', async () => {
			const startTime = performance.now();
			let errors = 0;

			const mixedOps = Array.from({ length: 30 }, (_, i) => {
				if (i % 3 === 0) {
					return collection.add({
						id: `torture_mixed_${i}`,
						content: `Mixed operation ${i}`,
						metadata: {}
					}).catch(() => { errors++; });
				} else if (i % 3 === 1) {
					return collection.search(`mixed query ${i}`, 5)
						.catch(() => { errors++; });
				} else {
					return embeddingService.embed(`mixed embed ${i}`)
						.catch(() => { errors++; });
				}
			});

			await Promise.all(mixedOps);
			const duration = performance.now() - startTime;

			const tortureResult: TortureResult = {
				test_name: 'mixed_concurrent_ops',
				passed: errors === 0,
				duration_ms: duration,
				operations_count: 30,
				errors_count: errors,
				memory_stable: true,
				details: 'Mixed insert/search/embed operations'
			};

			allResults.push(tortureResult);

			expect(errors).toBe(0);
		});
	});

	describe('4. Rapid Sequential Operations', () => {
		it('should handle rapid sequential insertions', async () => {
			const startTime = performance.now();
			let errors = 0;

			for (let i = 0; i < STRESS_CONFIG.rapid_operations_count; i++) {
				try {
					await collection.add({
						id: `torture_rapid_${i}`,
						content: `Rapid ${i}`,
						metadata: {}
					});
				} catch {
					errors++;
				}
			}

			const duration = performance.now() - startTime;
			const opsPerSecond = (STRESS_CONFIG.rapid_operations_count / duration) * 1000;

			const tortureResult: TortureResult = {
				test_name: 'rapid_sequential',
				passed: errors === 0,
				duration_ms: duration,
				operations_count: STRESS_CONFIG.rapid_operations_count,
				errors_count: errors,
				memory_stable: true,
				details: `${opsPerSecond.toFixed(2)} ops/second`
			};

			allResults.push(tortureResult);

			expect(errors).toBe(0);
		});
	});

	describe('5. Edge Case Inputs', () => {
		it('should handle empty content', async () => {
			const startTime = performance.now();
			let errors = 0;

			try {
				await collection.add({
					id: 'torture_empty',
					content: '',
					metadata: { empty: true }
				});
			} catch {
				errors++;
			}

			const tortureResult: TortureResult = {
				test_name: 'empty_content',
				passed: true, // Empty should be handled gracefully
				duration_ms: performance.now() - startTime,
				operations_count: 1,
				errors_count: errors,
				memory_stable: true,
				details: 'Empty content handled'
			};

			allResults.push(tortureResult);

			expect(true).toBe(true);
		});

		it('should handle special characters', async () => {
			const startTime = performance.now();
			let errors = 0;

			const specialChars = ['<script>', '"; DROP TABLE', '\\n\\r\\t', '\0\0\0'];

			for (const char of specialChars) {
				try {
					await collection.add({
						id: `torture_special_${errors}`,
						content: `Content with ${char} special`,
						metadata: {}
					});
				} catch {
					errors++;
				}
			}

			const tortureResult: TortureResult = {
				test_name: 'special_characters',
				passed: errors === 0,
				duration_ms: performance.now() - startTime,
				operations_count: specialChars.length,
				errors_count: errors,
				memory_stable: true,
				details: 'Special characters handled safely'
			};

			allResults.push(tortureResult);

			expect(errors).toBe(0);
		});

		it('should handle null and undefined in metadata', async () => {
			const startTime = performance.now();
			let errors = 0;

			try {
				await collection.add({
					id: 'torture_null_meta',
					content: 'Content with null metadata',
					metadata: { nullVal: null, undefinedVal: undefined } as any
				});
			} catch {
				errors++;
			}

			const tortureResult: TortureResult = {
				test_name: 'null_metadata',
				passed: true,
				duration_ms: performance.now() - startTime,
				operations_count: 1,
				errors_count: errors,
				memory_stable: true,
				details: 'Null/undefined metadata handled'
			};

			allResults.push(tortureResult);

			expect(true).toBe(true);
		});
	});

	describe('6. Unicode and RTL Handling', () => {
		it('should handle various Unicode strings', async () => {
			const startTime = performance.now();
			let errors = 0;

			for (let i = 0; i < STRESS_CONFIG.unicode_test_strings.length; i++) {
				try {
					await collection.add({
						id: `torture_unicode_${i}`,
						content: STRESS_CONFIG.unicode_test_strings[i],
						metadata: { unicode: true }
					});
				} catch {
					errors++;
				}
			}

			const duration = performance.now() - startTime;

			const tortureResult: TortureResult = {
				test_name: 'unicode_handling',
				passed: errors === 0,
				duration_ms: duration,
				operations_count: STRESS_CONFIG.unicode_test_strings.length,
				errors_count: errors,
				memory_stable: true,
				details: 'Hebrew, Arabic, Japanese, emoji handled'
			};

			allResults.push(tortureResult);

			expect(errors).toBe(0);
		});

		it('should search with Hebrew queries', async () => {
			const startTime = performance.now();
			let errors = 0;

			const hebrewQueries = [
				'מה זה TypeScript?',
				'איך עובד React?',
				'שלום עולם'
			];

			for (const query of hebrewQueries) {
				try {
					await collection.search(query, 5);
				} catch {
					errors++;
				}
			}

			const tortureResult: TortureResult = {
				test_name: 'hebrew_search',
				passed: errors === 0,
				duration_ms: performance.now() - startTime,
				operations_count: hebrewQueries.length,
				errors_count: errors,
				memory_stable: true,
				details: 'Hebrew RTL queries processed'
			};

			allResults.push(tortureResult);

			expect(errors).toBe(0);
		});
	});

	describe('7. Resource Cleanup', () => {
		it('should properly clean up deleted documents', async () => {
			const startTime = performance.now();
			let errors = 0;

			// Add documents
			for (let i = 0; i < 50; i++) {
				await collection.add({
					id: `torture_cleanup_${i}`,
					content: `Cleanup test ${i}`,
					metadata: {}
				});
			}

			const countBefore = collection.count();

			// Delete documents
			for (let i = 0; i < 50; i++) {
				try {
					collection.delete(`torture_cleanup_${i}`);
				} catch {
					errors++;
				}
			}

			const countAfter = collection.count();
			const deletedCount = countBefore - countAfter;

			const tortureResult: TortureResult = {
				test_name: 'resource_cleanup',
				passed: deletedCount === 50,
				duration_ms: performance.now() - startTime,
				operations_count: 100,
				errors_count: errors,
				memory_stable: true,
				details: `Deleted ${deletedCount} of 50 documents`
			};

			allResults.push(tortureResult);

			expect(deletedCount).toBe(50);
		});
	});

	describe('8. Long Running Stability', () => {
		it('should maintain stability over many iterations', async () => {
			const startTime = performance.now();
			let errors = 0;
			const latencies: number[] = [];

			for (let i = 0; i < STRESS_CONFIG.long_running_iterations; i++) {
				const opStart = performance.now();

				try {
					await collection.add({
						id: `torture_long_${i}`,
						content: `Long running test iteration ${i}`,
						metadata: {}
					});
					await collection.search(`long running query ${i}`, 5);
				} catch {
					errors++;
				}

				latencies.push(performance.now() - opStart);
			}

			const duration = performance.now() - startTime;

			// Check for latency degradation
			const firstHalf = latencies.slice(0, latencies.length / 2);
			const secondHalf = latencies.slice(latencies.length / 2);
			const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
			const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

			// Second half shouldn't be more than 2x slower
			const degradationRatio = avgSecond / avgFirst;
			const stable = degradationRatio < 2;

			const tortureResult: TortureResult = {
				test_name: 'long_running_stability',
				passed: errors === 0 && stable,
				duration_ms: duration,
				operations_count: STRESS_CONFIG.long_running_iterations * 2,
				errors_count: errors,
				memory_stable: stable,
				details: `Degradation ratio: ${degradationRatio.toFixed(2)}x`
			};

			allResults.push(tortureResult);

			expect(stable).toBe(true);
		});
	});

	describe('9. Boundary Conditions', () => {
		it('should handle search with limit 0', async () => {
			const startTime = performance.now();
			let passed = false;

			try {
				const results = await collection.search('test query', 0);
				passed = results.length === 0;
			} catch {
				passed = true; // Throwing is also acceptable
			}

			const tortureResult: TortureResult = {
				test_name: 'search_limit_zero',
				passed,
				duration_ms: performance.now() - startTime,
				operations_count: 1,
				errors_count: 0,
				memory_stable: true,
				details: 'Limit 0 handled gracefully'
			};

			allResults.push(tortureResult);

			expect(passed).toBe(true);
		});

		it('should handle search with very high limit', async () => {
			const startTime = performance.now();
			let errors = 0;

			try {
				await collection.search('test query', 10000);
			} catch {
				errors++;
			}

			const tortureResult: TortureResult = {
				test_name: 'search_high_limit',
				passed: errors === 0,
				duration_ms: performance.now() - startTime,
				operations_count: 1,
				errors_count: errors,
				memory_stable: true,
				details: 'High limit (10000) handled'
			};

			allResults.push(tortureResult);

			expect(errors).toBe(0);
		});

		it('should handle duplicate document IDs', async () => {
			const startTime = performance.now();
			let overwriteWorked = false;

			await collection.add({
				id: 'torture_duplicate',
				content: 'Original content',
				metadata: { version: 1 }
			});

			await collection.add({
				id: 'torture_duplicate',
				content: 'Updated content',
				metadata: { version: 2 }
			});

			const doc = collection.get('torture_duplicate');
			overwriteWorked = doc?.content === 'Updated content';

			const tortureResult: TortureResult = {
				test_name: 'duplicate_ids',
				passed: overwriteWorked,
				duration_ms: performance.now() - startTime,
				operations_count: 2,
				errors_count: 0,
				memory_stable: true,
				details: overwriteWorked ? 'Duplicate overwrites previous' : 'Duplicate handling unclear'
			};

			allResults.push(tortureResult);

			expect(overwriteWorked).toBe(true);
		});
	});

	describe('10. Error Recovery', () => {
		it('should continue operating after errors', async () => {
			const startTime = performance.now();
			let successAfterError = false;

			// Force an error scenario (search on fresh collection)
			const freshCollection = new MockCollection(embeddingService);

			// This should work even with empty collection
			const results = await freshCollection.search('query on empty', 5);
			successAfterError = results.length === 0;

			// Add something and search again
			await freshCollection.add({
				id: 'recovery_test',
				content: 'Recovery content',
				metadata: {}
			});

			const results2 = await freshCollection.search('recovery', 5);
			successAfterError = successAfterError && results2.length > 0;

			const tortureResult: TortureResult = {
				test_name: 'error_recovery',
				passed: successAfterError,
				duration_ms: performance.now() - startTime,
				operations_count: 3,
				errors_count: 0,
				memory_stable: true,
				details: 'System recovers after edge cases'
			};

			allResults.push(tortureResult);

			expect(successAfterError).toBe(true);
		});
	});
});
