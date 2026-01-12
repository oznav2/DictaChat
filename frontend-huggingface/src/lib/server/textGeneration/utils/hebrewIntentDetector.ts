/**
 * Detects specific user intents from Hebrew queries to guide tool selection.
 * Distinguishes between:
 * - "official_data" → מאגרים רשמיים, נתונים ממשלתיים (use DataGov)
 * - "research" → מחקר (use Perplexity)
 * - "search" → חפש (use Tavily)
 *
 * Also provides intelligent Perplexity tool selection via scorePerplexityTools().
 */

export type DetectedIntent = "official_data" | "research" | "search" | null;

export type PerplexityTool =
	| "perplexity_ask"
	| "perplexity_search"
	| "perplexity_research"
	| "perplexity_reason";

export interface PerplexityToolScore {
	tool: PerplexityTool;
	score: number;
	matchedSignals: string[];
}

/**
 * Comprehensive Hebrew + English intent patterns for each Perplexity tool.
 * Priority: Explicit Hebrew intent words take precedence.
 */
const PERPLEXITY_INTENTS: Record<string, { keywords: RegExp; weight: number }> = {
	// perplexity_search - Quick web search for facts/news/current info
	search: {
		keywords: new RegExp(
			[
				// Hebrew imperatives & verbs
				"חפש",
				"חיפוש",
				"מצא",
				"תמצא",
				"למצוא",
				"אתר",
				"לאתר",
				"בדוק",
				"תבדוק",
				"לבדוק",
				"גלה",
				"לגלות",
				// Quick info requests
				"מה זה\\??",
				"מי זה\\??",
				"מתי",
				"איפה",
				"כמה עולה",
				"מה המחיר",
				"מה השעה",
				"מזג אוויר",
				"חדשות",
				"עדכון",
				"עדכונים",
				// Lookups
				"תוצאות",
				"ציון",
				"דירוג",
				"סטטיסטיקה",
				"נתונים על",
				"כתובת",
				"טלפון",
				"שעות פתיחה",
				"פרטים על",
				// English
				"search",
				"find",
				"look up",
				"lookup",
				"what is",
				"who is",
				"when",
				"where",
				"how much",
				"price of",
				"news about",
				"latest",
				"current",
				"today",
				"results",
				"score",
			].join("|"),
			"i"
		),
		weight: 100,
	},

	// perplexity_ask - Conversational Q&A, explanations (HIGHEST QUALITY)
	ask: {
		keywords: new RegExp(
			[
				// Hebrew question/explain verbs
				"שאל",
				"תשאל",
				"לשאול",
				"ספר",
				"ספר לי",
				"תספר",
				"הסבר",
				"תסביר",
				"להסביר",
				"הסבר לי",
				"פרט",
				"תפרט",
				"לפרט",
				"תאר",
				"לתאר",
				"תיאור",
				"סקירה",
				"סקור",
				// Casual questions
				"מה דעתך",
				"מה אתה חושב",
				"מה ההבדל",
				"מה היתרון",
				"איך עובד",
				"איך פועל",
				"למה זה",
				"בשביל מה",
				"מה ההמלצה",
				"מה עדיף",
				"מה הכי טוב",
				// Definitions
				"מהו",
				"מהי",
				"מהם",
				"מהן",
				"הגדרה",
				"משמעות",
				// English
				"explain",
				"tell me",
				"describe",
				"what does",
				"how does",
				"how do",
				"how is",
				"what are",
				"difference between",
				"meaning of",
				"definition",
				"overview",
				"summarize",
				"can you",
				"could you",
				"would you",
				"please tell",
			].join("|"),
			"i"
		),
		weight: 90,
	},

	// perplexity_research - Deep research with citations, comprehensive
	research: {
		keywords: new RegExp(
			[
				// Hebrew research verbs
				"חקור",
				"לחקור",
				"חקירה",
				"מחקר",
				"עשה מחקר",
				"בצע מחקר",
				"נתח",
				"לנתח",
				"ניתוח",
				"ניתוח מעמיק",
				"ניתוח מקיף",
				"בחן",
				"לבחון",
				"בחינה",
				"בדיקה מעמיקה",
				// Depth indicators
				"לעומק",
				"בעומק",
				"מעמיק",
				"מקיף",
				"מפורט",
				"יסודי",
				"מלא",
				"שלם",
				"ממצה",
				"רחב",
				"כולל",
				"הכל על",
				"עמוק",
				"נרחב",
				// Summary/synthesis
				"תקציר",
				"תמצית",
				"סיכום",
				"סכם",
				"לסכם",
				"תמציתי",
				"סיכום מקיף",
				"תקציר מקיף",
				"סקירה נרחבת",
				"ניתוח עמוק",
				"בדיקה מקיפה",
				"חקירה נרחבת",
				"תמונה מלאה",
				"תמונה רחבה",
				"כל המידע",
				"מבט כולל",
				"מבט רחב",
				"פרספקטיבה",
				// Academic/formal
				"סקירת ספרות",
				"רקע",
				"הקשר",
				"היסטוריה של",
				"התפתחות",
				"השוואה",
				"השווה בין",
				"מקורות",
				"עם מקורות",
				"עם ציטוטים",
				"ביבליוגרפיה",
				"מאמרים",
				"מחקרים",
				"עדויות",
				"ראיות",
				// Report style
				'דו"ח',
				"דוח",
				"סיכום מקיף",
				"סקירה מקיפה",
				"white paper",
				// English
				"research",
				"investigate",
				"in-depth",
				"in depth",
				"comprehensive",
				"thorough",
				"detailed",
				"complete",
				"exhaustive",
				"full analysis",
				"deep dive",
				"literature review",
				"with sources",
				"with citations",
				"academic",
				"scholarly",
				"background on",
				"history of",
				"compare and contrast",
				"pros and cons",
				"advantages disadvantages",
			].join("|"),
			"i"
		),
		weight: 100,
	},

	// perplexity_reason - Logical reasoning, problem solving, step-by-step
	reason: {
		keywords: new RegExp(
			[
				// Hebrew reasoning verbs
				"נמק",
				"תנמק",
				"לנמק",
				"נימוק",
				"הוכח",
				"להוכיח",
				"הוכחה",
				"הסק",
				"להסיק",
				"מסקנה",
				"הגיון",
				"היגיון",
				"לוגיקה",
				"לוגי",
				// Step by step
				"צעד אחר צעד",
				"שלב אחר שלב",
				"בשלבים",
				"בצעדים",
				"שבור את זה",
				"פרק לחלקים",
				"תהליך",
				"שיטתי",
				// Problem solving
				"פתור",
				"לפתור",
				"פתרון",
				"חשב",
				"לחשב",
				"חישוב",
				"העריך",
				"להעריך",
				"הערכה",
				"אמוד",
				"לאמוד",
				// Argumentation
				"טענה",
				"טיעון",
				"ויכוח",
				"דיון",
				"בעד ונגד",
				"יתרונות וחסרונות",
				"שקול",
				"לשקול",
				"שיקולים",
				// Why/because patterns
				"למה כי",
				"מדוע",
				"הסיבה",
				"הסיבות",
				"גורם",
				"גורמים",
				"תוצאה",
				"השלכות",
				"השפעה",
				"סיבה ותוצאה",
				// Decision making
				"החלטה",
				"החלט",
				"בחירה",
				"בחר בין",
				"מה עדיף ולמה",
				"האם כדאי",
				"שווה",
				"משתלם",
				"כלכלי",
				// English
				"step by step",
				"step-by-step",
				"reason",
				"reasoning",
				"logic",
				"logical",
				"prove",
				"proof",
				"deduce",
				"conclude",
				"conclusion",
				"why.*because",
				"explain why",
				"justify",
				"justification",
				"argue",
				"argument",
				"evaluate",
				"assess",
				"weigh",
				"solve",
				"calculate",
				"figure out",
				"work through",
				"think through",
				"break down",
				"analyze step",
			].join("|"),
			"i"
		),
		weight: 100,
	},
};

/**
 * Quality ranking for tie-breaking (higher = better quality answers)
 * perplexity_ask yields the best quality conversational answers
 */
const TOOL_QUALITY_RANK: Record<PerplexityTool, number> = {
	perplexity_ask: 4, // Best quality answers
	perplexity_research: 3, // Deep with citations
	perplexity_reason: 2, // Step-by-step logic
	perplexity_search: 1, // Quick facts
};

/**
 * Scores all Perplexity tools based on query analysis.
 * Uses Hebrew intent keywords (primary), complexity signals (secondary).
 * Returns tools sorted by score (highest first), with quality rank as tie-breaker.
 */
export function scorePerplexityTools(query: string): PerplexityToolScore[] {
	if (!query) {
		return [{ tool: "perplexity_ask", score: 10, matchedSignals: ["default_fallback"] }];
	}

	const scores: Record<PerplexityTool, { score: number; signals: string[] }> = {
		perplexity_search: { score: 0, signals: [] },
		perplexity_ask: { score: 0, signals: [] },
		perplexity_research: { score: 0, signals: [] },
		perplexity_reason: { score: 0, signals: [] },
	};

	// 1. PRIMARY: Hebrew/English intent keywords (highest priority)
	for (const [intent, config] of Object.entries(PERPLEXITY_INTENTS)) {
		if (config.keywords.test(query)) {
			const tool = `perplexity_${intent}` as PerplexityTool;
			scores[tool].score += config.weight;
			scores[tool].signals.push(`intent_${intent}`);
		}
	}

	// 2. SECONDARY: Complexity signals
	// Long query → likely needs research or reasoning
	if (query.length > 100) {
		scores.perplexity_research.score += 25;
		scores.perplexity_research.signals.push("long_query");
		scores.perplexity_reason.score += 15;
	}

	// Multi-part question detection → needs reasoning
	if (/\?.*\?|וגם.*\?|בנוסף/.test(query)) {
		scores.perplexity_reason.score += 25;
		scores.perplexity_reason.signals.push("multi_part_question");
	}

	// Complex topic indicators → research
	if (/\b(כל ה|כלל|מכלול|היבטים|גורמים|משתנים|מורכב|סבוך)\b/i.test(query)) {
		scores.perplexity_research.score += 30;
		scores.perplexity_research.signals.push("complex_topic");
	}

	// Simple/quick indicators → search or ask
	if (/\b(פשוט|מהר|בקצרה|בקיצור|תכלס|ישר לעניין)\b/i.test(query)) {
		scores.perplexity_search.score += 30;
		scores.perplexity_search.signals.push("quick_request");
		scores.perplexity_ask.score += 20;
	}

	// 3. TERTIARY: Default fallback boost
	// If no strong signals, prefer ask (most versatile, highest quality)
	const maxScore = Math.max(...Object.values(scores).map((s) => s.score));
	if (maxScore === 0) {
		scores.perplexity_ask.score += 10;
		scores.perplexity_ask.signals.push("default_fallback");
	}

	// Sort by score descending, then by quality rank (ask > research > reason > search)
	return Object.entries(scores)
		.map(([tool, data]) => ({
			tool: tool as PerplexityTool,
			score: data.score,
			matchedSignals: data.signals,
		}))
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return TOOL_QUALITY_RANK[b.tool] - TOOL_QUALITY_RANK[a.tool];
		});
}

/**
 * Returns the best Perplexity tool for the given query.
 * Convenience wrapper around scorePerplexityTools().
 */
export function getBestPerplexityTool(query: string): PerplexityTool {
	const scores = scorePerplexityTools(query);
	return scores[0].tool;
}

// ============================================================================
// Legacy function for backward compatibility with existing code
// ============================================================================

export function detectHebrewIntent(query: string): DetectedIntent {
	if (!query) return null;
	const q = query.toLowerCase();

	// HIGHEST PRIORITY: Official/Government data keywords
	// מאגרים רשמיים, נתונים רשמיים, מידע ממשלתי, data.gov, סטטיסטיקה רשמית
	// These MUST use datagov_query for Israeli government data
	const officialDataRegex =
		/(?:מאגר(?:ים)?\s*רשמי|נתונים\s*רשמי|מידע\s*ממשלתי|נתונים\s*ממשלתי|data\.gov|דאטה\s*גוב|סטטיסטיקה\s*רשמית?|לשכת\s*הסטטיסטיקה|ממשלת\s*ישראל|משרד\s*ה(?:בריאות|חינוך|תחבורה|אוצר)|רישוי\s*רכב|מספר\s*רכב)/i;
	if (officialDataRegex.test(q)) {
		return "official_data";
	}

	// Research keywords (High priority)
	// מחקר, לחקור, בצע מחקר, research, deep dive
	const researchRegex = /(?:מחקר|לחקור|research|deep dive)/i;
	if (researchRegex.test(q)) {
		return "research";
	}

	// Search keywords (Lower priority)
	// חפש, למצוא, מצא, search, find
	const searchRegex = /(?:חפש|למצוא|מצא|search|find)/i;
	if (searchRegex.test(q)) {
		return "search";
	}

	return null;
}
