import type { NormalizedToolCall } from "./toolInvocation";

/**
 * Enhanced loop detection with semantic analysis
 * Prevents infinite loops by detecting functionally identical tool calls
 * AND repeated calls to same tool with varying arguments (e.g., fetch with different URLs)
 *
 * Gemini Finding 3+4: Refactored to be stateless regarding conversationId.
 * - conversationId is now passed as a parameter to detection methods
 * - This eliminates race condition risk if registration changed to singleton
 * - reset() removed as redundant (transient registration = new instance each request)
 * - State (callHashes, toolNameCounts) is still maintained within a request lifecycle
 */
export class LoopDetector {
	private readonly MAX_REPEATED_CALLS = 3;
	private readonly MAX_SAME_TOOL_CALLS = 5; // Same tool, any arguments
	private callHashes = new Map<string, number>();
	private contentHashes = new Map<string, number>();
	private toolNameCounts = new Map<string, number>(); // Track by tool name only

	/**
	 * Detect if tool calls are in a repetition loop
	 * Checks BOTH exact matches AND repeated use of same tool
	 * @param toolCalls - The tool calls to check
	 * @param conversationId - Conversation ID for cache key namespacing (prevents cross-conversation collisions)
	 */
	detectToolLoop(toolCalls: NormalizedToolCall[], conversationId: string): boolean {
		// Check 1: Exact semantic hash match (same tool + same args)
		const semanticHash = this.generateToolCallHash(toolCalls, conversationId);
		const exactCount = this.callHashes.get(semanticHash) || 0;

		if (exactCount >= this.MAX_REPEATED_CALLS) {
			return true;
		}
		this.callHashes.set(semanticHash, exactCount + 1);

		// Check 2: Same tool name repeated too many times (varying arguments)
		// This catches cases like fetch being called 5+ times with different URLs
		for (const call of toolCalls) {
			const toolName = this.normalizeToolName(call.name);
			const nameCount = (this.toolNameCounts.get(toolName) || 0) + 1;
			this.toolNameCounts.set(toolName, nameCount);

			if (nameCount >= this.MAX_SAME_TOOL_CALLS) {
				console.warn(
					{ toolName, originalName: call.name, callCount: nameCount },
					"[loop-detector] Same tool called too many times, likely a loop"
				);
				return true;
			}
		}

		return false;
	}

	/**
	 * Normalize tool name to handle MCP server prefixes and variations
	 * Examples:
	 *   "mcp-tavily__tavily_search" → "tavily_search"
	 *   "MCP-Perplexity__perplexity-ask" → "perplexity_ask"
	 *   "tavily_search" → "tavily_search"
	 */
	private normalizeToolName(name: string): string {
		let normalized = name.toLowerCase();

		// Strip MCP server prefix (e.g., "mcp-tavily__" from "mcp-tavily__tavily_search")
		const prefixMatch = normalized.match(/^mcp-[^_]+__(.+)$/);
		if (prefixMatch) {
			normalized = prefixMatch[1];
		}

		// Also strip any "mcp_" or "mcp-" prefix that might exist
		normalized = normalized.replace(/^mcp[-_]/, "");

		// Normalize hyphens to underscores for consistent matching
		normalized = normalized.replace(/-/g, "_");

		return normalized;
	}

	/**
	 * Detect if content is being repeated
	 * @param content - The content to check
	 * @param conversationId - Conversation ID for cache key namespacing
	 */
	detectContentLoop(content: string, conversationId: string): boolean {
		const contentHash = this.generateContentHash(content, conversationId);
		const count = this.contentHashes.get(contentHash) || 0;

		if (count >= this.MAX_REPEATED_CALLS) {
			return true;
		}

		this.contentHashes.set(contentHash, count + 1);
		return false;
	}

	/**
	 * Generate a semantic hash for tool calls
	 * Ignores ID differences, focuses on intent (name + arguments)
	 * Includes conversationId to prevent cross-conversation collisions
	 */
	private generateToolCallHash(calls: NormalizedToolCall[], conversationId: string): string {
		// Sort calls by name to ensure consistent hashing regardless of order
		const sorted = [...calls].sort((a, b) => a.name.localeCompare(b.name));

		const callsHash = sorted
			.map((c) => {
				// Normalize arguments to handle JSON spacing differences and key ordering
				let normalizedArgs = c.arguments;
				try {
					// Parse and re-stringify with sorted keys to normalize format
					const parsed = JSON.parse(c.arguments);
					normalizedArgs = JSON.stringify(this.sortObjectKeys(parsed));
				} catch (e) {
					// Keep original if not valid JSON
					normalizedArgs = c.arguments.trim();
				}
				return `${c.name}:${normalizedArgs}`;
			})
			.join("|");

		// Include conversationId in hash to namespace per conversation
		return `${conversationId}:${callsHash}`;
	}

	/**
	 * Recursively sort object keys for consistent serialization
	 */
	private sortObjectKeys(obj: unknown): unknown {
		if (Array.isArray(obj)) {
			return obj.map((item) => this.sortObjectKeys(item));
		}

		if (obj && typeof obj === "object" && obj !== null) {
			const sorted: Record<string, unknown> = {};
			const keys = Object.keys(obj).sort();

			for (const key of keys) {
				sorted[key] = this.sortObjectKeys((obj as Record<string, unknown>)[key]);
			}

			return sorted;
		}

		return obj;
	}

	/**
	 * Generate a semantic hash for content
	 * Ignores whitespace and minor differences
	 * Includes conversationId to prevent cross-conversation collisions
	 */
	private generateContentHash(content: string, conversationId: string): string {
		// Normalize whitespace and casing
		// Take first 1000 chars to avoid performance impact on huge outputs
		const normalized = content.slice(0, 1000).toLowerCase().replace(/\s+/g, " ").trim();
		return `${conversationId}:${normalized}`;
	}
}
