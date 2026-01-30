import { preprocessMessages } from "../endpoints/preprocessMessages";

import { generateTitleForConversation } from "./title";
import {
	type MessageUpdate,
	MessageUpdateType,
	MessageUpdateStatus,
	MessageMemoryUpdateType,
} from "$lib/types/MessageUpdate";
import type { MemoryMetaV1, MemoryTier } from "$lib/types/MemoryMeta";
import { generate } from "./generate";
import { runMcpFlow } from "./mcp/runMcpFlow";
import { mergeAsyncGenerators } from "$lib/utils/mergeAsyncGenerators";
import type { TextGenerationContext } from "./types";
import {
	prefetchMemoryContext,
	parseMemoryMarks,
	type MemoryContextResult,
	type SearchPositionMap,
} from "./mcp/memoryIntegration";
import { isHistoricalDateQuery } from "./mcp/toolFilter";
import { ADMIN_USER_ID } from "../constants";

async function* keepAlive(done: AbortSignal): AsyncGenerator<MessageUpdate, undefined, undefined> {
	while (!done.aborted) {
		yield {
			type: MessageUpdateType.Status,
			status: MessageUpdateStatus.KeepAlive,
		};
		// Phase 2.6: Increased from 100ms to 500ms to reduce SSE traffic
		// 100ms was excessive - 500ms is sufficient for connection keep-alive
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}

function hasDecisionDateSignal(text: string): boolean {
	if (!text) return false;
	const lower = text.toLowerCase();
	if (
		/(?:תאריך\s+הישיבה|מועד\s+הדיון|הדיון\s+התקיים|תאריך\s+פסק\s+דין|מועד\s+הכרעה|ניתן\s+היום|ניתנה?\s+ביום)/.test(
			text
		)
	) {
		return true;
	}
	if (/\b\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2}\b/.test(lower)) return true;
	if (
		/\b\d{1,2}\s+(?:ב|ל)?(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s+\d{4}\b/.test(
			text
		)
	) {
		return true;
	}
	if (
		/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+(?:19|20)\d{2}\b/.test(
			lower
		)
	) {
		return true;
	}
	return false;
}

function parseMemoryContextForUi(contextText: string | null): {
	citations: Array<{ tier: MemoryTier; memory_id: string; content?: string }>;
	knownContextItems: Array<{ tier: MemoryTier; memory_id: string; content: string }>;
} {
	if (!contextText) return { citations: [], knownContextItems: [] };

	const citations: Array<{ tier: MemoryTier; memory_id: string; content?: string }> = [];
	const knownContextItems: Array<{ tier: MemoryTier; memory_id: string; content: string }> = [];

	const lines = contextText.split("\n");
	for (const line of lines) {
		const marker = line.match(
			/\[(working|history|patterns|documents|memory_bank|datagov_schema|datagov_expansion):([^\]]+)\]/
		);
		if (!marker) continue;

		const tier = marker[1] as MemoryTier;
		const memory_id = marker[2].trim();
		const content = line.slice(marker.index! + marker[0].length).trim();
		if (!memory_id) continue;

		citations.push({ tier, memory_id, content: content || undefined });
		if (content) knownContextItems.push({ tier, memory_id, content });
	}

	return { citations, knownContextItems };
}

function buildFallbackMemoryMeta(params: {
	memoryResult: MemoryContextResult;
	conversationId: string | undefined;
	userId: string;
	userQuery: string;
}): MemoryMetaV1 {
	const { memoryResult, conversationId, userId, userQuery } = params;
	const parsedContext = parseMemoryContextForUi(memoryResult.memoryContext ?? null);
	const tiersUsed = Array.from(new Set(parsedContext.citations.map((c) => c.tier)));
	const searchPositionMap = memoryResult.searchPositionMap ?? ({} as SearchPositionMap);

	const byMemoryId = Object.fromEntries(
		Object.entries(searchPositionMap).map(([memory_id, entry]) => [
			memory_id,
			{ position: entry.position, tier: entry.tier },
		])
	);
	const byPosition = Object.entries(searchPositionMap)
		.map(([memory_id, entry]) => ({ memory_id, tier: entry.tier, position: entry.position }))
		.sort((a, b) => a.position - b.position);

	return {
		schema_version: "v1",
		conversation_id: conversationId ?? "unknown",
		assistant_message_id: "",
		user_id: userId,
		created_at: new Date().toISOString(),
		retrieval: {
			query: userQuery,
			normalized_query: null,
			limit: parsedContext.citations.length,
			sort_by: null,
			tiers_considered: ["working", "history", "patterns", "documents", "memory_bank"],
			tiers_used: tiersUsed,
			search_position_map: {
				by_position: byPosition,
				by_memory_id: byMemoryId,
			},
		},
		known_context: {
			known_context_text: memoryResult.memoryContext ?? "",
			known_context_items: parsedContext.knownContextItems.map((i) => ({
				tier: i.tier,
				memory_id: i.memory_id,
				content: i.content,
			})),
		},
		citations: parsedContext.citations.map((c) => ({
			tier: c.tier,
			memory_id: c.memory_id,
			content: c.content,
		})),
		context_insights: {
			matched_concepts: [],
			active_concepts: [],
			tier_recommendations: null,
			you_already_know: null,
			directives: null,
		},
		debug: {
			retrieval_confidence: memoryResult.retrievalConfidence,
			fallbacks_used: memoryResult.retrievalDebug?.fallbacks_used ?? [],
			stage_timings_ms: memoryResult.retrievalDebug?.stage_timings_ms ?? {},
			errors: memoryResult.retrievalDebug?.errors ?? [],
			vector_stage_status: null,
		},
		feedback: {
			eligible: true,
			interrupted: false,
			eligible_reason: null,
		},
	};
}

function stripAttributionArtifacts(text: string): string {
	const { cleanedResponse } = parseMemoryMarks(text);
	return cleanedResponse
		.replace(/^\s*(?:ייחוס זיכרון|Memory attribution)\s*:?\s*/i, "")
		.replace(/<!--\s*MEM:[\s\S]*?(?:-->|$)/gi, "")
		.trim();
}

export async function* textGeneration(ctx: TextGenerationContext) {
	const done = new AbortController();

	// Phase 23.8 P2.6: Pass abort signal to title generation so it stops when text generation completes
	// This prevents title generation from prolonging the "loading" state
	const titleGen = generateTitleForConversation(ctx.conv, ctx.locals, done.signal);
	const textGen = textGenerationWithoutTitle(ctx, done);
	const keepAliveGen = keepAlive(done.signal);

	// keep alive until textGen is done

	yield* mergeAsyncGenerators([titleGen, textGen, keepAliveGen]);
}

async function* textGenerationWithoutTitle(
	ctx: TextGenerationContext,
	done: AbortController
): AsyncGenerator<MessageUpdate, undefined, undefined> {
	yield {
		type: MessageUpdateType.Status,
		status: MessageUpdateStatus.Started,
	};

	const { conv, messages } = ctx;
	const convId = conv._id;

	const preprompt = conv.preprompt;

	const processedMessages = await preprocessMessages(messages, convId);

	// Try MCP tool flow first; fall back to default generation if not selected/available
	try {
		const mcpGen = runMcpFlow({
			model: ctx.model,
			conv,
			messages: processedMessages,
			assistant: ctx.assistant,
			forceMultimodal: ctx.forceMultimodal,
			forceTools: ctx.forceTools,
			locals: ctx.locals,
			preprompt,
			abortSignal: ctx.abortController.signal,
		});

		let step = await mcpGen.next();
		while (!step.done) {
			yield step.value;
			step = await mcpGen.next();
		}
		const didRunMcp = Boolean(step.value);
		if (!didRunMcp) {
			console.log(
				"[textGeneration] MCP flow skipped or yielded no results. Falling back to default generation."
			);
			// Fallback with memory integration to prevent "memory not called" issue
			yield* generateWithMemory(ctx, processedMessages, preprompt);
		}
	} catch (error) {
		console.error("[textGeneration] MCP flow failed with error:", error);
		// On any MCP error, fall back to generation with memory
		yield* generateWithMemory(ctx, processedMessages, preprompt);
	}
	done.abort();
}

/**
 * Generate with memory integration for fallback path
 * Ensures memory is still used even when MCP is skipped
 */
async function* generateWithMemory(
	ctx: TextGenerationContext,
	processedMessages: import("../endpoints/endpoints").EndpointMessage[],
	preprompt?: string
): AsyncGenerator<MessageUpdate, undefined, undefined> {
	const { conv } = ctx;
	const conversationId = conv._id?.toString();

	// Extract user query from last message
	// Note: EndpointMessage.content is always string after preprocessMessages
	const lastUserMessage = processedMessages.filter((m) => m.from === "user").pop();
	const userQuery = lastUserMessage?.content ?? "";

	// Emit memory search start event
	yield {
		type: MessageUpdateType.Memory,
		subtype: MessageMemoryUpdateType.Searching,
		query: userQuery.slice(0, 100),
	};

	// Prefetch memory context
	let enhancedPreprompt = preprompt || "";
	let memoryCount = 0;
	let memoryMeta: MemoryMetaV1 | undefined;
	try {
		const memoryResult = await prefetchMemoryContext(ADMIN_USER_ID, userQuery, {
			conversationId,
			recentMessages: processedMessages.slice(-6).map((m) => ({
				role: m.from,
				content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
			})),
			signal: ctx.abortController.signal,
		});

		// Inject memory context into preprompt if available
		if (memoryResult.personalityPrompt) {
			enhancedPreprompt = memoryResult.personalityPrompt + "\n\n" + enhancedPreprompt;
		}

		if (memoryResult.memoryContext) {
			enhancedPreprompt =
				enhancedPreprompt +
				"\n\n## Relevant Memory Context\n" +
				memoryResult.memoryContext +
				"\n\n---\n";
			memoryCount = memoryResult.memoryContext.split("\n\n").length;
		}

		if (memoryResult.isOperational) {
			memoryMeta = buildFallbackMemoryMeta({
				memoryResult,
				conversationId,
				userId: ADMIN_USER_ID,
				userQuery,
			});
		}

		// Emit memory found event
		const confidenceMap = { high: 0.9, medium: 0.6, low: 0.3 };
		yield {
			type: MessageUpdateType.Memory,
			subtype: MessageMemoryUpdateType.Found,
			count: memoryCount,
			confidence: confidenceMap[memoryResult.retrievalConfidence] || 0.3,
		};

		console.log("[textGeneration] Memory context injected into fallback generation", {
			hasPersonality: !!memoryResult.personalityPrompt,
			hasMemory: !!memoryResult.memoryContext,
			confidence: memoryResult.retrievalConfidence,
		});

		const isDateQuery = isHistoricalDateQuery(userQuery);
		const hasDecisionDate = hasDecisionDateSignal(memoryResult.memoryContext ?? "");
		if (isDateQuery && !hasDecisionDate) {
			const safeMessage =
				"לא מצאתי במסמכים שהעלית תאריך החלטה מדויק. אם תרצה שאחפש במקורות חיצוניים, כתוב \"חפש\" או אפשר לי להשתמש בכלי חיפוש.";
			yield { type: MessageUpdateType.Stream, token: safeMessage };
			yield {
				type: MessageUpdateType.FinalAnswer,
				text: safeMessage,
				interrupted: false,
				memoryMeta,
			};
			return;
		}
	} catch (err) {
		console.warn("[textGeneration] Memory prefetch failed in fallback, continuing without:", err);
		// Emit empty memory event so UI knows we tried
		yield {
			type: MessageUpdateType.Memory,
			subtype: MessageMemoryUpdateType.Found,
			count: 0,
			confidence: 0,
		};
	}

	// Add anti-hallucination instruction for fallback path (no tools available)
	// This is critical because without tools, the model cannot verify factual claims
	const antiHallucinationInstruction = `
## Important: No External Tools Available
You are responding WITHOUT access to search tools or external data sources.
- For factual questions (news, legal cases, statistics, specific data): clearly state "אין לי גישה לכלי חיפוש כרגע, אז אני לא יכול לאמת מידע עדכני" / "I don't have access to search tools right now, so I cannot verify current information"
- NEVER invent specific names, dates, numbers, or facts you're not certain about
- Use memory context above if relevant, but acknowledge its limitations
- For general knowledge questions, you may answer but clearly distinguish between verified knowledge and uncertainty
`;
	const finalPreprompt = enhancedPreprompt + antiHallucinationInstruction;

	// Proceed with generation using enhanced preprompt
	for await (const update of generate({ ...ctx, messages: processedMessages }, finalPreprompt)) {
		if (update.type === MessageUpdateType.FinalAnswer && memoryMeta) {
			yield { ...update, memoryMeta, text: stripAttributionArtifacts(update.text) };
			continue;
		}
		if (update.type === MessageUpdateType.FinalAnswer) {
			yield { ...update, text: stripAttributionArtifacts(update.text) };
			continue;
		}
		yield update;
	}
}
