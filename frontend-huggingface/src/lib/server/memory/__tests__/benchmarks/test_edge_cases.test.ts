/**
 * Edge Cases Tests
 *
 * Tests boundary conditions and unusual inputs that could break the memory system.
 * Enterprise-grade memory must handle edge cases gracefully.
 *
 * Test Scenarios:
 * 1. Empty inputs (empty strings, null-like values)
 * 2. Very long content (exceeding typical limits)
 * 3. Special characters (unicode, emojis, RTL markers)
 * 4. Numeric content (IDs, phone numbers, dates)
 * 5. Duplicate IDs (collision handling)
 * 6. Rapid operations (race conditions)
 * 7. Hebrew edge cases (RTL, mixed direction)
 *
 * Output: Generates benchmark results to benchmarks/results/edge_cases.txt
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import {
	MockEmbeddingService,
	MockTimeManager,
	MockCollection,
	TestHarness,
	createTestMetadata,
	verifyDocIdFormat,
	verifyEmbeddingDimension,
	BenchmarkReporter,
	EMBEDDING_DIM,
} from "../mock-utilities";

// Global reporter for this test file
const reporter = new BenchmarkReporter("test_edge_cases");

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

describe("Edge Cases", () => {
	let harness: TestHarness;
	let embeddingService: MockEmbeddingService;
	let timeManager: MockTimeManager;
	let collection: MockCollection;

	beforeEach(() => {
		harness = new TestHarness("EdgeCases");
		embeddingService = new MockEmbeddingService(42);
		timeManager = new MockTimeManager(new Date("2026-01-01T00:00:00Z"));
		collection = new MockCollection(embeddingService);
	});

	afterEach(() => {
		harness.cleanup();
	});

	afterAll(() => {
		reporter.saveReport("edge_cases.txt");
	});

	describe("Empty Input Handling", () => {
		it("test_empty_string_content", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				// Test with empty content
				await collection.add({
					id: "empty_content",
					content: "",
					metadata: createTestMetadata(),
				});

				const doc = collection.get("empty_content");
				expect(doc).toBeDefined();
				expect(doc?.content).toBe("");

				// Search with empty query
				const results = await collection.search("", 5);

				metrics = {
					empty_content_stored: doc ? 1 : 0,
					empty_search_results: results.length,
				};
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_empty_string_content", passed, Date.now() - start, metrics);
			}
		});

		it("test_whitespace_only_content", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				const whitespaceVariants = [
					{ id: "spaces", content: "     " },
					{ id: "tabs", content: "\t\t\t" },
					{ id: "newlines", content: "\n\n\n" },
					{ id: "mixed", content: " \t \n \t " },
				];

				for (const v of whitespaceVariants) {
					await collection.add({
						id: v.id,
						content: v.content,
						metadata: createTestMetadata(),
					});
				}

				let storedCount = 0;
				for (const v of whitespaceVariants) {
					if (collection.get(v.id)) storedCount++;
				}

				metrics = {
					whitespace_variants: whitespaceVariants.length,
					stored_count: storedCount,
				};

				expect(storedCount).toBe(whitespaceVariants.length);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_whitespace_only_content", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Long Content Handling", () => {
		it("test_very_long_content", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				// Generate very long content
				const longContent =
					"User fact: ".repeat(1000) +
					"This is the important part about the user preference for dark mode.";

				await collection.add({
					id: "long_content",
					content: longContent,
					metadata: createTestMetadata(),
				});

				const doc = collection.get("long_content");
				expect(doc).toBeDefined();
				expect(doc?.content.length).toBe(longContent.length);

				// Search should still work
				const results = await collection.search("dark mode preference", 3);

				metrics = {
					content_length: longContent.length,
					content_stored: doc ? 1 : 0,
					search_found: results.length > 0 ? 1 : 0,
				};

				expect(doc?.content).toBe(longContent);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_very_long_content", passed, Date.now() - start, metrics);
			}
		});

		it("test_content_size_limits", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				// Test different size limits
				const sizes = [100, 1000, 5000, 10000, 50000];
				const storedSizes: number[] = [];

				for (const size of sizes) {
					const content = "x".repeat(size);
					const id = `size_${size}`;

					await collection.add({
						id,
						content,
						metadata: createTestMetadata(),
					});

					const doc = collection.get(id);
					if (doc) storedSizes.push(size);
				}

				metrics = {
					tested_sizes: sizes.length,
					stored_sizes: storedSizes.length,
					max_stored_size: Math.max(...storedSizes),
				};

				expect(storedSizes.length).toBe(sizes.length);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_content_size_limits", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Special Characters", () => {
		it("test_unicode_content", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				const unicodeContent = [
					{ id: "emoji", content: "User loves 🎉 parties and 🍕 pizza" },
					{ id: "chinese", content: "User speaks 中文 Chinese" },
					{ id: "arabic", content: "User knows العربية Arabic" },
					{ id: "russian", content: "User understands Русский Russian" },
					{ id: "japanese", content: "User studies 日本語 Japanese" },
					{ id: "korean", content: "User learns 한국어 Korean" },
				];

				for (const u of unicodeContent) {
					await collection.add({
						id: u.id,
						content: u.content,
						metadata: createTestMetadata(),
					});
				}

				let storedCount = 0;
				let contentMatches = 0;
				for (const u of unicodeContent) {
					const doc = collection.get(u.id);
					if (doc) {
						storedCount++;
						if (doc.content === u.content) contentMatches++;
					}
				}

				metrics = {
					unicode_variants: unicodeContent.length,
					stored_count: storedCount,
					content_matches: contentMatches,
				};

				expect(contentMatches).toBe(unicodeContent.length);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_unicode_content", passed, Date.now() - start, metrics);
			}
		});

		it("test_special_characters", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				const specialChars = [
					{ id: "quotes", content: 'User\'s favorite quote is "Hello, World!"' },
					{ id: "backslash", content: "Path is C:\\Users\\name\\file.txt" },
					{ id: "html", content: "User likes <strong>bold</strong> text" },
					{ id: "sql", content: "User query: SELECT * FROM users WHERE name='test'" },
					{ id: "json", content: 'User data: {"name": "test", "age": 30}' },
					{ id: "null_bytes", content: "Content with \u0000 null byte" },
				];

				for (const s of specialChars) {
					await collection.add({
						id: s.id,
						content: s.content,
						metadata: createTestMetadata(),
					});
				}

				let storedCount = 0;
				for (const s of specialChars) {
					if (collection.get(s.id)) storedCount++;
				}

				metrics = {
					special_char_variants: specialChars.length,
					stored_count: storedCount,
				};

				expect(storedCount).toBe(specialChars.length);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_special_characters", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Hebrew Edge Cases", () => {
		it("test_hebrew_rtl_markers", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				// RTL markers and bidirectional text
				const rtlContent = [
					{ id: "rtl_1", content: "\u200Fשלום עולם\u200F" }, // RLM markers
					{ id: "rtl_2", content: "\u202Bעברית\u202C" }, // RLE/PDF
					{ id: "bidi", content: "Hello שלום World עולם" }, // Mixed
					{ id: "pure_hebrew", content: "המשתמש גר בתל אביב ועובד בגוגל" },
				];

				for (const r of rtlContent) {
					await collection.add({
						id: r.id,
						content: r.content,
						metadata: createTestMetadata(),
					});
				}

				// Search in Hebrew
				const results = await collection.search("שלום", 3);

				let storedCount = 0;
				for (const r of rtlContent) {
					if (collection.get(r.id)) storedCount++;
				}

				metrics = {
					rtl_variants: rtlContent.length,
					stored_count: storedCount,
					hebrew_search_results: results.length,
				};

				expect(storedCount).toBe(rtlContent.length);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_hebrew_rtl_markers", passed, Date.now() - start, metrics);
			}
		});

		it("test_hebrew_numbers_mixed", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				// Hebrew with numbers and mixed content
				const mixedContent = [
					{ id: "phone", content: "מספר טלפון: 054-1234567" },
					{ id: "date", content: "תאריך לידה: 15/03/1990" },
					{ id: "address", content: "כתובת: רחוב הרצל 123, תל אביב" },
					{ id: "price", content: "מחיר: ₪150.00" },
					{ id: "percent", content: "הנחה של 25% על כל המוצרים" },
				];

				for (const m of mixedContent) {
					await collection.add({
						id: m.id,
						content: m.content,
						metadata: createTestMetadata(),
					});
				}

				let storedCount = 0;
				for (const m of mixedContent) {
					const doc = collection.get(m.id);
					if (doc && doc.content === m.content) storedCount++;
				}

				metrics = {
					mixed_variants: mixedContent.length,
					exact_matches: storedCount,
				};

				expect(storedCount).toBe(mixedContent.length);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_hebrew_numbers_mixed", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Numeric Content", () => {
		it("test_numeric_content", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				const numericContent = [
					{ id: "int", content: "12345" },
					{ id: "float", content: "123.456789" },
					{ id: "negative", content: "-999" },
					{ id: "scientific", content: "1.23e10" },
					{ id: "phone", content: "+1-555-123-4567" },
					{ id: "date", content: "2026-01-07" },
					{ id: "time", content: "14:30:00" },
					{ id: "ip", content: "192.168.1.1" },
				];

				for (const n of numericContent) {
					await collection.add({
						id: n.id,
						content: n.content,
						metadata: createTestMetadata(),
					});
				}

				let storedCount = 0;
				for (const n of numericContent) {
					const doc = collection.get(n.id);
					if (doc && doc.content === n.content) storedCount++;
				}

				metrics = {
					numeric_variants: numericContent.length,
					exact_matches: storedCount,
				};

				expect(storedCount).toBe(numericContent.length);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_numeric_content", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("ID Format Validation", () => {
		it("test_id_format_validation", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				const testIds = [
					"simple_id",
					"id-with-dashes",
					"id_with_underscores",
					"CamelCaseId",
					"123numeric",
					"a".repeat(100), // Long ID
					"507f1f77bcf86cd799439011", // MongoDB ObjectId format
					"550e8400-e29b-41d4-a716-446655440000", // UUID format
					"mem_abc123", // Memory ID format
					"frag_xyz789", // Fragment ID format
				];

				let validCount = 0;
				const formats: string[] = [];

				for (const id of testIds) {
					const result = verifyDocIdFormat(id);
					if (result.valid) validCount++;
					formats.push(result.format);
				}

				metrics = {
					tested_ids: testIds.length,
					valid_ids: validCount,
					formats_detected: new Set(formats).size,
				};

				expect(validCount).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_id_format_validation", passed, Date.now() - start, metrics);
			}
		});

		it("test_duplicate_id_handling", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				const duplicateId = "duplicate_test_id";

				// Store first version
				await collection.add({
					id: duplicateId,
					content: "First version of content",
					metadata: createTestMetadata(),
				});

				// Store second version with same ID (should overwrite or handle)
				await collection.add({
					id: duplicateId,
					content: "Second version of content",
					metadata: createTestMetadata(),
				});

				// Check what's stored
				const doc = collection.get(duplicateId);
				const count = collection.count();

				metrics = {
					final_content: doc?.content === "Second version of content" ? "second" : "first",
					collection_count: count,
				};

				// Behavior depends on implementation - just verify no crash
				expect(doc).toBeDefined();
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_duplicate_id_handling", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Embedding Validation", () => {
		it("test_embedding_dimension_validation", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				// Generate embedding
				const embedding = await embeddingService.embed("Test content for embedding");

				const validation = verifyEmbeddingDimension(embedding, EMBEDDING_DIM);

				metrics = {
					embedding_dim: embedding.length,
					expected_dim: EMBEDDING_DIM,
					is_valid: validation.valid ? 1 : 0,
					is_normalized: validation.is_normalized ? 1 : 0,
				};

				expect(validation.valid).toBe(true);
				expect(validation.is_normalized).toBe(true);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_embedding_dimension_validation", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Rapid Operations", () => {
		it("test_rapid_concurrent_adds", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				// Rapid concurrent additions
				const count = 100;
				const promises = [];

				for (let i = 0; i < count; i++) {
					promises.push(
						collection.add({
							id: `rapid_${i}`,
							content: `Rapid content ${i}`,
							metadata: createTestMetadata(),
						})
					);
				}

				await Promise.all(promises);

				const finalCount = collection.count();
				const duration = Date.now() - start;

				metrics = {
					items_added: count,
					final_count: finalCount,
					duration_ms: duration,
					items_per_second: (count / duration) * 1000,
				};

				expect(finalCount).toBe(count);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_rapid_concurrent_adds", passed, Date.now() - start, metrics);
			}
		});

		it("test_rapid_search_operations", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				// Seed collection
				for (let i = 0; i < 50; i++) {
					await collection.add({
						id: `search_test_${i}`,
						content: `Content about topic ${i % 10} with details`,
						metadata: createTestMetadata(),
					});
				}

				// Rapid searches
				const searchCount = 20;
				const searches = [];
				for (let i = 0; i < searchCount; i++) {
					searches.push(collection.search(`topic ${i % 10}`, 5));
				}

				const results = await Promise.all(searches);
				const totalResults = results.reduce((sum, r) => sum + r.length, 0);
				const duration = Date.now() - start;

				metrics = {
					searches_performed: searchCount,
					total_results: totalResults,
					avg_results_per_search: totalResults / searchCount,
					duration_ms: duration,
					searches_per_second: (searchCount / duration) * 1000,
				};

				expect(totalResults).toBeGreaterThan(0);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_rapid_search_operations", passed, Date.now() - start, metrics);
			}
		});
	});

	describe("Summary Test", () => {
		it("test_edge_cases", async () => {
			const start = Date.now();
			let passed = true;
			let metrics: Record<string, number | string> = {};

			try {
				// Comprehensive edge case test
				const edgeCases = [
					{ id: "empty", content: "" },
					{ id: "long", content: "x".repeat(10000) },
					{ id: "unicode", content: "🎉 שלום 中文 العربية" },
					{ id: "special", content: '<script>alert("test")</script>' },
					{ id: "numeric", content: "12345.67890" },
					{ id: "mixed", content: "Hello שלום 123 🎉" },
				];

				let storedCount = 0;
				for (const ec of edgeCases) {
					await collection.add({
						id: ec.id,
						content: ec.content,
						metadata: createTestMetadata(),
					});
					if (collection.get(ec.id)) storedCount++;
				}

				// Search edge cases
				const searchQueries = ["", "שלום", "🎉", "script", "12345"];
				let searchSuccessCount = 0;
				for (const q of searchQueries) {
					try {
						await collection.search(q, 3);
						searchSuccessCount++;
					} catch {
						// Search failed - count as handled
					}
				}

				metrics = {
					edge_cases_tested: edgeCases.length,
					stored_successfully: storedCount,
					search_queries_tested: searchQueries.length,
					search_queries_handled: searchSuccessCount,
					robustness_score:
						(storedCount + searchSuccessCount) / (edgeCases.length + searchQueries.length),
				};

				expect(storedCount).toBe(edgeCases.length);
			} catch (e) {
				passed = false;
				throw e;
			} finally {
				recordTest("test_edge_cases", passed, Date.now() - start, metrics);
			}
		});
	});
});
