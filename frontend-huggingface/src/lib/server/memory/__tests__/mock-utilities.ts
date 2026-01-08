/**
 * Mock Utilities for Memory System Tests
 *
 * Adapted from roampal benchmark patterns for BricksLLM TypeScript codebase.
 * Provides deterministic mocks for embeddings, LLM, and time management.
 */

import { vi } from 'vitest';

// ============================================================================
// Constants
// ============================================================================

export const EMBEDDING_DIM = 1024;
export const DEFAULT_SEED = 42;

export const MATURITY_LEVELS = {
	cold_start: { uses: 0, score: 0.5, history: [] },
	early: { uses: 2, score: 0.55, history: ['worked', 'partial'] },
	established: { uses: 10, score: 0.7, history: Array(10).fill('worked') },
	proven: { uses: 25, score: 0.85, history: Array(25).fill('worked') },
	mature: { uses: 50, score: 0.95, history: Array(50).fill('worked') }
} as const;

export type MaturityLevel = keyof typeof MATURITY_LEVELS;

export const TEST_SCENARIOS = {
	simple_recall: {
		query: 'What is the capital of France?',
		expected_concepts: ['geography', 'capitals', 'france'],
		difficulty: 'easy'
	},
	multi_hop: {
		query: 'How does photosynthesis affect climate change?',
		expected_concepts: ['biology', 'climate', 'photosynthesis', 'carbon'],
		difficulty: 'medium'
	},
	hebrew_query: {
		query: 'מה הבירה של ישראל?',
		expected_concepts: ['geography', 'capitals', 'israel', 'hebrew'],
		difficulty: 'medium'
	},
	hebrew_family: {
		query: 'מי הם בני המשפחה שלי?',
		expected_concepts: ['family', 'relationships', 'personal'],
		difficulty: 'easy'
	},
	hebrew_work: {
		query: 'איפה אני עובד ומה התפקיד שלי?',
		expected_concepts: ['work', 'career', 'job', 'role'],
		difficulty: 'easy'
	},
	complex_reasoning: {
		query: 'Compare the economic policies of different governments',
		expected_concepts: ['economics', 'policy', 'government', 'comparison'],
		difficulty: 'hard'
	},
	bilingual_mixed: {
		query: 'Tell me about ירושלים and its history',
		expected_concepts: ['jerusalem', 'history', 'geography', 'israel'],
		difficulty: 'medium'
	}
} as const;

// ============================================================================
// Stopwords (English + Hebrew)
// ============================================================================

export const ENGLISH_STOPWORDS = new Set([
	'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
	'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
	'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
	'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'i',
	'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
	'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these',
	'those', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
	'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
	'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
	'very', 'just', 'also', 'now', 'here', 'there', 'then', 'once', 'if'
]);

export const HEBREW_STOPWORDS = new Set([
	'של', 'את', 'על', 'עם', 'זה', 'זו', 'זאת', 'אלה', 'אלו', 'הוא', 'היא',
	'הם', 'הן', 'אני', 'אתה', 'את', 'אנחנו', 'אתם', 'אתן', 'לא', 'כן', 'גם',
	'רק', 'עוד', 'כל', 'כמו', 'יותר', 'פחות', 'מאוד', 'הרבה', 'קצת', 'כבר',
	'עכשיו', 'אז', 'שם', 'פה', 'כאן', 'איפה', 'מתי', 'למה', 'איך', 'מה',
	'מי', 'אם', 'או', 'אבל', 'כי', 'ש', 'ו', 'ה', 'ב', 'ל', 'מ', 'כ',
	'היה', 'היתה', 'היו', 'יהיה', 'תהיה', 'להיות', 'אחד', 'אחת', 'שני',
	'שתי', 'שלוש', 'ארבע', 'חמש', 'בין', 'אצל', 'לפני', 'אחרי', 'תחת',
	'ליד', 'בתוך', 'מחוץ', 'דרך', 'בשביל', 'עבור', 'נגד', 'בלי', 'למרות'
]);

export type TestScenario = keyof typeof TEST_SCENARIOS;

// ============================================================================
// Seeded Random Number Generator
// ============================================================================

/**
 * Simple seeded random number generator using Linear Congruential Generator.
 * Provides deterministic random numbers for reproducible tests.
 */
export class SeededRandom {
	private seed: number;

	constructor(seed: number = DEFAULT_SEED) {
		this.seed = seed;
	}

	/**
	 * Generate next random number between 0 and 1
	 */
	next(): number {
		// LCG parameters (same as glibc)
		this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
		return this.seed / 0x7fffffff;
	}

	/**
	 * Generate random integer in range [min, max]
	 */
	nextInt(min: number, max: number): number {
		return Math.floor(this.next() * (max - min + 1)) + min;
	}

	/**
	 * Reset to initial seed
	 */
	reset(seed?: number): void {
		this.seed = seed ?? DEFAULT_SEED;
	}
}

/**
 * Generate a numeric hash from a string for deterministic seeding
 */
export function stringToSeed(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash);
}

// ============================================================================
// Mock Embedding Service
// ============================================================================

/**
 * Mock embedding service that generates deterministic embeddings.
 * Uses seeded random to ensure reproducible test results.
 */
export class MockEmbeddingService {
	private rng: SeededRandom;
	private cache: Map<string, number[]>;
	private wordCache: Map<string, number[]>;
	private callCount: number;

	constructor(seed: number = DEFAULT_SEED) {
		this.rng = new SeededRandom(seed);
		this.cache = new Map();
		this.wordCache = new Map();
		this.callCount = 0;
	}

	// Common stop words to filter out for better semantic matching
	private static STOP_WORDS = new Set([
		'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
		'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
		'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
		'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
		'through', 'during', 'before', 'after', 'above', 'below', 'between',
		'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
		'not', 'no', 'nor', 'only', 'own', 'same', 'than', 'too', 'very',
		'just', 'also', 'now', 'here', 'there', 'when', 'where', 'why', 'how',
		'all', 'each', 'every', 'any', 'some', 'such', 'what', 'which', 'who',
		'this', 'that', 'these', 'those', 'am', 'if', 'then', 'because', 'while',
		'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
		'you', 'your', 'yours', 'yourself', 'yourselves',
		'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
		'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
	]);

	/**
	 * Basic stemmer to normalize word variations (e.g., likes→like, prefers→prefer)
	 */
	private stem(word: string): string {
		// Handle irregular forms first
		const irregulars: Record<string, string> = {
			'does': 'do', 'goes': 'go', 'has': 'have', 'is': 'be', 'are': 'be',
			'was': 'be', 'were': 'be', 'been': 'be', 'being': 'be',
		};
		if (irregulars[word]) {
			return irregulars[word];
		}

		// Simple English suffix removal
		if (word.endsWith('ing') && word.length > 4) {
			return word.slice(0, -3);
		}
		if (word.endsWith('ed') && word.length > 3) {
			return word.slice(0, -2);
		}
		if (word.endsWith('ies') && word.length > 4) {
			return word.slice(0, -3) + 'y';
		}
		// Only remove 'es' for specific endings (ches, shes, xes, zes, sses)
		if (word.length > 3 && (
			word.endsWith('ches') || word.endsWith('shes') ||
			word.endsWith('xes') || word.endsWith('zes') || word.endsWith('sses')
		)) {
			return word.slice(0, -2);
		}
		// Remove simple 's' for plurals (likes→like, prefers→prefer)
		if (word.endsWith('s') && word.length > 2 && !word.endsWith('ss')) {
			return word.slice(0, -1);
		}
		return word;
	}

	/**
	 * Tokenize text into words, apply stemming and filter stop words.
	 * Handles Hebrew, English, and mixed text.
	 */
	private tokenize(text: string): string[] {
		const words = text.toLowerCase()
			.split(/[\s\p{P}]+/u)
			.filter(word => word.length > 0)
			.map(word => this.stem(word));

		// Filter stop words but keep at least some words
		const contentWords = words.filter(w => !MockEmbeddingService.STOP_WORDS.has(w));

		// If all words are stop words, return original (stemmed) words
		return contentWords.length > 0 ? contentWords : words;
	}

	/**
	 * Get or generate embedding for a single word
	 */
	private getWordEmbedding(word: string): number[] {
		if (this.wordCache.has(word)) {
			return this.wordCache.get(word)!;
		}

		// Generate deterministic embedding for this word
		const wordSeed = stringToSeed(word);
		this.rng.reset(wordSeed);

		const embedding: number[] = [];
		for (let i = 0; i < EMBEDDING_DIM; i++) {
			embedding.push(this.rng.next() * 2 - 1);
		}

		this.wordCache.set(word, embedding);
		return embedding;
	}

	/**
	 * Generate deterministic embedding for text using word-based averaging.
	 * This ensures texts sharing words have similar embeddings (semantic similarity).
	 */
	async embed(text: string): Promise<number[]> {
		this.callCount++;

		// Check cache first
		if (this.cache.has(text)) {
			return this.cache.get(text)!;
		}

		const words = this.tokenize(text);

		// Handle empty text
		if (words.length === 0) {
			const textSeed = stringToSeed(text || 'empty');
			this.rng.reset(textSeed);
			const embedding: number[] = [];
			for (let i = 0; i < EMBEDDING_DIM; i++) {
				embedding.push(this.rng.next() * 2 - 1);
			}
			const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
			const normalized = embedding.map(val => val / magnitude);
			this.cache.set(text, normalized);
			return normalized;
		}

		// Average word embeddings for semantic similarity
		const embedding: number[] = new Array(EMBEDDING_DIM).fill(0);
		for (const word of words) {
			const wordEmb = this.getWordEmbedding(word);
			for (let i = 0; i < EMBEDDING_DIM; i++) {
				embedding[i] += wordEmb[i];
			}
		}

		// Average and normalize to unit vector
		for (let i = 0; i < EMBEDDING_DIM; i++) {
			embedding[i] /= words.length;
		}

		const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
		const normalized = embedding.map(val => val / magnitude);

		this.cache.set(text, normalized);
		return normalized;
	}

	/**
	 * Batch embed multiple texts
	 */
	async embedBatch(texts: string[]): Promise<number[][]> {
		return Promise.all(texts.map(text => this.embed(text)));
	}

	/**
	 * Get call statistics
	 */
	getStats(): { callCount: number; cacheSize: number } {
		return {
			callCount: this.callCount,
			cacheSize: this.cache.size
		};
	}

	/**
	 * Reset service state
	 */
	reset(): void {
		this.cache.clear();
		this.wordCache.clear();
		this.callCount = 0;
		this.rng.reset();
	}
}

// ============================================================================
// Mock LLM Service
// ============================================================================

/**
 * Mock LLM service for testing without actual API calls.
 * Provides rule-based responses for common test scenarios.
 */
export class MockLLMService {
	private callCount: number;
	private responses: Map<string, string>;
	private defaultResponse: string;

	constructor() {
		this.callCount = 0;
		this.responses = new Map();
		this.defaultResponse = 'Mock LLM response for testing purposes.';
		this.setupDefaultResponses();
	}

	private setupDefaultResponses(): void {
		// Concept extraction responses
		this.responses.set('extract_concepts', JSON.stringify({
			concepts: ['test', 'concept', 'extraction'],
			confidence: 0.9
		}));

		// Summary responses
		this.responses.set('summarize', 'This is a mock summary of the content.');

		// Classification responses
		this.responses.set('classify', JSON.stringify({
			category: 'general',
			confidence: 0.85
		}));
	}

	/**
	 * Generate response based on prompt patterns
	 */
	async generate(prompt: string): Promise<string> {
		this.callCount++;

		// Check for registered patterns
		for (const [pattern, response] of this.responses) {
			if (prompt.toLowerCase().includes(pattern)) {
				return response;
			}
		}

		return this.defaultResponse;
	}

	/**
	 * Register custom response for pattern
	 */
	registerResponse(pattern: string, response: string): void {
		this.responses.set(pattern.toLowerCase(), response);
	}

	/**
	 * Get call count
	 */
	getCallCount(): number {
		return this.callCount;
	}

	/**
	 * Reset service state
	 */
	reset(): void {
		this.callCount = 0;
		this.responses.clear();
		this.setupDefaultResponses();
	}
}

// ============================================================================
// Mock Time Manager
// ============================================================================

/**
 * Mock time manager for testing time-dependent logic.
 * Allows advancing time and freezing at specific points.
 */
export class MockTimeManager {
	private currentTime: Date;
	private frozen: boolean;

	constructor(initialTime?: Date) {
		this.currentTime = initialTime ?? new Date();
		this.frozen = false;
	}

	/**
	 * Get current mock time
	 */
	now(): Date {
		return new Date(this.currentTime);
	}

	/**
	 * Get current time as ISO string
	 */
	nowISO(): string {
		return this.currentTime.toISOString();
	}

	/**
	 * Advance time by specified milliseconds
	 */
	advance(ms: number): void {
		if (!this.frozen) {
			this.currentTime = new Date(this.currentTime.getTime() + ms);
		}
	}

	/**
	 * Advance time by days
	 */
	advanceDays(days: number): void {
		this.advance(days * 24 * 60 * 60 * 1000);
	}

	/**
	 * Set specific time
	 */
	setTime(time: Date): void {
		this.currentTime = new Date(time);
	}

	/**
	 * Freeze time at current point
	 */
	freeze(): void {
		this.frozen = true;
	}

	/**
	 * Unfreeze time
	 */
	unfreeze(): void {
		this.frozen = false;
	}

	/**
	 * Reset to current system time
	 */
	reset(): void {
		this.currentTime = new Date();
		this.frozen = false;
	}
}

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generate test memory fragment
 */
export function createTestFragment(options: {
	id?: string;
	content?: string;
	score?: number;
	uses?: number;
	maturity?: MaturityLevel;
	metadata?: Record<string, unknown>;
}): {
	id: string;
	content: string;
	metadata: Record<string, unknown>;
} {
	const maturityConfig = options.maturity
		? MATURITY_LEVELS[options.maturity]
		: MATURITY_LEVELS.cold_start;

	return {
		id: options.id ?? `fragment_${Date.now()}_${Math.random().toString(36).slice(2)}`,
		content: options.content ?? 'Test fragment content for memory system testing.',
		metadata: {
			score: options.score ?? maturityConfig.score,
			uses: options.uses ?? maturityConfig.uses,
			outcome_history: JSON.stringify(maturityConfig.history),
			created_at: new Date().toISOString(),
			...options.metadata
		}
	};
}

/**
 * Generate batch of test fragments
 */
export function createTestFragmentBatch(
	count: number,
	options?: Partial<Parameters<typeof createTestFragment>[0]>
): ReturnType<typeof createTestFragment>[] {
	return Array.from({ length: count }, (_, i) =>
		createTestFragment({
			...options,
			id: `fragment_batch_${i}`,
			content: `Test fragment ${i + 1} content.`
		})
	);
}

/**
 * Generate test conversation history
 */
export function createTestConversation(turns: number = 5): Array<{
	role: 'user' | 'assistant';
	content: string;
}> {
	const conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [];

	for (let i = 0; i < turns; i++) {
		conversation.push({
			role: 'user',
			content: `User message ${i + 1}: This is a test query about topic ${i + 1}.`
		});
		conversation.push({
			role: 'assistant',
			content: `Assistant response ${i + 1}: Here is information about topic ${i + 1}.`
		});
	}

	return conversation;
}

// ============================================================================
// Metrics Calculation
// ============================================================================

/**
 * Calculate Mean Reciprocal Rank (MRR)
 */
export function calculateMRR(
	results: string[],
	relevantIds: Set<string>
): number {
	for (let i = 0; i < results.length; i++) {
		if (relevantIds.has(results[i])) {
			return 1 / (i + 1);
		}
	}
	return 0;
}

/**
 * Calculate normalized Discounted Cumulative Gain at K
 */
export function calculateNDCG(
	results: string[],
	relevantIds: Set<string>,
	k: number = 5
): number {
	const dcg = results.slice(0, k).reduce((sum, id, i) => {
		const rel = relevantIds.has(id) ? 1 : 0;
		return sum + rel / Math.log2(i + 2);
	}, 0);

	// Ideal DCG (all relevant items at top)
	const idealK = Math.min(k, relevantIds.size);
	const idcg = Array.from({ length: idealK }).reduce((sum: number, _, i) => {
		return sum + 1 / Math.log2(i + 2);
	}, 0);

	return idcg > 0 ? dcg / idcg : 0;
}

/**
 * Calculate Precision at K
 */
export function calculatePrecisionAtK(
	results: string[],
	relevantIds: Set<string>,
	k: number = 5
): number {
	const topK = results.slice(0, k);
	const relevant = topK.filter(id => relevantIds.has(id)).length;
	return relevant / k;
}

/**
 * Calculate all retrieval metrics
 */
export function calculateAllMetrics(
	results: string[],
	relevantIds: Set<string>,
	k: number = 5
): {
	mrr: number;
	ndcg: number;
	precision: number;
} {
	return {
		mrr: calculateMRR(results, relevantIds),
		ndcg: calculateNDCG(results, relevantIds, k),
		precision: calculatePrecisionAtK(results, relevantIds, k)
	};
}

// ============================================================================
// Test Harness
// ============================================================================

export interface TestResult {
	name: string;
	passed: boolean;
	duration: number;
	error?: string;
	metrics?: Record<string, number>;
}

export interface TestSuiteResult {
	suiteName: string;
	totalTests: number;
	passed: number;
	failed: number;
	duration: number;
	results: TestResult[];
	timestamp: string;
}

/**
 * Test harness for running and reporting tests
 * Also provides mock services for integration tests
 */
export class TestHarness {
	private results: TestResult[];
	private suiteName: string;
	private startTime: number;

	// Mock services for integration tests
	public facade: ReturnType<typeof createMockMemoryFacade>;
	public mockSearch: ReturnType<typeof createMockSearchService>;
	public collection: MockCollection;
	public mockStore: {
		store: ReturnType<typeof vi.fn>;
		get: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		archive: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
	};
	public mockOutcome: {
		recordOutcome: ReturnType<typeof vi.fn>;
		recordResponse: ReturnType<typeof vi.fn>;
	};
	public mockContext: {
		getColdStartContext: ReturnType<typeof vi.fn>;
		getContextInsights: ReturnType<typeof vi.fn>;
	};
	public mockOps: {
		promoteNow: ReturnType<typeof vi.fn>;
		getStats: ReturnType<typeof vi.fn>;
	};

	constructor(suiteName: string = 'DefaultTestSuite') {
		this.suiteName = suiteName;
		this.results = [];
		this.startTime = Date.now();

		// Create shared collection for stateful search
		this.collection = new MockCollection();

		// Initialize mock services with collection for stateful search
		this.mockSearch = createMockSearchService(this.collection);

		// Initialize facade with search that delegates to mockSearch
		this.facade = createMockMemoryFacade();

		// Initialize mock services first
		this.mockStore = {
			store: vi.fn().mockResolvedValue({ memory_id: 'mock_mem_id' }),
			get: vi.fn().mockResolvedValue(null),
			update: vi.fn().mockResolvedValue(null),
			archive: vi.fn().mockResolvedValue(true),
			delete: vi.fn().mockResolvedValue(true),
		};
		// Stateful outcome recording that updates collection Wilson scores
		this.mockOutcome = {
			recordOutcome: vi.fn().mockImplementation(async (params: {
				memoryIds?: string[];
				outcome?: 'worked' | 'failed' | 'partial';
			}) => {
				if (params.memoryIds && params.outcome) {
					for (const id of params.memoryIds) {
						this.collection.recordOutcome(id, params.outcome);
					}
				}
			}),
			recordResponse: vi.fn().mockResolvedValue(undefined),
		};
		this.mockContext = {
			getColdStartContext: vi.fn().mockResolvedValue({ text: null, debug: null }),
			getContextInsights: vi.fn().mockResolvedValue({
				matched_concepts: [],
				relevant_patterns: [],
				past_outcomes: [],
				proactive_insights: [],
				topic_continuity: { topics: [], links: [] },
				repetition: { is_repeated: false },
				you_already_know: [],
				directives: [],
			}),
			prefetchContext: vi.fn().mockResolvedValue({
				context: '<memory>\n</memory>',
				insights: { matched_concepts: [], confidence: 0 },
			}),
		};
		this.mockOps = {
			promoteNow: vi.fn().mockResolvedValue(undefined),
			getStats: vi.fn().mockResolvedValue({
				user_id: 'test_user',
				as_of: new Date().toISOString(),
				tiers: {},
				action_effectiveness: [],
			}),
		};

		// Wire facade methods to mock services
		this.facade.search = this.mockSearch.search;
		this.facade.store = this.mockStore.store;
		this.facade.getStats = this.mockOps.getStats;
		this.facade.prefetchContext = this.mockContext.prefetchContext;
	}

	/**
	 * Cleanup mocks after test
	 */
	cleanup(): void {
		vi.clearAllMocks();
		this.reset();
	}

	/**
	 * Record a test result
	 */
	recordResult(result: TestResult): void {
		this.results.push(result);
	}

	/**
	 * Generate summary report
	 */
	getSummary(): TestSuiteResult {
		const passed = this.results.filter(r => r.passed).length;
		return {
			suiteName: this.suiteName,
			totalTests: this.results.length,
			passed,
			failed: this.results.length - passed,
			duration: Date.now() - this.startTime,
			results: this.results,
			timestamp: new Date().toISOString()
		};
	}

	/**
	 * Format summary as text report
	 */
	formatReport(): string {
		const summary = this.getSummary();
		const lines: string[] = [
			'='.repeat(60),
			`TEST SUITE: ${summary.suiteName}`,
			'='.repeat(60),
			`Timestamp: ${summary.timestamp}`,
			`Duration: ${summary.duration}ms`,
			`Total: ${summary.totalTests} | Passed: ${summary.passed} | Failed: ${summary.failed}`,
			'-'.repeat(60),
			''
		];

		for (const result of summary.results) {
			const status = result.passed ? '[PASS]' : '[FAIL]';
			lines.push(`${status} ${result.name} (${result.duration}ms)`);

			if (result.metrics) {
				for (const [key, value] of Object.entries(result.metrics)) {
					lines.push(`       ${key}: ${value.toFixed(4)}`);
				}
			}

			if (result.error) {
				lines.push(`       Error: ${result.error}`);
			}
		}

		lines.push('');
		lines.push('='.repeat(60));
		lines.push(`RESULT: ${summary.failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
		lines.push('='.repeat(60));

		return lines.join('\n');
	}

	/**
	 * Reset harness for new run
	 */
	reset(): void {
		this.results = [];
		this.startTime = Date.now();
	}
}

// ============================================================================
// Mock Collection (Qdrant-like interface)
// ============================================================================

export interface MockDocument {
	id: string;
	content: string;
	embedding?: number[];
	metadata: Record<string, unknown>;
}

/**
 * Mock vector collection for testing without actual Qdrant
 */
export class MockCollection {
	private documents: Map<string, MockDocument>;
	private embeddingService: MockEmbeddingService;

	constructor(embeddingService?: MockEmbeddingService) {
		this.documents = new Map();
		this.embeddingService = embeddingService ?? new MockEmbeddingService();
	}

	/**
	 * Add document to collection
	 */
	async add(doc: Omit<MockDocument, 'embedding'>): Promise<void> {
		const embedding = await this.embeddingService.embed(doc.content);
		this.documents.set(doc.id, { ...doc, embedding });
	}

	/**
	 * Get document by ID
	 */
	get(id: string): MockDocument | undefined {
		return this.documents.get(id);
	}

	/**
	 * Search by vector similarity
	 */
	async search(query: string, limit: number = 5): Promise<Array<{
		document: MockDocument;
		score: number;
	}>> {
		const queryEmbedding = await this.embeddingService.embed(query);

		const results = Array.from(this.documents.values())
			.map(doc => ({
				document: doc,
				score: this.cosineSimilarity(queryEmbedding, doc.embedding!)
			}))
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);

		return results;
	}

	/**
	 * Update document metadata
	 */
	updateMetadata(id: string, metadata: Record<string, unknown>): boolean {
		const doc = this.documents.get(id);
		if (doc) {
			doc.metadata = { ...doc.metadata, ...metadata };
			return true;
		}
		return false;
	}

	/**
	 * Delete document
	 */
	delete(id: string): boolean {
		return this.documents.delete(id);
	}

	/**
	 * Get collection size
	 */
	count(): number {
		return this.documents.size;
	}

	/**
	 * Clear all documents
	 */
	clear(): void {
		this.documents.clear();
	}

	/**
	 * Record outcome and update Wilson score
	 */
	recordOutcome(id: string, outcome: 'worked' | 'failed' | 'partial'): boolean {
		const doc = this.documents.get(id);
		if (!doc) return false;

		const outcomeHistory = JSON.parse((doc.metadata.outcome_history as string) || '[]');
		outcomeHistory.push(outcome);

		const total = outcomeHistory.length;
		const successes = outcomeHistory.filter((o: string) => o === 'worked').length +
		                  outcomeHistory.filter((o: string) => o === 'partial').length * 0.5;

		const wilsonScore = calculateWilsonScore(successes, total);

		doc.metadata = {
			...doc.metadata,
			outcome_history: JSON.stringify(outcomeHistory),
			wilson_score: wilsonScore,
			use_count: total,
			success_count: successes
		};

		return true;
	}

	/**
	 * Calculate cosine similarity between vectors
	 */
	private cosineSimilarity(a: number[], b: number[]): number {
		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
	}
}

// ============================================================================
// Vitest Mock Helpers
// ============================================================================

/**
 * Create mock for UnifiedMemoryFacade
 */
export function createMockMemoryFacade() {
	return {
		initialize: vi.fn().mockResolvedValue(undefined),
		search: vi.fn().mockResolvedValue({ results: [], debug: { fallbacks_used: [] } }),
		store: vi.fn().mockResolvedValue({ memory_id: 'mock_mem_id', success: true }),
		storeMemory: vi.fn().mockResolvedValue({ id: 'mock_id' }),
		prefetchContext: vi.fn().mockResolvedValue({
			context: '<memory>\n</memory>',
			insights: { matched_concepts: [], confidence: 0 },
		}),
		recordOutcome: vi.fn().mockResolvedValue({ success: true }),
		getGoals: vi.fn().mockResolvedValue([]),
		addGoal: vi.fn().mockResolvedValue({ success: true }),
		removeGoal: vi.fn().mockResolvedValue({ success: true }),
		getValues: vi.fn().mockResolvedValue([]),
		addValue: vi.fn().mockResolvedValue({ success: true }),
		removeValue: vi.fn().mockResolvedValue({ success: true }),
		storeArbitraryData: vi.fn().mockResolvedValue({ success: true }),
		retrieveArbitraryData: vi.fn().mockResolvedValue(null),
		listBooks: vi.fn().mockResolvedValue([]),
		retrieveFromBooks: vi.fn().mockResolvedValue([]),
		removeBook: vi.fn().mockResolvedValue({ success: true }),
		getHealth: vi.fn().mockReturnValue({ status: 'healthy' }),
		getStats: vi.fn().mockResolvedValue({
			user_id: 'test_user',
			as_of: new Date().toISOString(),
			tiers: {},
			action_effectiveness: [],
		}),
		getConfig: vi.fn().mockReturnValue({ enabled: true }),
	};
}

/**
 * Create mock for SearchService
 * @param collection - Optional MockCollection to delegate search to (enables stateful search)
 */
export function createMockSearchService(collection?: MockCollection) {
	const searchImpl = async (query: string, options?: { limit?: number }) => {
		if (!collection) {
			return { results: [], totalCount: 0 };
		}
		const limit = options?.limit ?? 10;
		const rawResults = await collection.search(query, limit);
		const results = rawResults.map((r, idx) => ({
			id: r.document.id,
			content: r.document.content,
			metadata: r.document.metadata,
			score: r.score,
			rank: idx + 1,
			score_summary: {
				vector_score: r.score,
				text_score: r.score * 0.3,
				wilson_score: (r.document.metadata?.wilson_score as number) ?? 0.5,
				composite_score: r.score * (((r.document.metadata?.wilson_score as number) ?? 0.5) + 0.5)
			}
		}));
		return { results, totalCount: results.length };
	};

	return {
		search: vi.fn().mockImplementation(searchImpl),
		searchWithFilters: vi.fn().mockImplementation(searchImpl),
		semanticSearch: vi.fn().mockImplementation(async (query: string, limit: number = 10) => {
			if (!collection) return [];
			const raw = await collection.search(query, limit);
			return raw.map(r => ({ id: r.document.id, score: r.score, content: r.document.content }));
		}),
		hybridSearch: vi.fn().mockImplementation(async (query: string, limit: number = 10) => {
			if (!collection) return [];
			return collection.search(query, limit);
		})
	};
}

/**
 * Create mock for RetrievalService
 */
export function createMockRetrievalService() {
	return {
		retrieve: vi.fn().mockResolvedValue({ fragments: [], metadata: {} }),
		retrieveWithContext: vi.fn().mockResolvedValue({ fragments: [], context: {} }),
		getRetrievalStats: vi.fn().mockReturnValue({ totalQueries: 0, avgLatency: 0 })
	};
}

// ============================================================================
// Bilingual Concept Extraction (Roampal Pattern)
// ============================================================================

/**
 * Context keywords mapping for Hebrew and English classification
 */
export const CONTEXT_KEYWORDS = {
	work: {
		en: ['job', 'work', 'career', 'office', 'meeting', 'project', 'deadline', 'boss', 'colleague', 'salary'],
		he: ['עבודה', 'משרד', 'פגישה', 'פרויקט', 'דדליין', 'בוס', 'עמית', 'משכורת', 'קריירה', 'תפקיד']
	},
	family: {
		en: ['family', 'mom', 'dad', 'brother', 'sister', 'child', 'parent', 'spouse', 'wife', 'husband'],
		he: ['משפחה', 'אמא', 'אבא', 'אח', 'אחות', 'ילד', 'הורה', 'בן זוג', 'אישה', 'בעל']
	},
	health: {
		en: ['health', 'doctor', 'medicine', 'hospital', 'sick', 'exercise', 'diet', 'sleep', 'pain', 'symptom'],
		he: ['בריאות', 'רופא', 'תרופה', 'בית חולים', 'חולה', 'התעמלות', 'דיאטה', 'שינה', 'כאב', 'סימפטום']
	},
	finance: {
		en: ['money', 'bank', 'budget', 'invest', 'save', 'expense', 'income', 'loan', 'credit', 'payment'],
		he: ['כסף', 'בנק', 'תקציב', 'השקעה', 'חיסכון', 'הוצאה', 'הכנסה', 'הלוואה', 'אשראי', 'תשלום']
	},
	travel: {
		en: ['travel', 'trip', 'flight', 'hotel', 'vacation', 'destination', 'airport', 'passport', 'luggage'],
		he: ['טיול', 'נסיעה', 'טיסה', 'מלון', 'חופשה', 'יעד', 'שדה תעופה', 'דרכון', 'מזוודה']
	},
	education: {
		en: ['school', 'university', 'study', 'exam', 'course', 'learn', 'teacher', 'student', 'grade', 'homework'],
		he: ['בית ספר', 'אוניברסיטה', 'לימודים', 'מבחן', 'קורס', 'ללמוד', 'מורה', 'תלמיד', 'ציון', 'שיעורי בית']
	},
	technology: {
		en: ['computer', 'phone', 'app', 'software', 'internet', 'code', 'programming', 'data', 'ai', 'machine'],
		he: ['מחשב', 'טלפון', 'אפליקציה', 'תוכנה', 'אינטרנט', 'קוד', 'תכנות', 'נתונים', 'בינה מלאכותית']
	}
} as const;

export type ContextType = keyof typeof CONTEXT_KEYWORDS;

/**
 * Mock concept extraction using rule-based approach (no LLM)
 * Bilingual support for Hebrew and English
 */
export function mockExtractConcepts(text: string): string[] {
	const concepts: string[] = [];
	const normalizedText = text.toLowerCase();

	// Tokenize text (handle both Hebrew and English)
	const words = text.split(/[\s,.!?;:'"()\[\]{}]+/).filter(w => w.length > 2);

	// Extract English concepts (capitalized words, not stopwords)
	for (const word of words) {
		const lowerWord = word.toLowerCase();
		if (
			/^[A-Z]/.test(word) &&
			!ENGLISH_STOPWORDS.has(lowerWord) &&
			word.length > 2
		) {
			concepts.push(lowerWord);
		}
	}

	// Extract Hebrew concepts (Hebrew letters, not stopwords)
	for (const word of words) {
		if (
			/[\u0590-\u05FF]/.test(word) &&
			!HEBREW_STOPWORDS.has(word) &&
			word.length > 2
		) {
			concepts.push(word);
		}
	}

	// Check for domain-specific keywords
	for (const [domain, keywords] of Object.entries(CONTEXT_KEYWORDS)) {
		const allKeywords = [...keywords.en, ...keywords.he];
		for (const keyword of allKeywords) {
			if (normalizedText.includes(keyword.toLowerCase()) || text.includes(keyword)) {
				if (!concepts.includes(domain)) {
					concepts.push(domain);
				}
			}
		}
	}

	// Remove duplicates and limit
	return [...new Set(concepts)].slice(0, 10);
}

/**
 * Calculate text similarity using Jaccard coefficient
 * Works for both Hebrew and English text
 */
export function calculateSimilarity(text1: string, text2: string): number {
	const tokenize = (text: string): Set<string> => {
		const words = text.toLowerCase().split(/[\s,.!?;:'"()\[\]{}]+/).filter(w => w.length > 2);
		// Filter out stopwords for both languages
		return new Set(words.filter(w => !ENGLISH_STOPWORDS.has(w) && !HEBREW_STOPWORDS.has(w)));
	};

	const set1 = tokenize(text1);
	const set2 = tokenize(text2);

	if (set1.size === 0 || set2.size === 0) return 0;

	const intersection = new Set([...set1].filter(x => set2.has(x)));
	const union = new Set([...set1, ...set2]);

	return intersection.size / union.size;
}

/**
 * Mock context classifier - rule-based classification (no LLM)
 * Bilingual support for Hebrew and English
 */
export function mockContextClassifier(text: string): {
	category: ContextType | 'general';
	confidence: number;
	matched_keywords: string[];
} {
	const normalizedText = text.toLowerCase();
	const scores: Record<string, { count: number; keywords: string[] }> = {};

	for (const [domain, keywords] of Object.entries(CONTEXT_KEYWORDS)) {
		scores[domain] = { count: 0, keywords: [] };
		const allKeywords = [...keywords.en, ...keywords.he];

		for (const keyword of allKeywords) {
			if (normalizedText.includes(keyword.toLowerCase()) || text.includes(keyword)) {
				scores[domain].count++;
				scores[domain].keywords.push(keyword);
			}
		}
	}

	// Find best match
	let bestDomain = 'general';
	let bestScore = 0;
	let matchedKeywords: string[] = [];

	for (const [domain, { count, keywords }] of Object.entries(scores)) {
		if (count > bestScore) {
			bestScore = count;
			bestDomain = domain;
			matchedKeywords = keywords;
		}
	}

	// Calculate confidence based on match count
	const confidence = bestScore === 0 ? 0.3 : Math.min(0.95, 0.5 + (bestScore * 0.1));

	return {
		category: bestDomain as ContextType | 'general',
		confidence,
		matched_keywords: matchedKeywords
	};
}

/**
 * Create standard test metadata (Roampal pattern)
 */
export function createTestMetadata(options?: {
	user_id?: string;
	conversation_id?: string;
	turn_id?: string;
	tier?: 'hot' | 'warm' | 'cold' | 'archive';
	status?: 'active' | 'archived' | 'deleted';
	source?: string;
}): Record<string, unknown> {
	const now = new Date().toISOString();
	return {
		user_id: options?.user_id ?? 'test_user',
		conversation_id: options?.conversation_id ?? `conv_${Date.now()}`,
		turn_id: options?.turn_id ?? `turn_${Date.now()}`,
		tier: options?.tier ?? 'warm',
		status: options?.status ?? 'active',
		source: options?.source ?? 'test',
		created_at: now,
		updated_at: now,
		wilson_score: 0.5,
		use_count: 0,
		success_count: 0,
		outcome_history: '[]'
	};
}

// ============================================================================
// Verification Functions (Roampal Pattern)
// ============================================================================

/**
 * Verify document ID format
 */
export function verifyDocIdFormat(docId: string): {
	valid: boolean;
	format: string;
	errors: string[];
} {
	const errors: string[] = [];

	// Check if not empty
	if (!docId || docId.length === 0) {
		errors.push('Document ID cannot be empty');
	}

	// Check length constraints
	if (docId.length > 255) {
		errors.push('Document ID exceeds maximum length (255)');
	}

	// Check for valid characters (alphanumeric, underscore, hyphen)
	if (!/^[a-zA-Z0-9_-]+$/.test(docId)) {
		errors.push('Document ID contains invalid characters (only alphanumeric, underscore, hyphen allowed)');
	}

	// Detect format type
	let format = 'unknown';
	if (/^[0-9a-f]{24}$/.test(docId)) {
		format = 'mongodb_objectid';
	} else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(docId)) {
		format = 'uuid';
	} else if (/^mem_[a-zA-Z0-9_-]+$/.test(docId)) {
		format = 'memory_id';
	} else if (/^frag_[a-zA-Z0-9_-]+$/.test(docId)) {
		format = 'fragment_id';
	} else if (/^[a-zA-Z]+_[0-9]+_[a-zA-Z0-9]+$/.test(docId)) {
		format = 'composite_id';
	}

	return {
		valid: errors.length === 0,
		format,
		errors
	};
}

/**
 * Verify embedding dimension
 */
export function verifyEmbeddingDimension(
	embedding: number[],
	expectedDim: number = EMBEDDING_DIM
): {
	valid: boolean;
	actual_dim: number;
	expected_dim: number;
	is_normalized: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	// Check dimension
	if (embedding.length !== expectedDim) {
		errors.push(`Dimension mismatch: got ${embedding.length}, expected ${expectedDim}`);
	}

	// Check for NaN or Infinity
	const hasInvalidValues = embedding.some(v => !Number.isFinite(v));
	if (hasInvalidValues) {
		errors.push('Embedding contains NaN or Infinity values');
	}

	// Check normalization (magnitude should be ~1.0)
	const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
	const isNormalized = Math.abs(magnitude - 1.0) < 0.01;

	if (!isNormalized) {
		errors.push(`Embedding not normalized: magnitude is ${magnitude.toFixed(4)}, expected ~1.0`);
	}

	return {
		valid: errors.length === 0,
		actual_dim: embedding.length,
		expected_dim: expectedDim,
		is_normalized: isNormalized,
		errors
	};
}

/**
 * Verify metadata persistence
 */
export function verifyMetadataPersistence(
	originalMetadata: Record<string, unknown>,
	retrievedMetadata: Record<string, unknown>
): {
	valid: boolean;
	missing_fields: string[];
	extra_fields: string[];
	mismatched_values: Array<{ field: string; original: unknown; retrieved: unknown }>;
} {
	const originalKeys = new Set(Object.keys(originalMetadata));
	const retrievedKeys = new Set(Object.keys(retrievedMetadata));

	const missing_fields = [...originalKeys].filter(k => !retrievedKeys.has(k));
	const extra_fields = [...retrievedKeys].filter(k => !originalKeys.has(k));
	const mismatched_values: Array<{ field: string; original: unknown; retrieved: unknown }> = [];

	// Check common fields for value matches
	for (const key of originalKeys) {
		if (retrievedKeys.has(key)) {
			const orig = JSON.stringify(originalMetadata[key]);
			const retr = JSON.stringify(retrievedMetadata[key]);
			if (orig !== retr) {
				mismatched_values.push({
					field: key,
					original: originalMetadata[key],
					retrieved: retrievedMetadata[key]
				});
			}
		}
	}

	return {
		valid: missing_fields.length === 0 && mismatched_values.length === 0,
		missing_fields,
		extra_fields,
		mismatched_values
	};
}

/**
 * Verify knowledge graph structure
 */
export function verifyKgStructure(kg: {
	nodes?: Array<{ id: string; label: string; type?: string }>;
	edges?: Array<{ source: string; target: string; relation?: string }>;
}): {
	valid: boolean;
	node_count: number;
	edge_count: number;
	orphan_nodes: string[];
	invalid_edges: Array<{ edge: { source: string; target: string }; reason: string }>;
	errors: string[];
} {
	const errors: string[] = [];
	const nodes = kg.nodes ?? [];
	const edges = kg.edges ?? [];

	// Create node ID set
	const nodeIds = new Set(nodes.map(n => n.id));

	// Find orphan nodes (no edges)
	const connectedNodes = new Set<string>();
	for (const edge of edges) {
		connectedNodes.add(edge.source);
		connectedNodes.add(edge.target);
	}
	const orphan_nodes = nodes.filter(n => !connectedNodes.has(n.id)).map(n => n.id);

	// Find invalid edges (reference non-existent nodes)
	const invalid_edges: Array<{ edge: { source: string; target: string }; reason: string }> = [];
	for (const edge of edges) {
		if (!nodeIds.has(edge.source)) {
			invalid_edges.push({
				edge: { source: edge.source, target: edge.target },
				reason: `Source node '${edge.source}' does not exist`
			});
		}
		if (!nodeIds.has(edge.target)) {
			invalid_edges.push({
				edge: { source: edge.source, target: edge.target },
				reason: `Target node '${edge.target}' does not exist`
			});
		}
	}

	// Check for duplicate node IDs
	const seenIds = new Set<string>();
	for (const node of nodes) {
		if (seenIds.has(node.id)) {
			errors.push(`Duplicate node ID: ${node.id}`);
		}
		seenIds.add(node.id);
	}

	// Check for self-loops
	for (const edge of edges) {
		if (edge.source === edge.target) {
			errors.push(`Self-loop detected: ${edge.source} -> ${edge.target}`);
		}
	}

	return {
		valid: errors.length === 0 && invalid_edges.length === 0,
		node_count: nodes.length,
		edge_count: edges.length,
		orphan_nodes,
		invalid_edges,
		errors
	};
}

/**
 * Calculate Wilson score for confidence intervals
 * Used for Roampal-aligned scoring
 */
export function calculateWilsonScore(successes: number, total: number, z: number = 1.96): number {
	if (total === 0) return 0.5; // Default for no data

	const p = successes / total;
	const n = total;

	// Wilson score lower bound
	const denominator = 1 + (z * z) / n;
	const centre = p + (z * z) / (2 * n);
	const offset = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);

	return Math.max(0, (centre - offset) / denominator);
}

// ============================================================================
// Benchmark Reporter - Generates Roampal-style output files
// ============================================================================

export interface BenchmarkResult {
	name: string;
	passed: boolean;
	duration: number;
	metrics?: Record<string, number | string>;
	error?: string;
}

/**
 * Benchmark reporter that generates Roampal-compatible test result files
 */
export class BenchmarkReporter {
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
			'============================= test session starts =============================',
			`platform: node ${process.version}`,
			`test framework: vitest`,
			`timestamp: ${new Date().toISOString()}`,
			`rootdir: ${process.cwd()}`,
			'',
			`collecting ... collected ${this.results.length} items`,
			'',
		];

		// Test results
		this.results.forEach((result, idx) => {
			const pct = Math.round(((idx + 1) / this.results.length) * 100);
			const status = result.passed ? 'PASSED' : 'FAILED';
			const metrics = result.metrics
				? ` [${Object.entries(result.metrics)
						.map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(3) : v}`)
						.join(', ')}]`
				: '';
			lines.push(
				`${this.suiteName}::${result.name} ${status} (${result.duration}ms)${metrics} [${pct.toString().padStart(3)}%]`
			);
			if (result.error) {
				lines.push(`  ERROR: ${result.error}`);
			}
		});

		lines.push('');
		lines.push('============================== benchmark summary ==============================');

		// Detailed metrics summary
		const metricsMap = new Map<string, number[]>();
		this.results.forEach((r) => {
			if (r.metrics) {
				Object.entries(r.metrics).forEach(([k, v]) => {
					if (typeof v === 'number') {
						if (!metricsMap.has(k)) metricsMap.set(k, []);
						metricsMap.get(k)!.push(v);
					}
				});
			}
		});

		if (metricsMap.size > 0) {
			lines.push('');
			lines.push('Metrics Summary:');
			metricsMap.forEach((values, key) => {
				const avg = values.reduce((a, b) => a + b, 0) / values.length;
				const min = Math.min(...values);
				const max = Math.max(...values);
				lines.push(`  ${key}: avg=${avg.toFixed(3)}, min=${min.toFixed(3)}, max=${max.toFixed(3)}`);
			});
		}

		lines.push('');
		lines.push('============================== test results ===================================');
		lines.push(`${passed} passed, ${failed} failed in ${totalDuration}s`);
		lines.push('===============================================================================');

		return lines.join('\n');
	}

	saveReport(filename: string, resultsDir?: string): void {
		// Dynamic import for fs to work in test environment
		const fs = require('fs');
		const path = require('path');

		const dir = resultsDir ?? path.join(__dirname, 'benchmarks', 'results');
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		const filepath = path.join(dir, filename);
		fs.writeFileSync(filepath, this.generateReport(), 'utf-8');
		console.log(`\n📊 Benchmark results saved to: ${filepath}`);
	}

	getResults(): BenchmarkResult[] {
		return [...this.results];
	}

	reset(): void {
		this.results = [];
		this.startTime = Date.now();
	}
}

// ============================================================================
// Export all utilities
// ============================================================================

export const mockUtils = {
	// Classes
	SeededRandom,
	MockEmbeddingService,
	MockLLMService,
	MockTimeManager,
	MockCollection,
	TestHarness,
	BenchmarkReporter,
	// Test data generators
	createTestFragment,
	createTestFragmentBatch,
	createTestConversation,
	createTestMetadata,
	// Metrics
	calculateMRR,
	calculateNDCG,
	calculatePrecisionAtK,
	calculateAllMetrics,
	calculateSimilarity,
	calculateWilsonScore,
	// Mock factories
	createMockMemoryFacade,
	createMockSearchService,
	createMockRetrievalService,
	// Bilingual utilities
	mockExtractConcepts,
	mockContextClassifier,
	// Verification functions
	verifyDocIdFormat,
	verifyEmbeddingDimension,
	verifyMetadataPersistence,
	verifyKgStructure,
	// Utilities
	stringToSeed,
	// Constants
	MATURITY_LEVELS,
	TEST_SCENARIOS,
	CONTEXT_KEYWORDS,
	EMBEDDING_DIM,
	DEFAULT_SEED,
	ENGLISH_STOPWORDS,
	HEBREW_STOPWORDS
};

export default mockUtils;
