import type { ObjectId } from "mongodb";

/**
 * MemoryBankItem - Based on roampal's memory_bank schema
 *
 * Memory bank stores persistent user information like:
 * - Identity (name, role, company)
 * - Preferences (coding style, tools)
 * - Goals and projects
 * - Learned facts about the user
 */
export interface MemoryBankItem {
	_id: ObjectId;
	userId: string;
	text: string;
	tags: MemoryBankTag[];
	status: "active" | "archived";
	importance: number; // 0.0-1.0 (how critical is this memory)
	confidence: number; // 0.0-1.0 (how sure are we about this)
	alwaysInject?: boolean; // If true, appears in every context
	createdAt: Date;
	updatedAt?: Date;
	archivedAt?: Date;
	archivedReason?: string;
	source?: string; // Where the memory came from
	contextType?: string; // LLM-classified topic
}

export type MemoryBankTag =
	| "identity"
	| "preference"
	| "project"
	| "context"
	| "goal"
	| "fact"
	| string; // Allow custom tags
