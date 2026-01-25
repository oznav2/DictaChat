/**
 * Citation Parser Utility
 *
 * Parses inline citations like [1], [2] from assistant responses
 * and provides formatting utilities for confidence colors and tier icons.
 */

import type { MemoryTier } from "$lib/server/memory/types";

/**
 * Represents a parsed citation from assistant response text
 */
export interface ParsedCitation {
	index: number; // [1], [2], etc.
	memoryId: string;
	tier: MemoryTier;
	confidence: number; // 0.0 - 1.0
	excerpt: string; // First 150 chars of memory content
	position: { start: number; end: number }; // Position in original text
}

/**
 * Citation metadata attached to memories during retrieval
 */
export interface CitationMetadata {
	memoryId: string;
	tier: MemoryTier;
	confidence: number;
	text: string;
	tags?: string[];
	wilsonScore?: number;
}

/**
 * Get Tailwind CSS color class based on confidence level
 * - Green (>=90%): High confidence, memory is very reliable
 * - Yellow (70-89%): Medium confidence, may need verification
 * - Orange (<70%): Low confidence, use with caution
 */
export function getConfidenceColor(confidence: number): string {
	if (confidence >= 0.9) return "text-green-500";
	if (confidence >= 0.7) return "text-yellow-500";
	return "text-orange-500";
}

/**
 * Get background color variant for citations
 */
export function getConfidenceBgColor(confidence: number): string {
	if (confidence >= 0.9) return "bg-green-500/20";
	if (confidence >= 0.7) return "bg-yellow-500/20";
	return "bg-orange-500/20";
}

/**
 * Get emoji icon for memory tier
 * Each tier has a distinct icon for quick visual identification
 */
export function getTierIcon(tier: MemoryTier | string): string {
	const icons: Record<string, string> = {
		documents: "📄",
		working: "💭",
		history: "🕐",
		patterns: "⚡",
		memory_bank: "🧠",
	};
	return icons[tier] || "📝";
}

/**
 * Get human-readable tier label
 */
export function getTierLabel(tier: MemoryTier | string): string {
	const labels: Record<string, string> = {
		documents: "Document",
		working: "Working Memory",
		history: "History",
		patterns: "Pattern",
		memory_bank: "Memory Bank",
	};
	return labels[tier] || tier;
}

/**
 * Parse citation markers [n] from text and extract their positions
 */
export function parseCitationMarkers(
	text: string
): Array<{ index: number; start: number; end: number }> {
	const citations: Array<{ index: number; start: number; end: number }> = [];
	const regex = /\[(\d+)\]/g;
	let match;

	while ((match = regex.exec(text)) !== null) {
		citations.push({
			index: parseInt(match[1], 10),
			start: match.index,
			end: match.index + match[0].length,
		});
	}

	return citations;
}

/**
 * Map citation markers to their corresponding memory metadata
 * @param text - The text containing [n] citation markers
 * @param memories - Array of memory metadata in order of citation
 * @returns Array of ParsedCitation objects with full details
 */
export function mapCitationsToMemories(
	text: string,
	memories: CitationMetadata[]
): ParsedCitation[] {
	const markers = parseCitationMarkers(text);
	const citations: ParsedCitation[] = [];

	for (const marker of markers) {
		// Citation indices are 1-based, array is 0-based
		const memoryIndex = marker.index - 1;
		if (memoryIndex >= 0 && memoryIndex < memories.length) {
			const memory = memories[memoryIndex];
			citations.push({
				index: marker.index,
				memoryId: memory.memoryId,
				tier: memory.tier,
				confidence: memory.confidence,
				excerpt: truncateText(memory.text, 150),
				position: { start: marker.start, end: marker.end },
			});
		}
	}

	return citations;
}

/**
 * Truncate text to specified length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength).trim() + "...";
}

/**
 * Replace citation markers with HTML spans for interactive rendering
 * @param text - Original text with [n] markers
 * @param citations - Parsed citations with metadata
 * @returns HTML string with citation spans
 */
export function renderCitationsAsHtml(text: string, citations: ParsedCitation[]): string {
	if (citations.length === 0) return text;

	// Sort citations by position in reverse order to replace from end to start
	const sortedCitations = [...citations].sort((a, b) => b.position.start - a.position.start);

	let result = text;
	for (const citation of sortedCitations) {
		const colorClass = getConfidenceColor(citation.confidence);
		const bgClass = getConfidenceBgColor(citation.confidence);
		const marker = `[${citation.index}]`;
		const replacement = `<span class="citation-marker ${colorClass} ${bgClass} cursor-pointer rounded px-0.5 hover:opacity-80" data-citation-index="${citation.index}" data-memory-id="${citation.memoryId}" title="${getTierIcon(citation.tier)} ${getTierLabel(citation.tier)} - ${Math.round(citation.confidence * 100)}%">${marker}</span>`;

		result =
			result.slice(0, citation.position.start) + replacement + result.slice(citation.position.end);
	}

	return result;
}

/**
 * Check if text contains any citation markers
 */
export function hasCitations(text: string): boolean {
	return /\[\d+\]/.test(text);
}

/**
 * Get unique citation indices from text
 */
export function getUniqueCitationIndices(text: string): number[] {
	const markers = parseCitationMarkers(text);
	const indices = new Set(markers.map((m) => m.index));
	return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Format confidence as percentage string
 */
export function formatConfidence(confidence: number): string {
	return `${Math.round(confidence * 100)}%`;
}

/**
 * Generate citation summary for display
 */
export function generateCitationSummary(citations: ParsedCitation[]): string {
	if (citations.length === 0) return "";
	if (citations.length === 1) return "1 source";
	return `${citations.length} sources`;
}
