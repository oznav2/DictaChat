/**
 * add_to_memory_bank Tool
 *
 * Store permanent, selective memories that enable continuity
 * and growth across sessions.
 */

import { logger } from "$lib/server/logger";
import type { UnifiedMemoryFacade } from "../UnifiedMemoryFacade";

/**
 * Valid tags for memory_bank entries
 */
const VALID_TAGS = new Set([
	"identity",
	"preference",
	"goal",
	"project",
	"system_mastery",
	"agent_growth",
	"workflow",
	"context",
]);

/**
 * Tool definition for LLM tool calling
 */
export const ADD_TO_MEMORY_BANK_TOOL_DEFINITION = {
	name: "add_to_memory_bank",
	description: `Store permanent memories about the user that persist across all sessions.

Use this tool to save:
- identity: Core facts about who the user is
- preference: Likes, dislikes, communication style preferences
- goal: User's objectives, aspirations, current projects
- project: Details about ongoing projects and their context
- system_mastery: Technical skills, tools the user knows well
- agent_growth: Lessons learned about how to better assist this user
- workflow: Patterns in how the user works
- context: Important background information

IMPORTANT:
- Only store information the user would want remembered
- Be selective - don't store every detail
- Use specific, actionable content
- Set always_inject=true only for core identity facts`,
	inputSchema: {
		type: "object" as const,
		properties: {
			content: {
				type: "string",
				description: "The memory content to store - be specific and actionable",
			},
			tags: {
				type: "array",
				items: {
					type: "string",
					enum: [
						"identity",
						"preference",
						"goal",
						"project",
						"system_mastery",
						"agent_growth",
						"workflow",
						"context",
					],
				},
				description: "Categories for this memory (at least one required)",
			},
			importance: {
				type: "number",
				minimum: 0,
				maximum: 1,
				description: "How important is this memory? (0-1, default: 0.7)",
			},
			confidence: {
				type: "number",
				minimum: 0,
				maximum: 1,
				description: "How confident are you in this information? (0-1, default: 0.7)",
			},
			always_inject: {
				type: "boolean",
				description:
					"Always include in every prompt? (default: false) - use sparingly, only for core identity",
			},
		},
		required: ["content", "tags"],
	},
};

/**
 * Input parameters for add_to_memory_bank tool
 */
export interface AddToMemoryBankInput {
	content: string;
	tags: string[];
	importance?: number;
	confidence?: number;
	always_inject?: boolean;
}

/**
 * Output format for add_to_memory_bank tool
 */
export interface AddToMemoryBankOutput {
	success: boolean;
	memory_id?: string;
	message: string;
	error?: string;
}

/**
 * Execute add_to_memory_bank tool
 */
export async function executeAddToMemoryBank(
	facade: UnifiedMemoryFacade,
	userId: string,
	input: AddToMemoryBankInput
): Promise<AddToMemoryBankOutput> {
	const startTime = Date.now();

	try {
		// Validate content
		if (!input.content || input.content.trim().length === 0) {
			return {
				success: false,
				message: "Content is required",
				error: "Content cannot be empty",
			};
		}

		if (input.content.length > 5000) {
			return {
				success: false,
				message: "Content too long",
				error: "Content must be under 5000 characters",
			};
		}

		// Validate tags
		if (!input.tags || input.tags.length === 0) {
			return {
				success: false,
				message: "At least one tag is required",
				error: "Tags array cannot be empty",
			};
		}

		const validTags = input.tags.filter((t) => VALID_TAGS.has(t));
		if (validTags.length === 0) {
			return {
				success: false,
				message: `Invalid tags. Valid options: ${Array.from(VALID_TAGS).join(", ")}`,
				error: "No valid tags provided",
			};
		}

		// Validate always_inject usage
		if (input.always_inject && !validTags.includes("identity")) {
			logger.warn(
				{ tags: validTags },
				"always_inject=true used without identity tag - consider if this is appropriate"
			);
		}

		// Clamp importance and confidence
		const importance = Math.max(0, Math.min(1, input.importance ?? 0.7));
		const confidence = Math.max(0, Math.min(1, input.confidence ?? 0.7));

		// Store in memory_bank
		const result = await facade.store({
			userId,
			tier: "memory_bank",
			text: input.content.trim(),
			tags: validTags,
			importance,
			confidence,
			alwaysInject: input.always_inject ?? false,
		});

		const latencyMs = Date.now() - startTime;

		logger.info(
			{
				userId,
				memoryId: result.memory_id,
				tags: validTags,
				importance,
				alwaysInject: input.always_inject,
				latencyMs,
			},
			"Memory added to memory_bank"
		);

		return {
			success: true,
			memory_id: result.memory_id,
			message: `Memory saved successfully with tags: ${validTags.join(", ")}`,
		};
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error({ err, userId }, "add_to_memory_bank failed");

		return {
			success: false,
			message: "Failed to save memory",
			error: errorMessage,
		};
	}
}

/**
 * Format output for LLM consumption
 */
export function formatAddToMemoryBankForLLM(output: AddToMemoryBankOutput): string {
	if (output.success) {
		return `✓ ${output.message}`;
	}
	return `✗ Failed to save memory: ${output.error}`;
}
