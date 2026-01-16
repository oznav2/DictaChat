/**
 * Memory System Observability Module
 *
 * Phase 21: Memory System Observability
 *
 * Exports:
 * - MemoryLogger: Structured logging with correlation IDs
 * - MemoryMetrics: Operation counters, latency histograms, circuit breaker state
 */

// Logger exports
export {
	memoryLogger,
	generateCorrelationId,
	createRequestLogger,
	MemoryLogger,
	type MemoryLogContext,
	type MemoryOperation,
	type LogLevel,
} from "./MemoryLogger";

// Metrics exports
export {
	memoryMetrics,
	MemoryMetricsCollector,
	type OperationCounter,
	type LatencyStats,
	type CircuitBreakerMetric,
	type QueueMetric,
	type MetricsSnapshot,
} from "./MemoryMetrics";
