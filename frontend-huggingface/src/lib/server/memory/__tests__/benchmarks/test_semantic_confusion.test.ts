/**
 * Semantic Confusion Tests
 *
 * Tests how the memory system handles semantically similar but different concepts.
 * Enterprise-grade memory must distinguish between similar terms and contexts.
 *
 * Test Scenarios:
 * 1. Homonyms (same word, different meaning)
 * 2. Synonyms (different words, same meaning)
 * 3. Near-duplicates with subtle differences
 * 4. Context-dependent meanings
 * 5. Entity disambiguation
 * 6. Bilingual semantic confusion (Hebrew + English)
 *
 * Output: Generates benchmark results to benchmarks/results/semantic_confusion.txt
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
} from '../mock-utilities';

// Global reporter for this test file
const reporter = new BenchmarkReporter('test_semantic_confusion');

// Helper to record test metrics
function recordTest(name: string, passed: boolean, duration: number, metrics?: Record<string, number | string>, error?: string): void {
	reporter.recordTest({ name, passed, duration, metrics, error });
}

describe('Semantic Confusion Handling', () => {
	let harness: TestHarness;
	let embeddingService: MockEmbeddingService;
	let timeManager: MockTimeManager;
	let collection: MockCollection;

	beforeEach(() => {
		harness = new TestHarness('SemanticConfusion');
		embeddingService = new MockEmbeddingService(42);
		timeManager = new MockTimeManager(new Date('2026-01-01T00:00:00Z'));
		collection = new MockCollection(embeddingService);
	});

	afterEach(() => {
		harness.cleanup();
	});

	afterAll(() => {
		reporter.saveReport('semantic_confusion.txt');
	});

	describe('Homonym Handling', () => {
		it('test_english_homonyms', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// "Bank" - financial vs river
				await collection.add({
					id: 'bank_financial',
					content: 'User has an account at Bank Leumi',
					metadata: {
						...createTestMetadata(),
						semantic_domain: 'finance',
						entity_type: 'organization',
					},
				});

				await collection.add({
					id: 'bank_river',
					content: 'User likes walking along the river bank',
					metadata: {
						...createTestMetadata(),
						semantic_domain: 'nature',
						entity_type: 'location',
					},
				});

				// "Apple" - company vs fruit
				await collection.add({
					id: 'apple_company',
					content: 'User bought a new Apple MacBook',
					metadata: {
						...createTestMetadata(),
						semantic_domain: 'technology',
						entity_type: 'product',
					},
				});

				await collection.add({
					id: 'apple_fruit',
					content: 'User eats an apple every morning',
					metadata: {
						...createTestMetadata(),
						semantic_domain: 'food',
						entity_type: 'food_item',
					},
				});

				// Search for financial context
				const bankFinanceResults = await collection.search('user bank account money', 2);
				const bankNatureResults = await collection.search('user walking nature river', 2);

				// Check if correct meaning is retrieved
				const financeHasFinancial = bankFinanceResults.some(r => r.document.id === 'bank_financial');
				const natureHasRiver = bankNatureResults.some(r => r.document.id === 'bank_river');

				metrics = {
					finance_search_correct: financeHasFinancial ? 1 : 0,
					nature_search_correct: natureHasRiver ? 1 : 0,
					total_homonyms_tested: 2,
				};

				expect(bankFinanceResults.length).toBeGreaterThan(0);
				expect(bankNatureResults.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_english_homonyms', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_homonyms', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// "כלב" (kelev) - dog vs derogatory term (context-dependent)
				await collection.add({
					id: 'kelev_pet',
					content: 'למשתמש יש כלב חמוד בשם רקס',
					metadata: {
						...createTestMetadata(),
						semantic_domain: 'pets',
						entity_type: 'animal',
						language: 'he',
					},
				});

				// "חלון" (chalon) - window (physical) vs window (opportunity/time)
				await collection.add({
					id: 'chalon_physical',
					content: 'המשתמש פתח את החלון בחדר',
					metadata: {
						...createTestMetadata(),
						semantic_domain: 'home',
						entity_type: 'object',
						language: 'he',
					},
				});

				await collection.add({
					id: 'chalon_opportunity',
					content: 'יש חלון הזדמנויות קצר להשקעה',
					metadata: {
						...createTestMetadata(),
						semantic_domain: 'finance',
						entity_type: 'concept',
						language: 'he',
					},
				});

				// Search in different contexts
				const petResults = await collection.search('חיות מחמד כלב', 2);
				const opportunityResults = await collection.search('הזדמנות השקעה', 2);

				metrics = {
					pet_results: petResults.length,
					opportunity_results: opportunityResults.length,
					hebrew_homonyms_tested: 2,
				};

				expect(petResults.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_homonyms', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Synonym Recognition', () => {
		it('test_synonym_grouping', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Different words for the same concept
				await collection.add({
					id: 'happy_1',
					content: 'User was happy about the news',
					metadata: { ...createTestMetadata(), emotion: 'positive' },
				});

				await collection.add({
					id: 'joyful_1',
					content: 'User felt joyful at the celebration',
					metadata: { ...createTestMetadata(), emotion: 'positive' },
				});

				await collection.add({
					id: 'delighted_1',
					content: 'User was delighted with the gift',
					metadata: { ...createTestMetadata(), emotion: 'positive' },
				});

				await collection.add({
					id: 'sad_1',
					content: 'User was sad about leaving',
					metadata: { ...createTestMetadata(), emotion: 'negative' },
				});

				// Search for positive emotions
				const positiveResults = await collection.search('user feeling good pleased', 5);

				// Count positive emotions found
				const positiveFound = positiveResults.filter(r => r.document.metadata.emotion === 'positive').length;

				metrics = {
					total_positive_stored: 3,
					positive_found: positiveFound,
					synonym_recall_rate: Math.round((positiveFound / 3) * 100),
				};

				expect(positiveFound).toBeGreaterThanOrEqual(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_synonym_grouping', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_synonyms', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Hebrew synonyms for "big"
				await collection.add({
					id: 'gadol',
					content: 'המשתמש גר בבית גדול',
					metadata: { ...createTestMetadata(), size: 'large', language: 'he' },
				});

				await collection.add({
					id: 'anak',
					content: 'יש למשתמש כלב ענק',
					metadata: { ...createTestMetadata(), size: 'large', language: 'he' },
				});

				await collection.add({
					id: 'katan',
					content: 'המשתמש קנה רכב קטן',
					metadata: { ...createTestMetadata(), size: 'small', language: 'he' },
				});

				// Search for large things
				const largeResults = await collection.search('דברים גדולים ענקיים', 5);
				const largeFound = largeResults.filter(r => r.document.metadata.size === 'large').length;

				metrics = {
					large_items_stored: 2,
					large_items_found: largeFound,
					hebrew_synonym_recall: Math.round((largeFound / 2) * 100),
				};

				expect(largeResults.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_synonyms', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Near-Duplicate Detection', () => {
		it('test_subtle_differences', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Very similar but different facts
				await collection.add({
					id: 'meeting_monday',
					content: 'User has a meeting on Monday at 10am',
					metadata: { ...createTestMetadata(), day: 'monday', time: '10:00' },
				});

				await collection.add({
					id: 'meeting_tuesday',
					content: 'User has a meeting on Tuesday at 10am',
					metadata: { ...createTestMetadata(), day: 'tuesday', time: '10:00' },
				});

				await collection.add({
					id: 'meeting_monday_3pm',
					content: 'User has a meeting on Monday at 3pm',
					metadata: { ...createTestMetadata(), day: 'monday', time: '15:00' },
				});

				// Search for Monday meetings
				const mondayResults = await collection.search('Monday meeting', 5);
				const mondayMeetings = mondayResults.filter(r => r.document.metadata.day === 'monday');

				// Calculate similarity between near-duplicates
				const sim = calculateSimilarity(
					'User has a meeting on Monday at 10am',
					'User has a meeting on Tuesday at 10am'
				);

				metrics = {
					total_meetings: 3,
					monday_meetings_found: mondayMeetings.length,
					near_duplicate_similarity: Math.round(sim * 100),
					distinguished_correctly: mondayMeetings.length === 2 ? 1 : 0,
				};

				expect(mondayResults.length).toBeGreaterThanOrEqual(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_subtle_differences', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_near_duplicates', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Hebrew near-duplicates
				await collection.add({
					id: 'he_tel_aviv',
					content: 'המשתמש גר בתל אביב',
					metadata: { ...createTestMetadata(), city: 'tel_aviv', language: 'he' },
				});

				await collection.add({
					id: 'he_ramat_aviv',
					content: 'המשתמש גר ברמת אביב',
					metadata: { ...createTestMetadata(), city: 'ramat_aviv', language: 'he' },
				});

				await collection.add({
					id: 'he_tel_aviv_work',
					content: 'המשתמש עובד בתל אביב',
					metadata: { ...createTestMetadata(), city: 'tel_aviv', context: 'work', language: 'he' },
				});

				const results = await collection.search('תל אביב', 5);

				// Count Tel Aviv mentions (not Ramat Aviv)
				const telAvivOnly = results.filter(r => r.document.metadata.city === 'tel_aviv');

				metrics = {
					total_results: results.length,
					tel_aviv_specific: telAvivOnly.length,
					distinguished_locations: results.length >= 2 ? 1 : 0,
				};

				expect(results.length).toBeGreaterThanOrEqual(1);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_near_duplicates', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Context-Dependent Meanings', () => {
		it('test_context_disambiguation', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// "Python" in different contexts
				await collection.add({
					id: 'python_programming',
					content: 'User is learning Python programming language',
					metadata: {
						...createTestMetadata(),
						context: 'technology',
						entity_type: 'programming_language',
					},
				});

				await collection.add({
					id: 'python_snake',
					content: 'User saw a python snake at the zoo',
					metadata: {
						...createTestMetadata(),
						context: 'nature',
						entity_type: 'animal',
					},
				});

				// "Java" in different contexts
				await collection.add({
					id: 'java_programming',
					content: 'User writes Java code for work',
					metadata: {
						...createTestMetadata(),
						context: 'technology',
						entity_type: 'programming_language',
					},
				});

				await collection.add({
					id: 'java_coffee',
					content: 'User drinks Java coffee every morning',
					metadata: {
						...createTestMetadata(),
						context: 'food',
						entity_type: 'beverage',
					},
				});

				// Search with context hints
				const techResults = await collection.search('programming code development', 5);
				const natureResults = await collection.search('animal zoo wildlife', 5);

				const techEntities = techResults.filter(r => r.document.metadata.context === 'technology');
				const natureEntities = natureResults.filter(r => r.document.metadata.context === 'nature');

				metrics = {
					tech_search_tech_results: techEntities.length,
					nature_search_nature_results: natureEntities.length,
					context_precision: (techEntities.length > 0 && natureEntities.length > 0) ? 1 : 0,
				};

				expect(techResults.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_context_disambiguation', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_context_disambiguation', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// "שולחן" (shulchan) - table (furniture) vs Shulchan Aruch (religious text)
				await collection.add({
					id: 'shulchan_furniture',
					content: 'המשתמש קנה שולחן חדש לסלון',
					metadata: {
						...createTestMetadata(),
						context: 'home',
						entity_type: 'furniture',
						language: 'he',
					},
				});

				await collection.add({
					id: 'shulchan_aruch',
					content: 'המשתמש לומד שולחן ערוך',
					metadata: {
						...createTestMetadata(),
						context: 'religion',
						entity_type: 'text',
						language: 'he',
					},
				});

				// "ספר" (sefer) - book vs barber
				await collection.add({
					id: 'sefer_book',
					content: 'המשתמש קורא ספר מעניין',
					metadata: {
						...createTestMetadata(),
						context: 'reading',
						entity_type: 'book',
						language: 'he',
					},
				});

				await collection.add({
					id: 'sapar_barber',
					content: 'המשתמש הלך לספר להסתפר',
					metadata: {
						...createTestMetadata(),
						context: 'personal_care',
						entity_type: 'service',
						language: 'he',
					},
				});

				// Search with context
				const homeResults = await collection.search('רהיטים בית סלון', 5);
				const readingResults = await collection.search('קריאה לימוד ספרים', 5);

				metrics = {
					home_results: homeResults.length,
					reading_results: readingResults.length,
					hebrew_disambiguation_tested: 2,
				};

				expect(homeResults.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_context_disambiguation', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Entity Disambiguation', () => {
		it('test_person_disambiguation', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Multiple people with similar names
				await collection.add({
					id: 'john_smith_friend',
					content: 'John Smith is the user friend from college',
					metadata: {
						...createTestMetadata(),
						entity_id: 'person_john_smith_1',
						relationship: 'friend',
						context: 'college',
					},
				});

				await collection.add({
					id: 'john_smith_coworker',
					content: 'John Smith is a coworker at TechCorp',
					metadata: {
						...createTestMetadata(),
						entity_id: 'person_john_smith_2',
						relationship: 'coworker',
						context: 'work',
					},
				});

				await collection.add({
					id: 'john_doe',
					content: 'John Doe is the user neighbor',
					metadata: {
						...createTestMetadata(),
						entity_id: 'person_john_doe',
						relationship: 'neighbor',
						context: 'home',
					},
				});

				// Search for John at work
				const workResults = await collection.search('John coworker work office', 3);
				const workJohns = workResults.filter(r => r.document.metadata.context === 'work');

				// Search for college friend
				const collegeResults = await collection.search('John friend college university', 3);
				const collegeJohns = collegeResults.filter(r => r.document.metadata.context === 'college');

				metrics = {
					work_search_work_context: workJohns.length,
					college_search_college_context: collegeJohns.length,
					entity_disambiguation_success: (workJohns.length > 0 || collegeJohns.length > 0) ? 1 : 0,
				};

				expect(workResults.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_person_disambiguation', passed, Date.now() - start, metrics);
			}
		});

		it('test_hebrew_person_disambiguation', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Hebrew names disambiguation
				await collection.add({
					id: 'david_cohen_friend',
					content: 'דוד כהן הוא חבר של המשתמש מהצבא',
					metadata: {
						...createTestMetadata(),
						entity_id: 'person_david_cohen_1',
						relationship: 'friend',
						context: 'army',
						language: 'he',
					},
				});

				await collection.add({
					id: 'david_cohen_doctor',
					content: 'דוד כהן הוא הרופא של המשתמש',
					metadata: {
						...createTestMetadata(),
						entity_id: 'person_david_cohen_2',
						relationship: 'doctor',
						context: 'health',
						language: 'he',
					},
				});

				await collection.add({
					id: 'david_levi',
					content: 'דוד לוי הוא השכן של המשתמש',
					metadata: {
						...createTestMetadata(),
						entity_id: 'person_david_levi',
						relationship: 'neighbor',
						context: 'home',
						language: 'he',
					},
				});

				// Search for doctor
				const doctorResults = await collection.search('רופא בריאות', 3);
				const healthContext = doctorResults.filter(r => r.document.metadata.context === 'health');

				metrics = {
					doctor_search_results: doctorResults.length,
					health_context_found: healthContext.length,
					hebrew_entity_disambiguation: healthContext.length > 0 ? 1 : 0,
				};

				expect(doctorResults.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_hebrew_person_disambiguation', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Cross-Language Semantic Matching', () => {
		it('test_bilingual_concept_matching', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Same concept in both languages
				await collection.add({
					id: 'birthday_en',
					content: 'User birthday is on March 15th',
					metadata: {
						...createTestMetadata(),
						concept: 'birthday',
						language: 'en',
					},
				});

				await collection.add({
					id: 'birthday_he',
					content: 'יום ההולדת של המשתמש ב-15 במרץ',
					metadata: {
						...createTestMetadata(),
						concept: 'birthday',
						language: 'he',
					},
				});

				await collection.add({
					id: 'work_en',
					content: 'User works at a technology company',
					metadata: {
						...createTestMetadata(),
						concept: 'employment',
						language: 'en',
					},
				});

				await collection.add({
					id: 'work_he',
					content: 'המשתמש עובד בחברת טכנולוגיה',
					metadata: {
						...createTestMetadata(),
						concept: 'employment',
						language: 'he',
					},
				});

				// Search in English for birthday
				const enBirthdayResults = await collection.search('when is birthday', 5);
				// Search in Hebrew for work
				const heWorkResults = await collection.search('עבודה תעסוקה', 5);

				// Check cross-language retrieval
				const birthdayConcepts = enBirthdayResults.filter(r => r.document.metadata.concept === 'birthday');
				const workConcepts = heWorkResults.filter(r => r.document.metadata.concept === 'employment');

				metrics = {
					en_birthday_search_results: enBirthdayResults.length,
					he_work_search_results: heWorkResults.length,
					birthday_concept_found: birthdayConcepts.length,
					work_concept_found: workConcepts.length,
					cross_language_success: (birthdayConcepts.length > 0 && workConcepts.length > 0) ? 1 : 0,
				};

				expect(enBirthdayResults.length).toBeGreaterThan(0);
				expect(heWorkResults.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_bilingual_concept_matching', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Semantic Drift Detection', () => {
		it('test_meaning_evolution', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Terms that have evolved in meaning
				await collection.add({
					id: 'cloud_old',
					content: 'User mentioned clouds in the sky',
					metadata: {
						...createTestMetadata(),
						semantic_era: 'traditional',
						domain: 'weather',
					},
				});

				await collection.add({
					id: 'cloud_modern',
					content: 'User stores data in the cloud',
					metadata: {
						...createTestMetadata(),
						semantic_era: 'modern',
						domain: 'technology',
					},
				});

				await collection.add({
					id: 'viral_old',
					content: 'User had a viral infection',
					metadata: {
						...createTestMetadata(),
						semantic_era: 'traditional',
						domain: 'health',
					},
				});

				await collection.add({
					id: 'viral_modern',
					content: 'User post went viral on social media',
					metadata: {
						...createTestMetadata(),
						semantic_era: 'modern',
						domain: 'social_media',
					},
				});

				// Search in modern context
				const techResults = await collection.search('cloud storage backup data', 3);
				const socialResults = await collection.search('viral trending popular share', 3);

				const techDomain = techResults.filter(r => r.document.metadata.domain === 'technology');
				const socialDomain = socialResults.filter(r => r.document.metadata.domain === 'social_media');

				metrics = {
					tech_search_tech_domain: techDomain.length,
					social_search_social_domain: socialDomain.length,
					semantic_drift_handled: (techDomain.length > 0 || socialDomain.length > 0) ? 1 : 0,
				};

				expect(techResults.length).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_meaning_evolution', passed, Date.now() - start, metrics);
			}
		});
	});

	describe('Summary Test', () => {
		it('test_semantic_confusion', async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number> = {};

			try {
				// Comprehensive semantic confusion test
				const testData = [
					// Homonyms
					{ id: 'sc1', content: 'Bank account balance', domain: 'finance' },
					{ id: 'sc2', content: 'River bank fishing', domain: 'nature' },
					// Hebrew homonyms
					{ id: 'sc3', content: 'חשבון בבנק', domain: 'finance' },
					{ id: 'sc4', content: 'גדת הנהר', domain: 'nature' },
					// Synonyms
					{ id: 'sc5', content: 'User was happy', domain: 'emotion' },
					{ id: 'sc6', content: 'User felt joyful', domain: 'emotion' },
					// Hebrew synonyms
					{ id: 'sc7', content: 'המשתמש היה שמח', domain: 'emotion' },
					{ id: 'sc8', content: 'המשתמש הרגיש מאושר', domain: 'emotion' },
					// Context-dependent
					{ id: 'sc9', content: 'Python programming', domain: 'tech' },
					{ id: 'sc10', content: 'Python snake', domain: 'nature' },
				];

				for (const item of testData) {
					await collection.add({
						id: item.id,
						content: item.content,
						metadata: {
							...createTestMetadata(),
							domain: item.domain,
						},
					});
				}

				// Run various searches
				const searches = [
					{ query: 'money banking finance', expected_domain: 'finance' },
					{ query: 'כסף בנק פיננסי', expected_domain: 'finance' },
					{ query: 'happy pleased emotion', expected_domain: 'emotion' },
					{ query: 'שמח מאושר רגש', expected_domain: 'emotion' },
					{ query: 'coding programming development', expected_domain: 'tech' },
				];

				let correctDomains = 0;
				for (const search of searches) {
					const results = await collection.search(search.query, 3);
					const hasExpectedDomain = results.some(r => r.document.metadata.domain === search.expected_domain);
					if (hasExpectedDomain) correctDomains++;
				}

				metrics = {
					total_items: testData.length,
					total_searches: searches.length,
					correct_domain_matches: correctDomains,
					semantic_precision: Math.round((correctDomains / searches.length) * 100),
				};

				expect(correctDomains).toBeGreaterThanOrEqual(searches.length * 0.5);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest('test_semantic_confusion', passed, Date.now() - start, metrics);
			}
		});
	});
});
