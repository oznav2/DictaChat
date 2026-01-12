/**
 * Source Description Service
 *
 * Generates bilingual (Hebrew + English) descriptions for memory sources.
 * Used to provide context about where memories came from (tool results, conversations, etc.)
 */

// Source description generation - no external dependencies needed

/**
 * Source attribution data captured during tool execution
 */
export interface SourceAttribution {
	toolName: string;
	url: string | null;
	description?: { en: string; he: string };
	conversationId?: string;
	conversationTitle?: string;
	collectedAt: Date;
}

/**
 * Bilingual description result
 */
export interface BilingualDescription {
	en: string;
	he: string;
}

/**
 * Tool name mappings for bilingual descriptions
 */
const TOOL_NAME_LABELS: Record<string, { en: string; he: string }> = {
	perplexity_ask: { en: "Perplexity Research", he: "מחקר Perplexity" },
	"mcp__perplexity-ask__perplexity_ask": { en: "Perplexity Research", he: "מחקר Perplexity" },
	tavily_search: { en: "Tavily Search", he: "חיפוש Tavily" },
	"mcp__Tavily__tavily-search": { en: "Tavily Search", he: "חיפוש Tavily" },
	tavily_extract: { en: "Tavily Extract", he: "חילוץ Tavily" },
	"mcp__Tavily__tavily-extract": { en: "Tavily Extract", he: "חילוץ Tavily" },
	fetch: { en: "Web Fetch", he: "קריאת דף" },
	mcp__Fetch__fetch: { en: "Web Fetch", he: "קריאת דף" },
	firecrawl_scrape: { en: "Firecrawl Scrape", he: "גריפת Firecrawl" },
	"mcp__firecrawl-mcp__firecrawl_scrape": { en: "Firecrawl Scrape", he: "גריפת Firecrawl" },
	firecrawl_search: { en: "Firecrawl Search", he: "חיפוש Firecrawl" },
	"mcp__firecrawl-mcp__firecrawl_search": { en: "Firecrawl Search", he: "חיפוש Firecrawl" },
	datagov_query: { en: "DataGov Query", he: "שאילתת DataGov" },
	datagov_discover: { en: "DataGov Discover", he: "חיפוש DataGov" },
	mcp__GitHub__search_repositories: { en: "GitHub Search", he: "חיפוש GitHub" },
	mcp__GitHub__get_file_contents: { en: "GitHub File", he: "קובץ GitHub" },
	mcp__deepwiki__read_wiki_contents: { en: "DeepWiki", he: "DeepWiki" },
	mcp__deepwiki__ask_question: { en: "DeepWiki Ask", he: "שאלת DeepWiki" },
};

/**
 * Get tool label in specified language
 */
export function getToolLabel(toolName: string, lang: "en" | "he" = "he"): string {
	const labels = TOOL_NAME_LABELS[toolName];
	if (labels) {
		return lang === "he" ? labels.he : labels.en;
	}
	// Fallback: clean up the tool name
	const cleanName = toolName.replace(/^mcp__[^_]+__/, "").replace(/_/g, " ");
	return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
}

/**
 * Generate a simple bilingual description based on tool type and URL
 * This is a lightweight alternative to LLM generation for quick descriptions
 */
export function generateSimpleDescription(
	toolName: string,
	url: string | null
): BilingualDescription {
	const toolLabel = TOOL_NAME_LABELS[toolName] || { en: toolName, he: toolName };
	const domain = url ? extractDomain(url) : null;

	if (domain) {
		return {
			en: `Information retrieved from ${domain} using ${toolLabel.en}`,
			he: `מידע שנאסף מ-${domain} באמצעות ${toolLabel.he}`,
		};
	}

	return {
		en: `Information extracted using ${toolLabel.en}`,
		he: `מידע שנאסף באמצעות ${toolLabel.he}`,
	};
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string | null {
	try {
		return new URL(url).hostname.replace("www.", "");
	} catch {
		return null;
	}
}

/**
 * Extract URL from tool parameters
 * Handles various parameter naming conventions across tools
 */
export function extractUrlFromToolParams(params: Record<string, unknown>): string | null {
	// Common parameter names for URLs
	const urlKeys = ["url", "urls", "query_url", "source_url", "link", "href"];

	for (const key of urlKeys) {
		const val = params[key];
		if (val) {
			if (typeof val === "string" && val.startsWith("http")) {
				return val;
			}
			if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string") {
				return val[0];
			}
		}
	}

	return null;
}

/**
 * Create source attribution from tool execution
 */
export function createSourceAttribution(
	toolName: string,
	params: Record<string, unknown>,
	conversationId?: string,
	conversationTitle?: string
): SourceAttribution {
	const url = extractUrlFromToolParams(params);
	const description = generateSimpleDescription(toolName, url);

	return {
		toolName,
		url,
		description,
		conversationId,
		conversationTitle,
		collectedAt: new Date(),
	};
}

/**
 * Check if a tool should capture source attribution
 * Only research/fetch tools benefit from source tracking
 */
export function shouldCaptureSourceAttribution(toolName: string): boolean {
	const sourceCapturingTools = [
		"perplexity_ask",
		"mcp__perplexity-ask__perplexity_ask",
		"tavily_search",
		"mcp__Tavily__tavily-search",
		"tavily_extract",
		"mcp__Tavily__tavily-extract",
		"fetch",
		"mcp__Fetch__fetch",
		"firecrawl_scrape",
		"mcp__firecrawl-mcp__firecrawl_scrape",
		"firecrawl_search",
		"mcp__firecrawl-mcp__firecrawl_search",
		"datagov_query",
		"datagov_discover",
		"mcp__GitHub__search_repositories",
		"mcp__GitHub__get_file_contents",
		"mcp__deepwiki__read_wiki_contents",
		"mcp__deepwiki__ask_question",
	];

	return sourceCapturingTools.includes(toolName);
}

/**
 * Service class for managing source descriptions
 */
export class SourceDescriptionService {
	private static instance: SourceDescriptionService;

	static getInstance(): SourceDescriptionService {
		if (!this.instance) {
			this.instance = new SourceDescriptionService();
		}
		return this.instance;
	}

	/**
	 * Generate description for a tool result
	 */
	generateDescription(toolName: string, params: Record<string, unknown>): BilingualDescription {
		const url = extractUrlFromToolParams(params);
		return generateSimpleDescription(toolName, url);
	}

	/**
	 * Create full source attribution from tool execution context
	 */
	createAttribution(
		toolName: string,
		params: Record<string, unknown>,
		context?: { conversationId?: string; conversationTitle?: string }
	): SourceAttribution | null {
		if (!shouldCaptureSourceAttribution(toolName)) {
			return null;
		}

		return createSourceAttribution(
			toolName,
			params,
			context?.conversationId,
			context?.conversationTitle
		);
	}
}
