/**
 * Memory System Metrics Collection
 *
 * Phase 21: Memory System Observability (Task 21.2)
 *
 * Provides lightweight metrics collection for:
 * - Operation counters by tier (search, store, retrieve, etc.)
 * - Latency histograms for performance monitoring
 * - Circuit breaker state tracking
 * - Queue depth metrics for deferred indexing
 *
 * Design Decisions:
 * - In-memory metrics (no external dependency)
 * - Rolling windows to bound memory usage
 * - Exposed via /api/memory/health endpoint
 *
 * Risk Mitigation:
 * - Bounded array sizes prevent memory leaks
 * - Thread-safe counters (single-threaded JS)
 * - Metrics collection is non-blocking
 */

import type { MemoryTier } from "../types";
import type { MemoryOperation } from "./MemoryLogger";

// ============================================
// Configuration
// ============================================

/** Maximum number of latency samples to keep per operation */
const MAX_LATENCY_SAMPLES = 1000;

/** Maximum number of rate samples to keep per operation */
const MAX_RATE_SAMPLES = 5000;

/** Window size in milliseconds for rate calculation (5 minutes) */
const RATE_WINDOW_MS = 5 * 60 * 1000;

// ============================================
// Types
// ============================================

export interface OperationCounter {
	total: number;
	success: number;
	failure: number;
	lastUpdated: number;
}

export interface LatencyStats {
	count: number;
	min: number;
	max: number;
	avg: number;
	p50: number;
	p90: number;
	p99: number;
}

export interface CircuitBreakerMetric {
	name: string;
	isOpen: boolean;
	failures: number;
	lastFailure: number | null;
	lastSuccess: number | null;
}

export interface QueueMetric {
	name: string;
	depth: number;
	processing: number;
	lastUpdated: number;
}

export interface MetricsSnapshot {
	timestamp: string;
	uptime_ms: number;

	// Operation counters
	operations: {
		byOperation: Record<MemoryOperation, OperationCounter>;
		byTier: Record<string, OperationCounter>;
	};

	// Latency stats
	latencies: {
		search: LatencyStats | null;
		searchStages: {
			qdrant_query: LatencyStats | null;
			bm25_query: LatencyStats | null;
			rerank: LatencyStats | null;
		};
		store: LatencyStats | null;
		embed: LatencyStats | null;
		prefetch: LatencyStats | null;
	};

	// Operation rates (per second) over a rolling window
	rates: {
		window_ms: number;
		byOperation: Partial<Record<MemoryOperation, number>>;
	};

	// Circuit breakers
	circuitBreakers: CircuitBreakerMetric[];

	// Queue depths
	queues: QueueMetric[];

	// Hit rate (cache effectiveness)
	hitRate: {
		searches: number;
		hits: number;
		rate: number;
	};
}

// ============================================
// Rolling Array for Latencies
// ============================================

class RollingArray {
	private data: number[] = [];
	private maxSize: number;

	constructor(maxSize: number) {
		this.maxSize = maxSize;
	}

	push(value: number): void {
		if (this.data.length >= this.maxSize) {
			this.data.shift();
		}
		this.data.push(value);
	}

	getStats(): LatencyStats | null {
		if (this.data.length === 0) return null;

		const sorted = [...this.data].sort((a, b) => a - b);
		const sum = sorted.reduce((a, b) => a + b, 0);

		return {
			count: sorted.length,
			min: sorted[0],
			max: sorted[sorted.length - 1],
			avg: Math.round(sum / sorted.length),
			p50: sorted[Math.floor(sorted.length * 0.5)],
			p90: sorted[Math.floor(sorted.length * 0.9)],
			p99: sorted[Math.floor(sorted.length * 0.99)],
		};
	}

	clear(): void {
		this.data = [];
	}
}

// ============================================
// Metrics Collector Implementation
// ============================================

class MemoryMetricsCollector {
	private startTime = Date.now();

	// Counters
	private operationCounters = new Map<MemoryOperation, OperationCounter>();
	private tierCounters = new Map<string, OperationCounter>();

	// Latencies
	private latencies = new Map<string, RollingArray>();

	// Rates
	private operationEvents = new Map<MemoryOperation, number[]>();

	// Circuit breakers
	private circuitBreakers = new Map<string, CircuitBreakerMetric>();

	// Queues
	private queues = new Map<string, QueueMetric>();

	// Hit tracking
	private searchCount = 0;
	private hitCount = 0;

	constructor() {
		// Initialize latency trackers
		this.latencies.set("search", new RollingArray(MAX_LATENCY_SAMPLES));
		this.latencies.set("qdrant_query", new RollingArray(MAX_LATENCY_SAMPLES));
		this.latencies.set("bm25_query", new RollingArray(MAX_LATENCY_SAMPLES));
		this.latencies.set("rerank", new RollingArray(MAX_LATENCY_SAMPLES));
		this.latencies.set("store", new RollingArray(MAX_LATENCY_SAMPLES));
		this.latencies.set("embed", new RollingArray(MAX_LATENCY_SAMPLES));
		this.latencies.set("prefetch", new RollingArray(MAX_LATENCY_SAMPLES));
	}

	// ============================================
	// Counter Methods
	// ============================================

	/**
	 * Record an operation completion
	 */
	recordOperation(operation: MemoryOperation, success: boolean, tier?: MemoryTier): void {
		this.recordRateEvent(operation);

		// Update operation counter
		const opCounter = this.operationCounters.get(operation) ?? {
			total: 0,
			success: 0,
			failure: 0,
			lastUpdated: 0,
		};
		opCounter.total++;
		if (success) {
			opCounter.success++;
		} else {
			opCounter.failure++;
		}
		opCounter.lastUpdated = Date.now();
		this.operationCounters.set(operation, opCounter);

		// Update tier counter if provided
		if (tier) {
			const tierCounter = this.tierCounters.get(tier) ?? {
				total: 0,
				success: 0,
				failure: 0,
				lastUpdated: 0,
			};
			tierCounter.total++;
			if (success) {
				tierCounter.success++;
			} else {
				tierCounter.failure++;
			}
			tierCounter.lastUpdated = Date.now();
			this.tierCounters.set(tier, tierCounter);
		}
	}

	// ============================================
	// Latency Methods
	// ============================================

	/**
	 * Record a latency measurement
	 */
	recordLatency(operation: string, durationMs: number): void {
		const tracker = this.latencies.get(operation);
		if (tracker) {
			tracker.push(durationMs);
		}
	}

	private recordRateEvent(operation: MemoryOperation): void {
		const now = Date.now();
		const cutoff = now - RATE_WINDOW_MS;
		const events = this.operationEvents.get(operation) ?? [];
		events.push(now);

		while (events.length > 0 && events[0] < cutoff) {
			events.shift();
		}

		if (events.length > MAX_RATE_SAMPLES) {
			events.splice(0, events.length - MAX_RATE_SAMPLES);
		}

		this.operationEvents.set(operation, events);
	}

	private getRate(operation: MemoryOperation): number {
		const now = Date.now();
		const cutoff = now - RATE_WINDOW_MS;
		const events = this.operationEvents.get(operation) ?? [];

		let idx = 0;
		while (idx < events.length && events[idx] < cutoff) {
			idx++;
		}
		if (idx > 0) {
			events.splice(0, idx);
			this.operationEvents.set(operation, events);
		}

		return events.length / (RATE_WINDOW_MS / 1000);
	}

	// ============================================
	// Circuit Breaker Methods
	// ============================================

	/**
	 * Update circuit breaker state
	 */
	updateCircuitBreaker(
		name: string,
		isOpen: boolean,
		failures: number,
		lastFailure: number | null = null,
		lastSuccess: number | null = null
	): void {
		this.circuitBreakers.set(name, {
			name,
			isOpen,
			failures,
			lastFailure,
			lastSuccess,
		});
	}

	// ============================================
	// Queue Methods
	// ============================================

	/**
	 * Update queue depth
	 */
	updateQueueDepth(name: string, depth: number, processing: number = 0): void {
		this.queues.set(name, {
			name,
			depth,
			processing,
			lastUpdated: Date.now(),
		});
	}

	// ============================================
	// Hit Rate Methods
	// ============================================

	/**
	 * Record a search (for hit rate calculation)
	 */
	recordSearch(wasHit: boolean): void {
		this.searchCount++;
		if (wasHit) {
			this.hitCount++;
		}
	}

	// ============================================
	// Snapshot Methods
	// ============================================

	/**
	 * Get current metrics snapshot
	 */
	getSnapshot(): MetricsSnapshot {
		const byOperation: Record<string, OperationCounter> = {};
		for (const [op, counter] of this.operationCounters) {
			byOperation[op] = counter;
		}

		const byTier: Record<string, OperationCounter> = {};
		for (const [tier, counter] of this.tierCounters) {
			byTier[tier] = counter;
		}

		return {
			timestamp: new Date().toISOString(),
			uptime_ms: Date.now() - this.startTime,

			operations: {
				byOperation: byOperation as Record<MemoryOperation, OperationCounter>,
				byTier,
			},

			latencies: {
				search: this.latencies.get("search")?.getStats() ?? null,
				searchStages: {
					qdrant_query: this.latencies.get("qdrant_query")?.getStats() ?? null,
					bm25_query: this.latencies.get("bm25_query")?.getStats() ?? null,
					rerank: this.latencies.get("rerank")?.getStats() ?? null,
				},
				store: this.latencies.get("store")?.getStats() ?? null,
				embed: this.latencies.get("embed")?.getStats() ?? null,
				prefetch: this.latencies.get("prefetch")?.getStats() ?? null,
			},

			rates: {
				window_ms: RATE_WINDOW_MS,
				byOperation: {
					search: this.getRate("search"),
					store: this.getRate("store"),
					embed: this.getRate("embed"),
					prefetch: this.getRate("prefetch"),
				},
			},

			circuitBreakers: Array.from(this.circuitBreakers.values()),

			queues: Array.from(this.queues.values()),

			hitRate: {
				searches: this.searchCount,
				hits: this.hitCount,
				rate: this.searchCount > 0 ? Math.round((this.hitCount / this.searchCount) * 100) / 100 : 0,
			},
		};
	}

	/**
	 * Reset all metrics
	 */
	reset(): void {
		this.operationCounters.clear();
		this.tierCounters.clear();
		for (const tracker of this.latencies.values()) {
			tracker.clear();
		}
		this.operationEvents.clear();
		this.circuitBreakers.clear();
		this.queues.clear();
		this.searchCount = 0;
		this.hitCount = 0;
		this.startTime = Date.now();
	}
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Global metrics collector instance
 *
 * @example
 * ```typescript
 * import { memoryMetrics } from "./observability/MemoryMetrics";
 *
 * // Record operation
 * memoryMetrics.recordOperation("search", true, "memory_bank");
 *
 * // Record latency
 * memoryMetrics.recordLatency("search", 45);
 *
 * // Get snapshot for health endpoint
 * const metrics = memoryMetrics.getSnapshot();
 * ```
 */
export const memoryMetrics = new MemoryMetricsCollector();

// ============================================
// Re-export for convenience
// ============================================

export { MemoryMetricsCollector };
