import { z } from "zod";
import { openAICompletionToTextGenerationStream } from "./openAICompletionToTextGenerationStream";
import {
	openAIChatToTextGenerationSingle,
	openAIChatToTextGenerationStream,
} from "./openAIChatToTextGenerationStream";
import type { CompletionCreateParamsStreaming } from "openai/resources/completions";
import type {
	ChatCompletionCreateParamsNonStreaming,
	ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import { buildPrompt } from "$lib/buildPrompt";
import { config } from "$lib/server/config";
import type { Endpoint } from "../endpoints";
import type OpenAI from "openai";
import { createImageProcessorOptionsValidator, makeImageProcessor } from "../images";
import { prepareMessagesWithFiles } from "$lib/server/textGeneration/utils/prepareFiles";
import { logger } from "$lib/server/logger";
import { randomUUID } from "crypto";
// uuid import removed (no tool call ids)

export const endpointOAIParametersSchema = z.object({
	weight: z.number().int().positive().default(1),
	model: z.any(),
	type: z.literal("openai"),
	baseURL: z
		.string()
		.url()
		.default(config.OPENAI_BASE_URL || "http://localhost:8002/v1"),
	// Canonical auth token is OPENAI_API_KEY; keep HF_TOKEN as legacy alias
	apiKey: z.string().default(config.OPENAI_API_KEY || config.HF_TOKEN || "sk-"),
	completion: z
		.union([z.literal("completions"), z.literal("chat_completions")])
		.default("chat_completions"),
	defaultHeaders: z.record(z.string()).optional(),
	defaultQuery: z.record(z.string()).optional(),
	extraBody: z.record(z.any()).optional(),
	multimodal: z
		.object({
			image: createImageProcessorOptionsValidator({
				supportedMimeTypes: [
					// Restrict to the most widely-supported formats
					"image/png",
					"image/jpeg",
				],
				preferredMimeType: "image/jpeg",
				maxSizeInMB: 1,
				maxWidth: 1024,
				maxHeight: 1024,
			}),
		})
		.default({}),
	/* enable use of max_completion_tokens in place of max_tokens */
	useCompletionTokens: z.boolean().default(false),
	streamingSupported: z.boolean().default(true),
});

export async function endpointOai(
	input: z.input<typeof endpointOAIParametersSchema>
): Promise<Endpoint> {
	const {
		baseURL,
		apiKey,
		completion,
		model,
		defaultHeaders,
		defaultQuery,
		multimodal,
		extraBody,
		useCompletionTokens,
		streamingSupported,
	} = endpointOAIParametersSchema.parse(input);

	let OpenAI;
	try {
		OpenAI = (await import("openai")).OpenAI;
	} catch (e) {
		throw new Error("Failed to import OpenAI", { cause: e });
	}

	// Store router metadata if captured
	let routerMetadata: { route?: string; model?: string; provider?: string } = {};

	const debugRawStreamEnabled =
		config.DEBUG_RAW_STREAM === "true" || config.DEBUG_RAW_STREAM === "1";
	const debugRawStreamSampleRateRaw = config.DEBUG_RAW_STREAM_SAMPLE_RATE;
	const debugRawStreamSampleRate = Math.min(
		1,
		Math.max(
			0,
			typeof debugRawStreamSampleRateRaw === "number"
				? debugRawStreamSampleRateRaw
				: Number.parseFloat(String(debugRawStreamSampleRateRaw ?? "0.01"))
		)
	);
	const debugRawStreamSampleBytesRaw = config.DEBUG_RAW_STREAM_SAMPLE_BYTES;
	const debugRawStreamSampleBytes = Math.max(
		256,
		Math.min(
			1024 * 1024,
			typeof debugRawStreamSampleBytesRaw === "number"
				? debugRawStreamSampleBytesRaw
				: Number.parseInt(String(debugRawStreamSampleBytesRaw ?? "4096"), 10)
		)
	);

	const redactSensitiveText = (input: string): string => {
		let text = input;
		text = text.replace(
			/Authorization:\s*Bearer\s+[^\s\r\n"]+/gi,
			"Authorization: Bearer [REDACTED]"
		);
		text = text.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]");
		text = text.replace(/sk-[A-Za-z0-9]{16,}/g, "sk-[REDACTED]");
		text = text.replace(
			/("?(?:password|pass|api[_-]?key|apikey|token|secret)"?\s*:\s*)"[^"]*"/gi,
			'$1"[REDACTED]"'
		);
		text = text.replace(/([?&](?:api[_-]?key|apikey|token|secret)=)[^&\s]+/gi, "$1[REDACTED]");
		return text;
	};

	const getHeaderValue = (
		headers: RequestInit["headers"] | undefined,
		name: string
	): string | undefined => {
		if (!headers) return undefined;
		if (headers instanceof Headers) return headers.get(name) ?? undefined;
		if (Array.isArray(headers)) {
			const match = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
			return match?.[1];
		}
		const value = (headers as Record<string, string | undefined>)[name];
		if (typeof value === "string") return value;
		const fallback = (headers as Record<string, string | undefined>)[name.toLowerCase()];
		return typeof fallback === "string" ? fallback : undefined;
	};

	// Custom fetch wrapper to capture response headers for router metadata
	const customFetch = async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
		const response = await fetch(url, init);

		// Capture router headers if present (fallback for non-streaming)
		const routeHeader = response.headers.get("X-Router-Route");
		const modelHeader = response.headers.get("X-Router-Model");
		const providerHeader = response.headers.get("x-inference-provider");

		if (routeHeader && modelHeader) {
			routerMetadata = {
				route: routeHeader,
				model: modelHeader,
				provider: providerHeader || undefined,
			};
		} else if (providerHeader) {
			// Even without router metadata, capture provider info
			routerMetadata = {
				provider: providerHeader,
			};
		}

		const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
		const isEventStream = contentType.includes("text/event-stream");
		if (!debugRawStreamEnabled || !isEventStream || !response.body) {
			return response;
		}
		if (Math.random() > debugRawStreamSampleRate) {
			return response;
		}

		const requestId = getHeaderValue(init?.headers, "X-Request-ID");
		const conversationId = getHeaderValue(init?.headers, "ChatUI-Conversation-ID");

		const [logStream, passthroughStream] = response.body.tee();
		void (async () => {
			const decoder = new TextDecoder();
			const reader = logStream.getReader();
			let rawText = "";
			let receivedBytes = 0;

			try {
				while (receivedBytes < debugRawStreamSampleBytes) {
					const { value, done } = await reader.read();
					if (done) break;
					if (!value) continue;
					receivedBytes += value.byteLength;
					rawText += decoder.decode(value, { stream: true });
				}
				rawText += decoder.decode();
			} catch (err) {
				logger.warn({ err, requestId, conversationId }, "[DEBUG_RAW_STREAM] failed to read sample");
			} finally {
				try {
					await reader.cancel();
				} catch {}
			}

			const redacted = redactSensitiveText(rawText);
			logger.warn(
				{
					requestId,
					conversationId,
					status: response.status,
					url: typeof url === "string" ? url : url?.toString?.(),
					sampleBytes: receivedBytes,
					routerMetadata,
				},
				"[DEBUG_RAW_STREAM] OpenAI stream sample"
			);
			logger.warn({ requestId, sample: redacted }, "[DEBUG_RAW_STREAM] chunk");
		})();

		return new Response(passthroughStream, {
			status: response.status,
			statusText: response.statusText,
			headers: new Headers(response.headers),
		});
	};

	const openai = new OpenAI({
		apiKey: apiKey || "sk-",
		baseURL,
		defaultHeaders: {
			...(config.PUBLIC_APP_NAME === "HuggingChat" && { "User-Agent": "huggingchat" }),
			...defaultHeaders,
		},
		defaultQuery,
		fetch: customFetch,
	});

	const imageProcessor = makeImageProcessor(multimodal.image);

	if (completion === "completions") {
		return async ({
			messages,
			preprompt,
			generateSettings,
			conversationId,
			locals,
			abortSignal,
		}) => {
			const requestId = randomUUID();
			const prompt = await buildPrompt({
				messages,
				preprompt,
				model,
			});

			const parameters = { ...model.parameters, ...generateSettings };
			const body: CompletionCreateParamsStreaming = {
				model: model.id ?? model.name,
				prompt,
				stream: true,
				max_tokens: parameters?.max_tokens ?? 16384,
				stop: parameters?.stop,
				temperature: parameters?.temperature,
				top_p: parameters?.top_p,
				frequency_penalty: parameters?.frequency_penalty,
				presence_penalty: parameters?.presence_penalty,
			};

			const openAICompletion = await openai.completions.create(body, {
				body: { ...body, ...extraBody },
				headers: {
					"X-Request-ID": requestId,
					"ChatUI-Conversation-ID": conversationId?.toString() ?? "",
					"X-use-cache": "false",
					...(locals?.token ? { Authorization: `Bearer ${locals.token}` } : {}),
					// Bill to organization if configured (HuggingChat only)
					...(config.isHuggingChat && locals?.billingOrganization
						? { "X-HF-Bill-To": locals.billingOrganization }
						: {}),
				},
				signal: abortSignal,
			});

			return openAICompletionToTextGenerationStream(openAICompletion);
		};
	} else if (completion === "chat_completions") {
		return async ({
			messages,
			preprompt,
			generateSettings,
			conversationId,
			isMultimodal,
			locals,
			abortSignal,
		}) => {
			const requestId = randomUUID();
			// Format messages for the chat API, handling multimodal content if supported
			let messagesOpenAI: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
				await prepareMessagesWithFiles(messages, imageProcessor, isMultimodal ?? model.multimodal);

			// Normalize preprompt and handle empty values
			const normalizedPreprompt = typeof preprompt === "string" ? preprompt.trim() : "";

			// Check if a system message already exists as the first message
			const hasSystemMessage = messagesOpenAI.length > 0 && messagesOpenAI[0]?.role === "system";

			if (hasSystemMessage) {
				// Prepend normalized preprompt to existing system content when non-empty
				if (normalizedPreprompt) {
					const userSystemPrompt =
						(typeof messagesOpenAI[0].content === "string"
							? (messagesOpenAI[0].content as string)
							: "") || "";
					messagesOpenAI[0].content =
						normalizedPreprompt + (userSystemPrompt ? "\n\n" + userSystemPrompt : "");
				}
			} else {
				// Insert a system message only if the preprompt is non-empty
				if (normalizedPreprompt) {
					messagesOpenAI = [{ role: "system", content: normalizedPreprompt }, ...messagesOpenAI];
				}
			}

			// Combine model defaults with request-specific parameters
			const parameters = { ...model.parameters, ...generateSettings };

			// Calculate max tokens with safe clamping to prevent infinite loops
			// Enterprise Refactoring: Increased limit from 4096 to 16384 to support "Thinking" models
			// that generate extensive reasoning chains before the final answer.
			let maxTokens = parameters?.max_tokens ?? 4096;
			if (maxTokens > 16384) maxTokens = 16384;

			// Ensure critical stop tokens are present to prevent hallucinations/loops
			// NOTE: Do NOT add </tool_call> as stop sequence - allows parallel tool calls
			let stopSequences: string[] =
				typeof parameters?.stop === "string"
					? [parameters.stop]
					: Array.isArray(parameters?.stop)
						? parameters.stop
						: [];

			const criticalStopTokens = ["<|im_end|>", "<|im_start|>", "<tool_response>"];
			for (const token of criticalStopTokens) {
				if (!stopSequences.includes(token)) {
					stopSequences = [...stopSequences, token];
				}
			}

			// Remove </tool_call> if present to allow multiple tool calls
			if (stopSequences.includes("</tool_call>")) {
				stopSequences = stopSequences.filter((s) => s !== "</tool_call>");
			}

			logger.debug(
				{
					requestId,
					conversationId: conversationId?.toString() ?? "",
					model: model.id,
					maxTokens,
					stop: stopSequences,
					streaming: streamingSupported,
				},
				"[endpointOai] constructing request"
			);

			const body = {
				model: model.id ?? model.name,
				messages: messagesOpenAI,
				stream: streamingSupported,
				// Support two different ways of specifying token limits depending on the model
				...(useCompletionTokens ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
				stop: stopSequences,
				temperature: parameters?.temperature,
				top_p: parameters?.top_p,
				frequency_penalty: parameters?.frequency_penalty,
				presence_penalty: parameters?.presence_penalty,
			};

			// Handle both streaming and non-streaming responses with appropriate processors
			if (streamingSupported) {
				const openChatAICompletion = await openai.chat.completions.create(
					body as ChatCompletionCreateParamsStreaming,
					{
						body: { ...body, ...extraBody },
						headers: {
							"X-Request-ID": requestId,
							"ChatUI-Conversation-ID": conversationId?.toString() ?? "",
							"X-use-cache": "false",
							...(locals?.token ? { Authorization: `Bearer ${locals.token}` } : {}),
							// Bill to organization if configured (HuggingChat only)
							...(config.isHuggingChat && locals?.billingOrganization
								? { "X-HF-Bill-To": locals.billingOrganization }
								: {}),
						},
						signal: abortSignal,
					}
				);
				return openAIChatToTextGenerationStream(openChatAICompletion, () => routerMetadata);
			} else {
				const openChatAICompletion = await openai.chat.completions.create(
					body as ChatCompletionCreateParamsNonStreaming,
					{
						body: { ...body, ...extraBody },
						headers: {
							"X-Request-ID": requestId,
							"ChatUI-Conversation-ID": conversationId?.toString() ?? "",
							"X-use-cache": "false",
							...(locals?.token ? { Authorization: `Bearer ${locals.token}` } : {}),
							// Bill to organization if configured (HuggingChat only)
							...(config.isHuggingChat && locals?.billingOrganization
								? { "X-HF-Bill-To": locals.billingOrganization }
								: {}),
						},
						signal: abortSignal,
					}
				);
				return openAIChatToTextGenerationSingle(openChatAICompletion, () => routerMetadata);
			}
		};
	} else {
		throw new Error("Invalid completion type");
	}
}
