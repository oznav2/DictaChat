/**
 * Circuit breaker pattern implementation
 * Prevents cascading failures by monitoring operation success rates
 */

export interface CircuitBreakerOptions {
	failureThreshold: number; // Number of failures before opening circuit
	resetTimeout: number; // Time in ms before attempting to reset
	monitoringPeriod: number; // Time window in ms for monitoring
	successThreshold?: number; // Number of successes before closing circuit (default: 1)
}

export enum CircuitState {
	CLOSED = "closed", // Normal operation
	OPEN = "open", // Circuit is open, operations fail fast
	HALF_OPEN = "half-open", // Testing if service has recovered
}

export interface CircuitBreakerStats {
	state: CircuitState;
	failureCount: number;
	successCount: number;
	lastFailureTime?: number;
	lastSuccessTime?: number;
	monitoringStartTime: number;
}

/**
 * Circuit breaker for preventing cascading failures
 */
export class CircuitBreaker {
	private state: CircuitState = CircuitState.CLOSED;
	private failureCount = 0;
	private successCount = 0;
	private lastFailureTime?: number;
	private lastSuccessTime?: number;
	private monitoringStartTime: number;
	private resetTimer?: NodeJS.Timeout;

	constructor(private readonly options: CircuitBreakerOptions) {
		this.monitoringStartTime = Date.now();
	}

	/**
	 * Execute a function with circuit breaker protection
	 */
	async execute<T>(operation: () => Promise<T>, operationName: string = "unknown"): Promise<T> {
		// Check if circuit is open
		if (this.state === CircuitState.OPEN) {
			// Check if it's time to attempt reset
			if (this.shouldAttemptReset()) {
				this.state = CircuitState.HALF_OPEN;
				console.info(`[circuit-breaker] Circuit moved to HALF_OPEN for ${operationName}`);
			} else {
				throw new Error(`Circuit breaker is OPEN for ${operationName}`);
			}
		}

		try {
			const result = await operation();
			this.onSuccess();
			return result;
		} catch (error) {
			this.onFailure();
			throw error;
		}
	}

	/**
	 * Execute a synchronous function with circuit breaker protection
	 */
	executeSync<T>(operation: () => T, operationName: string = "unknown"): T {
		// Check if circuit is open
		if (this.state === CircuitState.OPEN) {
			if (this.shouldAttemptReset()) {
				this.state = CircuitState.HALF_OPEN;
				console.info(`[circuit-breaker] Circuit moved to HALF_OPEN for ${operationName}`);
			} else {
				throw new Error(`Circuit breaker is OPEN for ${operationName}`);
			}
		}

		try {
			const result = operation();
			this.onSuccess();
			return result;
		} catch (error) {
			this.onFailure();
			throw error;
		}
	}

	/**
	 * Record a successful operation
	 */
	private onSuccess(): void {
		this.lastSuccessTime = Date.now();
		this.successCount++;

		if (this.state === CircuitState.HALF_OPEN) {
			// Check if we should close the circuit
			const successThreshold = this.options.successThreshold || 1;
			if (this.successCount >= successThreshold) {
				this.state = CircuitState.CLOSED;
				this.failureCount = 0;
				this.successCount = 0;
				console.info("[circuit-breaker] Circuit moved to CLOSED");
			}
		}

		// Reset monitoring period if it's too old
		const now = Date.now();
		if (now - this.monitoringStartTime > this.options.monitoringPeriod) {
			this.resetMonitoring();
		}
	}

	/**
	 * Record a failed operation
	 */
	private onFailure(): void {
		this.lastFailureTime = Date.now();
		this.failureCount++;

		// Check if we should open the circuit
		if (this.failureCount >= this.options.failureThreshold) {
			this.openCircuit();
		}

		// Reset monitoring period if it's too old
		const now = Date.now();
		if (now - this.monitoringStartTime > this.options.monitoringPeriod) {
			this.resetMonitoring();
		}
	}

	/**
	 * Open the circuit due to too many failures
	 */
	private openCircuit(): void {
		this.state = CircuitState.OPEN;
		console.warn(`[circuit-breaker] Circuit opened after ${this.failureCount} failures`);

		// Schedule automatic reset attempt
		if (this.resetTimer) {
			clearTimeout(this.resetTimer);
		}

		this.resetTimer = setTimeout(() => {
			console.info("[circuit-breaker] Scheduled reset attempt");
		}, this.options.resetTimeout);
	}

	/**
	 * Check if it's time to attempt resetting the circuit
	 */
	private shouldAttemptReset(): boolean {
		if (!this.lastFailureTime) return true;
		const now = Date.now();
		return now - this.lastFailureTime >= this.options.resetTimeout;
	}

	/**
	 * Reset monitoring counters
	 */
	private resetMonitoring(): void {
		this.monitoringStartTime = Date.now();
		this.failureCount = 0;
		this.successCount = 0;
	}

	/**
	 * Get current statistics
	 */
	getStats(): CircuitBreakerStats {
		return {
			state: this.state,
			failureCount: this.failureCount,
			successCount: this.successCount,
			lastFailureTime: this.lastFailureTime,
			lastSuccessTime: this.lastSuccessTime,
			monitoringStartTime: this.monitoringStartTime,
		};
	}

	/**
	 * Manually reset the circuit breaker
	 */
	reset(): void {
		this.state = CircuitState.CLOSED;
		this.failureCount = 0;
		this.successCount = 0;
		this.lastFailureTime = undefined;
		this.lastSuccessTime = undefined;
		this.resetMonitoring();

		if (this.resetTimer) {
			clearTimeout(this.resetTimer);
			this.resetTimer = undefined;
		}

		console.info("[circuit-breaker] Circuit manually reset");
	}

	/**
	 * Get current state
	 */
	getState(): CircuitState {
		return this.state;
	}
}

/**
 * Factory function for creating circuit breakers with default settings
 */
export function createCircuitBreaker(
	name: string,
	options?: Partial<CircuitBreakerOptions>
): CircuitBreaker {
	const defaultOptions: CircuitBreakerOptions = {
		failureThreshold: 5,
		resetTimeout: 30000, // 30 seconds
		monitoringPeriod: 60000, // 1 minute
		successThreshold: 1,
		...options,
	};

	return new CircuitBreaker(defaultOptions);
}

/**
 * Collection of circuit breakers for different operations
 */
export class CircuitBreakerCollection {
	private breakers = new Map<string, CircuitBreaker>();

	/**
	 * Get or create a circuit breaker for an operation
	 */
	getBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
		if (!this.breakers.has(name)) {
			this.breakers.set(name, createCircuitBreaker(name, options));
		}
		const breaker = this.breakers.get(name);
		if (!breaker) {
			throw new Error(`Failed to create circuit breaker for ${name}`);
		}
		return breaker;
	}

	/**
	 * Execute with circuit breaker protection
	 */
	async execute<T>(
		operationName: string,
		operation: () => Promise<T>,
		options?: Partial<CircuitBreakerOptions>
	): Promise<T> {
		const breaker = this.getBreaker(operationName, options);
		return breaker.execute(operation, operationName);
	}

	/**
	 * Get statistics for all breakers
	 */
	getAllStats(): Record<string, CircuitBreakerStats> {
		const stats: Record<string, CircuitBreakerStats> = {};
		for (const [name, breaker] of this.breakers) {
			stats[name] = breaker.getStats();
		}
		return stats;
	}

	/**
	 * Reset all circuit breakers
	 */
	resetAll(): void {
		for (const breaker of this.breakers.values()) {
			breaker.reset();
		}
	}
}

/**
 * Global circuit breaker collection
 */
const globalCircuitBreakers = new CircuitBreakerCollection();

/**
 * Execute with global circuit breaker protection
 */
export async function executeWithCircuitBreaker<T>(
	operationName: string,
	operation: () => Promise<T>,
	options?: Partial<CircuitBreakerOptions>
): Promise<T> {
	return globalCircuitBreakers.execute(operationName, operation, options);
}

/**
 * Get global circuit breaker statistics
 */
export function getCircuitBreakerStats(): Record<string, CircuitBreakerStats> {
	return globalCircuitBreakers.getAllStats();
}

/**
 * Reset all global circuit breakers
 */
export function resetAllCircuitBreakers(): void {
	globalCircuitBreakers.resetAll();
}
