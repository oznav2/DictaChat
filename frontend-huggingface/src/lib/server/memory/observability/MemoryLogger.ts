/**
 * Memory System Structured Logger
 *
 * Phase 21: Memory System Observability (Task 21.1)
 *
 * Provides structured logging with:
 * - Correlation ID tracking across operations
 * - Memory-specific context fields (memory_id, tier, operation)
 * - Latency logging for all operations
 * - Log sampling for high-volume operations
 * - Consistent log levels: debug, info, warn, error
 *
 * Risk Mitigation:
 * - All logs are non-blocking (async friendly)
 * - Log sampling prevents log flooding
 * - Structured format enables log aggregation/analysis
 */

import { logger as pinoLogger } from "$lib/server/logger";
import type { MemoryTier } from "../types";

// ============================================
// Types
// ============================================

export interface MemoryLogContext {
	/** Unique correlation ID for tracing across operations */
	correlationId?: string;
	/** Memory ID being operated on */
	memoryId?: string;
	/** User ID performing the operation */
	userId?: string;
	/** Memory tier being accessed */
	tier?: MemoryTier | MemoryTier[];
	/** Operation type (store, search, retrieve, delete, etc.) */
	operation?: MemoryOperation;
	/** Duration in milliseconds */
	durationMs?: number;
	/** Additional context fields */
	[key: string]: unknown;
}

export type MemoryOperation =
	| "store"
	| "search"
	| "retrieve"
	| "update"
	| "delete"
	| "prefetch"
	| "embed"
	| "reindex"
	| "promote"
	| "decay"
	| "ingest"
	| "health_check"
	| "diagnose";

export type LogLevel = "debug" | "info" | "warn" | "error";

// ============================================
// Configuration
// ============================================

/**
 * Sampling configuration for high-volume operations
 * Key: operation type, Value: sample rate (1 = log all, 10 = log 1/10)
 */
const SAMPLING_RATES: Partial<Record<MemoryOperation, number>> = {
	search: 10, // Log 1 in 10 searches (high volume)
	embed: 5, // Log 1 in 5 embeddings
	prefetch: 10, // Log 1 in 10 prefetches
};

/** Counter for sampling */
const operationCounters = new Map<MemoryOperation, number>();

// ============================================
// Sampling Logic
// ============================================

/**
 * Determine if this log should be emitted based on sampling
 */
function shouldSample(operation?: MemoryOperation): boolean {
	if (!operation) return true;

	const sampleRate = SAMPLING_RATES[operation];
	if (!sampleRate || sampleRate <= 1) return true;

	const count = (operationCounters.get(operation) ?? 0) + 1;
	operationCounters.set(operation, count);

	return count % sampleRate === 0;
}

// ============================================
// Correlation ID Generation
// ============================================

/**
 * Generate a correlation ID for tracing
 */
export function generateCorrelationId(): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 8);
	return `mem_${timestamp}_${random}`;
}

// ============================================
// Logger Implementation
// ============================================

/**
 * Structured logger for memory system operations
 *
 * @example
 * ```typescript
 * const log = memoryLogger.child({ correlationId: generateCorrelationId() });
 * log.info({ operation: "search", tier: "memory_bank", durationMs: 45 }, "Search completed");
 * ```
 */
class MemoryLogger {
	private baseLogger = pinoLogger.child({ component: "memory" });
	private context: MemoryLogContext = {};

	constructor(context?: MemoryLogContext) {
		if (context) {
			this.context = context;
		}
	}

	/**
	 * Create a child logger with additional context
	 */
	child(context: MemoryLogContext): MemoryLogger {
		const childLogger = new MemoryLogger({ ...this.context, ...context });
		return childLogger;
	}

	/**
	 * Format context for structured logging
	 */
	private formatContext(ctx?: MemoryLogContext): Record<string, unknown> {
		const merged = { ...this.context, ...ctx };

		// Normalize tier array to string
		if (Array.isArray(merged.tier)) {
			merged.tiers = merged.tier;
			merged.tierCount = merged.tier.length;
			delete merged.tier;
		}

		return merged;
	}

	/**
	 * Debug level logging - detailed flow information
	 * Used for: parsing, scoring details, internal state
	 */
	debug(ctx: MemoryLogContext, message: string): void {
		if (!shouldSample(ctx.operation ?? this.context.operation)) return;
		this.baseLogger.debug(this.formatContext(ctx), `[memory] ${message}`);
	}

	/**
	 * Info level logging - key operations
	 * Used for: store, search, ingest completions
	 */
	info(ctx: MemoryLogContext, message: string): void {
		if (!shouldSample(ctx.operation ?? this.context.operation)) return;
		this.baseLogger.info(this.formatContext(ctx), `[memory] ${message}`);
	}

	/**
	 * Warn level logging - recoverable issues
	 * Used for: timeouts, fallbacks, degraded mode
	 */
	warn(ctx: MemoryLogContext, message: string): void {
		// Never sample warnings
		this.baseLogger.warn(this.formatContext(ctx), `[memory] ${message}`);
	}

	/**
	 * Error level logging - unrecoverable failures
	 * Used for: store failures, critical errors
	 */
	error(ctx: MemoryLogContext & { error?: unknown }, message: string): void {
		// Never sample errors
		const context = this.formatContext(ctx);
		if (ctx.error) {
			context.error = ctx.error instanceof Error ? ctx.error.message : String(ctx.error);
			context.errorStack = ctx.error instanceof Error ? ctx.error.stack : undefined;
		}
		this.baseLogger.error(context, `[memory] ${message}`);
	}

	/**
	 * Log operation with timing
	 * Automatically calculates duration
	 */
	timed<T>(
		operation: MemoryOperation,
		ctx: Omit<MemoryLogContext, "operation" | "durationMs">,
		fn: () => T
	): T {
		const start = Date.now();
		try {
			const result = fn();
			const durationMs = Date.now() - start;
			this.info({ ...ctx, operation, durationMs }, `${operation} completed`);
			return result;
		} catch (error) {
			const durationMs = Date.now() - start;
			this.error({ ...ctx, operation, durationMs, error }, `${operation} failed`);
			throw error;
		}
	}

	/**
	 * Async version of timed logging
	 */
	async timedAsync<T>(
		operation: MemoryOperation,
		ctx: Omit<MemoryLogContext, "operation" | "durationMs">,
		fn: () => Promise<T>
	): Promise<T> {
		const start = Date.now();
		try {
			const result = await fn();
			const durationMs = Date.now() - start;
			this.info({ ...ctx, operation, durationMs }, `${operation} completed`);
			return result;
		} catch (error) {
			const durationMs = Date.now() - start;
			this.error({ ...ctx, operation, durationMs, error }, `${operation} failed`);
			throw error;
		}
	}
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Default memory logger instance
 *
 * @example
 * ```typescript
 * import { memoryLogger, generateCorrelationId } from "./observability/MemoryLogger";
 *
 * const correlationId = generateCorrelationId();
 * const log = memoryLogger.child({ correlationId, userId });
 *
 * log.info({ operation: "search", tier: "memory_bank" }, "Starting search");
 * ```
 */
export const memoryLogger = new MemoryLogger();

/**
 * Create a request-scoped logger with correlation ID
 */
export function createRequestLogger(userId?: string): MemoryLogger {
	return memoryLogger.child({
		correlationId: generateCorrelationId(),
		userId,
	});
}

// ============================================
// Re-export for convenience
// ============================================

export { MemoryLogger };
