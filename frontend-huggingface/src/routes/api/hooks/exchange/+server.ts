import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import type { MemoryMetaV1, MemoryCitationV1, KnownContextV1, MemoryTier } from "$lib/types/MemoryMeta";

/**
 * Exchange Hook API - Called before LLM inference to inject memory context
 * POST /api/hooks/exchange
 */

export interface Message {
	role: "user" | "assistant" | "system";
	content: string;
}

export interface ExchangeRequest {
	conversationId: string;
	messageId: string;
	messages: Message[];
	limit?: number;
}

export interface ExchangeResponse {
	messages: Message[];
	memoryMeta: MemoryMetaV1;
}

const VALID_TIERS: MemoryTier[] = ["working", "history", "patterns", "books", "memory_bank"];

function isValidTier(tier: string): tier is MemoryTier {
	return VALID_TIERS.includes(tier as MemoryTier);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.user?.id;
	if (!userId) {
		return error(401, "Authentication required");
	}

	const body: ExchangeRequest = await request.json();
	const { conversationId, messageId, messages, limit = 10 } = body;

	if (!conversationId || typeof conversationId !== "string") {
		return error(400, "conversationId is required");
	}

	if (!messageId || typeof messageId !== "string") {
		return error(400, "messageId is required");
	}

	if (!Array.isArray(messages) || messages.length === 0) {
		return error(400, "messages array is required and cannot be empty");
	}

	const facade = UnifiedMemoryFacade.getInstance();

	// Extract user query from the last user message
	const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
	const query = lastUserMessage?.content ?? "";

	if (!query.trim()) {
		return json({
			messages,
			memoryMeta: createEmptyMemoryMeta(conversationId, messageId, userId),
		});
	}

	// Convert messages to recent messages format for prefetch
	const recentMessages = messages.slice(-10).map((m) => ({
		role: m.role,
		content: m.content,
	}));

	// Prefetch context from memory
	const startTime = Date.now();
	const prefetchResult = await facade.prefetchContext({
		userId,
		conversationId,
		query,
		recentMessages,
		hasDocuments: false,
		limit,
	});
	const prefetchMs = Date.now() - startTime;

	// If we have memory context, inject it as a system message
	const modifiedMessages = [...messages];
	if (prefetchResult.memoryContextInjection.trim()) {
		const systemIndex = modifiedMessages.findIndex((m) => m.role === "system");
		const memorySystemContent = "<memory_context>\n" + prefetchResult.memoryContextInjection + "\n</memory_context>";

		if (systemIndex >= 0) {
			modifiedMessages[systemIndex] = {
				...modifiedMessages[systemIndex],
				content: modifiedMessages[systemIndex].content + "\n\n" + memorySystemContent,
			};
		} else {
			modifiedMessages.unshift({
				role: "system",
				content: memorySystemContent,
			});
		}
	}

	// Build memory meta with retrieval information
	const memoryMeta = buildMemoryMeta({
		conversationId,
		messageId,
		userId,
		query,
		prefetchResult,
		prefetchMs,
	});

	return json({
		messages: modifiedMessages,
		memoryMeta,
	} satisfies ExchangeResponse);
};

function createEmptyMemoryMeta(
	conversationId: string,
	messageId: string,
	userId: string
): MemoryMetaV1 {
	return {
		schema_version: "v1",
		conversation_id: conversationId,
		assistant_message_id: messageId,
		user_id: userId,
		created_at: new Date().toISOString(),
		context_type: null,
		retrieval: {
			query: "",
			limit: 0,
			tiers_considered: [],
			tiers_used: [],
		},
		known_context: {
			known_context_text: "",
			known_context_items: [],
		},
		citations: [],
		context_insights: {
			matched_concepts: [],
			active_concepts: [],
		},
		debug: {
			retrieval_confidence: "low",
			fallbacks_used: [],
			stage_timings_ms: {},
			errors: [],
		},
		feedback: {
			eligible: false,
			interrupted: false,
		},
	};
}

function buildMemoryMeta({
	conversationId,
	messageId,
	userId,
	query,
	prefetchResult,
	prefetchMs,
}: {
	conversationId: string;
	messageId: string;
	userId: string;
	query: string;
	prefetchResult: Awaited<ReturnType<UnifiedMemoryFacade["prefetchContext"]>>;
	prefetchMs: number;
}): MemoryMetaV1 {
	const { citations, knownContext } = parseMemoryContext(prefetchResult.memoryContextInjection);

	return {
		schema_version: "v1",
		conversation_id: conversationId,
		assistant_message_id: messageId,
		user_id: userId,
		created_at: new Date().toISOString(),
		context_type: null,
		retrieval: {
			query,
			limit: 10,
			tiers_considered: VALID_TIERS,
			tiers_used: [...new Set(citations.map((c) => c.tier))],
		},
		known_context: knownContext,
		citations,
		context_insights: {
			matched_concepts: [],
			active_concepts: [],
		},
		debug: {
			retrieval_confidence: prefetchResult.retrievalConfidence,
			fallbacks_used: prefetchResult.retrievalDebug.fallbacks_used,
			stage_timings_ms: {
				...prefetchResult.retrievalDebug.stage_timings_ms,
				total_prefetch_ms: prefetchMs,
			},
			errors: prefetchResult.retrievalDebug.errors,
		},
		feedback: {
			eligible: citations.length > 0,
			interrupted: false,
			default_related_positions: citations.map((_, i) => i),
		},
	};
}

function parseMemoryContext(contextText: string): {
	citations: MemoryCitationV1[];
	knownContext: KnownContextV1;
} {
	const citations: MemoryCitationV1[] = [];
	const knownContextItems: KnownContextV1["known_context_items"] = [];

	if (!contextText.trim()) {
		return {
			citations,
			knownContext: { known_context_text: "", known_context_items: [] },
		};
	}

	// Parse memory entries line by line
	// Format: [tier:memory_id] content
	const lines = contextText.split("\n");
	for (const line of lines) {
		const bracketEnd = line.indexOf("]");
		if (bracketEnd > 0 && line.startsWith("[")) {
			const bracketContent = line.substring(1, bracketEnd);
			const colonIndex = bracketContent.indexOf(":");
			if (colonIndex > 0) {
				const tierCandidate = bracketContent.substring(0, colonIndex);
				const memoryId = bracketContent.substring(colonIndex + 1);
				const content = line.substring(bracketEnd + 1).trim();

				if (tierCandidate && isValidTier(tierCandidate) && memoryId && content) {
					citations.push({ tier: tierCandidate, memory_id: memoryId.trim() });
					knownContextItems.push({
						tier: tierCandidate,
						memory_id: memoryId.trim(),
						content: content,
					});
				}
			}
		}
	}

	return {
		citations,
		knownContext: { known_context_text: contextText, known_context_items: knownContextItems },
	};
}
