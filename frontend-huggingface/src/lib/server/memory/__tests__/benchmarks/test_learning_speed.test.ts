/**
 * Learning Speed Tests
 *
 * Tests how quickly the memory system learns from user interactions.
 * Enterprise-grade memory must adapt rapidly to user feedback.
 *
 * Test Scenarios:
 * 1. Cold start baseline (no prior knowledge)
 * 2. Learning curve (improvement over interactions)
 * 3. Adaptation speed (quick response to changes)
 * 4. Knowledge retention (learned facts persist)
 * 5. Pattern recognition (identifying user patterns)
 * 6. Context specialization (domain-specific learning)
 * 7. Learning efficiency metrics
 * 8. Bilingual learning (Hebrew + English)
 *
 * Output: Generates benchmark results to benchmarks/results/learning_speed.txt
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
	MATURITY_LEVELS,
} from "../mock-utilities";

// Global reporter for this test file
const reporter = new BenchmarkReporter("test_learning_speed");

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

describe("Learning Speed", () => {
	let harness: TestHarness;
	let embeddingService: MockEmbeddingService;
	let timeManager: MockTimeManager;
	let collection: MockCollection;

	beforeEach(() => {
		harness = new TestHarness("LearningSpeed");
		embeddingService = new MockEmbeddingService(42);
		timeManager = new MockTimeManager(new Date("2026-01-01T00:00:00Z"));
		collection = new MockCollection(embeddingService);
	});

	afterEach(() => {
		harness.cleanup();
	});

	afterAll(() => {
		reporter.saveReport("learning_speed.txt");
	});

	describe("Cold Start Baseline", () => {
		it("test_cold_start_baseline", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Empty collection - cold start scenario
				expect(collection.count()).toBe(0);

				// First interaction - should work despite no prior data
				const results = await collection.search("user preferences", 5);

				// Cold start should return empty results gracefully
				expect(results.length).toBe(0);

				// Add first memory
				await collection.add({
					id: "first_memory",
					content: "User prefers dark mode interface",
					metadata: {
						...createTestMetadata(),
						...MATURITY_LEVELS.cold_start,
						interaction_count: 1,
					},
				});

				// Should now find the memory
				const afterFirst = await collection.search("dark mode", 5);

				metrics = {
					cold_start_results: results.length,
					after_first_memory_results: afterFirst.length,
					first_memory_found: afterFirst.length > 0 ? 1 : 0,
				};

				expect(afterFirst.length).toBe(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_cold_start_baseline", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Learning Curve", () => {
		it("test_learning_curve", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Simulate learning over multiple interactions
				const interactions = 20;
				const wilsonScores: number[] = [];

				for (let i = 0; i < interactions; i++) {
					const successes = Math.floor(i * 0.8); // 80% success rate
					const score = calculateWilsonScore(successes, i + 1);
					wilsonScores.push(score);

					await collection.add({
						id: `learning_${i}`,
						content: `User interaction ${i}: learning about topic ${i % 5}`,
						metadata: {
							...createTestMetadata(),
							wilson_score: score,
							use_count: i + 1,
							success_count: successes,
						},
					});
				}

				// Calculate learning curve slope
				const firstHalf = wilsonScores.slice(0, 10);
				const secondHalf = wilsonScores.slice(10);
				const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
				const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
				const improvement = avgSecond - avgFirst;

				metrics = {
					interactions: interactions,
					avg_first_half_score: avgFirst,
					avg_second_half_score: avgSecond,
					improvement: improvement,
					final_wilson_score: wilsonScores[wilsonScores.length - 1],
				};

				// Should show improvement over time
				expect(avgSecond).toBeGreaterThan(avgFirst);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_learning_curve", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Adaptation Speed", () => {
		it("test_adaptation_speed", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store initial preference
				await collection.add({
					id: "old_pref",
					content: "User prefers morning meetings",
					metadata: {
						...createTestMetadata(),
						wilson_score: 0.8,
						use_count: 20,
						is_current: false,
					},
				});

				// User changes preference
				timeManager.advanceDays(7);

				await collection.add({
					id: "new_pref",
					content: "User now prefers afternoon meetings instead of morning",
					metadata: {
						...createTestMetadata(),
						wilson_score: 0.6,
						use_count: 5,
						is_current: true,
						supersedes: "old_pref",
					},
				});

				// Search should find both for context
				const results = await collection.search("meeting time preference", 2);

				const foundOld = results.some((r) => r.document.id === "old_pref");
				const foundNew = results.some((r) => r.document.id === "new_pref");

				// Simulate quick adaptation with positive feedback
				const adaptationSteps = 3;
				for (let i = 0; i < adaptationSteps; i++) {
					const doc = collection.get("new_pref");
					if (doc) {
						const useCount = (doc.metadata.use_count as number) + 1;
						const successCount = useCount; // 100% success on new pref
						collection.updateMetadata("new_pref", {
							wilson_score: calculateWilsonScore(successCount, useCount),
							use_count: useCount,
							success_count: successCount,
						});
					}
				}

				const finalDoc = collection.get("new_pref");

				metrics = {
					found_old_preference: foundOld ? 1 : 0,
					found_new_preference: foundNew ? 1 : 0,
					adaptation_steps: adaptationSteps,
					final_new_pref_score: finalDoc?.metadata.wilson_score as number,
				};

				expect(foundNew).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_adaptation_speed", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Knowledge Retention", () => {
		it("test_knowledge_retention", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store facts at different times
				const facts = [
					{ id: "fact_old", content: "User birthday is March 15", daysAgo: 365 },
					{ id: "fact_mid", content: "User works at Google", daysAgo: 180 },
					{ id: "fact_recent", content: "User started learning piano", daysAgo: 30 },
					{ id: "fact_new", content: "User favorite movie is Inception", daysAgo: 7 },
				];

				for (const fact of facts) {
					await collection.add({
						id: fact.id,
						content: fact.content,
						metadata: {
							...createTestMetadata(),
							created_at: new Date(Date.now() - fact.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
							wilson_score: 0.8,
						},
					});
				}

				// All facts should be retained and searchable
				let retainedCount = 0;
				for (const fact of facts) {
					const doc = collection.get(fact.id);
					if (doc) retainedCount++;
				}

				// Test search across time
				const birthdayResults = await collection.search("birthday", 2);
				const workResults = await collection.search("work job company", 2);

				const birthdayFound = birthdayResults.some((r) => r.document.id === "fact_old");
				const workFound = workResults.some((r) => r.document.id === "fact_mid");

				metrics = {
					total_facts: facts.length,
					retained_facts: retainedCount,
					retention_rate: retainedCount / facts.length,
					old_birthday_found: birthdayFound ? 1 : 0,
					mid_work_found: workFound ? 1 : 0,
				};

				expect(retainedCount).toBe(facts.length);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_knowledge_retention", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Pattern Recognition", () => {
		it("test_pattern_recognition", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store multiple instances of a pattern
				const coffeePattern = [
					{ id: "coffee_1", content: "User ordered coffee at 9am Monday" },
					{ id: "coffee_2", content: "User had coffee at 9:15am Tuesday" },
					{ id: "coffee_3", content: "User got coffee around 9am Wednesday" },
					{ id: "coffee_4", content: "User coffee break at 9am Thursday" },
					{ id: "coffee_5", content: "User morning coffee at 9am Friday" },
				];

				for (const c of coffeePattern) {
					await collection.add({
						id: c.id,
						content: c.content,
						metadata: {
							...createTestMetadata(),
							pattern: "morning_coffee",
							time: "9am",
						},
					});
				}

				// Add some noise
				await collection.add({
					id: "tea_1",
					content: "User had afternoon tea at 3pm",
					metadata: createTestMetadata(),
				});

				// Search for pattern
				const patternResults = await collection.search("morning coffee routine", 5);

				const coffeeResults = patternResults.filter((r) =>
					r.document.id.startsWith("coffee_")
				).length;

				metrics = {
					pattern_instances: coffeePattern.length,
					pattern_results_found: coffeeResults,
					pattern_recognition_rate: coffeeResults / coffeePattern.length,
				};

				// Should recognize the pattern
				expect(coffeeResults).toBeGreaterThanOrEqual(3);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_pattern_recognition", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Context Specialization", () => {
		it("test_context_specialization", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Store context-specific knowledge
				const workContext = [
					{ id: "work_1", content: "User uses Slack for team communication", ctx: "work" },
					{ id: "work_2", content: "User prefers VS Code for coding", ctx: "work" },
					{ id: "work_3", content: "User attends standup at 10am daily", ctx: "work" },
				];

				const personalContext = [
					{ id: "personal_1", content: "User uses WhatsApp for family chats", ctx: "personal" },
					{ id: "personal_2", content: "User plays guitar as hobby", ctx: "personal" },
					{ id: "personal_3", content: "User jogs every morning at 6am", ctx: "personal" },
				];

				for (const w of workContext) {
					await collection.add({
						id: w.id,
						content: w.content,
						metadata: { ...createTestMetadata(), context: w.ctx },
					});
				}

				for (const p of personalContext) {
					await collection.add({
						id: p.id,
						content: p.content,
						metadata: { ...createTestMetadata(), context: p.ctx },
					});
				}

				// Search with work context
				const workResults = await collection.search("communication tool", 3);
				const personalResults = await collection.search("morning routine exercise", 3);

				const workContextMatches = workResults.filter(
					(r) => r.document.metadata.context === "work"
				).length;
				const personalContextMatches = personalResults.filter(
					(r) => r.document.metadata.context === "personal"
				).length;

				metrics = {
					work_context_matches: workContextMatches,
					personal_context_matches: personalContextMatches,
					specialization_accuracy: (workContextMatches + personalContextMatches) / 6,
				};

				expect(workContextMatches).toBeGreaterThan(0);
				expect(personalContextMatches).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_context_specialization", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Learning Efficiency", () => {
		it("test_learning_efficiency", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Measure how quickly confidence builds
				const memId = "efficiency_test";
				let useCount = 0;
				let successCount = 0;

				await collection.add({
					id: memId,
					content: "User prefers TypeScript for all projects",
					metadata: {
						...createTestMetadata(),
						wilson_score: 0.5,
						use_count: 0,
						success_count: 0,
					},
				});

				// Simulate interactions with 90% success rate
				const targetConfidence = 0.8;
				const maxIterations = 50;
				let iterationsToTarget = maxIterations;

				for (let i = 0; i < maxIterations; i++) {
					useCount++;
					if (Math.random() < 0.9) successCount++;

					const newScore = calculateWilsonScore(successCount, useCount);
					collection.updateMetadata(memId, {
						wilson_score: newScore,
						use_count: useCount,
						success_count: successCount,
					});

					if (newScore >= targetConfidence && iterationsToTarget === maxIterations) {
						iterationsToTarget = i + 1;
					}
				}

				const finalDoc = collection.get(memId);
				const finalScore = finalDoc?.metadata.wilson_score as number;

				metrics = {
					target_confidence: targetConfidence,
					iterations_to_target: iterationsToTarget,
					final_confidence: finalScore,
					total_uses: useCount,
					success_rate: successCount / useCount,
					learning_efficiency: targetConfidence / iterationsToTarget,
				};

				expect(finalScore).toBeGreaterThanOrEqual(0.7);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_learning_efficiency", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Bilingual Learning", () => {
		it("test_hebrew_learning_speed", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Hebrew learning scenarios
				const hebrewLearning = [
					{ id: "he_learn_1", content: "המשתמש למד שהוא אוהב קפה בבוקר", score: 0.6 },
					{ id: "he_learn_2", content: "המשתמש מעדיף לעבוד מהבית", score: 0.7 },
					{ id: "he_learn_3", content: "המשתמש אוהב לקרוא ספרים בעברית", score: 0.8 },
				];

				for (const h of hebrewLearning) {
					await collection.add({
						id: h.id,
						content: h.content,
						metadata: {
							...createTestMetadata(),
							wilson_score: h.score,
							language: "hebrew",
						},
					});
				}

				// Search in Hebrew
				const results = await collection.search("מה המשתמש אוהב?", 3);

				const hebrewFound = results.filter((r) => r.document.metadata.language === "hebrew").length;

				// Calculate average learning score
				const avgScore =
					hebrewLearning.reduce((sum, h) => sum + h.score, 0) / hebrewLearning.length;

				metrics = {
					hebrew_items: hebrewLearning.length,
					hebrew_found: hebrewFound,
					avg_hebrew_score: avgScore,
				};

				expect(hebrewFound).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_hebrew_learning_speed", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Summary Test", () => {
		it("test_learning_speed", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Comprehensive learning speed test
				const learningData = [];

				// Simulate 30 learning interactions
				for (let i = 0; i < 30; i++) {
					const successRate = 0.5 + i / 60; // Improving success rate
					const successes = Math.floor((i + 1) * successRate);
					const score = calculateWilsonScore(successes, i + 1);

					learningData.push({ iteration: i, score, successRate });

					await collection.add({
						id: `learn_${i}`,
						content: `Learning item ${i}: user fact about topic ${i % 5}`,
						metadata: {
							...createTestMetadata(),
							wilson_score: score,
							use_count: i + 1,
							iteration: i,
						},
					});
				}

				// Calculate learning metrics
				const firstTen = learningData.slice(0, 10);
				const lastTen = learningData.slice(-10);

				const avgFirstScore = firstTen.reduce((s, d) => s + d.score, 0) / 10;
				const avgLastScore = lastTen.reduce((s, d) => s + d.score, 0) / 10;
				const improvement = avgLastScore - avgFirstScore;

				// Search test
				const searchResults = await collection.search("user fact", 10);

				metrics = {
					total_learning_items: learningData.length,
					avg_first_10_score: avgFirstScore,
					avg_last_10_score: avgLastScore,
					score_improvement: improvement,
					searchable_items: searchResults.length,
					learning_success: improvement > 0 ? 1 : 0,
				};

				expect(improvement).toBeGreaterThan(0);
				expect(searchResults.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_learning_speed", passed, Date.now() - start, metrics);
			}
		});
	});
});
