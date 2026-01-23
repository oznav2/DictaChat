import { extractJsonObjectSlice } from "$lib/server/textGeneration/utils/jsonExtractor";

/**
 * Find the start index of an XML <tool_call> tag in the text.
 * Returns -1 if not found or if inside a code fence.
 * Enhanced to handle whitespace variations and partial tags.
 */
export function findXmlToolCallStartIndex(text: string): number {
	const thinkClose = text.lastIndexOf("</think>");
	const base = thinkClose === -1 ? 0 : thinkClose + "</think>".length;
	const after = text.slice(base);

	// Enhanced regex: handles whitespace variations like <tool_call >, < tool_call>, <tool_call\n>
	// Also matches partial tags at end of string for early detection during streaming
	const toolCallMatch = after.match(/<\s*tool_call\s*>/i);
	if (!toolCallMatch || toolCallMatch.index === undefined) return -1;

	const start = base + toolCallMatch.index;

	// Ensure we're not inside a code fence
	const fenceCount = (text.slice(0, start).match(/```/g) ?? []).length;
	if (fenceCount % 2 === 1) return -1;

	return start;
}

/**
 * Check if text ends with a partial <tool_call tag that's still being streamed.
 * Used to prevent streaming content that might become a tool call tag.
 * Returns the index where the partial tag starts, or -1 if no partial tag.
 */
export function findPartialXmlToolCallIndex(text: string): number {
	const thinkClose = text.lastIndexOf("</think>");
	const base = thinkClose === -1 ? 0 : thinkClose + "</think>".length;
	const after = text.slice(base);

	// Check for partial tags at end of string:
	// "<", "<t", "<to", "<too", "<tool", "<tool_", "<tool_c", "<tool_ca", "<tool_cal", "<tool_call"
	// Also handle with spaces: "< ", "< t", etc.
	const partialPatterns = [
		/<\s*tool_call$/i, // Almost complete, just missing >
		/<\s*tool_cal$/i,
		/<\s*tool_ca$/i,
		/<\s*tool_c$/i,
		/<\s*tool_$/i,
		/<\s*tool$/i,
		/<\s*too$/i,
		/<\s*to$/i,
		/<\s*t$/i,
	];

	for (const pattern of partialPatterns) {
		const match = after.match(pattern);
		if (match && match.index !== undefined) {
			const start = base + match.index;
			// Ensure we're not inside a code fence
			const fenceCount = (text.slice(0, start).match(/```/g) ?? []).length;
			if (fenceCount % 2 === 0) {
				return start;
			}
		}
	}

	return -1;
}

export function findToolCallsPayloadStartIndex(text: string): number {
	const thinkClose = text.lastIndexOf("</think>");
	const base = thinkClose === -1 ? 0 : thinkClose + "</think>".length;
	const after = text.slice(base);
	const firstNonWs = after.search(/\S/);
	if (firstNonWs === -1) return -1;
	const start = base + firstNonWs;

	const fenceCount = (text.slice(0, start).match(/```/g) ?? []).length;
	if (fenceCount % 2 === 1) return -1;

	if (text.slice(start, start + 3) === "```") {
		const lineEnd = text.indexOf("\n", start);
		if (lineEnd === -1) return -1;
		const innerStart = lineEnd + 1;
		const innerNonWs = text.slice(innerStart).search(/\S/);
		if (innerNonWs === -1) return -1;
		const braceIndex = innerStart + innerNonWs;
		if (text[braceIndex] !== "{") return -1;
		const prefix = text.slice(braceIndex, Math.min(text.length, braceIndex + 200));
		if (!/^\{\s*(?:"tool_calls"|'tool_calls'|tool_calls)\s*:/.test(prefix)) return -1;
		return braceIndex;
	}

	if (text[start] !== "{") return -1;
	const prefix = text.slice(start, Math.min(text.length, start + 200));
	if (!/^\{\s*(?:"tool_calls"|'tool_calls'|tool_calls)\s*:/.test(prefix)) return -1;
	return start;
}

export function stripLeadingToolCallsPayload(text: string): { text: string; removed: boolean } {
	const start = findToolCallsPayloadStartIndex(text);
	if (start === -1) return { text, removed: false };
	const slice = extractJsonObjectSlice(text, start);
	if (!slice.success || !slice.json || slice.endIndex === undefined) {
		return { text, removed: false };
	}
	const before = text.slice(0, start).trimEnd();
	const after = text.slice(slice.endIndex).trimStart();
	const rebuilt = (before ? before + "\n" : "") + after;
	return { text: rebuilt.trim(), removed: rebuilt !== text };
}
