/**
 * QdrantAdapter - Vector database adapter for Memory System
 *
 * Responsibilities:
 * - Collection creation and management
 * - Vector upsert, delete, query operations
 * - 1024d vector dimension validation (BGE-M3)
 * - Fail-open behavior with timeouts
 *
 * Key design principles:
 * - All operations have hard timeouts
 * - Return empty results on timeout/error, never throw to UI path
 * - Single collection with payload filtering (not per-tier collections)
 */

import { v5 as uuidv5, validate as uuidValidate } from "uuid";

import { logger } from "$lib/server/logger";
import type { MemoryConfig, QdrantDistance } from "../memory_config";
import { defaultMemoryConfig } from "../memory_config";
import type { MemoryTier, MemoryStatus } from "../types";

export interface QdrantAdapterConfig {
	host: string;
	port: number;
	apiKey?: string;
	https?: boolean;
	config?: MemoryConfig;
}

export interface QdrantPoint {
	id: string; // UUID (memory_id)
	vector: number[];
	payload: QdrantPayload;
}

export interface QdrantPayload {
	memory_id?: string;
	user_id: string;
	tier: MemoryTier;
	status: MemoryStatus;
	tags: string[];
	entities: string[];
	content: string; // Text content for display
	timestamp: number; // Unix timestamp for sorting
	composite_score: number; // Wilson score for sorting
	uses: number;
	always_inject: boolean;
	doc_id?: string | null;
	chunk_id?: string | null;
	book?: {
		book_id: string;
		title: string;
		author: string | null;
		chunk_index: number;
		upload_timestamp: string | null;
		file_type: string | null;
		mime_type: string | null;
		document_hash: string | null;
	};
}

export interface QdrantSearchResult {
	id: string;
	score: number;
	payload: QdrantPayload;
}

export interface QdrantSearchParams {
	userId: string;
	vector: number[];
	limit?: number;
	tiers?: MemoryTier[];
	status?: MemoryStatus[];
	tags?: string[];
	minScore?: number;
	/** NER Integration: Pre-filter to only these memory IDs */
	filterIds?: string[];
}

export interface EntityFilterParams {
	userId: string;
	entityWords: string[];
	limit?: number;
}

export interface QdrantHealthStatus {
	healthy: boolean;
	collectionExists: boolean;
	vectorDims: number | null;
	pointCount: number;
	error?: string;
}

interface QdrantCollectionInfo {
	status: string;
	vectors_count: number;
	points_count: number;
	config: {
		params: {
			vectors: {
				size: number;
				distance: string;
			};
		};
	};
}

const MEMORY_ID_NAMESPACE = uuidv5.DNS;

export class QdrantAdapter {
	private baseUrl: string;
	private apiKey?: string;
	private config: MemoryConfig;
	private collectionName: string;
	private vectorName: string;
	private expectedDims: number;
	private distance: QdrantDistance;

	// Circuit breaker state
	private isOpen = false;
	private failureCount = 0;
	private lastFailure: number | null = null;
	private successCount = 0;

	constructor(params: QdrantAdapterConfig) {
		const protocol = params.https ? "https" : "http";
		this.baseUrl = `${protocol}://${params.host}:${params.port}`;
		this.apiKey = params.apiKey;
		this.config = params.config ?? defaultMemoryConfig;

		this.collectionName = this.config.qdrant.collection_name;
		this.vectorName = this.config.qdrant.vector_name;
		// BGE-M3 produces 1024-dim vectors - must match DictaEmbeddingClient default
		this.expectedDims = this.config.qdrant.expected_embedding_dims ?? 1024;
		this.distance = this.config.qdrant.distance;
	}

	/**
	 * Initialize the adapter - create collection if needed
	 */
	async initialize(): Promise<boolean> {
		try {
			const exists = await this.collectionExists();
			if (!exists) {
				await this.createCollection();
			}

			// Validate vector dimensions
			const validation = await this.validateSchema();
			if (!validation.valid) {
				logger.error({ error: validation.error }, "Qdrant schema validation failed");
				if (this.config.vector_schema_validation.on_mismatch === "throw") {
					throw new Error(validation.error);
				}
				// Disable vector stage
				this.openCircuitBreaker("Schema mismatch");
				return false;
			}

			logger.info(
				{ collection: this.collectionName, dims: this.expectedDims },
				"QdrantAdapter initialized"
			);
			return true;
		} catch (err) {
			logger.error({ err }, "Failed to initialize QdrantAdapter");
			this.openCircuitBreaker("Initialization failed");
			return false;
		}
	}

	/**
	 * Execute HTTP request with timeout
	 */
	private async request<T>(
		method: string,
		path: string,
		body?: unknown,
		timeoutMs?: number
	): Promise<T | null> {
		if (this.isOpen && !this.shouldAttemptHalfOpen()) {
			return null;
		}

		const timeout = timeoutMs ?? this.config.timeouts.qdrant_query_ms;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};
			if (this.apiKey) {
				headers["api-key"] = this.apiKey;
			}

			const response = await fetch(`${this.baseUrl}${path}`, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Qdrant request failed: ${response.status} ${errorText}`);
			}

			const data = await response.json();
			this.recordSuccess();
			return data as T;
		} catch (err) {
			clearTimeout(timeoutId);
			const errorMessage = err instanceof Error ? err.message : String(err);

			if (errorMessage.includes("aborted")) {
				logger.warn({ path, timeout }, "Qdrant request timed out");
			} else {
				logger.warn({ err, path }, "Qdrant request failed");
			}

			this.recordFailure();
			return null;
		}
	}

	// ============================================
	// Circuit Breaker
	// ============================================

	private openCircuitBreaker(reason: string): void {
		this.isOpen = true;
		this.lastFailure = Date.now();
		logger.warn({ reason }, "Qdrant circuit breaker opened");
	}

	private shouldAttemptHalfOpen(): boolean {
		if (!this.lastFailure) return true;
		const elapsed = Date.now() - this.lastFailure;
		return elapsed > this.config.circuit_breakers.qdrant.open_duration_ms;
	}

	private recordSuccess(): void {
		if (this.isOpen) {
			this.successCount++;
			if (this.successCount >= this.config.circuit_breakers.qdrant.success_threshold) {
				this.isOpen = false;
				this.failureCount = 0;
				this.successCount = 0;
				logger.info("Qdrant circuit breaker closed");
			}
		} else {
			this.failureCount = 0;
		}
	}

	private recordFailure(): void {
		this.failureCount++;
		this.successCount = 0;
		if (this.failureCount >= this.config.circuit_breakers.qdrant.failure_threshold) {
			this.openCircuitBreaker("Too many failures");
		}
	}

	private toPointId(memoryId: string): string {
		const trimmed = memoryId.trim();
		if (uuidValidate(trimmed)) {
			return trimmed;
		}
		return uuidv5(trimmed, MEMORY_ID_NAMESPACE);
	}

	private resolveMemoryId(
		pointId: string | number,
		payload?: QdrantPayload,
		fallbackMap?: Map<string, string>
	): string {
		if (payload?.memory_id) {
			return payload.memory_id;
		}
		const pointIdStr = String(pointId);
		return fallbackMap?.get(pointIdStr) ?? pointIdStr;
	}

	// ============================================
	// Collection Management
	// ============================================

	/**
	 * Check if collection exists
	 */
	async collectionExists(): Promise<boolean> {
		const result = await this.request<{ result: { collections: Array<{ name: string }> } }>(
			"GET",
			"/collections"
		);
		if (!result) return false;
		return result.result.collections.some((c) => c.name === this.collectionName);
	}

	/**
	 * Delete the entire collection (DESTRUCTIVE - use with caution!)
	 */
	async deleteCollection(): Promise<boolean> {
		try {
			const result = await this.request<{ result: boolean }>(
				"DELETE",
				`/collections/${this.collectionName}`
			);

			if (result?.result) {
				logger.info({ collection: this.collectionName }, "Deleted Qdrant collection");
				return true;
			}

			return false;
		} catch (err) {
			logger.error({ err, collection: this.collectionName }, "Failed to delete Qdrant collection");
			return false;
		}
	}

	/**
	 * Get collection info (point count, vector dims, etc.)
	 */
	async getCollectionInfo(): Promise<QdrantCollectionInfo | null> {
		try {
			const result = await this.request<{ result: QdrantCollectionInfo }>(
				"GET",
				`/collections/${this.collectionName}`
			);
			return result?.result ?? null;
		} catch {
			return null;
		}
	}

	/**
	 * Create collection with proper schema
	 */
	async createCollection(): Promise<boolean> {
		const body = {
			vectors: {
				[this.vectorName]: {
					size: this.expectedDims,
					distance: this.distance,
				},
			},
		};

		const result = await this.request<{ result: boolean }>(
			"PUT",
			`/collections/${this.collectionName}`,
			body
		);

		if (result?.result) {
			// Create payload indexes for filtering
			await this.createPayloadIndexes();
			logger.info({ collection: this.collectionName }, "Created Qdrant collection");
			return true;
		}

		return false;
	}

	/**
	 * Create payload field indexes for efficient filtering
	 */
	private async createPayloadIndexes(): Promise<void> {
		const indexes = [
			{ field: "user_id", type: "keyword" },
			{ field: "tier", type: "keyword" },
			{ field: "status", type: "keyword" },
			{ field: "tags", type: "keyword" },
			{ field: "entities", type: "keyword" },
			{ field: "timestamp", type: "integer" },
			{ field: "composite_score", type: "float" },
			{ field: "uses", type: "integer" },
			{ field: "always_inject", type: "bool" },
		];

		for (const idx of indexes) {
			await this.request("PUT", `/collections/${this.collectionName}/index`, {
				field_name: idx.field,
				field_schema: idx.type,
			});
		}
	}

	/**
	 * Validate that collection schema matches expected configuration
	 */
	async validateSchema(): Promise<{ valid: boolean; error?: string }> {
		const result = await this.request<{ result: QdrantCollectionInfo }>(
			"GET",
			`/collections/${this.collectionName}`
		);

		if (!result) {
			return { valid: false, error: "Could not fetch collection info" };
		}

		const vectorConfig = result.result.config.params.vectors;

		// Check if it's a named vector or default
		const vectorSize =
			typeof vectorConfig === "object" && "size" in vectorConfig
				? vectorConfig.size
				: (vectorConfig as Record<string, { size: number }>)[this.vectorName]?.size;

		if (!vectorSize) {
			return { valid: false, error: `Vector '${this.vectorName}' not found in collection` };
		}

		if (vectorSize !== this.expectedDims) {
			return {
				valid: false,
				error: `Vector dimension mismatch: expected ${this.expectedDims}, got ${vectorSize}`,
			};
		}

		return { valid: true };
	}

	/**
	 * Get collection health status
	 */
	async getHealth(): Promise<QdrantHealthStatus> {
		try {
			const result = await this.request<{ result: QdrantCollectionInfo }>(
				"GET",
				`/collections/${this.collectionName}`
			);

			if (!result) {
				return {
					healthy: false,
					collectionExists: false,
					vectorDims: null,
					pointCount: 0,
					error: "Could not connect to Qdrant",
				};
			}

			const vectorConfig = result.result.config.params.vectors;
			const vectorSize =
				typeof vectorConfig === "object" && "size" in vectorConfig
					? vectorConfig.size
					: (vectorConfig as Record<string, { size: number }>)[this.vectorName]?.size;

			return {
				healthy: result.result.status === "green",
				collectionExists: true,
				vectorDims: vectorSize ?? null,
				pointCount: result.result.points_count,
			};
		} catch (err) {
			return {
				healthy: false,
				collectionExists: false,
				vectorDims: null,
				pointCount: 0,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	// ============================================
	// CRUD Operations
	// ============================================

	/**
	 * Upsert a single point
	 */
	async upsert(point: QdrantPoint): Promise<boolean> {
		return this.upsertBatch([point]);
	}

	/**
	 * Upsert multiple points
	 */
	async upsertBatch(points: QdrantPoint[]): Promise<boolean> {
		if (points.length === 0) return true;

		// Validate vector dimensions
		for (const point of points) {
			if (point.vector.length !== this.expectedDims) {
				logger.error(
					{ pointId: point.id, expected: this.expectedDims, got: point.vector.length },
					"Vector dimension mismatch, skipping upsert"
				);
				return false;
			}
		}

		const body = {
			points: points.map((p) => {
				const pointId = this.toPointId(p.id);
				return {
					id: pointId,
					vector: { [this.vectorName]: p.vector },
					payload: {
						...p.payload,
						memory_id: p.payload.memory_id ?? p.id,
					},
				};
			}),
		};

		const result = await this.request<{ result: { status: string } }>(
			"PUT",
			`/collections/${this.collectionName}/points`,
			body
		);

		return result?.result?.status === "completed" || result?.result?.status === "acknowledged";
	}

	/**
	 * Delete points by IDs
	 */
	async delete(ids: string[]): Promise<boolean> {
		if (ids.length === 0) return true;

		const body = {
			points: ids.map((id) => this.toPointId(id)),
		};

		const result = await this.request<{ result: { status: string } }>(
			"POST",
			`/collections/${this.collectionName}/points/delete`,
			body
		);

		return result?.result?.status === "completed" || result?.result?.status === "acknowledged";
	}

	/**
	 * Delete points by filter (e.g., all points for a user)
	 *
	 * Supports two filter formats:
	 * 1. Simple object: { userId, tier, status }
	 * 2. Qdrant-native filter: { must: [{ key, match: { value } }] }
	 *
	 * v0.2.9 Parity: Used by clearDocumentsTier for "True Collection Nuke"
	 */
	async deleteByFilter(filter: {
		userId?: string;
		tier?: MemoryTier;
		status?: MemoryStatus;
		must?: Array<{ key: string; match: { value: string } }>;
	}): Promise<{ deleted: number; success: boolean }> {
		let must: Array<{ key: string; match: { value: string } }> = [];

		// Support native Qdrant filter format
		if (filter.must) {
			must = filter.must;
		} else {
			// Build from simple object format
			if (filter.userId) {
				must.push({ key: "user_id", match: { value: filter.userId } });
			}
			if (filter.tier) {
				must.push({ key: "tier", match: { value: filter.tier } });
			}
			if (filter.status) {
				must.push({ key: "status", match: { value: filter.status } });
			}
		}

		if (must.length === 0) {
			logger.warn("deleteByFilter called with empty filter, skipping");
			return { deleted: 0, success: false };
		}

		// First count how many points will be deleted
		const countBody = {
			filter: { must },
			exact: true,
		};
		const countResult = await this.request<{ result: { count: number } }>(
			"POST",
			`/collections/${this.collectionName}/points/count`,
			countBody
		);
		const willDelete = countResult?.result?.count ?? 0;

		// Now delete
		const body = {
			filter: { must },
		};

		const result = await this.request<{ result: { status: string } }>(
			"POST",
			`/collections/${this.collectionName}/points/delete`,
			body
		);

		const success =
			result?.result?.status === "completed" || result?.result?.status === "acknowledged";
		return { deleted: willDelete, success };
	}

	/**
	 * Search for similar vectors
	 */
	async search(params: QdrantSearchParams): Promise<QdrantSearchResult[]> {
		// Validate query vector dimensions
		if (params.vector.length !== this.expectedDims) {
			logger.error(
				{ expected: this.expectedDims, got: params.vector.length },
				"Query vector dimension mismatch"
			);
			return [];
		}

		const limit = params.limit ?? this.config.caps.search_limit_default;
		const must: Array<Record<string, unknown>> = [
			{ key: "user_id", match: { value: params.userId } },
		];

		// Add tier filter
		if (params.tiers?.length) {
			must.push({ key: "tier", match: { any: params.tiers } });
		}

		// Add status filter (default to active)
		const statuses = params.status ?? ["active"];
		must.push({ key: "status", match: { any: statuses } });

		// Add tag filter
		if (params.tags?.length) {
			must.push({ key: "tags", match: { any: params.tags } });
		}

		// NER Integration: Add ID filter for entity pre-filtering
		if (params.filterIds?.length) {
			must.push({ has_id: params.filterIds.map((id) => this.toPointId(id)) });
		}

		const body = {
			vector: { name: this.vectorName, vector: params.vector },
			filter: { must },
			limit,
			with_payload: true,
			score_threshold: params.minScore ?? 0,
		};

		const result = await this.request<{
			result: Array<{ id: string; score: number; payload: QdrantPayload }>;
		}>("POST", `/collections/${this.collectionName}/points/search`, body);

		if (!result) return [];

		logger.debug(
			{ results: result.result.length, userId: params.userId, tiers: params.tiers ?? [] },
			"[qdrant] search ok"
		);

		return result.result.map((r) => ({
			id: this.resolveMemoryId(r.id, r.payload),
			score: r.score,
			payload: r.payload,
		}));
	}

	/**
	 * Get points by IDs
	 */
	async getByIds(ids: string[]): Promise<QdrantSearchResult[]> {
		if (ids.length === 0) return [];

		const pointIdToMemoryId = new Map<string, string>();
		const pointIds = ids.map((id) => {
			const pointId = this.toPointId(id);
			pointIdToMemoryId.set(pointId, id);
			return pointId;
		});

		const body = {
			ids: pointIds,
			with_payload: true,
			with_vector: false,
		};

		const result = await this.request<{ result: Array<{ id: string; payload: QdrantPayload }> }>(
			"POST",
			`/collections/${this.collectionName}/points`,
			body
		);

		if (!result) return [];

		return result.result.map((r) => ({
			id: this.resolveMemoryId(r.id, r.payload, pointIdToMemoryId),
			score: 1, // No score for direct lookups
			payload: r.payload,
		}));
	}

	/**
	 * Filter by entities (NER Integration)
	 *
	 * Finds memory IDs that have matching entities in their payload.
	 * Uses Qdrant scroll API with payload filtering for efficiency.
	 *
	 * @param params - Entity filter parameters
	 * @returns Array of matching memory IDs
	 */
	async filterByEntities(params: EntityFilterParams): Promise<string[]> {
		if (!params.entityWords || params.entityWords.length === 0) {
			return [];
		}

		const limit = params.limit ?? 500;

		// Build filter: user_id match AND entities array contains any of the query words
		// Qdrant supports "match any" for array fields
		const filter = {
			must: [
				{ key: "user_id", match: { value: params.userId } },
				{ key: "status", match: { value: "active" } },
			],
			should: params.entityWords.map((word) => ({
				key: "entities",
				match: { value: word.toLowerCase() },
			})),
			min_should: { conditions: 1 }, // At least one entity must match
		};

		try {
			const body = {
				filter,
				limit,
				with_payload: ["memory_id"],
				with_vector: false,
			};

			const result = await this.request<{
				result: { points: Array<{ id: string; payload?: QdrantPayload }> };
			}>("POST", `/collections/${this.collectionName}/points/scroll`, body);

			if (!result?.result?.points) {
				return [];
			}

			return result.result.points.map((p) => this.resolveMemoryId(p.id, p.payload));
		} catch (err) {
			logger.warn(
				{ err, entityCount: params.entityWords.length },
				"[qdrant] filterByEntities failed"
			);
			return [];
		}
	}

	/**
	 * Update payload fields without touching vector
	 * Used for score/usage updates
	 */
	async updatePayload(id: string, payload: Partial<QdrantPayload>): Promise<boolean> {
		const pointId = this.toPointId(id);
		const body = {
			points: [pointId],
			payload,
		};

		const result = await this.request<{ result: { status: string } }>(
			"POST",
			`/collections/${this.collectionName}/points/payload`,
			body
		);

		return result?.result?.status === "completed" || result?.result?.status === "acknowledged";
	}

	/**
	 * Batch update payloads
	 */
	async updatePayloadBatch(
		updates: Array<{ id: string; payload: Partial<QdrantPayload> }>
	): Promise<boolean> {
		if (updates.length === 0) return true;

		// Qdrant doesn't have a direct batch payload update, so we do sequential
		// For large batches, consider using set_payload with filter
		let success = true;
		for (const update of updates) {
			const result = await this.updatePayload(update.id, update.payload);
			if (!result) success = false;
		}
		return success;
	}

	/**
	 * Scroll through all points (for reindex/consistency)
	 */
	async scroll(
		userId: string,
		options?: { limit?: number; offset?: string }
	): Promise<{ points: QdrantSearchResult[]; nextOffset: string | null }> {
		const body: Record<string, unknown> = {
			filter: {
				must: [{ key: "user_id", match: { value: userId } }],
			},
			limit: options?.limit ?? 100,
			with_payload: true,
			with_vector: false,
		};

		if (options?.offset) {
			body.offset = options.offset;
		}

		const result = await this.request<{
			result: {
				points: Array<{ id: string; payload: QdrantPayload }>;
				next_page_offset: string | null;
			};
		}>("POST", `/collections/${this.collectionName}/points/scroll`, body);

		if (!result) {
			return { points: [], nextOffset: null };
		}

		return {
			points: result.result.points.map((p) => ({
				id: this.resolveMemoryId(p.id, p.payload),
				score: 1,
				payload: p.payload,
			})),
			nextOffset: result.result.next_page_offset,
		};
	}

	/**
	 * Count points for a user
	 */
	async count(userId: string, tier?: MemoryTier): Promise<number> {
		const must: Array<Record<string, unknown>> = [{ key: "user_id", match: { value: userId } }];

		if (tier) {
			must.push({ key: "tier", match: { value: tier } });
		}

		const body = {
			filter: { must },
			exact: true,
		};

		const result = await this.request<{ result: { count: number } }>(
			"POST",
			`/collections/${this.collectionName}/points/count`,
			body
		);

		return result?.result?.count ?? 0;
	}

	/**
	 * Check if circuit breaker is open
	 */
	isCircuitOpen(): boolean {
		return this.isOpen;
	}
}
