/**
 * ActionKgServiceImpl - Action Knowledge Graph service implementation
 *
 * Wraps the KnowledgeGraphService for action outcome recording and effectiveness tracking.
 * Implements the ActionKgService interface from UnifiedMemoryFacade.
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { ActionOutcome, Outcome, StatsSnapshot } from "../types";
import type { ActionKgService, GetActionEffectivenessParams } from "../UnifiedMemoryFacade";
import type { KnowledgeGraphService } from "../kg/KnowledgeGraphService";
import type { ContextType as KgContextType } from "../kg/types";

export interface ActionKgServiceImplConfig {
	kgService?: KnowledgeGraphService;
	config?: MemoryConfig;
	defaultUserId?: string;
}

export class ActionKgServiceImpl implements ActionKgService {
	private kgService: KnowledgeGraphService | null;
	private config: MemoryConfig;
	private defaultUserId?: string;

	constructor(params: ActionKgServiceImplConfig) {
		this.kgService = params.kgService ?? null;
		this.config = params.config ?? defaultMemoryConfig;
		this.defaultUserId = params.defaultUserId;
	}

	/**
	 * Record an action outcome to the Knowledge Graph
	 * Updates action effectiveness statistics for future recommendations
	 */
	async recordActionOutcome(action: ActionOutcome): Promise<void> {
		if (!this.kgService) {
			logger.warn("ActionKgServiceImpl: No KG service configured, skipping outcome recording");
			return;
		}

		try {
			// Start a turn if not already started
			const conversationId = action.conversation_id ?? "unknown";
			const turnId = action.message_id ?? action.action_id;

			this.kgService.startTurn(
				conversationId,
				turnId,
				(action.context_type ?? "general") as KgContextType,
				"" // Query not available from ActionOutcome
			);

			// Record the action
			this.kgService.recordAction(
				conversationId,
				turnId,
				action.action_type,
				action.tier,
				action.memory_id ? [action.memory_id] : undefined,
				undefined // tool name extracted from action_type if needed
			);

			const userId = this.defaultUserId ?? action.doc_id ?? "unknown";
			await this.kgService.applyOutcomeToTurn(userId, conversationId, turnId, action.outcome);

			logger.debug(
				{ actionId: action.action_id, outcome: action.outcome },
				"Recorded action outcome to KG"
			);
		} catch (err) {
			logger.error({ err, actionId: action.action_id }, "Failed to record action outcome");
		}
	}

	/**
	 * Get action effectiveness statistics for a user
	 * Returns statistics in the StatsSnapshot format
	 */
	async getActionEffectiveness(
		params: GetActionEffectivenessParams
	): Promise<StatsSnapshot["action_effectiveness"]> {
		if (!this.kgService) {
			return [];
		}

		try {
			const contextType = (params.contextType ?? "general") as KgContextType;
			const records = await this.kgService.getActionEffectiveness(params.userId, contextType);

			// Transform KG records to StatsSnapshot format
			return records.map((r) => ({
				context_type: r.context_type,
				action_type: r.action,
				success_rate: r.success_rate,
				total_uses: r.uses,
				examples: r.examples.slice(0, this.config.caps.max_action_examples_per_key).map((ex) => ({
					timestamp: ex.timestamp.toISOString(),
					outcome: ex.outcome,
					doc_id: ex.memory_ids?.[0] ?? null,
				})),
			}));
		} catch (err) {
			logger.error({ err, userId: params.userId }, "Failed to get action effectiveness");
			return [];
		}
	}
}
