import { extractJsonObjectSlice } from "$lib/server/textGeneration/utils/jsonExtractor";

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
