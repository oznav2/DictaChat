/**
 * Memory Attribution Tests - LLM Annotation Parsing
 * 
 * Tests for the v0.2.12 memory attribution system:
 * - parseMemoryMarks() - Extracts <!-- MEM: 1👍 2👎 3➖ --> annotations
 * - getMemoryIdByPosition() - Maps positions to memory IDs
 * - recordSelectiveOutcomes() - Causal attribution scoring
 * - processResponseWithAttribution() - Full response processing
 * - processResponseWithFullAttribution() - v0.2.12 enhanced processing
 * - getScoringAction() - Scoring matrix lookups
 * - buildSurfacedMemories() - Surfaced memory structure building
 * - inferUsedPositions() - Fallback usage inference
 * - detectBasicOutcome() - Basic outcome detection
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	parseMemoryMarks,
	getMemoryIdByPosition,
	recordSelectiveOutcomes,
	processResponseWithAttribution,
	processResponseWithFullAttribution,
	getScoringAction,
	buildSurfacedMemories,
	inferUsedPositions,
	detectBasicOutcome,
	// v0.2.10 additions
	getMemoryBankPhilosophy,
	hasMemoryBankTool,
	getToolGuidance,
	MEMORY_ATTRIBUTION_INSTRUCTION,
	MEMORY_ATTRIBUTION_INSTRUCTION_HE,
	MEMORY_BANK_PHILOSOPHY,
	MEMORY_BANK_PHILOSOPHY_HE,
	SCORING_MATRIX,
	type SearchPositionMap,
	type MemoryAttribution,
} from "$lib/server/textGeneration/mcp/memoryIntegration";

// Mock UnifiedMemoryFacade
vi.mock("$lib/server/memory/UnifiedMemoryFacade", () => ({
	UnifiedMemoryFacade: {
		getInstance: () => ({
			recordOutcome: vi.fn().mockResolvedValue(undefined),
		}),
	},
}));

// Mock feature flags
vi.mock("$lib/server/memory/featureFlags", () => ({
	getMemoryFeatureFlags: () => ({
		systemEnabled: true,
		outcomeEnabled: true,
	}),
	isMemorySystemOperational: () => true,
	getMemoryEnvConfig: () => ({
		prefetchTimeoutMs: 5000,
	}),
}));

// Mock logger
vi.mock("$lib/server/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock personality loader
vi.mock("$lib/server/memory/personality", () => ({
	getPersonalityLoader: () => ({
		loadTemplate: () => null,
	}),
}));

describe("Memory Attribution - parseMemoryMarks()", () => {
	it("should parse standard emoji marks correctly", () => {
		const response = `This is a response about user preferences.

The answer is based on memories 1 and 3.

<!-- MEM: 1👍 2👎 3➖ -->`;

		const result = parseMemoryMarks(response);

		expect(result.attribution).not.toBeNull();
		expect(result.attribution?.upvoted).toEqual([1]);
		expect(result.attribution?.downvoted).toEqual([2]);
		expect(result.attribution?.neutral).toEqual([3]);
		expect(result.cleanedResponse).not.toContain("<!-- MEM:");
		expect(result.cleanedResponse).toContain("This is a response");
	});

	it("should handle multiple upvoted memories", () => {
		const response = `Answer here.
<!-- MEM: 1👍 2👍 3👍 4👎 5➖ -->`;

		const result = parseMemoryMarks(response);

		expect(result.attribution?.upvoted).toEqual([1, 2, 3]);
		expect(result.attribution?.downvoted).toEqual([4]);
		expect(result.attribution?.neutral).toEqual([5]);
	});

	it("should handle compact format without spaces", () => {
		const response = `Answer here.
<!-- MEM:1👍2👎3➖ -->`;

		const result = parseMemoryMarks(response);

		expect(result.attribution?.upvoted).toEqual([1]);
		expect(result.attribution?.downvoted).toEqual([2]);
		expect(result.attribution?.neutral).toEqual([3]);
	});

	it("should handle case-insensitive MEM tag", () => {
		const response = `Answer here.
<!-- mem: 1👍 2👎 -->`;

		const result = parseMemoryMarks(response);

		expect(result.attribution).not.toBeNull();
		expect(result.attribution?.upvoted).toEqual([1]);
		expect(result.attribution?.downvoted).toEqual([2]);
	});

	it("should handle GitHub-style emoji codes", () => {
		const response = `Answer here.
<!-- MEM: 1:+1: 2:-1: 3:neutral_face: -->`;

		const result = parseMemoryMarks(response);

		expect(result.attribution?.upvoted).toEqual([1]);
		expect(result.attribution?.downvoted).toEqual([2]);
		expect(result.attribution?.neutral).toEqual([3]);
	});

	it("should return null attribution when no marks present", () => {
		const response = "This is a response without any memory marks.";

		const result = parseMemoryMarks(response);

		expect(result.attribution).toBeNull();
		expect(result.cleanedResponse).toBe(response);
	});

	it("should return null attribution for malformed marks", () => {
		const response = `Answer here.
<!-- MEM: invalid format -->`;

		const result = parseMemoryMarks(response);

		expect(result.attribution).toBeNull();
	});

	it("should handle extra whitespace in annotation", () => {
		const response = `Answer here.
<!--   MEM:   1👍   2👎   -->`;

		const result = parseMemoryMarks(response);

		expect(result.attribution?.upvoted).toEqual([1]);
		expect(result.attribution?.downvoted).toEqual([2]);
	});

	it("should preserve response content before annotation", () => {
		const response = `## Summary

This is important information.

- Point 1
- Point 2

<!-- MEM: 1👍 -->`;

		const result = parseMemoryMarks(response);

		expect(result.cleanedResponse).toContain("## Summary");
		expect(result.cleanedResponse).toContain("This is important information");
		expect(result.cleanedResponse).toContain("- Point 1");
		expect(result.cleanedResponse).not.toContain("MEM:");
	});

	it("should handle annotation in the middle of response", () => {
		const response = `Some text before.
<!-- MEM: 1👍 2👎 -->
Some text after.`;

		const result = parseMemoryMarks(response);

		expect(result.cleanedResponse).toContain("Some text before");
		expect(result.cleanedResponse).toContain("Some text after");
		expect(result.cleanedResponse).not.toContain("MEM:");
	});

	it("should capture raw mark string", () => {
		const response = `Answer.
<!-- MEM: 1👍 3👍 2👎 4➖ 5➖ -->`;

		const result = parseMemoryMarks(response);

		expect(result.attribution?.raw).toContain("1👍");
		expect(result.attribution?.raw).toContain("2👎");
	});
});

describe("Memory Attribution - getMemoryIdByPosition()", () => {
	const searchPositionMap: SearchPositionMap = {
		"mem_abc123": {
			position: 0,
			tier: "working",
			score: 0.9,
			alwaysInjected: false,
		},
		"mem_def456": {
			position: 1,
			tier: "history",
			score: 0.8,
			alwaysInjected: false,
		},
		"mem_ghi789": {
			position: 2,
			tier: "patterns",
			score: 0.7,
			alwaysInjected: false,
		},
	};

	it("should map 1-indexed position to memory ID", () => {
		// Position 1 in attribution = position 0 in map (0-indexed)
		expect(getMemoryIdByPosition(searchPositionMap, 1)).toBe("mem_abc123");
		expect(getMemoryIdByPosition(searchPositionMap, 2)).toBe("mem_def456");
		expect(getMemoryIdByPosition(searchPositionMap, 3)).toBe("mem_ghi789");
	});

	it("should return null for invalid position", () => {
		expect(getMemoryIdByPosition(searchPositionMap, 0)).toBeNull();
		expect(getMemoryIdByPosition(searchPositionMap, 4)).toBeNull();
		expect(getMemoryIdByPosition(searchPositionMap, -1)).toBeNull();
	});

	it("should handle empty position map", () => {
		expect(getMemoryIdByPosition({}, 1)).toBeNull();
	});
});

describe("Memory Attribution - getScoringAction()", () => {
	it("should return upvote for worked+upvoted", () => {
		const result = getScoringAction("worked", "upvoted");
		expect(result.action).toBe("upvote");
		expect(result.delta).toBe(0.2);
	});

	it("should return neutral for worked+downvoted (don't punish on success)", () => {
		const result = getScoringAction("worked", "downvoted");
		expect(result.action).toBe("neutral");
		expect(result.delta).toBe(0.0);
	});

	it("should return downvote for failed+downvoted", () => {
		const result = getScoringAction("failed", "downvoted");
		expect(result.action).toBe("downvote");
		expect(result.delta).toBe(-0.3);
	});

	it("should return neutral for failed+upvoted (don't reward on failure)", () => {
		const result = getScoringAction("failed", "upvoted");
		expect(result.action).toBe("neutral");
		expect(result.delta).toBe(0.0);
	});

	it("should return slight_up for partial+upvoted", () => {
		const result = getScoringAction("partial", "upvoted");
		expect(result.action).toBe("slight_up");
		expect(result.delta).toBe(0.1);
	});

	it("should return slight_down for partial+downvoted", () => {
		const result = getScoringAction("partial", "downvoted");
		expect(result.action).toBe("slight_down");
		expect(result.delta).toBe(-0.1);
	});

	it("should return slight_up for unknown+upvoted", () => {
		const result = getScoringAction("unknown", "upvoted");
		expect(result.action).toBe("slight_up");
		expect(result.delta).toBe(0.05);
	});

	it("should return neutral for all neutral marks", () => {
		expect(getScoringAction("worked", "neutral").action).toBe("neutral");
		expect(getScoringAction("failed", "neutral").action).toBe("neutral");
		expect(getScoringAction("partial", "neutral").action).toBe("neutral");
		expect(getScoringAction("unknown", "neutral").action).toBe("neutral");
	});
});

describe("Memory Attribution - buildSurfacedMemories()", () => {
	it("should build position and content maps correctly", () => {
		const searchPositionMap: SearchPositionMap = {
			"mem_abc": { position: 0, tier: "working", score: 0.9, alwaysInjected: false },
			"mem_def": { position: 1, tier: "history", score: 0.8, alwaysInjected: false },
		};
		const memoryContents = {
			"mem_abc": "User prefers dark mode for coding",
			"mem_def": "User lives in Jerusalem",
		};

		const result = buildSurfacedMemories(searchPositionMap, memoryContents);

		// UI positions are 1-indexed
		expect(result.position_map[1]).toBe("mem_abc");
		expect(result.position_map[2]).toBe("mem_def");
		expect(result.content_map[1]).toContain("dark mode");
		expect(result.content_map[2]).toContain("Jerusalem");
	});

	it("should handle missing content map", () => {
		const searchPositionMap: SearchPositionMap = {
			"mem_abc": { position: 0, tier: "working", score: 0.9, alwaysInjected: false },
		};

		const result = buildSurfacedMemories(searchPositionMap);

		expect(result.position_map[1]).toBe("mem_abc");
		expect(result.content_map[1]).toBeUndefined();
	});

	it("should truncate long content previews", () => {
		const searchPositionMap: SearchPositionMap = {
			"mem_abc": { position: 0, tier: "working", score: 0.9, alwaysInjected: false },
		};
		const memoryContents = {
			"mem_abc": "A".repeat(200), // 200 character content
		};

		const result = buildSurfacedMemories(searchPositionMap, memoryContents);

		expect(result.content_map[1]).toHaveLength(100); // Truncated to 100
	});
});

describe("Memory Attribution - inferUsedPositions()", () => {
	it("should detect keyword matches in response", () => {
		const response = "The user prefers dark mode for coding.";
		const surfacedMemories = {
			position_map: { 1: "mem_abc", 2: "mem_def" },
			content_map: {
				1: "User prefers dark mode for coding",
				2: "User visited Paris France tourist attractions",
			},
		};

		const result = inferUsedPositions(response, surfacedMemories);

		expect(result).toContain(1); // "dark" and "mode" and "coding" match
		expect(result).not.toContain(2); // Paris/France/tourist not in response
	});

	it("should require multiple keyword matches", () => {
		const response = "The mode is set correctly.";
		const surfacedMemories = {
			position_map: { 1: "mem_abc" },
			content_map: {
				1: "User prefers dark mode for coding",
			},
		};

		const result = inferUsedPositions(response, surfacedMemories);

		// Only "mode" matches - need 2+ matches
		expect(result).toHaveLength(0);
	});

	it("should handle case-insensitive matching", () => {
		const response = "DARK MODE is the user's PREFERENCE for CODING.";
		const surfacedMemories = {
			position_map: { 1: "mem_abc" },
			content_map: {
				1: "User prefers dark mode for coding",
			},
		};

		const result = inferUsedPositions(response, surfacedMemories);

		expect(result).toContain(1);
	});

	it("should return empty for no matches", () => {
		const response = "Here is some completely unrelated information.";
		const surfacedMemories = {
			position_map: { 1: "mem_abc" },
			content_map: {
				1: "User prefers dark mode for coding",
			},
		};

		const result = inferUsedPositions(response, surfacedMemories);

		expect(result).toHaveLength(0);
	});
});

describe("Memory Attribution - detectBasicOutcome()", () => {
	it("should detect explicit thanks as worked", () => {
		const result = detectBasicOutcome("Thanks! That's exactly what I needed.", "Here is the answer.");

		expect(result.outcome).toBe("worked");
		expect(result.confidence).toBeGreaterThanOrEqual(0.8);
		expect(result.indicators).toContain("explicit_thanks");
	});

	it("should detect Hebrew thanks as worked", () => {
		const result = detectBasicOutcome("תודה! מעולה", "Here is the answer.");

		expect(result.outcome).toBe("worked");
		expect(result.indicators).toContain("explicit_thanks");
	});

	it("should detect correction as failed", () => {
		const result = detectBasicOutcome("No, that's not right. Actually...", "Here is my answer.");

		expect(result.outcome).toBe("failed");
		expect(result.indicators).toContain("correction_needed");
	});

	it("should detect error in response as failed", () => {
		const result = detectBasicOutcome(null, "I'm sorry, I cannot help with that.");

		expect(result.outcome).toBe("failed");
		expect(result.indicators).toContain("error_message");
	});

	it("should detect follow-up question as partial", () => {
		const result = detectBasicOutcome("What about option B?", "Here is the answer.");

		expect(result.outcome).toBe("partial");
		expect(result.indicators).toContain("follow_up_question");
	});

	it("should return unknown for no clear signals", () => {
		const result = detectBasicOutcome(null, "OK");

		expect(result.outcome).toBe("unknown");
	});

	it("should return partial for substantial response with no signals", () => {
		const result = detectBasicOutcome(null, "A".repeat(250)); // Substantial response

		expect(result.outcome).toBe("partial");
	});
});

describe("Memory Attribution - SCORING_MATRIX", () => {
	it("should have all outcomes defined", () => {
		expect(SCORING_MATRIX).toHaveProperty("worked");
		expect(SCORING_MATRIX).toHaveProperty("failed");
		expect(SCORING_MATRIX).toHaveProperty("partial");
		expect(SCORING_MATRIX).toHaveProperty("unknown");
	});

	it("should have all mark types for each outcome", () => {
		for (const outcome of ["worked", "failed", "partial", "unknown"]) {
			expect(SCORING_MATRIX[outcome]).toHaveProperty("upvoted");
			expect(SCORING_MATRIX[outcome]).toHaveProperty("downvoted");
			expect(SCORING_MATRIX[outcome]).toHaveProperty("neutral");
		}
	});

	it("should have action and delta for each entry", () => {
		for (const outcome of Object.values(SCORING_MATRIX)) {
			for (const entry of Object.values(outcome)) {
				expect(entry).toHaveProperty("action");
				expect(entry).toHaveProperty("delta");
				expect(typeof entry.delta).toBe("number");
			}
		}
	});
});

describe("Memory Attribution - Constants", () => {
	it("should have English attribution instruction", () => {
		expect(MEMORY_ATTRIBUTION_INSTRUCTION).toContain("<!-- MEM:");
		expect(MEMORY_ATTRIBUTION_INSTRUCTION).toContain("👍");
		expect(MEMORY_ATTRIBUTION_INSTRUCTION).toContain("👎");
		expect(MEMORY_ATTRIBUTION_INSTRUCTION).toContain("➖");
	});

	it("should have Hebrew attribution instruction", () => {
		expect(MEMORY_ATTRIBUTION_INSTRUCTION_HE).toContain("<!-- MEM:");
		expect(MEMORY_ATTRIBUTION_INSTRUCTION_HE).toContain("👍");
		expect(MEMORY_ATTRIBUTION_INSTRUCTION_HE).toContain("👎");
		expect(MEMORY_ATTRIBUTION_INSTRUCTION_HE).toContain("➖");
	});
});

describe("Memory Attribution - processResponseWithAttribution()", () => {
	const mockSearchPositionMap: SearchPositionMap = {
		"mem_abc": { position: 0, tier: "working", score: 0.9, alwaysInjected: false },
		"mem_def": { position: 1, tier: "history", score: 0.8, alwaysInjected: false },
	};

	it("should process response with attribution and strip comment", async () => {
		const response = `Here is the answer.
<!-- MEM: 1👍 2👎 -->`;

		const result = await processResponseWithAttribution({
			userId: "user123",
			conversationId: "conv123",
			response,
			searchPositionMap: mockSearchPositionMap,
		});

		expect(result.attributionFound).toBe(true);
		expect(result.cleanedResponse).not.toContain("MEM:");
		expect(result.attribution?.upvoted).toEqual([1]);
		expect(result.attribution?.downvoted).toEqual([2]);
	});

	it("should handle response without attribution", async () => {
		const response = "Here is the answer without any attribution.";

		const result = await processResponseWithAttribution({
			userId: "user123",
			conversationId: "conv123",
			response,
			searchPositionMap: mockSearchPositionMap,
		});

		expect(result.attributionFound).toBe(false);
		expect(result.cleanedResponse).toBe(response);
		expect(result.attribution).toBeNull();
	});

	it("should handle empty search position map", async () => {
		const response = `Answer.
<!-- MEM: 1👍 -->`;

		const result = await processResponseWithAttribution({
			userId: "user123",
			conversationId: "conv123",
			response,
			searchPositionMap: {},
		});

		// Attribution is parsed but not recorded (no memories to score)
		expect(result.attributionFound).toBe(true);
		expect(result.cleanedResponse).not.toContain("MEM:");
	});
});

describe("Memory Attribution - processResponseWithFullAttribution()", () => {
	const mockSearchPositionMap: SearchPositionMap = {
		"mem_abc": { position: 0, tier: "working", score: 0.9, alwaysInjected: false },
		"mem_def": { position: 1, tier: "history", score: 0.8, alwaysInjected: false },
	};

	it("should use attribution marks when present", async () => {
		const response = `Here is the answer.
<!-- MEM: 1👍 2👎 -->`;

		const result = await processResponseWithFullAttribution({
			userId: "user123",
			conversationId: "conv123",
			response,
			searchPositionMap: mockSearchPositionMap,
		});

		expect(result.attributionFound).toBe(true);
		expect(result.scoringApplied).toBe("attribution");
		expect(result.usedPositions).toContain(1);
		expect(result.usedPositions).toContain(2);
	});

	it("should fall back to inference when no attribution marks", async () => {
		const response = "User prefers dark mode for coding, as requested.";

		const result = await processResponseWithFullAttribution({
			userId: "user123",
			conversationId: "conv123",
			response,
			searchPositionMap: mockSearchPositionMap,
			memoryContents: {
				"mem_abc": "User prefers dark mode for coding",
				"mem_def": "User lives in Jerusalem",
			},
		});

		expect(result.attributionFound).toBe(false);
		expect(result.scoringApplied).toBe("inference");
	});

	it("should fall back to all-scoring when no inference matches", async () => {
		const response = "Completely unrelated response text here.";

		const result = await processResponseWithFullAttribution({
			userId: "user123",
			conversationId: "conv123",
			response,
			searchPositionMap: mockSearchPositionMap,
			memoryContents: {
				"mem_abc": "User prefers dark mode for coding",
				"mem_def": "User lives in Jerusalem",
			},
		});

		expect(result.attributionFound).toBe(false);
		expect(result.scoringApplied).toBe("all");
	});

	it("should include outcome detection", async () => {
		const response = "Here is the answer.";

		const result = await processResponseWithFullAttribution({
			userId: "user123",
			conversationId: "conv123",
			response,
			searchPositionMap: mockSearchPositionMap,
			userFollowUp: "Thanks! That's exactly what I needed.",
		});

		expect(result.outcomeDetection.outcome).toBe("worked");
		expect(result.outcomeDetection.indicators).toContain("explicit_thanks");
	});

	it("should return none scoring for empty position map", async () => {
		const response = "Here is the answer.";

		const result = await processResponseWithFullAttribution({
			userId: "user123",
			conversationId: "conv123",
			response,
			searchPositionMap: {},
		});

		expect(result.scoringApplied).toBe("none");
	});
});

// ============================================
// v0.2.10 MEMORY BANK PHILOSOPHY TESTS
// ============================================

describe("Memory Attribution - v0.2.10 Memory Bank Philosophy", () => {
	describe("MEMORY_BANK_PHILOSOPHY constant", () => {
		it("should include three-layer purpose structure", () => {
			expect(MEMORY_BANK_PHILOSOPHY).toContain("User Context");
			expect(MEMORY_BANK_PHILOSOPHY).toContain("System Mastery");
			expect(MEMORY_BANK_PHILOSOPHY).toContain("Agent Growth");
		});

		it("should include selectivity guidance", () => {
			expect(MEMORY_BANK_PHILOSOPHY).toContain("BE SELECTIVE");
			expect(MEMORY_BANK_PHILOSOPHY).toContain("DON'T store");
		});

		it("should include layer tags", () => {
			expect(MEMORY_BANK_PHILOSOPHY).toContain("user_context");
			expect(MEMORY_BANK_PHILOSOPHY).toContain("system_mastery");
			expect(MEMORY_BANK_PHILOSOPHY).toContain("agent_growth");
		});

		it("should include good/bad examples", () => {
			expect(MEMORY_BANK_PHILOSOPHY).toContain("Good memory examples");
			expect(MEMORY_BANK_PHILOSOPHY).toContain("Bad memory examples");
		});
	});

	describe("MEMORY_BANK_PHILOSOPHY_HE constant", () => {
		it("should include Hebrew three-layer structure", () => {
			expect(MEMORY_BANK_PHILOSOPHY_HE).toContain("הקשר משתמש");
			expect(MEMORY_BANK_PHILOSOPHY_HE).toContain("שליטה במערכת");
			expect(MEMORY_BANK_PHILOSOPHY_HE).toContain("צמיחת הסוכן");
		});

		it("should include Hebrew selectivity guidance", () => {
			expect(MEMORY_BANK_PHILOSOPHY_HE).toContain("היה סלקטיבי");
			expect(MEMORY_BANK_PHILOSOPHY_HE).toContain("אל תשמור");
		});
	});

	describe("getMemoryBankPhilosophy()", () => {
		it("should return English philosophy by default", () => {
			const result = getMemoryBankPhilosophy();
			expect(result).toBe(MEMORY_BANK_PHILOSOPHY);
		});

		it("should return English philosophy for 'en' language", () => {
			const result = getMemoryBankPhilosophy("en");
			expect(result).toBe(MEMORY_BANK_PHILOSOPHY);
		});

		it("should return Hebrew philosophy for 'he' language", () => {
			const result = getMemoryBankPhilosophy("he");
			expect(result).toBe(MEMORY_BANK_PHILOSOPHY_HE);
		});

		it("should return English philosophy for 'mixed' language", () => {
			const result = getMemoryBankPhilosophy("mixed");
			expect(result).toBe(MEMORY_BANK_PHILOSOPHY);
		});
	});

	describe("hasMemoryBankTool()", () => {
		it("should return true when add_to_memory_bank is present", () => {
			const tools = [
				{ function: { name: "search_memory" } },
				{ function: { name: "add_to_memory_bank" } },
			];
			expect(hasMemoryBankTool(tools)).toBe(true);
		});

		it("should return true when create_memory is present", () => {
			const tools = [
				{ function: { name: "search_memory" } },
				{ function: { name: "create_memory" } },
			];
			expect(hasMemoryBankTool(tools)).toBe(true);
		});

		it("should return true when store_memory is present", () => {
			const tools = [
				{ function: { name: "store_memory" } },
			];
			expect(hasMemoryBankTool(tools)).toBe(true);
		});

		it("should return false when no memory bank tool is present", () => {
			const tools = [
				{ function: { name: "search_memory" } },
				{ function: { name: "tavily_search" } },
			];
			expect(hasMemoryBankTool(tools)).toBe(false);
		});

		it("should return false for empty tools array", () => {
			expect(hasMemoryBankTool([])).toBe(false);
		});
	});
});

// ============================================
// v0.2.10 TOOL GUIDANCE TESTS
// ============================================

describe("Memory Attribution - v0.2.10 Tool Guidance", () => {
	describe("getToolGuidance()", () => {
		it("should return empty guidance when no action stats are available", async () => {
			const result = await getToolGuidance("user123", "general", ["search_memory"]);
			
			// Returns empty because no stats in mock
			expect(result.hasGuidance).toBe(false);
			expect(result.guidanceText).toBeNull();
			expect(result.preferredTools).toEqual([]);
			expect(result.avoidTools).toEqual([]);
		});

		it("should return timing information", async () => {
			const result = await getToolGuidance("user123", "debugging", []);
			
			expect(typeof result.timingMs).toBe("number");
			expect(result.timingMs).toBeGreaterThanOrEqual(0);
		});

		it("should accept different context types", async () => {
			const contextTypes = ["general", "docker", "debugging", "coding_help", "memory_test"];
			
			for (const contextType of contextTypes) {
				const result = await getToolGuidance("user123", contextType, []);
				expect(result).toHaveProperty("hasGuidance");
				expect(result).toHaveProperty("timingMs");
			}
		});

		it("should handle empty available tools list", async () => {
			const result = await getToolGuidance("user123", "general", []);
			expect(result).toHaveProperty("hasGuidance");
		});
	});
});
