import type { NormalizedToolCall } from "./toolInvocation";

/**
 * Enhanced loop detection with semantic analysis
 * Prevents infinite loops by detecting functionally identical tool calls
 */
export class LoopDetector {
	private readonly MAX_REPEATED_CALLS = 3;
	private callHashes = new Map<string, number>();
	private contentHashes = new Map<string, number>();

	/**
	 * Detect if tool calls are in a repetition loop
	 */
	detectToolLoop(toolCalls: NormalizedToolCall[]): boolean {
		const semanticHash = this.generateToolCallHash(toolCalls);
		const count = this.callHashes.get(semanticHash) || 0;

		if (count >= this.MAX_REPEATED_CALLS) {
			return true;
		}

		this.callHashes.set(semanticHash, count + 1);
		return false;
	}

	/**
	 * Detect if content is being repeated
	 */
	detectContentLoop(content: string): boolean {
		const contentHash = this.generateContentHash(content);
		const count = this.contentHashes.get(contentHash) || 0;

		if (count >= this.MAX_REPEATED_CALLS) {
			return true;
		}

		this.contentHashes.set(contentHash, count + 1);
		return false;
	}

	/**
	 * Reset loop detection state
	 */
	reset(): void {
		this.callHashes.clear();
		this.contentHashes.clear();
	}

	/**
	 * Generate a semantic hash for tool calls
	 * Ignores ID differences, focuses on intent (name + arguments)
	 */
	private generateToolCallHash(calls: NormalizedToolCall[]): string {
		// Sort calls by name to ensure consistent hashing regardless of order
		const sorted = [...calls].sort((a, b) => a.name.localeCompare(b.name));

		return sorted
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
	 */
	private generateContentHash(content: string): string {
		// Normalize whitespace and casing
		// Take first 1000 chars to avoid performance impact on huge outputs
		return content.slice(0, 1000).toLowerCase().replace(/\s+/g, " ").trim();
	}
}
