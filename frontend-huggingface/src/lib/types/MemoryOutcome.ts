import type { ObjectId } from "mongodb";

/**
 * MemoryOutcome - Tracks context/action/outcome for causal learning
 *
 * Based on roampal's outcome learning system.
 * Used to learn what actions work in which contexts.
 */
export interface MemoryOutcome {
	_id: ObjectId;
	userId: string;
	context: string; // What was happening
	action: string; // What was done
	result: "success" | "failure" | "neutral";
	feedback?: string; // Optional user feedback
	confidence: number; // 0.0-1.0
	metadata?: Record<string, unknown>;
	timestamp: Date;
	processed: boolean; // Whether this outcome has been used for learning
}
