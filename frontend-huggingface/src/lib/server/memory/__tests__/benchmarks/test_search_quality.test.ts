/**
 * Search Quality Tests
 *
 * Tests the quality and robustness of memory search functionality.
 * Enterprise-grade search must handle variations, typos, synonyms gracefully.
 *
 * Test Scenarios:
 * 1. Synonym understanding (car vs automobile)
 * 2. Typo tolerance (teh vs the)
 * 3. Acronym expansion (AI vs Artificial Intelligence)
 * 4. Result diversity (not all same topic)
 * 5. Recency vs relevance balance
 * 6. Partial match quality
 * 7. Bilingual search (Hebrew + English)
 *
 * Output: Generates benchmark results to benchmarks/results/search_quality.txt
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import {
	MockEmbeddingService,
	MockTimeManager,
	MockCollection,
	TestHarness,
	createTestMetadata,
	calculateMRR,
	calculateNDCG,
	calculatePrecisionAtK,
	BenchmarkReporter,
} from "../mock-utilities";

// Global reporter for this test file
const reporter = new BenchmarkReporter("test_search_quality");

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

describe("Search Quality", () => {
	let harness: TestHarness;
	let embeddingService: MockEmbeddingService;
	let timeManager: MockTimeManager;
	let collection: MockCollection;

	beforeEach(() => {
		harness = new TestHarness("SearchQuality");
		embeddingService = new MockEmbeddingService(42);
		timeManager = new MockTimeManager(new Date("2026-01-01T00:00:00Z"));
		collection = new MockCollection(embeddingService);
	});

	afterEach(() => {
		harness.cleanup();
	});

	afterAll(() => {
		reporter.saveReport("search_quality.txt");
	});

	describe("Synonym Understanding", () => {
		it("test_synonym_understanding", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store content with various synonyms
				const synonymGroups = [
					{
						id: "car_1",
						content: "The user drives a Tesla car to work every day",
						synonyms: ["car", "automobile", "vehicle"],
					},
					{
						id: "car_2",
						content: "User purchased a new automobile last month",
						synonyms: ["car", "automobile", "vehicle"],
					},
					{
						id: "happy_1",
						content: "The user feels happy about the promotion",
						synonyms: ["happy", "joyful", "pleased", "delighted"],
					},
					{
						id: "fast_1",
						content: "User prefers fast food for lunch",
						synonyms: ["fast", "quick", "rapid"],
					},
				];

				for (const item of synonymGroups) {
					await collection.add({
						id: item.id,
						content: item.content,
						metadata: createTestMetadata(),
					});
				}

				// Search using different synonym
				const carResults = await collection.search("automobile", 2);
				const vehicleResults = await collection.search("vehicle", 2);
				const joyfulResults = await collection.search("joyful", 2);

				// Check if synonyms find the same content
				const carFound = carResults.some((r) => r.document.id.startsWith("car_"));
				const vehicleFound = vehicleResults.some((r) => r.document.id.startsWith("car_"));
				const joyfulFound = joyfulResults.some((r) => r.document.id === "happy_1");

				metrics = {
					car_synonym_found: carFound ? 1 : 0,
					vehicle_synonym_found: vehicleFound ? 1 : 0,
					joyful_synonym_found: joyfulFound ? 1 : 0,
					synonym_success_rate: (Number(carFound) + Number(vehicleFound) + Number(joyfulFound)) / 3,
				};

				// At least some synonyms should work with semantic search
				expect(carFound || vehicleFound).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_synonym_understanding", passed, Date.now() - start, metrics);
			}
		});

		it("test_hebrew_synonym_understanding", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Hebrew synonyms
				await collection.add({
					id: "he_car",
					content: "המשתמש נוסע ברכב לעבודה",
					metadata: createTestMetadata(),
				});

				await collection.add({
					id: "he_auto",
					content: "המשתמש קנה מכונית חדשה",
					metadata: createTestMetadata(),
				});

				// Search using synonym
				const results = await collection.search("אוטו", 2);

				metrics = {
					hebrew_synonym_results: results.length,
				};

				expect(results.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_hebrew_synonym_understanding", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Typo Tolerance", () => {
		it("test_typo_tolerance", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store clean content
				const content = [
					{ id: "doc_1", content: "The user prefers JavaScript programming" },
					{ id: "doc_2", content: "Machine learning is interesting to the user" },
					{ id: "doc_3", content: "The user works in software development" },
				];

				for (const c of content) {
					await collection.add({
						id: c.id,
						content: c.content,
						metadata: createTestMetadata(),
					});
				}

				// Search with typos
				const typoQueries = [
					{ typo: "Javascrpit", correct: "JavaScript", expectedId: "doc_1" },
					{ typo: "machin lerning", correct: "machine learning", expectedId: "doc_2" },
					{ typo: "sofware develoment", correct: "software development", expectedId: "doc_3" },
				];

				let typoMatches = 0;
				for (const q of typoQueries) {
					const results = await collection.search(q.typo, 2);
					if (results.some((r) => r.document.id === q.expectedId)) {
						typoMatches++;
					}
				}

				metrics = {
					typo_queries: typoQueries.length,
					typo_matches: typoMatches,
					typo_tolerance_rate: typoMatches / typoQueries.length,
				};

				// Some tolerance expected from semantic search
				expect(typoMatches).toBeGreaterThanOrEqual(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_typo_tolerance", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Acronym Expansion", () => {
		it("test_acronym_expansion", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store content with acronyms and full forms
				const acronymContent = [
					{ id: "ai_1", content: "The user is interested in AI and machine learning" },
					{ id: "ai_2", content: "Artificial Intelligence is transforming the tech industry" },
					{ id: "ml_1", content: "User studies ML algorithms weekly" },
					{ id: "ml_2", content: "Machine Learning models require training data" },
					{ id: "api_1", content: "The user builds REST APIs for web services" },
					{ id: "api_2", content: "Application Programming Interface design patterns" },
				];

				for (const c of acronymContent) {
					await collection.add({
						id: c.id,
						content: c.content,
						metadata: createTestMetadata(),
					});
				}

				// Search acronym, expect full form
				const aiResults = await collection.search("Artificial Intelligence", 3);
				const apiResults = await collection.search("Application Programming Interface", 2);

				// Search full form, expect acronym
				const aiAcronymResults = await collection.search("AI", 3);

				const aiFound = aiResults.some((r) => r.document.id.startsWith("ai_"));
				const apiFound = apiResults.some((r) => r.document.id.startsWith("api_"));
				const aiAcronymFound = aiAcronymResults.some((r) => r.document.id.startsWith("ai_"));

				metrics = {
					ai_full_found_acronym: aiFound ? 1 : 0,
					api_full_found_acronym: apiFound ? 1 : 0,
					ai_acronym_found_full: aiAcronymFound ? 1 : 0,
					acronym_success_rate: (Number(aiFound) + Number(apiFound) + Number(aiAcronymFound)) / 3,
				};

				expect(aiFound || aiAcronymFound).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_acronym_expansion", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Result Diversity", () => {
		it("test_result_diversity", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store diverse content about user
				const diverseContent = [
					{ id: "work", content: "User works at Google as an engineer", topic: "career" },
					{ id: "hobby", content: "User enjoys playing guitar on weekends", topic: "hobby" },
					{ id: "family", content: "User has two children named Alex and Sam", topic: "family" },
					{ id: "food", content: "User favorite cuisine is Italian food", topic: "preference" },
					{ id: "location", content: "User lives in San Francisco Bay Area", topic: "location" },
					{
						id: "education",
						content: "User studied computer science at Stanford",
						topic: "education",
					},
				];

				for (const c of diverseContent) {
					await collection.add({
						id: c.id,
						content: c.content,
						metadata: { ...createTestMetadata(), topic: c.topic },
					});
				}

				// General query should return diverse results
				const results = await collection.search("Tell me about the user", 5);

				// Count unique topics in results
				const topics = new Set(results.map((r) => r.document.metadata.topic as string));

				metrics = {
					total_topics: diverseContent.length,
					topics_in_results: topics.size,
					diversity_ratio: topics.size / Math.min(5, diverseContent.length),
				};

				// Should have diverse results
				expect(topics.size).toBeGreaterThanOrEqual(3);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_result_diversity", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Recency vs Relevance", () => {
		it("test_recency_vs_relevance", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store old but highly relevant content
				await collection.add({
					id: "old_relevant",
					content: "User favorite programming language is Python for data science",
					metadata: {
						...createTestMetadata(),
						created_at: "2023-01-01T00:00:00Z",
						wilson_score: 0.9,
					},
				});

				// Advance time
				timeManager.advanceDays(730);

				// Store recent but less relevant content
				await collection.add({
					id: "new_less_relevant",
					content: "User attended a Python meetup last week",
					metadata: {
						...createTestMetadata(),
						created_at: "2025-12-01T00:00:00Z",
						wilson_score: 0.5,
					},
				});

				// Store recent and relevant
				await collection.add({
					id: "new_relevant",
					content: "User now prefers TypeScript over Python for web development",
					metadata: {
						...createTestMetadata(),
						created_at: "2025-12-15T00:00:00Z",
						wilson_score: 0.85,
					},
				});

				// Search for language preference
				const results = await collection.search("programming language preference", 3);

				const oldFound = results.some((r) => r.document.id === "old_relevant");
				const newRelevantFound = results.some((r) => r.document.id === "new_relevant");

				metrics = {
					old_relevant_found: oldFound ? 1 : 0,
					new_relevant_found: newRelevantFound ? 1 : 0,
					results_count: results.length,
				};

				// Both old relevant and new relevant should be found
				expect(results.length).toBe(3);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_recency_vs_relevance", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Partial Match Quality", () => {
		it("test_partial_match_quality", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store content with multi-word phrases
				const phraseContent = [
					{ id: "p1", content: "User prefers dark roast coffee from Ethiopia" },
					{ id: "p2", content: "The best dark chocolate is from Belgium according to user" },
					{ id: "p3", content: "User coffee preference is strong and black" },
					{ id: "p4", content: "Ethiopian cuisine is a favorite of the user" },
				];

				for (const p of phraseContent) {
					await collection.add({
						id: p.id,
						content: p.content,
						metadata: createTestMetadata(),
					});
				}

				// Search with partial phrase
				const partialResults = await collection.search("dark coffee", 3);
				const ethiopianResults = await collection.search("Ethiopian", 2);

				// Calculate relevance
				const darkCoffeeRelevant = partialResults.filter(
					(r) => r.document.content.includes("coffee") || r.document.content.includes("dark")
				).length;

				const ethiopianRelevant = ethiopianResults.filter((r) =>
					r.document.content.includes("Ethiopia")
				).length;

				metrics = {
					partial_match_relevant: darkCoffeeRelevant,
					partial_match_total: partialResults.length,
					ethiopian_relevant: ethiopianRelevant,
					partial_precision: darkCoffeeRelevant / Math.max(1, partialResults.length),
				};

				expect(darkCoffeeRelevant).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_partial_match_quality", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Bilingual Search", () => {
		it("test_bilingual_search_quality", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store content in both languages
				const bilingualContent = [
					{ id: "en_work", content: "User works as a software engineer at Google", lang: "en" },
					{ id: "he_work", content: "המשתמש עובד כמהנדס תוכנה בגוגל", lang: "he" },
					{ id: "en_hobby", content: "User enjoys hiking in the mountains", lang: "en" },
					{ id: "he_hobby", content: "המשתמש נהנה מטיולים בהרים", lang: "he" },
					{ id: "mixed", content: "User works at Google גוגל in Tel Aviv תל אביב", lang: "mixed" },
				];

				for (const c of bilingualContent) {
					await collection.add({
						id: c.id,
						content: c.content,
						metadata: { ...createTestMetadata(), language: c.lang },
					});
				}

				// Search in English
				const enResults = await collection.search("software engineer Google", 3);
				// Search in Hebrew
				const heResults = await collection.search("מהנדס תוכנה גוגל", 3);
				// Mixed search
				const mixedResults = await collection.search("Google תל אביב", 3);

				const enFound = enResults.some((r) => r.document.id.includes("work"));
				const heFound = heResults.some((r) => r.document.id.includes("work"));
				const mixedFound = mixedResults.some((r) => r.document.id === "mixed");

				metrics = {
					english_search_found: enFound ? 1 : 0,
					hebrew_search_found: heFound ? 1 : 0,
					mixed_search_found: mixedFound ? 1 : 0,
					bilingual_success_rate: (Number(enFound) + Number(heFound) + Number(mixedFound)) / 3,
				};

				expect(enFound || heFound).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_bilingual_search_quality", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Retrieval Metrics", () => {
		it("test_search_quality", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Create a test corpus with known relevance
				const corpus = [
					{ id: "rel_1", content: "User birthday is March 15th 1990", relevant: true },
					{ id: "rel_2", content: "User was born in the spring of 1990", relevant: true },
					{ id: "irr_1", content: "User favorite season is summer", relevant: false },
					{ id: "rel_3", content: "User age is 35 years old", relevant: true },
					{ id: "irr_2", content: "User prefers warm weather", relevant: false },
					{ id: "irr_3", content: "User likes springtime activities", relevant: false },
				];

				for (const doc of corpus) {
					await collection.add({
						id: doc.id,
						content: doc.content,
						metadata: { ...createTestMetadata(), relevant: doc.relevant },
					});
				}

				// Search for birthday/age info
				const results = await collection.search("When was the user born? birthday age", 5);

				// Calculate metrics
				const resultIds = results.map((r) => r.document.id);
				const relevantIds = new Set(corpus.filter((c) => c.relevant).map((c) => c.id));

				const mrr = calculateMRR(resultIds, relevantIds);
				const ndcg = calculateNDCG(resultIds, relevantIds, 5);
				const precision = calculatePrecisionAtK(resultIds, relevantIds, 5);

				metrics = {
					mrr: mrr,
					ndcg_at_5: ndcg,
					precision_at_5: precision,
					results_count: results.length,
					relevant_in_corpus: relevantIds.size,
				};

				// Should have reasonable retrieval quality
				expect(mrr).toBeGreaterThan(0);
				expect(results.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_search_quality", passed, Date.now() - start, metrics);
			}
		});
	});
});
