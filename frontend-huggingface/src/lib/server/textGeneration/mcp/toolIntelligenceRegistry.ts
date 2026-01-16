/**
 * Tool Intelligence Registry
 *
 * Enterprise-grade metadata for ALL MCP tools including:
 * - Latency characteristics (for progress indicators)
 * - Response characteristics (for token management)
 * - Fallback chains (for cascade retries)
 * - Intent signals (for intelligent selection)
 * - User-friendly messages (NEVER show raw errors)
 *
 * CRITICAL UX REQUIREMENT:
 * Users should NEVER see raw errors. Always provide:
 * - Meaningful guidance
 * - Suggestions for improving their query
 * - Graceful fallback to alternative tools
 */

import { logger } from "../../logger";

export const INGESTIBLE_TOOL_CATEGORIES = ["search", "research", "data", "document"] as const;

// ============================================================================
// Type Definitions
// ============================================================================

export type LatencyTier = "fast" | "medium" | "slow" | "very_slow";

export interface ToolLatency {
	/** Expected response time in milliseconds */
	typical: number;
	/** Maximum wait before timeout */
	timeout: number;
	/** Show progress indicator after this delay */
	userFeedbackDelay: number;
	/** Latency tier for categorization */
	tier: LatencyTier;
}

export interface ToolResponse {
	/** Expected output size in tokens (approximate) */
	typicalTokens: number;
	/** Truncate output if exceeds this */
	maxTokens: number;
	/** Returns structured JSON vs plain text */
	structured: boolean;
	/** Needs post-processing summarization */
	requiresSummarization: boolean;
}

export interface ToolMessages {
	/** Progress message shown during execution */
	progress: string;
	/** Message when tool succeeds but returns no results */
	noResults: string;
	/** Suggestion for improving the query */
	suggestion: string;
	/** Graceful message when all fallbacks fail */
	gracefulFailure: string;
}

export interface ToolIntelligence {
	/** Tool name (canonical form) */
	name: string;
	/** Regex patterns to match tool name variants */
	patterns: RegExp[];
	/** MCP server this tool belongs to */
	mcpServer: string;
	/** Display name for user-facing messages */
	displayName: string;

	/** Priority score (0-100, higher = better) */
	priority: number;
	/** Fallback chain - tools to try if this one fails */
	fallbackChain: string[];
	/** Tools that conflict (exclude when this is selected) */
	conflictsWith: string[];

	/** Latency characteristics */
	latency: ToolLatency;
	/** Response characteristics */
	response: ToolResponse;
	/** User-friendly messages */
	messages: ToolMessages;

	/** Intent signals for scoring */
	intentSignals: {
		/** Keywords that indicate this tool should be used */
		keywords: RegExp;
		/** Score boost when keywords match */
		weight: number;
		/** If true, use ONLY this tool when matched (no alternatives) */
		exclusive?: boolean;
	};
}

// ============================================================================
// Tool Intelligence Definitions
// ============================================================================

const TOOL_INTELLIGENCE: ToolIntelligence[] = [
	// =========================================================================
	// DATAGOV TOOLS (Israeli Government Data)
	// =========================================================================
	{
		name: "datagov_query",
		patterns: [/^datagov[_-]query$/i],
		mcpServer: "datagov",
		displayName: "Israel Government Data",
		priority: 95,
		fallbackChain: ["perplexity-search", "tavily-search"],
		conflictsWith: [],
		latency: {
			typical: 5000,
			timeout: 60000,
			userFeedbackDelay: 1000,
			tier: "medium",
		},
		response: {
			typicalTokens: 2000,
			maxTokens: 15000,
			structured: true,
			requiresSummarization: false,
		},
		messages: {
			progress: "מחפש במאגרי המידע הממשלתיים...",
			noResults: "לא נמצאו תוצאות במאגרים הרשמיים. נסה לנסח את השאלה בצורה שונה.",
			suggestion: "נסה לציין את שם המשרד או הגוף הממשלתי הרלוונטי",
			gracefulFailure: "המאגרים הממשלתיים אינם זמינים כעת. הנה מידע ממקורות אחרים:",
		},
		intentSignals: {
			keywords:
				/מאגר(?:ים)?\s*רשמי|נתונים\s*ממשלתי|data\.gov|לשכת הסטטיסטיקה|משרד ה|רישוי|עסקים|רשויות|עיריות|בית חולים|בתי חולים|רכב חשמלי|כמה רכבים|סטטיסטיקה רשמית/i,
			weight: 100,
			exclusive: true,
		},
	},
	{
		name: "datastore_search",
		patterns: [/^datastore[_-]search$/i],
		mcpServer: "datagov",
		displayName: "DataGov Resource Search",
		priority: 80,
		fallbackChain: ["datagov_query"],
		conflictsWith: [],
		latency: {
			typical: 3000,
			timeout: 30000,
			userFeedbackDelay: 1000,
			tier: "medium",
		},
		response: {
			typicalTokens: 1500,
			maxTokens: 10000,
			structured: true,
			requiresSummarization: false,
		},
		messages: {
			progress: "מחפש במשאב הנתונים...",
			noResults: "לא נמצאו רשומות במשאב זה.",
			suggestion: "וודא שמזהה המשאב נכון",
			gracefulFailure: "לא ניתן לגשת למשאב כעת.",
		},
		intentSignals: {
			keywords: /resource_id|datastore/i,
			weight: 50,
		},
	},

	// =========================================================================
	// PERPLEXITY TOOLS (Research & AI Search)
	// =========================================================================
	{
		name: "perplexity-research",
		patterns: [/^perplexity[_-]research$/i],
		mcpServer: "perplexity",
		displayName: "Perplexity Deep Research",
		priority: 100,
		fallbackChain: ["perplexity-ask", "tavily-search"],
		conflictsWith: ["perplexity-ask", "perplexity-search", "perplexity-reason", "tavily-search"],
		latency: {
			typical: 120000,
			timeout: 300000,
			userFeedbackDelay: 2000,
			tier: "very_slow",
		},
		response: {
			typicalTokens: 4000,
			maxTokens: 8000,
			structured: false,
			requiresSummarization: false,
		},
		messages: {
			progress: "מבצע מחקר מעמיק עם Perplexity...",
			noResults: "המחקר לא הניב תוצאות. נסה לנסח שאלה ממוקדת יותר.",
			suggestion: "נסה לשאול שאלה ספציפית עם הקשר ברור",
			gracefulFailure: "שירות המחקר אינו זמין כעת. הנה תשובה מקוצרת:",
		},
		intentSignals: {
			keywords:
				/מחקר|לחקור|ניתוח מעמיק|research|deep dive|in-depth|comprehensive|לעומק|מקיף|מפורט|תקציר|תמצית|סיכום/i,
			weight: 100,
		},
	},
	{
		name: "perplexity-ask",
		patterns: [/^perplexity[_-]ask$/i],
		mcpServer: "perplexity",
		displayName: "Perplexity Q&A",
		priority: 95,
		fallbackChain: ["perplexity-search", "tavily-search"],
		conflictsWith: [
			"perplexity-research",
			"perplexity-search",
			"perplexity-reason",
			"tavily-search",
		],
		latency: {
			typical: 15000,
			timeout: 120000,
			userFeedbackDelay: 2000,
			tier: "slow",
		},
		response: {
			typicalTokens: 2000,
			maxTokens: 6000,
			structured: false,
			requiresSummarization: false,
		},
		messages: {
			progress: "מחפש תשובה עם Perplexity...",
			noResults: "לא נמצאה תשובה מתאימה.",
			suggestion: "נסה לנסח את השאלה בצורה ברורה יותר",
			gracefulFailure: "שירות החיפוש אינו זמין כעת.",
		},
		intentSignals: {
			keywords: /הסבר|ספר לי|מה זה|מהו|איך עובד|tell me|explain|what is|how does/i,
			weight: 90,
		},
	},
	{
		name: "perplexity-search",
		patterns: [/^perplexity[_-]search$/i],
		mcpServer: "perplexity",
		displayName: "Perplexity Search",
		priority: 90,
		fallbackChain: ["tavily-search"],
		conflictsWith: ["perplexity-research", "perplexity-ask", "perplexity-reason", "tavily-search"],
		latency: {
			typical: 8000,
			timeout: 60000,
			userFeedbackDelay: 1500,
			tier: "medium",
		},
		response: {
			typicalTokens: 1500,
			maxTokens: 5000,
			structured: false,
			requiresSummarization: false,
		},
		messages: {
			progress: "מחפש ברשת עם Perplexity...",
			noResults: "לא נמצאו תוצאות רלוונטיות.",
			suggestion: "נסה מילות מפתח שונות",
			gracefulFailure: "החיפוש נכשל. מנסה מקור חלופי...",
		},
		intentSignals: {
			keywords: /חפש|מצא|search|find|look up|חדשות|news|עדכון/i,
			weight: 80,
		},
	},
	{
		name: "perplexity-reason",
		patterns: [/^perplexity[_-]reason$/i],
		mcpServer: "perplexity",
		displayName: "Perplexity Reasoning",
		priority: 85,
		fallbackChain: ["perplexity-ask"],
		conflictsWith: ["perplexity-research", "perplexity-ask", "perplexity-search", "tavily-search"],
		latency: {
			typical: 30000,
			timeout: 180000,
			userFeedbackDelay: 2000,
			tier: "slow",
		},
		response: {
			typicalTokens: 3000,
			maxTokens: 7000,
			structured: false,
			requiresSummarization: false,
		},
		messages: {
			progress: "מנתח ומסיק מסקנות...",
			noResults: "לא ניתן להסיק מסקנות מהנתונים הזמינים.",
			suggestion: "נסה לספק יותר הקשר או נתונים",
			gracefulFailure: "הניתוח נכשל. הנה תשובה ישירה:",
		},
		intentSignals: {
			keywords: /נמק|הוכח|צעד אחר צעד|step by step|reason|logic|prove|analyze/i,
			weight: 85,
		},
	},

	// =========================================================================
	// TAVILY TOOLS (Web Search)
	// =========================================================================
	{
		name: "tavily-search",
		patterns: [/^tavily[_-]search$/i],
		mcpServer: "Tavily",
		displayName: "Tavily Web Search",
		priority: 85,
		fallbackChain: ["perplexity-search", "fetch"],
		conflictsWith: [],
		latency: {
			typical: 3000,
			timeout: 30000,
			userFeedbackDelay: 1000,
			tier: "medium",
		},
		response: {
			typicalTokens: 1500,
			maxTokens: 8000,
			structured: true,
			requiresSummarization: true,
		},
		messages: {
			progress: "מחפש ברשת...",
			noResults: "לא נמצאו תוצאות חיפוש.",
			suggestion: "נסה לחפש עם מילים שונות או באנגלית",
			gracefulFailure: "החיפוש נכשל. נסה שוב מאוחר יותר.",
		},
		intentSignals: {
			keywords: /חפש באינטרנט|search online|web search|google/i,
			weight: 70,
		},
	},
	{
		name: "tavily-extract",
		patterns: [/^tavily[_-]extract$/i],
		mcpServer: "Tavily",
		displayName: "Tavily Content Extractor",
		priority: 80,
		fallbackChain: ["fetch"],
		conflictsWith: [],
		latency: {
			typical: 5000,
			timeout: 45000,
			userFeedbackDelay: 1500,
			tier: "medium",
		},
		response: {
			typicalTokens: 2000,
			maxTokens: 10000,
			structured: true,
			requiresSummarization: true,
		},
		messages: {
			progress: "מחלץ תוכן מהדף...",
			noResults: "לא ניתן לחלץ תוכן מהכתובת.",
			suggestion: "וודא שהכתובת נכונה ונגישה",
			gracefulFailure: "לא ניתן לגשת לתוכן הדף.",
		},
		intentSignals: {
			keywords: /extract|חלץ|תוכן מ|content from/i,
			weight: 60,
		},
	},

	// =========================================================================
	// FILESYSTEM TOOLS
	// =========================================================================
	{
		name: "read_file",
		patterns: [/^read[_-]file$/i],
		mcpServer: "filesystem",
		displayName: "File Reader",
		priority: 80,
		fallbackChain: [],
		conflictsWith: [],
		latency: {
			typical: 500,
			timeout: 10000,
			userFeedbackDelay: 500,
			tier: "fast",
		},
		response: {
			typicalTokens: 1000,
			maxTokens: 20000,
			structured: false,
			requiresSummarization: false,
		},
		messages: {
			progress: "קורא קובץ...",
			noResults: "הקובץ ריק או לא נמצא.",
			suggestion: "וודא שנתיב הקובץ נכון",
			gracefulFailure: "לא ניתן לקרוא את הקובץ.",
		},
		intentSignals: {
			keywords: /קרא קובץ|read file|open file|תוכן קובץ/i,
			weight: 90,
		},
	},
	{
		name: "write_file",
		patterns: [/^write[_-]file$/i],
		mcpServer: "filesystem",
		displayName: "File Writer",
		priority: 80,
		fallbackChain: [],
		conflictsWith: [],
		latency: {
			typical: 500,
			timeout: 10000,
			userFeedbackDelay: 500,
			tier: "fast",
		},
		response: {
			typicalTokens: 100,
			maxTokens: 500,
			structured: false,
			requiresSummarization: false,
		},
		messages: {
			progress: "כותב לקובץ...",
			noResults: "הכתיבה הושלמה.",
			suggestion: "וודא שיש הרשאות כתיבה",
			gracefulFailure: "לא ניתן לכתוב לקובץ.",
		},
		intentSignals: {
			keywords: /כתוב לקובץ|write file|save file|שמור קובץ/i,
			weight: 90,
		},
	},
	{
		name: "list_directory",
		patterns: [/^list[_-]directory$/i, /^ls$/i],
		mcpServer: "filesystem",
		displayName: "Directory Listing",
		priority: 75,
		fallbackChain: [],
		conflictsWith: [],
		latency: {
			typical: 300,
			timeout: 5000,
			userFeedbackDelay: 300,
			tier: "fast",
		},
		response: {
			typicalTokens: 500,
			maxTokens: 5000,
			structured: true,
			requiresSummarization: false,
		},
		messages: {
			progress: "קורא תיקייה...",
			noResults: "התיקייה ריקה.",
			suggestion: "וודא שנתיב התיקייה נכון",
			gracefulFailure: "לא ניתן לקרוא את התיקייה.",
		},
		intentSignals: {
			keywords: /הצג תיקייה|list directory|show folder|קבצים בתיקייה/i,
			weight: 80,
		},
	},

	// =========================================================================
	// GIT TOOLS
	// =========================================================================
	{
		name: "git_status",
		patterns: [/^git[_-]status$/i],
		mcpServer: "git",
		displayName: "Git Status",
		priority: 80,
		fallbackChain: [],
		conflictsWith: [],
		latency: {
			typical: 1000,
			timeout: 10000,
			userFeedbackDelay: 500,
			tier: "fast",
		},
		response: {
			typicalTokens: 300,
			maxTokens: 2000,
			structured: false,
			requiresSummarization: false,
		},
		messages: {
			progress: "בודק סטטוס Git...",
			noResults: "אין שינויים.",
			suggestion: "וודא שאתה בתוך מאגר Git",
			gracefulFailure: "לא ניתן לבדוק סטטוס Git.",
		},
		intentSignals: {
			keywords: /git status|סטטוס גיט|שינויים ב-git/i,
			weight: 90,
		},
	},
	{
		name: "git_log",
		patterns: [/^git[_-]log$/i],
		mcpServer: "git",
		displayName: "Git History",
		priority: 75,
		fallbackChain: [],
		conflictsWith: [],
		latency: {
			typical: 1000,
			timeout: 10000,
			userFeedbackDelay: 500,
			tier: "fast",
		},
		response: {
			typicalTokens: 500,
			maxTokens: 3000,
			structured: false,
			requiresSummarization: false,
		},
		messages: {
			progress: "קורא היסטוריית Git...",
			noResults: "אין היסטוריה.",
			suggestion: "וודא שיש קומיטים במאגר",
			gracefulFailure: "לא ניתן לקרוא היסטוריה.",
		},
		intentSignals: {
			keywords: /git log|היסטוריית קומיטים|commit history/i,
			weight: 80,
		},
	},

	// =========================================================================
	// TIME TOOLS
	// =========================================================================
	{
		name: "get_current_time",
		patterns: [/^get[_-]current[_-]time$/i, /^time$/i],
		mcpServer: "time",
		displayName: "Current Time",
		priority: 70,
		fallbackChain: [],
		conflictsWith: [],
		latency: {
			typical: 100,
			timeout: 5000,
			userFeedbackDelay: 0,
			tier: "fast",
		},
		response: {
			typicalTokens: 50,
			maxTokens: 200,
			structured: true,
			requiresSummarization: false,
		},
		messages: {
			progress: "בודק שעה...",
			noResults: "לא ניתן לקבל את השעה.",
			suggestion: "נסה שוב",
			gracefulFailure: "שירות הזמן אינו זמין.",
		},
		intentSignals: {
			keywords: /מה השעה|what time|current time|שעה עכשיו/i,
			weight: 100,
			exclusive: true,
		},
	},

	// =========================================================================
	// FETCH TOOL
	// =========================================================================
	{
		name: "fetch",
		patterns: [/^fetch$/i],
		mcpServer: "fetch",
		displayName: "Web Fetch",
		priority: 70,
		fallbackChain: [],
		conflictsWith: [],
		latency: {
			typical: 3000,
			timeout: 30000,
			userFeedbackDelay: 1000,
			tier: "medium",
		},
		response: {
			typicalTokens: 2000,
			maxTokens: 15000,
			structured: false,
			requiresSummarization: true,
		},
		messages: {
			progress: "מביא תוכן מהאינטרנט...",
			noResults: "לא ניתן לגשת לכתובת.",
			suggestion: "וודא שהכתובת נכונה ונגישה",
			gracefulFailure: "לא ניתן לגשת לדף.",
		},
		intentSignals: {
			keywords: /הבא מ|fetch from|get url|קרא דף/i,
			weight: 60,
		},
	},

	// =========================================================================
	// YOUTUBE SUMMARIZER
	// =========================================================================
	{
		name: "get-video-info-for-summary-from-url",
		patterns: [/^get[_-]video[_-]info/i, /youtube.*summar/i],
		mcpServer: "youtube-video-summarizer",
		displayName: "YouTube Summarizer",
		priority: 85,
		fallbackChain: ["fetch"],
		conflictsWith: [],
		latency: {
			typical: 15000,
			timeout: 60000,
			userFeedbackDelay: 2000,
			tier: "slow",
		},
		response: {
			typicalTokens: 2000,
			maxTokens: 8000,
			structured: true,
			requiresSummarization: false,
		},
		messages: {
			progress: "מסכם סרטון YouTube...",
			noResults: "לא ניתן לסכם את הסרטון.",
			suggestion: "וודא שהקישור ליוטיוב תקין",
			gracefulFailure: "לא ניתן לגשת לסרטון.",
		},
		intentSignals: {
			keywords: /סכם סרטון|youtube|summarize video|יוטיוב|וידאו/i,
			weight: 95,
			exclusive: true,
		},
	},

	// =========================================================================
	// SEQUENTIAL THINKING
	// =========================================================================
	{
		name: "sequentialthinking",
		patterns: [/^sequentialthinking$/i, /^sequential[_-]thinking$/i],
		mcpServer: "sequential-thinking",
		displayName: "Step-by-Step Reasoning",
		priority: 95,
		fallbackChain: ["perplexity-reason"],
		conflictsWith: [],
		latency: {
			typical: 10000,
			timeout: 60000,
			userFeedbackDelay: 2000,
			tier: "slow",
		},
		response: {
			typicalTokens: 1500,
			maxTokens: 5000,
			structured: true,
			requiresSummarization: false,
		},
		messages: {
			progress: "חושב צעד אחר צעד...",
			noResults: "לא ניתן להגיע למסקנה.",
			suggestion: "נסה לפרק את הבעיה לחלקים קטנים יותר",
			gracefulFailure: "הניתוח נכשל.",
		},
		intentSignals: {
			keywords: /צעד אחר צעד|step by step|חשוב על זה|think through|reason through/i,
			weight: 90,
		},
	},

	// =========================================================================
	// DOCLING TOOLS (Document Processing)
	// =========================================================================
	{
		name: "docling_convert",
		patterns: [/^docling[_-]?convert$/i, /^convert[_-]?document$/i],
		mcpServer: "docling",
		displayName: "Document Converter",
		priority: 88,
		// NOTE: fetch removed from fallback - it expects URLs, not file paths
		// If standard pipeline fails, try OCR mode as last resort
		fallbackChain: ["docling_ocr"],
		conflictsWith: [],
		latency: {
			typical: 5000,
			timeout: 300000,
			userFeedbackDelay: 2000,
			tier: "slow",
		},
		response: {
			typicalTokens: 5000,
			maxTokens: 50000,
			structured: false,
			requiresSummarization: true,
		},
		messages: {
			progress: "מעבד את המסמך...",
			noResults: "לא ניתן לעבד את המסמך. ודא שהקובץ תקין.",
			suggestion: "נסה פורמט אחר או ודא שהמסמך לא פגום",
			gracefulFailure: "עיבוד המסמך נכשל. הנה מידע חלקי:",
		},
		intentSignals: {
			keywords: /convert|document|pdf|docx|המר|מסמך|קובץ|וורד/i,
			weight: 90,
		},
	},
	{
		name: "docling_convert_url",
		patterns: [/^docling[_-]?convert[_-]?url$/i],
		mcpServer: "docling",
		displayName: "URL Document Converter",
		priority: 85,
		// NOTE: docling_convert removed - it expects file paths, not URLs
		// fetch is valid fallback since both work with URLs
		fallbackChain: ["fetch"],
		conflictsWith: [],
		latency: {
			typical: 8000,
			timeout: 300000,
			userFeedbackDelay: 2000,
			tier: "slow",
		},
		response: {
			typicalTokens: 5000,
			maxTokens: 50000,
			structured: false,
			requiresSummarization: true,
		},
		messages: {
			progress: "מוריד ומעבד מסמך מהאינטרנט...",
			noResults: "לא ניתן לעבד את המסמך מהכתובת.",
			suggestion: "ודא שהכתובת נכונה והמסמך נגיש",
			gracefulFailure: "לא ניתן לגשת למסמך.",
		},
		intentSignals: {
			keywords: /convert.*url|המר.*קישור|מסמך.*מ.*http/i,
			weight: 85,
		},
	},
	{
		name: "docling_extract_tables",
		patterns: [/^docling[_-]?extract[_-]?tables$/i, /^extract[_-]?tables$/i],
		mcpServer: "docling",
		displayName: "Table Extractor",
		priority: 92,
		fallbackChain: ["docling_convert"],
		conflictsWith: [],
		latency: {
			typical: 3000,
			timeout: 120000,
			userFeedbackDelay: 1500,
			tier: "medium",
		},
		response: {
			typicalTokens: 3000,
			maxTokens: 30000,
			structured: true,
			requiresSummarization: false,
		},
		messages: {
			progress: "מחלץ טבלאות מהמסמך...",
			noResults: "לא נמצאו טבלאות במסמך.",
			suggestion: "ודא שהמסמך מכיל טבלאות בפורמט מובנה",
			gracefulFailure: "לא ניתן לחלץ טבלאות מהמסמך.",
		},
		intentSignals: {
			keywords: /table|טבלה|extract.*table|חלץ.*טבל|הוצא.*טבל/i,
			weight: 95,
		},
	},
	{
		name: "docling_extract_images",
		patterns: [/^docling[_-]?extract[_-]?images$/i],
		mcpServer: "docling",
		displayName: "Image Extractor",
		priority: 85,
		fallbackChain: ["docling_convert"],
		conflictsWith: [],
		latency: {
			typical: 4000,
			timeout: 180000,
			userFeedbackDelay: 2000,
			tier: "medium",
		},
		response: {
			typicalTokens: 2000,
			maxTokens: 20000,
			structured: true,
			requiresSummarization: false,
		},
		messages: {
			progress: "מחלץ תמונות מהמסמך...",
			noResults: "לא נמצאו תמונות במסמך.",
			suggestion: "ודא שהמסמך מכיל תמונות",
			gracefulFailure: "לא ניתן לחלץ תמונות.",
		},
		intentSignals: {
			keywords: /image|תמונה|extract.*image|חלץ.*תמונ/i,
			weight: 90,
		},
	},
	{
		name: "docling_ocr",
		patterns: [/^docling[_-]?ocr$/i, /^ocr$/i],
		mcpServer: "docling",
		displayName: "OCR Scanner",
		priority: 90,
		fallbackChain: ["docling_convert"],
		conflictsWith: [],
		latency: {
			typical: 10000,
			timeout: 300000,
			userFeedbackDelay: 3000,
			tier: "slow",
		},
		response: {
			typicalTokens: 4000,
			maxTokens: 40000,
			structured: false,
			requiresSummarization: false,
		},
		messages: {
			progress: "מזהה טקסט במסמך הסרוק...",
			noResults: "לא זוהה טקסט במסמך.",
			suggestion: "ודא שהתמונה ברורה ובאיכות טובה",
			gracefulFailure: "זיהוי הטקסט נכשל.",
		},
		intentSignals: {
			keywords: /ocr|scan|סרוק|זהה.*טקסט|recognize.*text|זיהוי\s*תווים/i,
			weight: 95,
		},
	},
	{
		name: "docling_list_formats",
		patterns: [/^docling[_-]?list[_-]?formats$/i],
		mcpServer: "docling",
		displayName: "Format Lister",
		priority: 50,
		fallbackChain: [],
		conflictsWith: [],
		latency: {
			typical: 100,
			timeout: 5000,
			userFeedbackDelay: 500,
			tier: "fast",
		},
		response: {
			typicalTokens: 200,
			maxTokens: 500,
			structured: true,
			requiresSummarization: false,
		},
		messages: {
			progress: "מביא רשימת פורמטים נתמכים...",
			noResults: "לא ניתן לקבל רשימת פורמטים.",
			suggestion: "נסה שוב",
			gracefulFailure: "שירות Docling אינו זמין.",
		},
		intentSignals: {
			keywords: /format|פורמט|supported|נתמך|list.*format/i,
			weight: 70,
		},
	},
	{
		name: "docling_analyze",
		patterns: [/^docling[_-]?analyze$/i],
		mcpServer: "docling",
		displayName: "Document Analyzer",
		priority: 80,
		fallbackChain: ["docling_convert"],
		conflictsWith: [],
		latency: {
			typical: 2000,
			timeout: 30000,
			userFeedbackDelay: 1000,
			tier: "medium",
		},
		response: {
			typicalTokens: 500,
			maxTokens: 2000,
			structured: true,
			requiresSummarization: false,
		},
		messages: {
			progress: "מנתח את המסמך...",
			noResults: "לא ניתן לנתח את המסמך.",
			suggestion: "ודא שהקובץ תקין",
			gracefulFailure: "ניתוח המסמך נכשל.",
		},
		intentSignals: {
			keywords: /analyze|נתח|בדוק.*מסמך|check.*document/i,
			weight: 75,
		},
	},
];

// ============================================================================
// Registry Access Functions
// ============================================================================

/**
 * Get intelligence for a specific tool by name
 */
export function getToolIntelligence(toolName: string): ToolIntelligence | undefined {
	const lowerName = toolName.toLowerCase();
	return TOOL_INTELLIGENCE.find(
		(ti) => ti.name.toLowerCase() === lowerName || ti.patterns.some((p) => p.test(toolName))
	);
}

/**
 * Get fallback chain for a tool
 */
export function getFallbackChain(toolName: string): string[] {
	const ti = getToolIntelligence(toolName);
	return ti?.fallbackChain || [];
}

/**
 * Get user-friendly progress message
 */
export function getProgressMessage(toolName: string): string {
	const ti = getToolIntelligence(toolName);
	return ti?.messages.progress || "מעבד...";
}

/**
 * Get graceful failure message (NEVER show raw errors)
 */
export function getGracefulFailureMessage(toolName: string): string {
	const ti = getToolIntelligence(toolName);
	return ti?.messages.gracefulFailure || "הפעולה נכשלה. נסה שוב מאוחר יותר.";
}

/**
 * Get suggestion for improving query
 */
export function getQuerySuggestion(toolName: string): string {
	const ti = getToolIntelligence(toolName);
	return ti?.messages.suggestion || "נסה לנסח את השאלה בצורה שונה";
}

/**
 * Get latency tier for a tool
 */
export function getLatencyTier(toolName: string): LatencyTier {
	const ti = getToolIntelligence(toolName);
	return ti?.latency.tier || "medium";
}

/**
 * Get timeout for a tool
 */
export function getToolTimeout(toolName: string): number {
	const ti = getToolIntelligence(toolName);
	return ti?.latency.timeout || 60000;
}

/**
 * Get user feedback delay (when to show progress indicator)
 */
export function getUserFeedbackDelay(toolName: string): number {
	const ti = getToolIntelligence(toolName);
	return ti?.latency.userFeedbackDelay || 1000;
}

/**
 * Get max tokens for tool output
 */
export function getMaxOutputTokens(toolName: string): number {
	const ti = getToolIntelligence(toolName);
	return ti?.response.maxTokens || 10000;
}

/**
 * Check if tool output needs summarization
 */
export function needsSummarization(toolName: string): boolean {
	const ti = getToolIntelligence(toolName);
	return ti?.response.requiresSummarization || false;
}

/**
 * Get all tools for an MCP server
 */
export function getToolsForServer(mcpServer: string): ToolIntelligence[] {
	return TOOL_INTELLIGENCE.filter((ti) => ti.mcpServer === mcpServer);
}

/**
 * Score a tool based on query intent
 * Returns score 0-200 (weight + priority bonus)
 */
export function scoreToolForQuery(toolName: string, query: string): number {
	const ti = getToolIntelligence(toolName);
	if (!ti) return 0;

	let score = 0;

	// Check intent signals
	if (ti.intentSignals.keywords.test(query)) {
		score += ti.intentSignals.weight;
	}

	// Add priority bonus (scaled to 0-50 range)
	score += ti.priority * 0.5;

	return score;
}

/**
 * Get all tools sorted by score for a given query
 */
export function rankToolsForQuery(
	query: string,
	availableTools: string[]
): Array<{
	tool: string;
	score: number;
	latencyTier: LatencyTier;
	isExclusive: boolean;
}> {
	const results = availableTools.map((toolName) => {
		const ti = getToolIntelligence(toolName);
		const score = scoreToolForQuery(toolName, query);
		const latencyTier = ti?.latency.tier || "medium";
		const isExclusive = ti?.intentSignals.exclusive && ti.intentSignals.keywords.test(query);

		return { tool: toolName, score, latencyTier, isExclusive: !!isExclusive };
	});

	// Sort by score descending
	results.sort((a, b) => b.score - a.score);

	// If any tool has exclusive match, filter to only that tool
	const exclusiveMatch = results.find((r) => r.isExclusive);
	if (exclusiveMatch) {
		logger.info(
			{ tool: exclusiveMatch.tool, query: query.slice(0, 50) },
			"[tool-intelligence] Exclusive tool match"
		);
		return [exclusiveMatch];
	}

	return results;
}

/**
 * Get all registered tool names
 */
export function getAllRegisteredTools(): string[] {
	return TOOL_INTELLIGENCE.map((ti) => ti.name);
}

/**
 * Check if a tool is registered in the intelligence registry
 */
export function isToolRegistered(toolName: string): boolean {
	return getToolIntelligence(toolName) !== undefined;
}

// ============================================================================
// Tool Capability Awareness Functions
// ============================================================================

/**
 * Tool categories for grouping in capability manifest
 */
type ToolCategory =
	| "research"
	| "search"
	| "data"
	| "documents"
	| "files"
	| "development"
	| "utility";

interface ToolCategoryInfo {
	name: string;
	hebrewName: string;
	description: string;
	tools: string[];
}

const TOOL_CATEGORIES: Record<ToolCategory, ToolCategoryInfo> = {
	research: {
		name: "Deep Research",
		hebrewName: "מחקר מעמיק",
		description: "In-depth analysis and comprehensive research",
		tools: ["perplexity-research", "perplexity-ask", "perplexity-reason", "sequentialthinking"],
	},
	search: {
		name: "Web Search",
		hebrewName: "חיפוש ברשת",
		description: "Quick searches and fact-finding",
		tools: ["perplexity-search", "tavily-search", "tavily-extract", "fetch"],
	},
	data: {
		name: "Government Data",
		hebrewName: "מידע ממשלתי",
		description: "Official Israeli government data sources",
		tools: ["datagov_query", "datastore_search"],
	},
	documents: {
		name: "Document Processing",
		hebrewName: "עיבוד מסמכים",
		description: "Convert, extract, and analyze documents (PDF, Word, Excel, images)",
		tools: [
			"docling_convert",
			"docling_convert_url",
			"docling_extract_tables",
			"docling_extract_images",
			"docling_ocr",
			"docling_analyze",
			"docling_list_formats",
		],
	},
	files: {
		name: "File Operations",
		hebrewName: "פעולות קבצים",
		description: "Read, write, and manage files",
		tools: ["read_file", "write_file", "list_directory"],
	},
	development: {
		name: "Development Tools",
		hebrewName: "כלי פיתוח",
		description: "Git, code, and development operations",
		tools: ["git_status", "git_log"],
	},
	utility: {
		name: "Utilities",
		hebrewName: "כלי עזר",
		description: "Time, media, and other utilities",
		tools: ["get_current_time", "get-video-info-for-summary-from-url"],
	},
};

/**
 * Generate a human-readable manifest of available tool capabilities.
 * Used to inform the model about what tools it can use.
 *
 * @param availableTools - List of tool names that are actually enabled
 * @returns Hebrew + English description of capabilities
 */
export function generateToolCapabilityManifest(availableTools: string[]): string {
	const availableSet = new Set(availableTools.map((t) => t.toLowerCase()));

	const sections: string[] = [];

	for (const [category, info] of Object.entries(TOOL_CATEGORIES)) {
		// Filter to only tools that are actually available
		const categoryTools = info.tools.filter((tool) => {
			const normalizedTool = tool.toLowerCase();
			return (
				availableSet.has(normalizedTool) ||
				availableSet.has(normalizedTool.replace(/-/g, "_")) ||
				availableSet.has(normalizedTool.replace(/_/g, "-"))
			);
		});

		if (categoryTools.length === 0) continue;

		const toolDescriptions = categoryTools.map((toolName) => {
			const ti = getToolIntelligence(toolName);
			if (!ti) return `- ${toolName}`;

			const latencyHint =
				ti.latency.tier === "fast"
					? "(מהיר)"
					: ti.latency.tier === "slow" || ti.latency.tier === "very_slow"
						? "(לוקח זמן)"
						: "";

			return `  • ${ti.displayName} ${latencyHint}: ${ti.messages.progress.replace("...", "")}`;
		});

		sections.push(`**${info.hebrewName} / ${info.name}**\n${toolDescriptions.join("\n")}`);
	}

	if (sections.length === 0) {
		return "";
	}

	return `
## היכולות שלי / My Capabilities

${sections.join("\n\n")}

**הנחיה חשובה**: כאשר המשתמש שואל מה אתה יכול לעשות, תאר את היכולות הללו. לאחר שימוש בכלי, ציין איזה כלי שימש ואם יש אפשרויות נוספות.
`;
}

/**
 * Generate post-execution suggestions for complementary tools.
 * Called after a tool successfully executes to suggest alternatives that could enhance the answer.
 *
 * @param usedTool - The tool that was just used
 * @param query - The original user query
 * @returns Suggestion text or empty string if no suggestion
 */
export function generatePostExecutionSuggestions(usedTool: string, query: string): string {
	const ti = getToolIntelligence(usedTool);
	if (!ti) return "";

	const usedToolLower = usedTool.toLowerCase();

	// Quick search → Suggest deeper research
	if (usedToolLower.includes("tavily") || usedToolLower === "perplexity-search") {
		// Check if query seems complex enough to warrant deeper research
		const complexitySignals =
			/מחקר|ניתוח|השווא|מקיף|מפורט|research|analysis|compare|comprehensive|detailed/i;
		if (complexitySignals.test(query)) {
			return `\n\n💡 **הצעה**: התשובה מבוססת על חיפוש מהיר. לניתוח מעמיק יותר, אוכל לבצע מחקר עם Perplexity Research שיספק תוצאות מקיפות יותר.`;
		}
	}

	// DataGov → Suggest Perplexity for context
	if (usedToolLower.includes("datagov")) {
		return `\n\n💡 **הערה**: הנתונים מגיעים ממאגרי המידע הממשלתיים הרשמיים. לקבלת הקשר נוסף או פרשנות, אוכל לחפש מידע משלים.`;
	}

	// Perplexity Research already deep → no suggestion
	if (usedToolLower === "perplexity-research") {
		return ""; // Already the deepest
	}

	// Perplexity Ask → Suggest Research for more depth
	if (usedToolLower === "perplexity-ask") {
		return `\n\n💡 **אפשרות נוספת**: לקבלת מחקר מקיף יותר עם מקורות רבים, אוכל להשתמש בכלי המחקר המעמיק.`;
	}

	return "";
}

/**
 * Get user-friendly attribution for which tool provided an answer.
 *
 * @param toolName - The tool that was used
 * @returns Attribution string like "מקור: חיפוש Tavily"
 */
export function getToolUsageAttribution(toolName: string): string {
	const ti = getToolIntelligence(toolName);
	if (!ti) return `מקור: ${toolName}`;

	return `מקור: ${ti.displayName}`;
}

/**
 * Get complementary tools that could enhance a query.
 * Used when the model wants to proactively offer additional capabilities.
 *
 * @param currentTool - The tool being used or considered
 * @returns Array of complementary tool suggestions
 */
export function getComplementaryTools(currentTool: string): Array<{
	name: string;
	displayName: string;
	reason: string;
}> {
	const ti = getToolIntelligence(currentTool);
	if (!ti) return [];

	const complementary: Array<{ name: string; displayName: string; reason: string }> = [];
	const currentLower = currentTool.toLowerCase();

	// If using quick search, suggest deep research
	if (currentLower.includes("tavily") || currentLower === "perplexity-search") {
		const research = getToolIntelligence("perplexity-research");
		if (research) {
			complementary.push({
				name: "perplexity-research",
				displayName: research.displayName,
				reason: "לניתוח מעמיק ומקיף יותר",
			});
		}
	}

	// If using Perplexity, suggest DataGov for Israeli official data
	if (currentLower.includes("perplexity") && !currentLower.includes("datagov")) {
		const datagov = getToolIntelligence("datagov_query");
		if (datagov) {
			complementary.push({
				name: "datagov_query",
				displayName: datagov.displayName,
				reason: "לנתונים רשמיים ממאגרי המידע הממשלתיים",
			});
		}
	}

	return complementary;
}
