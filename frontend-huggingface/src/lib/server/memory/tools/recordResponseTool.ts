/**
 * record_response Tool
 *
 * Store a semantic learning summary of the exchange and
 * update outcome scores for retrieved memories.
 */

import { logger } from "$lib/server/logger";
import type { Outcome } from "../types";
import type { UnifiedMemoryFacade } from "../UnifiedMemoryFacade";

/**
 * Tool definition for LLM tool calling
 */
export const RECORD_RESPONSE_TOOL_DEFINITION = {
	name: "record_response",
	description: `Record the outcome of this exchange and what was learned.

WHEN TO USE:
- After providing a helpful answer
- After completing a task
- After a conversation reaches a natural conclusion
- To acknowledge what worked or didn't work

SCORING GUIDE:
- worked: The response successfully helped the user
- partial: Some parts helped, others didn't
- failed: The response was not helpful
- unknown: Uncertain about the outcome

RELATED REFERENCES:
Use the position numbers [1], [2], [3] from search_memory results to indicate which memories were actually useful. This helps the system learn which memories are valuable.

Example: If search_memory returned 5 results and only [1] and [3] were useful:
  related: [1, 3]`,
	inputSchema: {
		type: "object" as const,
		properties: {
			key_takeaway: {
				type: "string",
				description: "1-2 sentence summary of what was learned or accomplished in this exchange",
			},
			outcome: {
				type: "string",
				enum: ["worked", "failed", "partial", "unknown"],
				description: "How well did the response serve the user? (default: unknown)",
			},
			related: {
				type: "array",
				items: {
					oneOf: [{ type: "integer", minimum: 1 }, { type: "string" }],
				},
				description:
					"Position numbers [1,2,3] from search results, or explicit memory_ids, indicating which memories were helpful",
			},
		},
		required: ["key_takeaway"],
	},
};

/**
 * Input parameters for record_response tool
 */
export interface RecordResponseInput {
	key_takeaway: string;
	outcome?: string;
	related?: Array<number | string>;
}

/**
 * Output format for record_response tool
 */
export interface RecordResponseOutput {
	success: boolean;
	message: string;
	memories_scored?: number;
	error?: string;
}

/**
 * Execute record_response tool
 */
export async function executeRecordResponse(
	facade: UnifiedMemoryFacade,
	userId: string,
	input: RecordResponseInput
): Promise<RecordResponseOutput> {
	const startTime = Date.now();

	try {
		// Validate key_takeaway
		if (!input.key_takeaway || input.key_takeaway.trim().length === 0) {
			return {
				success: false,
				message: "Key takeaway is required",
				error: "key_takeaway cannot be empty",
			};
		}

		if (input.key_takeaway.length > 1000) {
			return {
				success: false,
				message: "Key takeaway too long",
				error: "key_takeaway must be under 1000 characters",
			};
		}

		// Validate and resolve outcome
		const outcome = resolveOutcome(input.outcome);

		// Validate related references
		const related = validateRelated(input.related);

		// Record the response
		await facade.recordResponse({
			userId,
			keyTakeaway: input.key_takeaway.trim(),
			outcome,
			related,
		});

		const latencyMs = Date.now() - startTime;

		logger.info(
			{
				userId,
				outcome,
				relatedCount: related?.length ?? 0,
				latencyMs,
			},
			"Response recorded"
		);

		return {
			success: true,
			message: buildSuccessMessage(outcome, related?.length ?? 0),
			memories_scored: related?.length ?? 0,
		};
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error({ err, userId }, "record_response failed");

		return {
			success: false,
			message: "Failed to record response",
			error: errorMessage,
		};
	}
}

/**
 * Resolve outcome string to Outcome type
 */
function resolveOutcome(outcome?: string): Outcome {
	if (outcome === "worked") return "worked";
	if (outcome === "failed") return "failed";
	if (outcome === "partial") return "partial";
	return "unknown";
}

/**
 * Validate and filter related references
 */
function validateRelated(related?: Array<number | string>): Array<number | string> | undefined {
	if (!related || related.length === 0) {
		return undefined;
	}

	const validated: Array<number | string> = [];

	for (const ref of related) {
		if (typeof ref === "number" && Number.isInteger(ref) && ref >= 1) {
			validated.push(ref);
		} else if (typeof ref === "string" && ref.startsWith("mem_")) {
			validated.push(ref);
		}
		// Silently skip invalid references
	}

	return validated.length > 0 ? validated : undefined;
}

/**
 * Build success message based on outcome
 */
function buildSuccessMessage(outcome: Outcome, memoriesScored: number): string {
	const outcomeText = {
		worked: "Response marked as successful",
		failed: "Response marked as unsuccessful",
		partial: "Response marked as partially helpful",
		unknown: "Response recorded",
	}[outcome];

	if (memoriesScored > 0) {
		return `${outcomeText}. Updated scores for ${memoriesScored} memories.`;
	}

	return `${outcomeText}. Key takeaway saved.`;
}

/**
 * Format output for LLM consumption
 */
export function formatRecordResponseForLLM(output: RecordResponseOutput): string {
	if (output.success) {
		return `✓ ${output.message}`;
	}
	return `✗ ${output.message}: ${output.error}`;
}
