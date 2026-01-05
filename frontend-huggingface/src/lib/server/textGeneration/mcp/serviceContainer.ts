/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Dependency injection container for MCP services
 * Provides better testability and modularity
 */

import { env } from "$env/dynamic/private";
import { LogLevel, StructuredLoggingService } from "./loggingService";

// Define interfaces locally to avoid circular dependencies

/**
 * Service interfaces defined locally to avoid circular dependencies
 */
export interface IToolFilterService {
	filterToolsByIntent(
		allTools: any[],
		userQuery: string,
		options?: { hasDocuments?: boolean }
	): { filtered: any[]; categories: string[] };
	clearCache(): void;
}

export interface ILoopDetectorService {
	detectToolLoop(toolCalls: any[]): boolean;
	detectContentLoop(content: string): boolean;
	reset(): void;
}

export interface IClientPoolService {
	getClient(server: any, signal?: AbortSignal): Promise<any>;
	releaseClient(server: any, client: any): void;
	drainPool(): Promise<void>;
	getPoolStats(): Record<string, { total: number; inUse: number; available: number }>;
}

export interface IUrlValidationService {
	validateUrl(urlString: string): { isValid: boolean; error?: string };
}

export interface IArgumentSanitizationService {
	sanitizeArguments(
		toolName: string,
		args: Record<string, unknown>
	): {
		success: boolean;
		sanitized?: Record<string, unknown>;
		error?: string;
		warnings?: string[];
	};
}

export interface ILoggingService {
	debug(message: string, metadata?: Record<string, unknown>): void;
	info(message: string, metadata?: Record<string, unknown>): void;
	warn(message: string, metadata?: Record<string, unknown>): void;
	error(message: string, error?: Error, metadata?: Record<string, unknown>): void;
}

/**
 * Service interfaces
 */
export interface IToolFilterService {
	filterToolsByIntent(
		allTools: any[],
		userQuery: string,
		options?: { hasDocuments?: boolean }
	): { filtered: any[]; categories: string[] };
	clearCache(): void;
}

export interface ILoopDetectorService {
	detectToolLoop(toolCalls: any[]): boolean;
	detectContentLoop(content: string): boolean;
	reset(): void;
}

export interface IClientPoolService {
	getClient(server: any, signal?: AbortSignal): Promise<any>;
	releaseClient(server: any, client: any): void;
	drainPool(): Promise<void>;
	getPoolStats(): Record<string, { total: number; inUse: number; available: number }>;
}

export interface IUrlValidationService {
	validateUrl(urlString: string): { isValid: boolean; error?: string };
}

export interface IArgumentSanitizationService {
	sanitizeArguments(
		toolName: string,
		args: Record<string, unknown>
	): {
		success: boolean;
		sanitized?: Record<string, unknown>;
		error?: string;
		warnings?: string[];
	};
}

export interface ILoggingService {
	debug(message: string, metadata?: Record<string, unknown>): void;
	info(message: string, metadata?: Record<string, unknown>): void;
	warn(message: string, metadata?: Record<string, unknown>): void;
	error(message: string, error?: Error, metadata?: Record<string, unknown>): void;
}

/**
 * Service container implementation
 */
export class ServiceContainer {
	private services = new Map<string, any>();
	private singletons = new Map<string, any>();

	/**
	 * Register a service
	 */
	register<T>(key: string, factory: () => T, singleton: boolean = true): void {
		if (singleton) {
			// For singletons, store the factory and create on first access
			this.services.set(key, factory);
		} else {
			// For transient services, store the factory directly
			this.services.set(key, factory);
		}
	}

	/**
	 * Resolve a service
	 */
	resolve<T>(key: string): T {
		const service = this.services.get(key);
		if (!service) {
			throw new Error(`Service '${key}' not registered`);
		}

		// Check if it's a singleton and already created
		if (this.singletons.has(key)) {
			return this.singletons.get(key);
		}

		// Create the service
		const instance = typeof service === "function" ? service() : service;

		// Store as singleton if requested
		if (this.services.has(key) && !this.singletons.has(key)) {
			this.singletons.set(key, instance);
		}

		return instance;
	}

	/**
	 * Check if a service is registered
	 */
	has(key: string): boolean {
		return this.services.has(key);
	}

	/**
	 * Remove a service
	 */
	remove(key: string): void {
		this.services.delete(key);
		this.singletons.delete(key);
	}

	/**
	 * Clear all services
	 */
	clear(): void {
		this.services.clear();
		this.singletons.clear();
	}

	/**
	 * Get all registered service keys
	 */
	getKeys(): string[] {
		return Array.from(this.services.keys());
	}
}

/**
 * Global service container instance
 */
export const container = new ServiceContainer();

/**
 * Service registration keys
 */
export const SERVICE_KEYS = {
	TOOL_FILTER: "toolFilterService",
	LOOP_DETECTOR: "loopDetectorService",
	CLIENT_POOL: "clientPoolService",
	URL_VALIDATOR: "urlValidationService",
	ARGUMENT_SANITIZER: "argumentSanitizationService",
	LOGGING: "loggingService",
} as const;

/**
 * Helper functions for common service access
 */
export function getToolFilterService(): IToolFilterService {
	return container.resolve<IToolFilterService>(SERVICE_KEYS.TOOL_FILTER);
}

export function getLoopDetectorService(): ILoopDetectorService {
	return container.resolve<ILoopDetectorService>(SERVICE_KEYS.LOOP_DETECTOR);
}

export function getClientPoolService(): IClientPoolService {
	return container.resolve<IClientPoolService>(SERVICE_KEYS.CLIENT_POOL);
}

export function getUrlValidationService(): IUrlValidationService {
	return container.resolve<IUrlValidationService>(SERVICE_KEYS.URL_VALIDATOR);
}

export function getArgumentSanitizationService(): IArgumentSanitizationService {
	return container.resolve<IArgumentSanitizationService>(SERVICE_KEYS.ARGUMENT_SANITIZER);
}

export function getLoggingService(): ILoggingService {
	return container.resolve<ILoggingService>(SERVICE_KEYS.LOGGING);
}

/**
 * Initialize the service container with default implementations
 */
export function initializeServiceContainer(): void {
	// Register logging service first (used by others)
	container.register(SERVICE_KEYS.LOGGING, () => {
		const debugMode = env.DEBUG_MCP === "true";
		return new StructuredLoggingService(undefined, {
			minLevel: debugMode ? LogLevel.DEBUG : LogLevel.INFO,
			enableConsole: true,
			redact: !debugMode, // Disable redaction in debug mode for full visibility
		});
	});

	// Note: Other services will be registered by their respective modules
	// This allows for lazy loading and better separation of concerns
}
