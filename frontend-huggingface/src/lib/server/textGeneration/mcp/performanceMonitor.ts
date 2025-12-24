/**
 * Performance monitoring for MCP operations
 * Tracks execution times and provides metrics for optimization
 */

export interface PerformanceMetric {
	operation: string;
	duration: number;
	timestamp: number;
	metadata?: Record<string, unknown>;
}

export interface PerformanceStats {
	operation: string;
	count: number;
	totalDuration: number;
	avgDuration: number;
	minDuration: number;
	maxDuration: number;
}

/**
 * Format duration in seconds or minutes/seconds
 */
function formatDuration(ms: number): string {
	const seconds = ms / 1000;
	if (seconds >= 60) {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = Math.floor(seconds % 60);
		return `${minutes}m ${remainingSeconds}s`;
	}
	return `${seconds.toFixed(2)}s`;
}

/**
 * Performance monitor for tracking operation execution times
 */
export class PerformanceMonitor {
	private metrics: PerformanceMetric[] = [];
	private readonly maxMetrics = 1000; // Limit memory usage
	private readonly slowThreshold = 100; // Operations slower than 100ms are considered slow

	/**
	 * Start timing an operation
	 */
	startTimer(operation: string): () => void {
		const startTime = performance.now();

		return () => {
			const endTime = performance.now();
			const duration = endTime - startTime;

			this.recordMetric({
				operation,
				duration,
				timestamp: Date.now(),
			});

			// Log slow operations
			if (duration > this.slowThreshold) {
				console.warn(
					`[mcp-performance] Slow operation detected: ${operation} took ${formatDuration(duration)}`
				);
			}
		};
	}

	/**
	 * Time an async operation
	 */
	async timeAsync<T>(operation: string, fn: () => Promise<T>): Promise<T> {
		const endTimer = this.startTimer(operation);

		try {
			const result = await fn();
			endTimer();
			return result;
		} catch (error) {
			endTimer();
			throw error;
		}
	}

	/**
	 * Record a performance metric
	 */
	recordMetric(metric: PerformanceMetric): void {
		this.metrics.push(metric);

		// Maintain size limit to prevent memory accumulation
		if (this.metrics.length > this.maxMetrics) {
			this.metrics = this.metrics.slice(-this.maxMetrics);
		}
	}

	/**
	 * Get performance statistics for an operation
	 */
	getStats(operation?: string): PerformanceStats[] {
		const filtered = operation
			? this.metrics.filter((m) => m.operation === operation)
			: this.metrics;

		const grouped = new Map<string, PerformanceMetric[]>();

		for (const metric of filtered) {
			const existing = grouped.get(metric.operation) || [];
			existing.push(metric);
			grouped.set(metric.operation, existing);
		}

		return Array.from(grouped.entries()).map(([op, metrics]) => {
			const durations = metrics.map((m) => m.duration);
			const count = durations.length;
			const totalDuration = durations.reduce((sum, d) => sum + d, 0);
			const avgDuration = totalDuration / count;
			const minDuration = Math.min(...durations);
			const maxDuration = Math.max(...durations);

			return {
				operation: op,
				count,
				totalDuration,
				avgDuration,
				minDuration,
				maxDuration,
			};
		});
	}

	/**
	 * Get slow operations (above threshold)
	 */
	getSlowOperations(thresholdMs: number = this.slowThreshold): PerformanceMetric[] {
		return this.metrics.filter((m) => m.duration > thresholdMs);
	}

	/**
	 * Get recent metrics (last N operations)
	 */
	getRecent(count: number = 100): PerformanceMetric[] {
		return this.metrics.slice(-count);
	}

	/**
	 * Clear all metrics
	 */
	clear(): void {
		this.metrics = [];
	}

	/**
	 * Get performance summary
	 */
	getSummary(): {
		totalOperations: number;
		totalDuration: number;
		avgDuration: number;
		slowOperations: number;
		slowestOperation?: PerformanceMetric;
		mostFrequentOperation?: string;
	} {
		if (this.metrics.length === 0) {
			return {
				totalOperations: 0,
				totalDuration: 0,
				avgDuration: 0,
				slowOperations: 0,
			};
		}

		const totalOperations = this.metrics.length;
		const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
		const avgDuration = totalDuration / totalOperations;
		const slowOperations = this.metrics.filter((m) => m.duration > this.slowThreshold).length;

		// Find slowest operation
		const slowestOperation = this.metrics.reduce((slowest, current) =>
			current.duration > slowest.duration ? current : slowest
		);

		// Find most frequent operation
		const operationCounts = new Map<string, number>();
		for (const metric of this.metrics) {
			const count = operationCounts.get(metric.operation) || 0;
			operationCounts.set(metric.operation, count + 1);
		}

		const mostFrequentOperation = Array.from(operationCounts.entries()).sort(
			([, a], [, b]) => b - a
		)[0]?.[0];

		return {
			totalOperations,
			totalDuration,
			avgDuration,
			slowOperations,
			slowestOperation,
			mostFrequentOperation,
		};
	}
}

/**
 * Global performance monitor instance
 */
const globalPerformanceMonitor = new PerformanceMonitor();

/**
 * Start timing an operation
 */
export function startTimer(operation: string): () => void {
	return globalPerformanceMonitor.startTimer(operation);
}

/**
 * Time an async operation
 */
export async function timeAsync<T>(operation: string, fn: () => Promise<T>): Promise<T> {
	return globalPerformanceMonitor.timeAsync(operation, fn);
}

/**
 * Record a performance metric
 */
export function recordMetric(metric: PerformanceMetric): void {
	globalPerformanceMonitor.recordMetric(metric);
}

/**
 * Get performance statistics
 */
export function getPerformanceStats(operation?: string): PerformanceStats[] {
	return globalPerformanceMonitor.getStats(operation);
}

/**
 * Get performance summary
 */
export function getPerformanceSummary() {
	return globalPerformanceMonitor.getSummary();
}

/**
 * Clear performance metrics
 */
export function clearPerformanceMetrics(): void {
	globalPerformanceMonitor.clear();
}

/**
 * Log performance summary
 */
export function logPerformanceSummary(): void {
	const summary = globalPerformanceMonitor.getSummary();

	console.info("[mcp-performance] Performance Summary:", {
		totalOperations: summary.totalOperations,
		totalDuration: formatDuration(summary.totalDuration),
		avgDuration: formatDuration(summary.avgDuration),
		slowOperations: summary.slowOperations,
		...(summary.slowestOperation && {
			slowestOperation: `${summary.slowestOperation.operation}: ${formatDuration(summary.slowestOperation.duration)}`,
		}),
		...(summary.mostFrequentOperation && {
			mostFrequentOperation: summary.mostFrequentOperation,
		}),
	});

	// Log detailed stats for each operation
	const stats = globalPerformanceMonitor.getStats();
	if (stats.length > 0) {
		console.info("[mcp-performance] Operation Details:");
		for (const stat of stats) {
			console.info(
				`  ${stat.operation}: ${stat.count} calls, avg: ${formatDuration(stat.avgDuration)}, min: ${formatDuration(stat.minDuration)}, max: ${formatDuration(stat.maxDuration)}`
			);
		}
	}
}
