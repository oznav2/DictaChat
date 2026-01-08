/**
 * Outcome Learning A/B Tests
 *
 * Tests A/B comparison of outcome-based learning effectiveness.
 * Measures how memory system adapts based on user feedback and outcomes.
 *
 * Test Scenarios:
 * 1. Learning vs No-Learning comparison
 * 2. Positive vs Negative feedback impact
 * 3. Learning convergence speed
 * 4. Context-specific learning
 * 5. Wilson score confidence intervals
 * 6. Bilingual learning (Hebrew + English)
 *
 * Output: Generates benchmark results to benchmarks/results/outcome_learning_ab.txt
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import {
	MockEmbeddingService,
	MockCollection,
	TestHarness,
	createTestMetadata,
	calculateWilsonScore,
	BenchmarkReporter,
} from '../mock-utilities';

// Global reporter for this test file
const reporter = new BenchmarkReporter('test_outcome_learning_ab');

// Helper to record test metrics
function recordTest(name: string, passed: boolean, duration: number, metrics?: Record<string, number | string>, error?: string): void {
	reporter.recordTest({ name, passed, duration, metrics, error });
}

// Outcome types
type Outcome = 'positive' | 'negative' | 'neutral';

// Memory with outcome learning
class LearningMemory {
	private collection: MockCollection;
	private outcomes: Map<string, { positive: number; negative: number; neutral: number }> = new Map();
	private learningEnabled: boolean;
	private learningRate: number;

	constructor(embeddingService: MockEmbeddingService, learningEnabled: boolean = true, learningRate: number = 0.1) {
		this.collection = new MockCollection(embeddingService);
		this.learningEnabled = learningEnabled;
		this.learningRate = learningRate;
	}

	async add(id: string, content: string, metadata: Record<string, unknown> = {}): Promise<void> {
		await this.collection.add({
			id,
			content,
			metadata: {
				...createTestMetadata(),
				...metadata,
				initial_score: 1.0,
			},
		});
		this.outcomes.set(id, { positive: 0, negative: 0, neutral: 0 });
	}

	recordOutcome(id: string, outcome: Outcome): void {
		if (!this.learningEnabled) return;

		const current = this.outcomes.get(id) || { positive: 0, negative: 0, neutral: 0 };
		current[outcome]++;
		this.outcomes.set(id, current);
	}

	getConfidence(id: string): number {
		const outcomes = this.outcomes.get(id);
		if (!outcomes) return 0.5;

		const total = outcomes.positive + outcomes.negative + outcomes.neutral;
		if (total === 0) return 0.5;

		// Wilson score based on positive outcomes
		return calculateWilsonScore(outcomes.positive, total);
	}

	getEffectiveness(id: string): { score: number; confidence: number; samples: number } {
		const outcomes = this.outcomes.get(id);
		if (!outcomes) return { score: 0.5, confidence: 0, samples: 0 };

		const total = outcomes.positive + outcomes.negative;
		if (total === 0) return { score: 0.5, confidence: 0, samples: 0 };

		const score = outcomes.positive / total;
		const confidence = calculateWilsonScore(outcomes.positive, total);

		return { score, confidence, samples: total };
	}

	async search(query: string, limit: number): Promise<Array<{ id: string; content: string; baseScore: number; adjustedScore: number; confidence: number }>> {
		const results = await this.collection.search(query, limit * 2);

		const scored = results.map(r => {
			const baseScore = r.score;
			const confidence = this.getConfidence(r.document.id);

			// Apply learning adjustment
			let adjustedScore = baseScore;
			if (this.learningEnabled) {
				// Boost or penalize based on learned confidence
				adjustedScore = baseScore * (0.5 + confidence);
			}

			return {
				id: r.document.id,
				content: r.document.content,
				baseScore,
				adjustedScore,
				confidence,
			};
		});

		return scored.sort((a, b) => b.adjustedScore - a.adjustedScore).slice(0, limit);
	}

	isLearningEnabled(): boolean {
		return this.learningEnabled;
	}
}

describe('Outcome Learning A/B Tests', () => {
	let harness: TestHarness;
	let embeddingService: MockEmbeddingService;

	beforeEach(() => {
		harness = new TestHarness('OutcomeLearningAB');
		embeddingService = new MockEmbeddingService(42);
	});

	afterEach(() => {
		harness.cleanup();
	});

	afterAll(() => {
		reporter.saveReport('outcome_learning_ab.txt');
	});

	describe('Learning vs No-Learning Comparison', () => {
		it('test_ab_learning_effectiveness', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Group A: Learning enabled
				const groupA = new LearningMemory(embeddingService, true);
				// Group B: Learning disabled
				const groupB = new LearningMemory(embeddingService, false);

				// Same data for both groups
				const testData = [
					{ id: 'ab1', content: 'Restaurant recommendation: Italian place downtown' },
					{ id: 'ab2', content: 'Restaurant recommendation: Chinese restaurant' },
					{ id: 'ab3', content: 'Restaurant recommendation: Mexican food truck' },
				];

				for (const item of testData) {
					await groupA.add(item.id, item.content);
					await groupB.add(item.id, item.content);
				}

				// Simulate user feedback - Italian is preferred
				for (let i = 0; i < 10; i++) {
					groupA.recordOutcome('ab1', 'positive');
					groupA.recordOutcome('ab2', 'negative');
					groupA.recordOutcome('ab3', 'neutral');
				}

				// Search in both groups
				const query = 'restaurant recommendation';
				const resultsA = await groupA.search(query, 3);
				const resultsB = await groupB.search(query, 3);

				// Check if learning group ranks Italian higher
				const italianRankA = resultsA.findIndex(r => r.id === 'ab1');
				const italianRankB = resultsB.findIndex(r => r.id === 'ab1');

				// Get confidence for Italian in learning group
				const italianConfidence = groupA.getConfidence('ab1');

				metrics = {
					learning_group_italian_rank: italianRankA + 1,
					control_group_italian_rank: italianRankB + 1,
					learning_improved_rank: italianRankA < italianRankB ? 1 : 0,
					italian_confidence: Math.round(italianConfidence * 100),
					learning_enabled_a: groupA.isLearningEnabled() ? 1 : 0,
					learning_enabled_b: groupB.isLearningEnabled() ? 1 : 0,
				};

				// Learning group should rank Italian at top
				expect(italianRankA).toBe(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_ab_learning_effectiveness', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Feedback Impact Analysis', () => {
		it('test_positive_negative_impact', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const memory = new LearningMemory(embeddingService, true);

				// Add items
				await memory.add('pn1', 'Option A for the task');
				await memory.add('pn2', 'Option B for the task');
				await memory.add('pn3', 'Option C for the task');

				// Initial effectiveness
				const initialA = memory.getEffectiveness('pn1');
				const initialB = memory.getEffectiveness('pn2');

				// Apply feedback
				for (let i = 0; i < 20; i++) {
					memory.recordOutcome('pn1', 'positive');
					memory.recordOutcome('pn2', 'negative');
				}

				// Final effectiveness
				const finalA = memory.getEffectiveness('pn1');
				const finalB = memory.getEffectiveness('pn2');

				metrics = {
					initial_a_score: Math.round(initialA.score * 100),
					final_a_score: Math.round(finalA.score * 100),
					initial_b_score: Math.round(initialB.score * 100),
					final_b_score: Math.round(finalB.score * 100),
					a_confidence: Math.round(finalA.confidence * 100),
					b_confidence: Math.round(finalB.confidence * 100),
					positive_impact: finalA.score > initialA.score ? 1 : 0,
					negative_impact: finalB.score < 0.5 ? 1 : 0,
				};

				expect(finalA.score).toBeGreaterThan(finalB.score);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_positive_negative_impact', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_feedback_impact', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const memory = new LearningMemory(embeddingService, true);

				// Hebrew options
				await memory.add('he_pn1', 'אפשרות א למשימה');
				await memory.add('he_pn2', 'אפשרות ב למשימה');

				// Apply Hebrew-specific feedback
				for (let i = 0; i < 15; i++) {
					memory.recordOutcome('he_pn1', 'positive');
					memory.recordOutcome('he_pn2', 'negative');
				}

				const heA = memory.getEffectiveness('he_pn1');
				const heB = memory.getEffectiveness('he_pn2');

				metrics = {
					hebrew_a_score: Math.round(heA.score * 100),
					hebrew_b_score: Math.round(heB.score * 100),
					hebrew_a_confidence: Math.round(heA.confidence * 100),
					hebrew_learning_effective: heA.score > heB.score ? 1 : 0,
				};

				expect(heA.score).toBeGreaterThan(heB.score);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_feedback_impact', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Learning Convergence', () => {
		it('test_convergence_speed', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const memory = new LearningMemory(embeddingService, true);

				await memory.add('conv1', 'The correct answer option');
				await memory.add('conv2', 'An incorrect answer option');

				// Track confidence over iterations
				const confidenceHistory: number[] = [];
				const targetConfidence = 0.7;

				let iterations = 0;
				const maxIterations = 50;

				while (iterations < maxIterations) {
					memory.recordOutcome('conv1', 'positive');
					const conf = memory.getConfidence('conv1');
					confidenceHistory.push(conf);

					if (conf >= targetConfidence) break;
					iterations++;
				}

				const converged = confidenceHistory[confidenceHistory.length - 1] >= targetConfidence;
				const convergenceRate = converged ? iterations : maxIterations;

				metrics = {
					iterations_to_converge: convergenceRate,
					final_confidence: Math.round(confidenceHistory[confidenceHistory.length - 1] * 100),
					target_confidence: Math.round(targetConfidence * 100),
					converged: converged ? 1 : 0,
					samples_needed: iterations,
				};

				expect(converged).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_convergence_speed', passed, Date.now() - start, metrics);
			}
		});

		it('test_learning_stability', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const memory = new LearningMemory(embeddingService, true);
				await memory.add('stab1', 'Test item for stability');

				// Build up confidence
				for (let i = 0; i < 20; i++) {
					memory.recordOutcome('stab1', 'positive');
				}
				const highConfidence = memory.getConfidence('stab1');

				// Add some negative feedback
				for (let i = 0; i < 5; i++) {
					memory.recordOutcome('stab1', 'negative');
				}
				const afterNegative = memory.getConfidence('stab1');

				// Confidence should decrease but not collapse
				const stabilityRatio = afterNegative / highConfidence;

				metrics = {
					high_confidence: Math.round(highConfidence * 100),
					after_negative: Math.round(afterNegative * 100),
					stability_ratio: Math.round(stabilityRatio * 100),
					stable: stabilityRatio > 0.5 ? 1 : 0,
				};

				// Should maintain at least 50% of confidence
				expect(stabilityRatio).toBeGreaterThan(0.5);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_learning_stability', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Context-Specific Learning', () => {
		it('test_context_isolation', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const memory = new LearningMemory(embeddingService, true);

				// Items in different contexts
				await memory.add('ctx_work1', 'Work-related answer A', { context: 'work' });
				await memory.add('ctx_work2', 'Work-related answer B', { context: 'work' });
				await memory.add('ctx_home1', 'Home-related answer A', { context: 'home' });
				await memory.add('ctx_home2', 'Home-related answer B', { context: 'home' });

				// Different feedback per context
				// At work, answer A is better
				for (let i = 0; i < 10; i++) {
					memory.recordOutcome('ctx_work1', 'positive');
					memory.recordOutcome('ctx_work2', 'negative');
				}

				// At home, answer B is better
				for (let i = 0; i < 10; i++) {
					memory.recordOutcome('ctx_home1', 'negative');
					memory.recordOutcome('ctx_home2', 'positive');
				}

				const workA = memory.getEffectiveness('ctx_work1');
				const workB = memory.getEffectiveness('ctx_work2');
				const homeA = memory.getEffectiveness('ctx_home1');
				const homeB = memory.getEffectiveness('ctx_home2');

				metrics = {
					work_a_score: Math.round(workA.score * 100),
					work_b_score: Math.round(workB.score * 100),
					home_a_score: Math.round(homeA.score * 100),
					home_b_score: Math.round(homeB.score * 100),
					work_prefers_a: workA.score > workB.score ? 1 : 0,
					home_prefers_b: homeB.score > homeA.score ? 1 : 0,
					context_isolation: (workA.score > workB.score && homeB.score > homeA.score) ? 1 : 0,
				};

				expect(workA.score).toBeGreaterThan(workB.score);
				expect(homeB.score).toBeGreaterThan(homeA.score);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_context_isolation', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Wilson Score Confidence', () => {
		it('test_wilson_score_calculation', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Test Wilson score at different sample sizes
				const testCases = [
					{ positive: 1, total: 1, expectedMin: 0.0, expectedMax: 0.5 }, // Small sample, low confidence
					{ positive: 5, total: 5, expectedMin: 0.5, expectedMax: 0.95 }, // Small sample, all positive
					{ positive: 50, total: 100, expectedMin: 0.35, expectedMax: 0.55 }, // Large sample, 50%
					{ positive: 95, total: 100, expectedMin: 0.85, expectedMax: 0.98 }, // Large sample, high rate
					{ positive: 0, total: 10, expectedMin: 0.0, expectedMax: 0.15 }, // All negative
				];

				let accurate = 0;
				const scores: number[] = [];

				for (const tc of testCases) {
					const score = calculateWilsonScore(tc.positive, tc.total);
					scores.push(score);
					if (score >= tc.expectedMin && score <= tc.expectedMax) {
						accurate++;
					}
				}

				metrics = {
					test_cases: testCases.length,
					accurate_calculations: accurate,
					accuracy_rate: Math.round((accurate / testCases.length) * 100),
					min_score: Math.round(Math.min(...scores) * 100),
					max_score: Math.round(Math.max(...scores) * 100),
				};

				expect(accurate).toBeGreaterThanOrEqual(testCases.length * 0.8);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_wilson_score_calculation', passed, Date.now() - start, metrics);
			}
		});

		it('test_confidence_growth', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Track how confidence grows with more samples
				const sampleSizes = [1, 5, 10, 25, 50, 100];
				const confidences: number[] = [];

				// 80% success rate at each sample size
				for (const size of sampleSizes) {
					const positives = Math.floor(size * 0.8);
					const conf = calculateWilsonScore(positives, size);
					confidences.push(conf);
				}

				// Confidence should increase with sample size (for same success rate)
				let monotonic = true;
				for (let i = 1; i < confidences.length; i++) {
					if (confidences[i] < confidences[i - 1]) {
						monotonic = false;
						break;
					}
				}

				metrics = {
					sample_sizes_tested: sampleSizes.length,
					min_confidence: Math.round(Math.min(...confidences) * 100),
					max_confidence: Math.round(Math.max(...confidences) * 100),
					confidence_monotonic: monotonic ? 1 : 0,
					confidence_at_100: Math.round(confidences[confidences.length - 1] * 100),
				};

				expect(monotonic).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_confidence_growth', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Bilingual Learning Comparison', () => {
		it('test_bilingual_learning_parity', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				const memory = new LearningMemory(embeddingService, true);

				// Parallel English and Hebrew items
				await memory.add('en_learn1', 'English answer option A');
				await memory.add('en_learn2', 'English answer option B');
				await memory.add('he_learn1', 'תשובה בעברית אופציה א');
				await memory.add('he_learn2', 'תשובה בעברית אופציה ב');

				// Same feedback pattern for both languages
				for (let i = 0; i < 15; i++) {
					memory.recordOutcome('en_learn1', 'positive');
					memory.recordOutcome('en_learn2', 'negative');
					memory.recordOutcome('he_learn1', 'positive');
					memory.recordOutcome('he_learn2', 'negative');
				}

				const enA = memory.getEffectiveness('en_learn1');
				const enB = memory.getEffectiveness('en_learn2');
				const heA = memory.getEffectiveness('he_learn1');
				const heB = memory.getEffectiveness('he_learn2');

				// Learning should be equivalent across languages
				const enDiff = enA.score - enB.score;
				const heDiff = heA.score - heB.score;
				const parity = Math.abs(enDiff - heDiff) < 0.1;

				metrics = {
					english_a_score: Math.round(enA.score * 100),
					english_b_score: Math.round(enB.score * 100),
					hebrew_a_score: Math.round(heA.score * 100),
					hebrew_b_score: Math.round(heB.score * 100),
					english_diff: Math.round(enDiff * 100),
					hebrew_diff: Math.round(heDiff * 100),
					learning_parity: parity ? 1 : 0,
				};

				expect(parity).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_bilingual_learning_parity', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Summary Test', () => {
		it('test_outcome_learning_ab', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Comprehensive A/B test
				const learningGroup = new LearningMemory(embeddingService, true);
				const controlGroup = new LearningMemory(embeddingService, false);

				// Add items to both
				const items = [
					{ id: 'sum1', content: 'Best answer for query', quality: 'high' },
					{ id: 'sum2', content: 'Medium answer for query', quality: 'medium' },
					{ id: 'sum3', content: 'Poor answer for query', quality: 'low' },
					{ id: 'sum4', content: 'תשובה מצוינת לשאילתה', quality: 'high' },
					{ id: 'sum5', content: 'תשובה בינונית לשאילתה', quality: 'medium' },
				];

				for (const item of items) {
					await learningGroup.add(item.id, item.content, { quality: item.quality });
					await controlGroup.add(item.id, item.content, { quality: item.quality });
				}

				// Simulate realistic feedback pattern
				for (let i = 0; i < 20; i++) {
					// High quality gets positive feedback
					learningGroup.recordOutcome('sum1', 'positive');
					learningGroup.recordOutcome('sum4', 'positive');
					// Medium gets mixed
					learningGroup.recordOutcome('sum2', i % 2 === 0 ? 'positive' : 'negative');
					learningGroup.recordOutcome('sum5', i % 2 === 0 ? 'positive' : 'negative');
					// Low gets negative
					learningGroup.recordOutcome('sum3', 'negative');
				}

				// Compare search results
				const learningResults = await learningGroup.search('answer query', 3);
				const controlResults = await controlGroup.search('answer query', 3);

				// Check if learning group ranks high quality first
				const learningRankHigh = learningResults.findIndex(r => r.id === 'sum1' || r.id === 'sum4');
				const controlRankHigh = controlResults.findIndex(r => r.id === 'sum1' || r.id === 'sum4');

				// Get effectiveness scores
				const highQualityEff = learningGroup.getEffectiveness('sum1');
				const lowQualityEff = learningGroup.getEffectiveness('sum3');

				metrics = {
					items_tested: items.length,
					feedback_rounds: 20,
					learning_high_rank: learningRankHigh + 1,
					control_high_rank: controlRankHigh + 1,
					learning_improved: learningRankHigh < controlRankHigh ? 1 : 0,
					high_quality_confidence: Math.round(highQualityEff.confidence * 100),
					low_quality_confidence: Math.round(lowQualityEff.confidence * 100),
					quality_differentiation: highQualityEff.score > lowQualityEff.score ? 1 : 0,
					ab_test_success: (learningRankHigh <= controlRankHigh && highQualityEff.score > lowQualityEff.score) ? 1 : 0,
				};

				// Learning should differentiate quality
				expect(highQualityEff.score).toBeGreaterThan(lowQualityEff.score);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_outcome_learning_ab', passed, Date.now() - start, metrics);
			}
		});
	});
});
