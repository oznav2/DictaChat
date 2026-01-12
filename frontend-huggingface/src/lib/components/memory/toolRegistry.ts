/**
 * Tool Registry - Maps MCP tool names to display labels and icons
 * Supports bilingual display (Hebrew + English)
 */

export interface ToolDisplayInfo {
	name: string;
	labelEn: string;
	labelHe: string;
	icon: string;
	color: string;
	category: "search" | "fetch" | "research" | "data" | "compute" | "file";
}

export const TOOL_REGISTRY: Record<string, ToolDisplayInfo> = {
	// Research Tools
	perplexity_ask: {
		name: "perplexity_ask",
		labelEn: "Perplexity Research",
		labelHe: "מחקר Perplexity",
		icon: "🔍",
		color: "bg-purple-500",
		category: "research",
	},
	"mcp__perplexity-ask__perplexity_ask": {
		name: "perplexity_ask",
		labelEn: "Perplexity Research",
		labelHe: "מחקר Perplexity",
		icon: "🔍",
		color: "bg-purple-500",
		category: "research",
	},

	// Search Tools
	tavily_search: {
		name: "tavily_search",
		labelEn: "Tavily Search",
		labelHe: "חיפוש Tavily",
		icon: "🌐",
		color: "bg-blue-500",
		category: "search",
	},
	"mcp__Tavily__tavily-search": {
		name: "tavily_search",
		labelEn: "Tavily Search",
		labelHe: "חיפוש Tavily",
		icon: "🌐",
		color: "bg-blue-500",
		category: "search",
	},
	tavily_extract: {
		name: "tavily_extract",
		labelEn: "Tavily Extract",
		labelHe: "חילוץ Tavily",
		icon: "📄",
		color: "bg-blue-400",
		category: "fetch",
	},
	"mcp__Tavily__tavily-extract": {
		name: "tavily_extract",
		labelEn: "Tavily Extract",
		labelHe: "חילוץ Tavily",
		icon: "📄",
		color: "bg-blue-400",
		category: "fetch",
	},

	// Fetch Tools
	fetch: {
		name: "fetch",
		labelEn: "Web Fetch",
		labelHe: "קריאת דף",
		icon: "📥",
		color: "bg-green-500",
		category: "fetch",
	},
	mcp__Fetch__fetch: {
		name: "fetch",
		labelEn: "Web Fetch",
		labelHe: "קריאת דף",
		icon: "📥",
		color: "bg-green-500",
		category: "fetch",
	},

	// Firecrawl Tools
	firecrawl_scrape: {
		name: "firecrawl_scrape",
		labelEn: "Firecrawl Scrape",
		labelHe: "גריפת Firecrawl",
		icon: "🔥",
		color: "bg-orange-500",
		category: "fetch",
	},
	"mcp__firecrawl-mcp__firecrawl_scrape": {
		name: "firecrawl_scrape",
		labelEn: "Firecrawl Scrape",
		labelHe: "גריפת Firecrawl",
		icon: "🔥",
		color: "bg-orange-500",
		category: "fetch",
	},
	firecrawl_search: {
		name: "firecrawl_search",
		labelEn: "Firecrawl Search",
		labelHe: "חיפוש Firecrawl",
		icon: "🔥",
		color: "bg-orange-400",
		category: "search",
	},
	"mcp__firecrawl-mcp__firecrawl_search": {
		name: "firecrawl_search",
		labelEn: "Firecrawl Search",
		labelHe: "חיפוש Firecrawl",
		icon: "🔥",
		color: "bg-orange-400",
		category: "search",
	},

	// DataGov Tools
	datagov_query: {
		name: "datagov_query",
		labelEn: "DataGov Query",
		labelHe: "שאילתת DataGov",
		icon: "🏛️",
		color: "bg-cyan-500",
		category: "data",
	},
	datagov_discover: {
		name: "datagov_discover",
		labelEn: "DataGov Discover",
		labelHe: "חיפוש DataGov",
		icon: "🗂️",
		color: "bg-cyan-400",
		category: "data",
	},

	// GitHub Tools
	mcp__GitHub__search_repositories: {
		name: "github_search",
		labelEn: "GitHub Search",
		labelHe: "חיפוש GitHub",
		icon: "🐙",
		color: "bg-gray-600",
		category: "search",
	},
	mcp__GitHub__get_file_contents: {
		name: "github_file",
		labelEn: "GitHub File",
		labelHe: "קובץ GitHub",
		icon: "📁",
		color: "bg-gray-500",
		category: "file",
	},

	// Filesystem Tools
	mcp__Filesystem__read_text_file: {
		name: "filesystem_read",
		labelEn: "File Read",
		labelHe: "קריאת קובץ",
		icon: "📖",
		color: "bg-amber-500",
		category: "file",
	},

	// DeepWiki Tools
	mcp__deepwiki__read_wiki_contents: {
		name: "deepwiki",
		labelEn: "DeepWiki",
		labelHe: "DeepWiki",
		icon: "📚",
		color: "bg-indigo-500",
		category: "research",
	},
	mcp__deepwiki__ask_question: {
		name: "deepwiki_ask",
		labelEn: "DeepWiki Ask",
		labelHe: "שאלת DeepWiki",
		icon: "❓",
		color: "bg-indigo-400",
		category: "research",
	},

	// Memory Tools
	"mcp__ken-you-remember__remember": {
		name: "memory_store",
		labelEn: "Memory Store",
		labelHe: "שמירה בזיכרון",
		icon: "🧠",
		color: "bg-pink-500",
		category: "compute",
	},
	"mcp__ken-you-remember__recall": {
		name: "memory_recall",
		labelEn: "Memory Recall",
		labelHe: "שליפת זיכרון",
		icon: "💭",
		color: "bg-pink-400",
		category: "compute",
	},

	// Conversation (manual input)
	conversation: {
		name: "conversation",
		labelEn: "Conversation",
		labelHe: "שיחה",
		icon: "💬",
		color: "bg-violet-500",
		category: "compute",
	},

	// Manual/Upload
	upload: {
		name: "upload",
		labelEn: "File Upload",
		labelHe: "העלאת קובץ",
		icon: "📤",
		color: "bg-teal-500",
		category: "file",
	},

	// Default fallback
	unknown: {
		name: "unknown",
		labelEn: "Unknown Source",
		labelHe: "מקור לא ידוע",
		icon: "❓",
		color: "bg-gray-500",
		category: "search",
	},
};

/**
 * Get display info for a tool by name
 */
export function getToolInfo(toolName: string | null | undefined): ToolDisplayInfo {
	if (!toolName) return TOOL_REGISTRY.unknown;
	return TOOL_REGISTRY[toolName] || TOOL_REGISTRY.unknown;
}

/**
 * Get tool label in specified language
 */
export function getToolLabel(
	toolName: string | null | undefined,
	lang: "he" | "en" = "he"
): string {
	const info = getToolInfo(toolName);
	return lang === "he" ? info.labelHe : info.labelEn;
}

/**
 * Get category color for grouping
 */
export function getCategoryColor(category: ToolDisplayInfo["category"]): string {
	const colors: Record<string, string> = {
		search: "text-blue-400",
		fetch: "text-green-400",
		research: "text-purple-400",
		data: "text-cyan-400",
		compute: "text-pink-400",
		file: "text-amber-400",
	};
	return colors[category] || "text-gray-400";
}
