/**
 * URL validation cache to reduce redundant validation operations
 * Caches validation results for frequently checked URLs
 */

import type { UrlValidationOptions, UrlValidationResult } from "./urlSafetyEnhanced";
import { validateUrlDetailed } from "./urlSafetyEnhanced";
import { startTimer } from "./textGeneration/mcp/performanceMonitor";
import { env } from "$env/dynamic/private";

interface CacheEntry {
	result: UrlValidationResult;
	timestamp: number;
}

export class UrlValidationCache {
	private cache = new Map<string, CacheEntry>();
	private readonly TTL = 300000; // 5 minutes cache lifetime
	private readonly maxSize = 1000; // Maximum cache entries

	/**
	 * Validate URL with caching
	 */
	validateUrl(url: string, options: UrlValidationOptions = {}): UrlValidationResult {
		const key = this.generateKey(url, options);
		const cached = this.getFromCacheWithTracking(key);

		if (cached) {
			return cached;
		}

		// Perform validation with performance monitoring
		const validationTimer = startTimer("url_validation");
		const result = validateUrlDetailed(url, options);
		validationTimer();

		// Cache the result
		this.setInCache(key, result);

		return result;
	}

	/**
	 * Get from cache if valid
	 */
	private getFromCache(key: string): UrlValidationResult | null {
		const entry = this.cache.get(key);

		if (!entry) {
			return null;
		}

		// Check if entry is expired
		const now = Date.now();
		if (now - entry.timestamp > this.TTL) {
			this.cache.delete(key);
			return null;
		}

		return entry.result;
	}

	/**
	 * Set in cache with size management
	 */
	private setInCache(key: string, result: UrlValidationResult): void {
		// Remove oldest entries if cache is full
		if (this.cache.size >= this.maxSize) {
			const oldestKey = this.getOldestKey();
			if (oldestKey) {
				this.cache.delete(oldestKey);
			}
		}

		this.cache.set(key, {
			result,
			timestamp: Date.now(),
		});
	}

	/**
	 * Generate cache key from URL
	 */
	private generateKey(url: string, options: UrlValidationOptions): string {
		try {
			const urlObj = new URL(url);
			const allowedHostsKey = (options.allowedHosts ?? [])
				.map((h) => (typeof h === "string" ? h.trim().toLowerCase() : ""))
				.filter(Boolean)
				.sort()
				.join(",");
			const optionsKey = `allowLocalhost=${Boolean(options.allowLocalhost)};allowPrivateIp=${Boolean(options.allowPrivateIp)};allowReservedRange=${Boolean(options.allowReservedRange)};allowedHosts=${allowedHostsKey}`;
			// Normalize the URL for consistent caching
			return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}|${optionsKey}`;
		} catch {
			// Fallback for invalid URLs
			return url;
		}
	}

	/**
	 * Get the oldest cache key for eviction
	 */
	private getOldestKey(): string | null {
		let oldestKey: string | null = null;
		let oldestTimestamp = Infinity;

		for (const [key, entry] of this.cache.entries()) {
			if (entry.timestamp < oldestTimestamp) {
				oldestTimestamp = entry.timestamp;
				oldestKey = key;
			}
		}

		return oldestKey;
	}

	/**
	 * Get cache statistics
	 */
	getStats(): {
		size: number;
		hits: number;
		misses: number;
		hitRate: number;
	} {
		const hits = this.hits;
		const misses = this.misses;
		const total = hits + misses;

		return {
			size: this.cache.size,
			hits,
			misses,
			hitRate: total > 0 ? (hits / total) * 100 : 0,
		};
	}

	private hits = 0;
	private misses = 0;

	/**
	 * Track cache hit
	 */
	private trackHit(): void {
		this.hits++;
	}

	/**
	 * Track cache miss
	 */
	private trackMiss(): void {
		this.misses++;
	}

	/**
	 * Get from cache with tracking
	 */
	private getFromCacheWithTracking(key: string): UrlValidationResult | null {
		const result = this.getFromCache(key);
		if (result) {
			this.trackHit();
		} else {
			this.trackMiss();
		}
		return result;
	}

	/**
	 * Clear cache
	 */
	clear(): void {
		this.cache.clear();
		this.hits = 0;
		this.misses = 0;
	}
}

// Global cache instance
const urlValidationCache = new UrlValidationCache();

/**
 * Validate URL with caching (drop-in replacement for isValidUrlEnhanced)
 */
export function isValidUrlCached(urlString: string): boolean {
	return urlValidationCache.validateUrl(urlString).isValid;
}

/**
 * Validate URL with detailed results and caching
 */
export function validateUrlCached(urlString: string): UrlValidationResult {
	return urlValidationCache.validateUrl(urlString);
}

// Debug flag for MCP env logging (logs once per startup)
let _mcpEnvDebugLogged = false;

export function validateMcpServerUrlCached(urlString: string): UrlValidationResult {
	// CRITICAL: Use SvelteKit's $env/dynamic/private instead of process.env
	// SvelteKit doesn't populate process.env from .env files in dev mode
	const allowLocalhost = env.MCP_ALLOW_LOCALHOST_URLS === "true";
	const allowPrivateIp = env.MCP_ALLOW_PRIVATE_URLS === "true";
	const allowReservedRange = env.MCP_ALLOW_RESERVED_URLS === "true";

	// Debug: Log env values on first call to diagnose localhost rejection issue
	if (!_mcpEnvDebugLogged) {
		console.log("[urlValidationCache] MCP env values:", {
			MCP_ALLOW_LOCALHOST_URLS: env.MCP_ALLOW_LOCALHOST_URLS,
			MCP_ALLOW_PRIVATE_URLS: env.MCP_ALLOW_PRIVATE_URLS,
			allowLocalhost,
			allowPrivateIp,
		});
		_mcpEnvDebugLogged = true;
	}
	const allowedHosts = (env.MCP_ALLOWED_HOSTS || "")
		.split(",")
		.map((h) => h.trim())
		.filter(Boolean);
	return urlValidationCache.validateUrl(urlString, {
		allowLocalhost,
		allowPrivateIp,
		allowReservedRange,
		allowedHosts,
	});
}

/**
 * Get cache statistics
 */
export function getUrlValidationCacheStats() {
	return urlValidationCache.getStats();
}

/**
 * Clear URL validation cache
 */
export function clearUrlValidationCache() {
	urlValidationCache.clear();
}
