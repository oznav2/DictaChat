/**
 * Memoized version of prepareMessagesWithFiles for performance optimization
 * Caches processed messages to avoid repeated image processing and file preparation
 */

import type { EndpointMessage } from "$lib/server/endpoints/endpoints";
import type { OpenAI } from "openai";
import type { makeImageProcessor } from "$lib/server/endpoints/images";
import { prepareMessagesWithFiles } from "./prepareFiles";
import { createHash } from "crypto";

interface CacheEntry {
	result: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
	timestamp: number;
}

class MessagePreparationCache {
	private cache = new Map<string, CacheEntry>();
	private readonly TTL = 60000; // 60 seconds

	/**
	 * Generate cache key from messages and multimodal flag
	 * Phase 2.5: Uses hash instead of full JSON.stringify for performance
	 * With large conversations, JSON.stringify can take 10-50ms
	 */
	private generateKey(messages: EndpointMessage[], isMultimodal: boolean): string {
		const hash = createHash("sha256");

		// Hash essential fields only (not full content)
		hash.update(isMultimodal ? "1" : "0");
		hash.update(String(messages.length));

		for (const msg of messages) {
			hash.update(msg.from);
			// Hash content length + first/last 100 chars (deterministic, fast)
			const content = msg.content;
			hash.update(String(content.length));
			if (content.length > 200) {
				hash.update(content.slice(0, 100));
				hash.update(content.slice(-100));
			} else {
				hash.update(content);
			}

			// Hash file metadata (not content)
			if (msg.files?.length) {
				hash.update(String(msg.files.length));
				for (const file of msg.files) {
					hash.update(file.name ?? "");
					hash.update(file.mime ?? "");
					hash.update(String(file.value?.length ?? 0));
				}
			}
		}

		return hash.digest("hex").slice(0, 32); // 32 char hex = 128 bits
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
