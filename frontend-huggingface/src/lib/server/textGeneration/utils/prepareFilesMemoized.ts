/**
 * Memoized version of prepareMessagesWithFiles for performance optimization
 * Caches processed messages to avoid repeated image processing and file preparation
 */

import type { MessageFile } from "$lib/types/Message";
import type { EndpointMessage } from "$lib/server/endpoints/endpoints";
import type { OpenAI } from "openai";
import { TEXT_MIME_ALLOWLIST } from "$lib/constants/mime";
import type { makeImageProcessor } from "$lib/server/endpoints/images";
import { prepareMessagesWithFiles } from "./prepareFiles";

interface CacheKey {
	messages: EndpointMessage[];
	isMultimodal: boolean;
}

interface CacheEntry {
	result: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
	timestamp: number;
}

class MessagePreparationCache {
	private cache = new Map<string, CacheEntry>();
	private readonly TTL = 60000; // 60 seconds

	/**
	 * Generate cache key from messages and multimodal flag
	 */
	private generateKey(messages: EndpointMessage[], isMultimodal: boolean): string {
		// Create a deterministic key based on message content and files
		const keyData = {
			messages: messages.map((msg) => ({
				from: msg.from,
				content: msg.content,
				files:
					msg.files?.map((file) => ({
						name: file.name,
						mime: file.mime,
						path: file.path ?? null,
						size: file.value?.length || 0,
						type: file.type,
					})) || [],
			})),
			isMultimodal,
		};
		return JSON.stringify(keyData);
	}

	/**
	 * Get cached result
	 */
	get(
		messages: EndpointMessage[],
		isMultimodal: boolean
	): OpenAI.Chat.Completions.ChatCompletionMessageParam[] | null {
		const key = this.generateKey(messages, isMultimodal);
		const entry = this.cache.get(key);

		if (entry && Date.now() - entry.timestamp < this.TTL) {
			return entry.result;
		}

		// Clean up expired entries
		this.cleanup();
		return null;
	}

	/**
	 * Cache result
	 */
	set(
		messages: EndpointMessage[],
		isMultimodal: boolean,
		result: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
	): void {
		const key = this.generateKey(messages, isMultimodal);
		this.cache.set(key, {
			result,
			timestamp: Date.now(),
		});
	}

	/**
	 * Clean up expired cache entries
	 */
	private cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > this.TTL) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Clear all cache entries
	 */
	clear(): void {
		this.cache.clear();
	}
}

// Global cache instance
const messageCache = new MessagePreparationCache();

/**
 * Memoized version of prepareMessagesWithFiles
 * Caches processed messages to avoid repeated image processing and file preparation
 */
export async function prepareMessagesWithFilesMemoized(
	messages: EndpointMessage[],
	imageProcessor: ReturnType<typeof makeImageProcessor>,
	isMultimodal: boolean
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
	// Check cache first
	const cached = messageCache.get(messages, isMultimodal);
	if (cached) {
		console.debug("[mcp] Using cached message preparation");
		return cached;
	}

	// Process messages
	const result = await prepareMessagesWithFiles(messages, imageProcessor, isMultimodal);

	// Cache the result
	messageCache.set(messages, isMultimodal, result);

	return result;
}

/**
 * Clear the message preparation cache
 * Useful when memory needs to be freed or when testing
 */
export function clearMessagePreparationCache(): void {
	messageCache.clear();
}
