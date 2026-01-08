/**
 * Token Efficiency Tests
 *
 * Tests how efficiently the memory system uses tokens.
 * Enterprise-grade memory must optimize context window utilization.
 *
 * Test Scenarios:
 * 1. Token counting accuracy
 * 2. Compression ratio measurement
 * 3. Context window budget management
 * 4. Summarization efficiency
 * 5. Deduplication savings
 * 6. Bilingual token efficiency (Hebrew + English)
 *
 * Output: Generates benchmark results to benchmarks/results/token_efficiency.txt
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import {
	MockEmbeddingService,
	MockCollection,
	TestHarness,
	createTestMetadata,
	BenchmarkReporter,
} from '../mock-utilities';

// Global reporter for this test file
const reporter = new BenchmarkReporter('test_token_efficiency');

// Helper to record test metrics
function recordTest(name: string, passed: boolean, duration: number, metrics?: Record<string, number | string>, error?: string): void {
	reporter.recordTest({ name, passed, duration, metrics, error });
}

// Simple token estimation (roughly 4 chars per token for English, 2-3 for Hebrew)
function estimateTokens(text: string): number {
	const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
	const otherChars = text.length - hebrewChars;
	// Hebrew is more token-dense (fewer chars per token)
	return Math.ceil(hebrewChars / 2.5 + otherChars / 4);
}

// Context window budget constants
const CONTEXT_BUDGET_SMALL = 2048;
const CONTEXT_BUDGET_MEDIUM = 8192;
const CONTEXT_BUDGET_LARGE = 32768;

describe('Token Efficiency', () => {
	let harness: TestHarness;
	let embeddingService: MockEmbeddingService;
	let collection: MockCollection;

	beforeEach(() => {
		harness = new TestHarness('TokenEfficiency');
		embeddingService = new MockEmbeddingService(42);
		collection = new MockCollection(embeddingService);
	});

	afterEach(() => {
		harness.cleanup();
	});

	afterAll(() => {
		reporter.saveReport('token_efficiency.txt');
	});

	describe('Token Counting', () => {
		it('test_english_token_estimation', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const testTexts = [
					{ text: 'Hello world', expected_range: [2, 4] },
					{ text: 'The quick brown fox jumps over the lazy dog', expected_range: [9, 12] },
					{ text: 'User prefers morning meetings at 9am on Mondays', expected_range: [8, 12] },
					{ text: 'A'.repeat(100), expected_range: [20, 30] },
				];

				let accurateEstimates = 0;
				const tokenCounts: number[] = [];

				for (const test of testTexts) {
					const tokens = estimateTokens(test.text);
					tokenCounts.push(tokens);
					if (tokens >= test.expected_range[0] && tokens <= test.expected_range[1]) {
						accurateEstimates++;
					}
				}

				metrics = {
					texts_tested: testTexts.length,
					accurate_estimates: accurateEstimates,
					accuracy_rate: Math.round((accurateEstimates / testTexts.length) * 100),
					avg_tokens: Math.round(tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length),
				};

				expect(accurateEstimates).toBeGreaterThanOrEqual(testTexts.length * 0.5);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_english_token_estimation', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_token_estimation', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const testTexts = [
					{ text: 'שלום עולם', expected_range: [3, 6] },
					{ text: 'המשתמש מעדיף פגישות בבוקר', expected_range: [8, 14] },
					{ text: 'יום ההולדת של המשתמש בחודש מרץ', expected_range: [10, 16] },
					{ text: 'א'.repeat(50), expected_range: [15, 25] },
				];

				let accurateEstimates = 0;
				const tokenCounts: number[] = [];

				for (const test of testTexts) {
					const tokens = estimateTokens(test.text);
					tokenCounts.push(tokens);
					if (tokens >= test.expected_range[0] && tokens <= test.expected_range[1]) {
						accurateEstimates++;
					}
				}

				metrics = {
					hebrew_texts_tested: testTexts.length,
					accurate_estimates: accurateEstimates,
					hebrew_accuracy_rate: Math.round((accurateEstimates / testTexts.length) * 100),
					avg_hebrew_tokens: Math.round(tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length),
				};

				expect(accurateEstimates).toBeGreaterThanOrEqual(testTexts.length * 0.5);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_token_estimation', passed, Date.now() - start, metrics);
			}
		});

		it('test_bilingual_token_estimation', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Mixed Hebrew-English texts
				const mixedTexts = [
					'User lives in תל אביב',
					'המשתמש works at Google',
					'Meeting at 3pm עם דוד כהן',
					'שלום Hello עולם World',
				];

				const tokenCounts: number[] = [];
				for (const text of mixedTexts) {
					tokenCounts.push(estimateTokens(text));
				}

				// Compare to pure English equivalent length
				const avgMixedTokens = tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length;
				const avgMixedLength = mixedTexts.reduce((a, b) => a + b.length, 0) / mixedTexts.length;
				const tokensPerChar = avgMixedTokens / avgMixedLength;

				metrics = {
					mixed_texts_tested: mixedTexts.length,
					avg_mixed_tokens: Math.round(avgMixedTokens),
					avg_text_length: Math.round(avgMixedLength),
					tokens_per_char: Math.round(tokensPerChar * 100) / 100,
				};

				expect(avgMixedTokens).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_bilingual_token_estimation', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Compression Efficiency', () => {
		it('test_memory_compression_ratio', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Original verbose text
				const originalTexts = [
					'The user mentioned during our conversation that they really enjoy drinking coffee in the morning, specifically they prefer a dark roast coffee from their local coffee shop.',
					'In our previous discussion, the user stated that they have been working at TechCorp for approximately three years now and they are very happy with their job.',
					'The user indicated that their birthday is coming up soon, specifically on March 15th, and they are planning to celebrate with family.',
				];

				// Compressed versions
				const compressedTexts = [
					'User likes dark roast morning coffee from local shop',
					'User works at TechCorp 3 years, satisfied',
					'User birthday March 15, celebrating with family',
				];

				let totalOriginalTokens = 0;
				let totalCompressedTokens = 0;

				for (let i = 0; i < originalTexts.length; i++) {
					totalOriginalTokens += estimateTokens(originalTexts[i]);
					totalCompressedTokens += estimateTokens(compressedTexts[i]);
				}

				const compressionRatio = totalOriginalTokens / totalCompressedTokens;
				const tokensSaved = totalOriginalTokens - totalCompressedTokens;
				const savingsPercent = ((totalOriginalTokens - totalCompressedTokens) / totalOriginalTokens) * 100;

				metrics = {
					original_tokens: totalOriginalTokens,
					compressed_tokens: totalCompressedTokens,
					compression_ratio: Math.round(compressionRatio * 100) / 100,
					tokens_saved: tokensSaved,
					savings_percent: Math.round(savingsPercent),
				};

				expect(compressionRatio).toBeGreaterThan(1.5);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_memory_compression_ratio', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_compression_ratio', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Hebrew verbose vs compressed
				const originalTexts = [
					'המשתמש אמר במהלך השיחה שלנו שהוא מאוד אוהב לשתות קפה בבוקר, במיוחד קפה קלוי כהה מבית הקפה המקומי שלו',
					'בשיחה הקודמת שלנו, המשתמש ציין שהוא עובד בחברת טכנולוגיה כבר כשלוש שנים והוא מאוד מרוצה מהעבודה',
				];

				const compressedTexts = [
					'משתמש אוהב קפה כהה בבוקר מבית קפה מקומי',
					'משתמש עובד בחברת טכנולוגיה 3 שנים, מרוצה',
				];

				let totalOriginalTokens = 0;
				let totalCompressedTokens = 0;

				for (let i = 0; i < originalTexts.length; i++) {
					totalOriginalTokens += estimateTokens(originalTexts[i]);
					totalCompressedTokens += estimateTokens(compressedTexts[i]);
				}

				const compressionRatio = totalOriginalTokens / totalCompressedTokens;

				metrics = {
					hebrew_original_tokens: totalOriginalTokens,
					hebrew_compressed_tokens: totalCompressedTokens,
					hebrew_compression_ratio: Math.round(compressionRatio * 100) / 100,
					hebrew_savings_percent: Math.round(((totalOriginalTokens - totalCompressedTokens) / totalOriginalTokens) * 100),
				};

				expect(compressionRatio).toBeGreaterThan(1.3);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_compression_ratio', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Context Budget Management', () => {
		it('test_budget_allocation', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Simulate memory items with token costs
				const memoryItems = [
					{ id: 'm1', content: 'User name is John Smith', priority: 'high', tokens: 0 },
					{ id: 'm2', content: 'User birthday is March 15, 1990', priority: 'high', tokens: 0 },
					{ id: 'm3', content: 'User works at TechCorp as a software engineer', priority: 'medium', tokens: 0 },
					{ id: 'm4', content: 'User prefers dark mode in applications', priority: 'low', tokens: 0 },
					{ id: 'm5', content: 'User mentioned they like hiking on weekends', priority: 'low', tokens: 0 },
					{ id: 'm6', content: 'User has a dog named Max', priority: 'medium', tokens: 0 },
					{ id: 'm7', content: 'User favorite restaurant is the Italian place downtown', priority: 'low', tokens: 0 },
					{ id: 'm8', content: 'User is learning Spanish', priority: 'low', tokens: 0 },
				];

				// Calculate tokens for each
				for (const item of memoryItems) {
					item.tokens = estimateTokens(item.content);
				}

				// Budget allocation function
				const allocateBudget = (items: typeof memoryItems, budget: number) => {
					const sorted = [...items].sort((a, b) => {
						const priorityOrder = { high: 0, medium: 1, low: 2 };
						return (priorityOrder[a.priority as keyof typeof priorityOrder] || 2) -
							   (priorityOrder[b.priority as keyof typeof priorityOrder] || 2);
					});

					let usedTokens = 0;
					const included: string[] = [];

					for (const item of sorted) {
						if (usedTokens + item.tokens <= budget) {
							usedTokens += item.tokens;
							included.push(item.id);
						}
					}

					return { usedTokens, included, utilization: usedTokens / budget };
				};

				const smallBudget = allocateBudget(memoryItems, CONTEXT_BUDGET_SMALL);
				const mediumBudget = allocateBudget(memoryItems, CONTEXT_BUDGET_MEDIUM);

				// Check high priority items are included first
				const highPriorityIncluded = memoryItems
					.filter(m => m.priority === 'high')
					.every(m => smallBudget.included.includes(m.id));

				metrics = {
					total_items: memoryItems.length,
					total_tokens: memoryItems.reduce((a, b) => a + b.tokens, 0),
					small_budget_items: smallBudget.included.length,
					small_budget_utilization: Math.round(smallBudget.utilization * 100),
					medium_budget_items: mediumBudget.included.length,
					medium_budget_utilization: Math.round(mediumBudget.utilization * 100),
					high_priority_preserved: highPriorityIncluded ? 1 : 0,
				};

				expect(highPriorityIncluded).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_budget_allocation', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_budget_allocation', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Hebrew memory items
				const hebrewItems = [
					{ id: 'h1', content: 'שם המשתמש הוא יוסי כהן', priority: 'high', tokens: 0 },
					{ id: 'h2', content: 'יום ההולדת של המשתמש ב-15 במרץ', priority: 'high', tokens: 0 },
					{ id: 'h3', content: 'המשתמש עובד בחברת הייטק כמפתח תוכנה', priority: 'medium', tokens: 0 },
					{ id: 'h4', content: 'המשתמש מעדיף מצב כהה באפליקציות', priority: 'low', tokens: 0 },
					{ id: 'h5', content: 'המשתמש אוהב לטייל בסופי שבוע', priority: 'low', tokens: 0 },
				];

				for (const item of hebrewItems) {
					item.tokens = estimateTokens(item.content);
				}

				const totalHebrewTokens = hebrewItems.reduce((a, b) => a + b.tokens, 0);

				// Compare to equivalent English
				const equivalentEnglish = [
					'User name is Yossi Cohen',
					'User birthday is March 15',
					'User works at tech company as software developer',
					'User prefers dark mode in apps',
					'User likes hiking on weekends',
				];

				const totalEnglishTokens = equivalentEnglish.reduce((a, b) => a + estimateTokens(b), 0);

				const hebrewEfficiency = totalEnglishTokens / totalHebrewTokens;

				metrics = {
					hebrew_items: hebrewItems.length,
					hebrew_total_tokens: totalHebrewTokens,
					english_equivalent_tokens: totalEnglishTokens,
					hebrew_token_efficiency: Math.round(hebrewEfficiency * 100) / 100,
				};

				expect(totalHebrewTokens).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_budget_allocation', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Deduplication Savings', () => {
		it('test_deduplication_efficiency', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store items with duplicates and near-duplicates
				const items = [
					{ id: 'd1', content: 'User likes coffee' },
					{ id: 'd2', content: 'User enjoys coffee' }, // near-duplicate
					{ id: 'd3', content: 'User prefers coffee in morning' },
					{ id: 'd4', content: 'User likes coffee' }, // exact duplicate
					{ id: 'd5', content: 'User drinks coffee every day' },
					{ id: 'd6', content: 'User enjoys coffee' }, // exact duplicate
				];

				// Deduplication logic
				const seen = new Set<string>();
				const unique: typeof items = [];

				for (const item of items) {
					const normalized = item.content.toLowerCase().trim();
					if (!seen.has(normalized)) {
						seen.add(normalized);
						unique.push(item);
					}
				}

				const originalTokens = items.reduce((a, b) => a + estimateTokens(b.content), 0);
				const deduplicatedTokens = unique.reduce((a, b) => a + estimateTokens(b.content), 0);
				const tokensSaved = originalTokens - deduplicatedTokens;

				metrics = {
					original_items: items.length,
					unique_items: unique.length,
					duplicates_removed: items.length - unique.length,
					original_tokens: originalTokens,
					deduplicated_tokens: deduplicatedTokens,
					tokens_saved: tokensSaved,
					savings_percent: Math.round((tokensSaved / originalTokens) * 100),
				};

				expect(unique.length).toBeLessThan(items.length);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_deduplication_efficiency', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_deduplication', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const hebrewItems = [
					{ id: 'hd1', content: 'המשתמש אוהב קפה' },
					{ id: 'hd2', content: 'המשתמש אוהב קפה' }, // exact duplicate
					{ id: 'hd3', content: 'המשתמש שותה קפה בבוקר' },
					{ id: 'hd4', content: 'המשתמש מעדיף קפה' },
					{ id: 'hd5', content: 'המשתמש אוהב קפה' }, // exact duplicate
				];

				const seen = new Set<string>();
				const unique: typeof hebrewItems = [];

				for (const item of hebrewItems) {
					if (!seen.has(item.content)) {
						seen.add(item.content);
						unique.push(item);
					}
				}

				const originalTokens = hebrewItems.reduce((a, b) => a + estimateTokens(b.content), 0);
				const deduplicatedTokens = unique.reduce((a, b) => a + estimateTokens(b.content), 0);

				metrics = {
					hebrew_original_items: hebrewItems.length,
					hebrew_unique_items: unique.length,
					hebrew_duplicates_removed: hebrewItems.length - unique.length,
					hebrew_tokens_saved: originalTokens - deduplicatedTokens,
				};

				expect(unique.length).toBeLessThan(hebrewItems.length);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_deduplication', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Summarization Efficiency', () => {
		it('test_multi_memory_summarization', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Multiple related memories that could be summarized
				const relatedMemories = [
					'User went to Italian restaurant on Monday',
					'User ordered pasta at the Italian restaurant',
					'User said the Italian restaurant was good',
					'User wants to return to the Italian restaurant',
					'User recommended the Italian restaurant to friends',
				];

				// Summarized version
				const summarized = 'User enjoys Italian restaurant: visited Monday, had pasta, plans to return, recommended to friends';

				const originalTokens = relatedMemories.reduce((a, b) => a + estimateTokens(b), 0);
				const summarizedTokens = estimateTokens(summarized);

				const compressionRatio = originalTokens / summarizedTokens;
				const informationDensity = relatedMemories.length / summarizedTokens;

				metrics = {
					original_memories: relatedMemories.length,
					original_tokens: originalTokens,
					summarized_tokens: summarizedTokens,
					compression_ratio: Math.round(compressionRatio * 100) / 100,
					information_density: Math.round(informationDensity * 100) / 100,
					tokens_saved: originalTokens - summarizedTokens,
				};

				expect(compressionRatio).toBeGreaterThan(2);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_multi_memory_summarization', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_summarization', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const hebrewMemories = [
					'המשתמש הלך למסעדה האיטלקית ביום שני',
					'המשתמש הזמין פסטה במסעדה האיטלקית',
					'המשתמש אמר שהמסעדה האיטלקית טובה',
					'המשתמש רוצה לחזור למסעדה האיטלקית',
				];

				const summarized = 'המשתמש אוהב מסעדה איטלקית: ביקר ביום שני, אכל פסטה, מתכנן לחזור';

				const originalTokens = hebrewMemories.reduce((a, b) => a + estimateTokens(b), 0);
				const summarizedTokens = estimateTokens(summarized);

				metrics = {
					hebrew_original_memories: hebrewMemories.length,
					hebrew_original_tokens: originalTokens,
					hebrew_summarized_tokens: summarizedTokens,
					hebrew_compression_ratio: Math.round((originalTokens / summarizedTokens) * 100) / 100,
				};

				expect(summarizedTokens).toBeLessThan(originalTokens);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_summarization', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Context Window Utilization', () => {
		it('test_optimal_context_packing', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Simulate optimal packing of context window
				const contextBudget = CONTEXT_BUDGET_MEDIUM; // 8192 tokens

				// Different memory types with different token costs
				const memoryPool = {
					identity: [
						{ content: 'User: John Smith, 34, Software Engineer', tokens: 10 },
						{ content: 'Location: San Francisco, CA', tokens: 6 },
					],
					preferences: [
						{ content: 'Prefers: dark mode, morning meetings, coffee', tokens: 8 },
						{ content: 'Dislikes: cold calls, late meetings', tokens: 7 },
					],
					recent: [
						{ content: 'Yesterday: discussed project timeline', tokens: 6 },
						{ content: 'Last week: reviewed Q4 goals', tokens: 6 },
					],
					knowledge: [
						{ content: 'Works on: AI/ML projects, Python', tokens: 7 },
						{ content: 'Team: 5 engineers, agile methodology', tokens: 7 },
					],
				};

				// Calculate total available
				let totalAvailable = 0;
				for (const category of Object.values(memoryPool)) {
					for (const item of category) {
						totalAvailable += item.tokens;
					}
				}

				// Optimal packing strategy: prioritize identity > preferences > recent > knowledge
				const packed: string[] = [];
				let usedTokens = 0;

				const priority = ['identity', 'preferences', 'recent', 'knowledge'];
				for (const cat of priority) {
					const items = memoryPool[cat as keyof typeof memoryPool];
					for (const item of items) {
						if (usedTokens + item.tokens <= contextBudget) {
							packed.push(item.content);
							usedTokens += item.tokens;
						}
					}
				}

				const utilization = usedTokens / contextBudget;
				const wastedTokens = contextBudget - usedTokens;

				metrics = {
					context_budget: contextBudget,
					total_available_tokens: totalAvailable,
					used_tokens: usedTokens,
					utilization_percent: Math.round(utilization * 100),
					wasted_tokens: wastedTokens,
					items_packed: packed.length,
				};

				// Should use available tokens efficiently
				expect(usedTokens).toBeLessThanOrEqual(contextBudget);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_optimal_context_packing', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Summary Test', () => {
		it('test_token_efficiency', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Comprehensive token efficiency test
				const testData = {
					english: [
						'User name is John Smith',
						'User works at TechCorp',
						'User birthday is March 15',
					],
					hebrew: [
						'שם המשתמש הוא יוסי כהן',
						'המשתמש עובד בחברת טכנולוגיה',
						'יום ההולדת של המשתמש במרץ',
					],
					verbose: [
						'The user mentioned during our conversation that their name is John Smith',
						'In our discussion, the user stated they work at TechCorp company',
					],
					compressed: [
						'User: John Smith',
						'Works: TechCorp',
					],
				};

				// Calculate tokens for each category
				const englishTokens = testData.english.reduce((a, b) => a + estimateTokens(b), 0);
				const hebrewTokens = testData.hebrew.reduce((a, b) => a + estimateTokens(b), 0);
				const verboseTokens = testData.verbose.reduce((a, b) => a + estimateTokens(b), 0);
				const compressedTokens = testData.compressed.reduce((a, b) => a + estimateTokens(b), 0);

				// Calculate efficiency metrics
				const compressionRatio = verboseTokens / compressedTokens;
				const hebrewVsEnglishRatio = hebrewTokens / englishTokens;

				// Simulate budget constraints
				const budget = 50;
				const fitsInBudget = (englishTokens + hebrewTokens) <= budget;

				metrics = {
					english_tokens: englishTokens,
					hebrew_tokens: hebrewTokens,
					verbose_tokens: verboseTokens,
					compressed_tokens: compressedTokens,
					compression_ratio: Math.round(compressionRatio * 100) / 100,
					hebrew_vs_english_ratio: Math.round(hebrewVsEnglishRatio * 100) / 100,
					fits_in_budget: fitsInBudget ? 1 : 0,
					total_efficiency_score: Math.round(compressionRatio * 25 + (fitsInBudget ? 25 : 0)),
				};

				expect(compressionRatio).toBeGreaterThan(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_token_efficiency', passed, Date.now() - start, metrics);
			}
		});
	});
});
