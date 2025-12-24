/**
 * Detects specific user intents from Hebrew queries to guide tool selection.
 * Distinguishes between simple search ("חפש") and deep research ("מחקר").
 */

export type DetectedIntent = "research" | "search" | null;

export function detectHebrewIntent(query: string): DetectedIntent {
	if (!query) return null;
	const q = query.toLowerCase();

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
