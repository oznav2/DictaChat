/**
 * PromotionServiceImpl - Wrapper service for memory promotion lifecycle
 *
 * Wraps the learning/PromotionService for dependency injection and facade integration.
 * Handles autonomous memory lifecycle: working → history → patterns
 */

import { logger } from "$lib/server/logger";
import type { MemoryConfig } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import { PromotionService, type PromotionServiceConfig, type PromotionStats } from "../learning/PromotionService";

export interface PromotionServiceImplConfig {
	promotionService?: PromotionService;
	promotionServiceConfig?: PromotionServiceConfig;
	config?: MemoryConfig;
}

export class PromotionServiceImpl {
	private promotionService: PromotionService | null;
	private config: MemoryConfig;

	constructor(params: PromotionServiceImplConfig) {
		this.config = params.config ?? defaultMemoryConfig;

		// Use provided service or create new one if config provided
		if (params.promotionService) {
			this.promotionService = params.promotionService;
		} else if (params.promotionServiceConfig) {
			this.promotionService = new PromotionService(params.promotionServiceConfig);
		} else {
			this.promotionService = null;
			logger.warn("PromotionServiceImpl created without backing service");
		}
	}

	/**
	 * Start the promotion scheduler
	 * Runs immediately on startup, then every 30 minutes
	 */
	async startScheduler(): Promise<void> {
		if (!this.promotionService) {
			logger.warn("Cannot start scheduler: no promotion service configured");
			return;
		}
		await this.promotionService.startScheduler();
	}

	/**
	 * Stop the promotion scheduler
	 */
	stopScheduler(): void {
		if (!this.promotionService) {
			return;
		}
		this.promotionService.stopScheduler();
	}

	/**
	 * Run a full promotion/cleanup cycle
	 */
	async runCycle(userId?: string): Promise<PromotionStats> {
		if (!this.promotionService) {
			return { promoted: 0, archived: 0, deleted: 0, errors: 0, durationMs: 0 };
		}
		return this.promotionService.runCycle(userId);
	}

	/**
	 * Trigger immediate promotion for a user
	 */
	async triggerForUser(userId: string): Promise<PromotionStats> {
		if (!this.promotionService) {
			return { promoted: 0, archived: 0, deleted: 0, errors: 0, durationMs: 0 };
		}
		return this.promotionService.triggerForUser(userId);
	}

	/**
	 * Get last run timestamp
	 */
	getLastRunAt(): Date | null {
		return this.promotionService?.getLastRunAt() ?? null;
	}

	/**
	 * Check if scheduler is running
	 */
	isSchedulerRunning(): boolean {
		return this.promotionService?.isSchedulerRunning() ?? false;
	}
}
