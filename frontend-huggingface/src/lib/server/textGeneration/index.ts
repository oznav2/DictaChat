import { preprocessMessages } from "../endpoints/preprocessMessages";

import { generateTitleForConversation } from "./title";
import {
	type MessageUpdate,
	MessageUpdateType,
	MessageUpdateStatus,
	MessageMemoryUpdateType,
} from "$lib/types/MessageUpdate";
import { generate } from "./generate";
import { runMcpFlow } from "./mcp/runMcpFlow";
import { mergeAsyncGenerators } from "$lib/utils/mergeAsyncGenerators";
import type { TextGenerationContext } from "./types";
import { prefetchMemoryContext } from "./mcp/memoryIntegration";
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
	yield* generate({ ...ctx, messages: processedMessages }, finalPreprompt);
}
