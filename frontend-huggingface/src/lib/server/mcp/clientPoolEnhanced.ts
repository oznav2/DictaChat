/**
 * Enhanced client pool with connection limits and better resource management
 */

import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { McpServerConfig } from "./httpClient";

interface PoolEntry {
	client: Client;
	inUse: boolean;
	lastUsed: number;
	createdAt: number;
}

interface ServerPool {
	entries: PoolEntry[];
	maxConnections: number;
}

class EnhancedMcpClientPool {
	private pools = new Map<string, ServerPool>();
	private readonly maxConnectionsPerServer = 5;
	private readonly connectionTimeout = 30000; // 30 seconds
	private readonly idleTimeout = 300000; // 5 minutes

	/**
	 * Get a client from the pool or create a new one
	 */
	async getClient(server: McpServerConfig, signal?: AbortSignal): Promise<Client> {
		const key = this.keyOf(server);
		let serverPool = this.pools.get(key);

		if (!serverPool) {
			serverPool = {
				entries: [],
				maxConnections: this.maxConnectionsPerServer,
			};
			this.pools.set(key, serverPool);
		}

		// Find an available client
		let availableEntry: PoolEntry | undefined = serverPool.entries.find((entry) => !entry.inUse);

		// Clean up idle connections if needed
		this.cleanupIdleConnections(serverPool);

		// Create new client if needed and under limit
		if (!availableEntry && serverPool.entries.length < serverPool.maxConnections) {
			const newEntry = await this.createClient(server, signal);
			if (newEntry) {
				serverPool.entries.push(newEntry);
				availableEntry = newEntry;
			}
		}

		if (availableEntry) {
			availableEntry.inUse = true;
			availableEntry.lastUsed = Date.now();
			return availableEntry.client;
		}

		// All clients in use - wait for one to become available
		throw new Error(`All ${serverPool.maxConnections} connections to ${server.name} are in use`);
	}

	/**
	 * Return a client to the pool
	 */
	releaseClient(server: McpServerConfig, client: Client): void {
		const key = this.keyOf(server);
		const serverPool = this.pools.get(key);

		if (serverPool) {
			const entry = serverPool.entries.find((e) => e.client === client);
			if (entry) {
				entry.inUse = false;
				entry.lastUsed = Date.now();
			}
		}
	}

	/**
	 * Invalidate a client (remove from pool and close)
	 */
	invalidateClient(server: McpServerConfig, client: Client): void {
		const key = this.keyOf(server);
		const serverPool = this.pools.get(key);

		if (serverPool) {
			const index = serverPool.entries.findIndex((e) => e.client === client);
			if (index !== -1) {
				// Remove from pool
				serverPool.entries.splice(index, 1);

				// Close connection
				try {
					client.close?.();
				} catch (error) {
					console.warn(`[mcp] Error closing invalidated client: ${error}`);
				}
			}
		}
	}

	/**
	 * Create a new client connection
	 */
	private async createClient(
		server: McpServerConfig,
		signal?: AbortSignal
	): Promise<PoolEntry | null> {
		// Check abort signal before starting
		if (signal?.aborted) {
			throw new Error("Operation aborted before client connection");
		}

		const client = new Client({ name: "chat-ui-mcp", version: "0.1.0" });
		const url = new URL(server.url);
		const requestInit: RequestInit = { headers: server.headers, signal };

		try {
			// Try HTTP transport first
			await client.connect(new StreamableHTTPClientTransport(url, { requestInit }));
		} catch (httpErr) {
			// Check abort signal again before fallback
			if (signal?.aborted) {
				throw new Error("Operation aborted during HTTP transport");
			}

			// Fallback to SSE transport
			try {
				await client.connect(new SSEClientTransport(url, { requestInit }));
			} catch (sseErr) {
				// Both transports failed - clean up and throw
				try {
					await client.close?.();
				} catch {}

				const message = `HTTP transport failed: ${String(httpErr instanceof Error ? httpErr.message : httpErr)}; SSE fallback failed: ${String(sseErr instanceof Error ? sseErr.message : sseErr)}`;
				throw new Error(message);
			}
		}

		const now = Date.now();
		return {
			client,
			inUse: true,
			lastUsed: now,
			createdAt: now,
		};
	}

	/**
	 * Clean up idle connections that have been unused for too long
	 */
	private cleanupIdleConnections(serverPool: ServerPool): void {
		const now = Date.now();
		const toRemove: PoolEntry[] = [];

		const entries = Array.from(serverPool.entries);
		for (const entry of entries) {
			// Remove connections that have been idle for too long and are not in use
			if (!entry.inUse && now - entry.lastUsed > this.idleTimeout) {
				toRemove.push(entry);
			}
		}

		// Remove and close the idle connections
		for (const entry of toRemove) {
			const index = serverPool.entries.indexOf(entry);
			if (index !== -1) {
				serverPool.entries.splice(index, 1);
				try {
					entry.client.close?.();
				} catch (error) {
					console.warn(`[mcp] Error closing idle client: ${error}`);
				}
			}
		}
	}

	/**
	 * Drain all connections in all pools
	 */
	async drainPool(): Promise<void> {
		const closePromises: Promise<void>[] = [];

		const poolEntries = Array.from(this.pools.entries());
		for (const [key, serverPool] of poolEntries) {
			const serverEntries = Array.from(serverPool.entries);
			for (const entry of serverEntries) {
				closePromises.push(
					(async () => {
						try {
							await entry.client.close?.();
						} catch (error) {
							console.warn(`[mcp] Error closing client for ${key}: ${error}`);
						}
					})()
				);
			}
		}

		// Wait for all clients to close
		await Promise.allSettled(closePromises);

		// Clear all pools
		this.pools.clear();
	}

	/**
	 * Generate cache key for server configuration
	 */
	private keyOf(server: McpServerConfig): string {
		const headers = Object.entries(server.headers ?? {})
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${k}:${v}`)
			.join("|\0|");
		return `${server.url}|${headers}`;
	}

	/**
	 * Get pool statistics for monitoring
	 */
	getPoolStats(): Record<string, { total: number; inUse: number; available: number }> {
		const stats: Record<string, { total: number; inUse: number; available: number }> = {};

		const poolEntries = Array.from(this.pools.entries());
		for (const [key, serverPool] of poolEntries) {
			const inUse = Array.from(serverPool.entries).filter((e) => e.inUse).length;
			const available = Array.from(serverPool.entries).filter((e) => !e.inUse).length;

			stats[key] = {
				total: serverPool.entries.length,
				inUse,
				available,
			};
		}

		return stats;
	}
}

// Global enhanced pool instance
const enhancedPool = new EnhancedMcpClientPool();

/**
 * Get a client from the enhanced pool
 */
export async function getClientEnhanced(
	server: McpServerConfig,
	signal?: AbortSignal
): Promise<Client> {
	return enhancedPool.getClient(server, signal);
}

/**
 * Release a client back to the enhanced pool
 */
export function releaseClientEnhanced(server: McpServerConfig, client: Client): void {
	enhancedPool.releaseClient(server, client);
}

/**
 * Invalidate a client from the enhanced pool
 */
export function invalidateClientEnhanced(server: McpServerConfig, client: Client): void {
	enhancedPool.invalidateClient(server, client);
}

/**
 * Drain all connections in the enhanced pool
 */
export async function drainPoolEnhanced(): Promise<void> {
	return enhancedPool.drainPool();
}

/**
 * Get pool statistics for monitoring
 */
export function getPoolStats(): Record<
	string,
	{ total: number; inUse: number; available: number }
> {
	return enhancedPool.getPoolStats();
}
