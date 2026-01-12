import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import type { MemoryTier } from "$lib/types/MemoryMeta";
import { ADMIN_USER_ID } from "$lib/server/constants";

/**
 * Context Hook API - Retrieves relevant context for a query
 * POST /api/hooks/context
 */

export interface ContextRequest {
	userId?: string;
	query: string;
	limit?: number;
	tiers?: MemoryTier[];
	sortBy?: "relevance" | "recency" | "score";
}

export interface ContextItem {
	tier: MemoryTier;
	content: string;
	score: number;
	memoryId: string;
	docId?: string | null;
	chunkId?: string | null;
	preview?: string;
	tags?: string[];
	createdAt?: string;
}

export interface ContextResponse {
	contexts: ContextItem[];
	total: number;
	query: string;
	tiersSearched: MemoryTier[];
	latencyMs: number;
	confidence: "high" | "medium" | "low";
}

const ALL_TIERS: MemoryTier[] = ["working", "history", "patterns", "books", "memory_bank"];

export const POST: RequestHandler = async ({ request }) => {
	const body: ContextRequest = await request.json();
	const { query, limit = 10, tiers = ALL_TIERS, sortBy = "relevance" } = body;

	if (!query || typeof query !== "string") {
		return error(400, "query is required");
	}

	if (query.trim().length < 2) {
		return error(400, "query must be at least 2 characters");
	}

	// Validate tiers
	const validTiers = tiers.filter((t) => ALL_TIERS.includes(t));
	if (validTiers.length === 0) {
		return error(400, "At least one valid tier must be specified");
	}

	const facade = UnifiedMemoryFacade.getInstance();

	const startTime = Date.now();
	const searchResult = await facade.search({
		userId: ADMIN_USER_ID,
		query: query.trim(),
		collections: validTiers,
		limit: Math.min(limit, 50),
		sortBy,
	});
	const latencyMs = Date.now() - startTime;

	// Transform search results to context items
	const contexts: ContextItem[] = searchResult.results.map((result) => ({
		tier: result.tier,
		content: result.content,
		score: result.score_summary.final_score,
		memoryId: result.memory_id,
		docId: result.citations?.[0]?.doc_id ?? null,
		chunkId: result.citations?.[0]?.chunk_id ?? null,
		preview: result.preview ?? truncateContent(result.content, 150),
		createdAt: result.score_summary.created_at ?? undefined,
	}));

	// Determine confidence based on scores
	const confidence = determineConfidence(contexts);

	return json({
		contexts,
		total: searchResult.results.length,
		query,
		tiersSearched: validTiers,
		latencyMs,
		confidence,
	} satisfies ContextResponse);
};

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get("query");
	const limitStr = url.searchParams.get("limit");
	const tiersStr = url.searchParams.get("tiers");
	const sortBy = url.searchParams.get("sortBy") as "relevance" | "recency" | "score" | null;

	if (!query) {
		return error(400, "query parameter is required");
	}

	const limit = limitStr ? parseInt(limitStr, 10) : 10;
	const tiers = tiersStr
		? (tiersStr.split(",").filter((t) => ALL_TIERS.includes(t as MemoryTier)) as MemoryTier[])
		: ALL_TIERS;

	const facade = UnifiedMemoryFacade.getInstance();

	const startTime = Date.now();
	const searchResult = await facade.search({
		userId: ADMIN_USER_ID,
		query: query.trim(),
		collections: tiers.length > 0 ? tiers : ALL_TIERS,
		limit: Math.min(limit, 50),
		sortBy: sortBy ?? "relevance",
	});
	const latencyMs = Date.now() - startTime;

	const contexts: ContextItem[] = searchResult.results.map((result) => ({
		tier: result.tier,
		content: result.content,
		score: result.score_summary.final_score,
		memoryId: result.memory_id,
		preview: result.preview ?? truncateContent(result.content, 150),
	}));

	const confidence = determineConfidence(contexts);

	return json({
		contexts,
		total: searchResult.results.length,
		query,
		tiersSearched: tiers.length > 0 ? tiers : ALL_TIERS,
		latencyMs,
		confidence,
	} satisfies ContextResponse);
};

function truncateContent(content: string, maxLength: number): string {
	if (content.length <= maxLength) return content;
	return content.slice(0, maxLength).trim() + "...";
}

function determineConfidence(contexts: ContextItem[]): "high" | "medium" | "low" {
	if (contexts.length === 0) return "low";

	const topScore = contexts[0]?.score ?? 0;
	const avgScore =
		contexts.length > 0 ? contexts.reduce((sum, c) => sum + c.score, 0) / contexts.length : 0;

	if (topScore >= 0.8 && avgScore >= 0.5) return "high";
	if (topScore >= 0.5 && avgScore >= 0.3) return "medium";
	return "low";
}
