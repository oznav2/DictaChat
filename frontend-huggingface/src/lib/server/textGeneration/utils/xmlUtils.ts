/**
 * XML Tag Extraction and Repair Utilities
 * Critical for ensuring model outputs (Reasoning, Tool Calls) are properly closed and structured.
 */

export interface XmlTagResult {
	isOpen: boolean;
	content?: string;
	openTagIndex: number;
	closeTagIndex: number;
}

/**
 * Checks if a specific XML block is currently open (unclosed) in the text buffer.
 * @param text The current accumulated text
 * @param tagName The tag name to check (e.g., "think", "tool_call")
 */
export function isTagOpen(text: string, tagName: string): boolean {
	const openTag = `<${tagName}>`;
	const closeTag = `</${tagName}>`;

	const lastOpenIndex = text.lastIndexOf(openTag);
	const lastCloseIndex = text.lastIndexOf(closeTag);

	// If no open tag found, it's not open
	if (lastOpenIndex === -1) return false;

	// If open tag found, but no close tag found after it, it's open
	if (lastCloseIndex === -1 || lastCloseIndex < lastOpenIndex) {
		return true;
	}

	return false;
}

/**
 * Repairs text by injecting missing closing tags if needed.
 * This is crucial for "Thinking" models that might truncate or forget to close blocks.
 *
 * @param text The generated text so far
 * @param tagNames List of tags to check and close in order (LIFO - Last In First Out logic usually)
 * @returns The repaired text with injected closing tags
 */
export function repairXmlTags(
	text: string,
	tagNames: string[] = ["think", "tool_call", "tools"]
): string {
	let repairedText = text;

	// Find all open tags and their positions
	const openTags: { name: string; index: number }[] = [];

	for (const tagName of tagNames) {
		if (isTagOpen(repairedText, tagName)) {
			const lastOpenIndex = repairedText.lastIndexOf(`<${tagName}>`);
			openTags.push({ name: tagName, index: lastOpenIndex });
		}
	}

	// Sort by index descending (LIFO - close the most recently opened tag first)
	openTags.sort((a, b) => b.index - a.index);

	// Append closing tags in correct order
	for (const tag of openTags) {
		repairedText += `</${tag.name}>`;
	}

	return repairedText;
}

export function repairXmlStream(text: string): string {
	let repairedText = text;

	if (isTagOpen(repairedText, "think")) {
		repairedText += "</think>";
	}

	repairedText = repairedText.replace(
		/```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```/gi,
		(full, inner: string) => {
			const trimmed = String(inner ?? "").trim();
			if (/^\{\s*(?:"tool_calls"|'tool_calls'|tool_calls)\s*:/.test(trimmed)) {
				return trimmed;
			}
			return full;
		}
	);

	return repairedText;
}

/**
 * Extracts content within specific XML tags.
 * Handles cases where the tag might be unclosed (returns content up to end of string).
 */
export function extractTagContent(text: string, tagName: string): string | null {
	const openTag = `<${tagName}>`;
	const closeTag = `</${tagName}>`;

	const openIndex = text.indexOf(openTag);
	if (openIndex === -1) return null;

	const contentStart = openIndex + openTag.length;
	const closeIndex = text.indexOf(closeTag, contentStart);

	if (closeIndex === -1) {
		// Return everything after open tag if unclosed
		return text.slice(contentStart);
	}

	return text.slice(contentStart, closeIndex);
}
