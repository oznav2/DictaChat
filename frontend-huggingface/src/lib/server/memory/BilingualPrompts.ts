/**
 * BilingualPrompts - Static bilingual prompt strings and utilities
 *
 * Provides:
 * - Pre-defined bilingual prompts for common scenarios
 * - Hebrew/English string retrieval
 * - Simple template interpolation for bilingual content
 * - RTL/LTR direction utilities
 *
 * This module provides static strings that don't require Handlebars rendering,
 * complementing the PromptEngine for more complex template needs.
 */

// ============================================================================
// Types
// ============================================================================

export type SupportedLanguage = "en" | "he";

export interface BilingualPrompt {
	en: string;
	he: string;
}

export interface BilingualPromptWithContext extends BilingualPrompt {
	context?: string;
	category?: string;
}

// ============================================================================
// Static Bilingual Prompts
// ============================================================================

/**
 * Core bilingual prompts used throughout the memory system
 */
export const BILINGUAL_PROMPTS: Record<string, BilingualPrompt> = {
	// Memory Context Headers
	memory_context_header: {
		en: "Based on what I know about you:",
		he: "על סמך מה שאני יודע עליך:",
	},
	no_memory_found: {
		en: "No relevant information found in memory.",
		he: "לא נמצא מידע רלוונטי בזיכרון.",
	},
	memory_search_in_progress: {
		en: "Searching memory...",
		he: "מחפש בזיכרון...",
	},

	// Goal Reminders
	goal_reminder: {
		en: "Remember your goal:",
		he: "זכור את המטרה שלך:",
	},
	goal_progress: {
		en: "Goal progress:",
		he: "התקדמות למטרה:",
	},
	no_goals_set: {
		en: "No specific goals defined.",
		he: "לא הוגדרו מטרות ספציפיות.",
	},

	// Pattern Recognition
	pattern_detected: {
		en: "I noticed a pattern:",
		he: "שמתי לב לדפוס:",
	},
	similar_past_query: {
		en: "You asked something similar before:",
		he: "שאלת משהו דומה בעבר:",
	},
	proven_solution: {
		en: "This approach worked before:",
		he: "גישה זו עבדה בעבר:",
	},

	// Failure Prevention
	failure_warning: {
		en: "Warning: Similar approaches have failed:",
		he: "אזהרה: גישות דומות נכשלו:",
	},
	consider_alternative: {
		en: "Consider an alternative approach.",
		he: "שקול גישה חלופית.",
	},
	past_failure_reason: {
		en: "Previous failure reason:",
		he: "סיבת כישלון קודמת:",
	},

	// Feedback
	was_helpful: {
		en: "Was this helpful?",
		he: "האם זה עזר?",
	},
	feedback_appreciated: {
		en: "Your feedback helps me improve.",
		he: "המשוב שלך עוזר לי להשתפר.",
	},
	rate_response: {
		en: "Please rate this response:",
		he: "אנא דרג את התשובה:",
	},

	// Scoring Explanations
	high_confidence: {
		en: "High confidence - proven pattern",
		he: "ודאות גבוהה - דפוס מוכח",
	},
	medium_confidence: {
		en: "Medium confidence - emerging pattern",
		he: "ודאות בינונית - דפוס מתהווה",
	},
	low_confidence: {
		en: "Low confidence - limited data",
		he: "ודאות נמוכה - מידע מוגבל",
	},

	// Context Indicators
	topic_shift: {
		en: "Topic shift detected",
		he: "זוהה מעבר נושא",
	},
	continuing_discussion: {
		en: "Continuing discussion about:",
		he: "ממשיך דיון על:",
	},
	new_context_loaded: {
		en: "New context loaded",
		he: "הקשר חדש נטען",
	},

	// Book/Document Context
	from_your_documents: {
		en: "From your documents:",
		he: "מהמסמכים שלך:",
	},
	source_reference: {
		en: "Source:",
		he: "מקור:",
	},
	page_reference: {
		en: "Page:",
		he: "עמוד:",
	},

	// Error Messages
	error_occurred: {
		en: "An error occurred:",
		he: "אירעה שגיאה:",
	},
	try_again: {
		en: "Please try again.",
		he: "אנא נסה שוב.",
	},
	service_unavailable: {
		en: "Service temporarily unavailable.",
		he: "השירות אינו זמין זמנית.",
	},
	rate_limit_exceeded: {
		en: "Rate limit exceeded. Please wait.",
		he: "חרגת ממגבלת הקצב. אנא המתן.",
	},

	// Value Alignment
	aligning_with_values: {
		en: "Aligning with your values:",
		he: "מתאים לערכים שלך:",
	},
	preference_noted: {
		en: "Preference noted:",
		he: "העדפה נרשמה:",
	},

	// Personality
	assistant_introduction: {
		en: "I'm your memory-enhanced assistant.",
		he: "אני העוזר שלך עם זיכרון משופר.",
	},
	learning_from_you: {
		en: "I learn from our conversations.",
		he: "אני לומד מהשיחות שלנו.",
	},

	// Memory Bank Operations
	memory_saved: {
		en: "Information saved to memory.",
		he: "המידע נשמר בזיכרון.",
	},
	memory_updated: {
		en: "Memory updated.",
		he: "הזיכרון עודכן.",
	},
	memory_deleted: {
		en: "Memory deleted.",
		he: "הזיכרון נמחק.",
	},

	// Organic Recall
	you_mentioned_before: {
		en: "You mentioned before:",
		he: "הזכרת בעבר:",
	},
	this_might_help: {
		en: "This might help:",
		he: "זה עשוי לעזור:",
	},
	related_information: {
		en: "Related information:",
		he: "מידע קשור:",
	},

	// Actions
	searching: {
		en: "Searching...",
		he: "מחפש...",
	},
	processing: {
		en: "Processing...",
		he: "מעבד...",
	},
	loading: {
		en: "Loading...",
		he: "טוען...",
	},
	done: {
		en: "Done",
		he: "הושלם",
	},
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a bilingual prompt by key
 */
export function getBilingualPrompt(key: string, language: SupportedLanguage): string {
	const prompt = BILINGUAL_PROMPTS[key];
	if (!prompt) {
		console.warn(`Bilingual prompt key not found: ${key}`);
		return key;
	}
	return prompt[language];
}

/**
 * Get both language versions of a prompt
 */
export function getBothLanguages(key: string): BilingualPrompt | null {
	return BILINGUAL_PROMPTS[key] ?? null;
}

/**
 * Render a bilingual prompt with variable interpolation
 * Variables are denoted by {{variableName}} in the prompt strings
 */
export function renderBilingual(
	key: string,
	vars: Record<string, unknown> = {}
): BilingualPrompt {
	const prompt = BILINGUAL_PROMPTS[key];
	if (!prompt) {
		console.warn(`Bilingual prompt key not found: ${key}`);
		return { en: key, he: key };
	}

	return {
		en: interpolateString(prompt.en, vars),
		he: interpolateString(prompt.he, vars),
	};
}

/**
 * Render a single language version with variable interpolation
 */
export function renderPrompt(
	key: string,
	language: SupportedLanguage,
	vars: Record<string, unknown> = {}
): string {
	const prompt = BILINGUAL_PROMPTS[key];
	if (!prompt) {
		console.warn(`Bilingual prompt key not found: ${key}`);
		return key;
	}

	return interpolateString(prompt[language], vars);
}

/**
 * Simple string interpolation for {{variable}} patterns
 */
function interpolateString(template: string, vars: Record<string, unknown>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
		const value = vars[varName];
		if (value === undefined || value === null) {
			return match; // Keep original if no value
		}
		return String(value);
	});
}

/**
 * Create a custom bilingual prompt
 */
export function createBilingualPrompt(en: string, he: string): BilingualPrompt {
	return { en, he };
}

/**
 * Merge multiple bilingual prompts into one
 */
export function mergeBilingualPrompts(
	prompts: BilingualPrompt[],
	separator: string = "\n"
): BilingualPrompt {
	return {
		en: prompts.map((p) => p.en).join(separator),
		he: prompts.map((p) => p.he).join(separator),
	};
}

// ============================================================================
// Direction Utilities
// ============================================================================

/**
 * Get text direction for a language
 */
export function getTextDirection(language: SupportedLanguage): "ltr" | "rtl" {
	return language === "he" ? "rtl" : "ltr";
}

/**
 * Wrap text with appropriate direction tag
 */
export function wrapWithDirection(text: string, language: SupportedLanguage): string {
	const dir = getTextDirection(language);
	return `<span dir="${dir}">${text}</span>`;
}

/**
 * Create a div with proper direction
 */
export function createDirectionalDiv(text: string, language: SupportedLanguage): string {
	const dir = getTextDirection(language);
	return `<div dir="${dir}">${text}</div>`;
}

// ============================================================================
// Language Detection
// ============================================================================

/**
 * Detect if text contains Hebrew characters
 */
export function containsHebrew(text: string): boolean {
	const hebrewRegex = /[\u0590-\u05FF]/;
	return hebrewRegex.test(text);
}

/**
 * Detect primary language of text
 */
export function detectLanguage(text: string): SupportedLanguage {
	if (!text) return "en";

	// Count Hebrew vs non-Hebrew characters
	const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
	const latinChars = (text.match(/[a-zA-Z]/g) || []).length;

	return hebrewChars > latinChars ? "he" : "en";
}

/**
 * Check if text is primarily RTL
 */
export function isRtlText(text: string): boolean {
	return detectLanguage(text) === "he";
}

// ============================================================================
// Prompt Builders
// ============================================================================

/**
 * Build a memory context header with memories
 */
export function buildMemoryContextHeader(
	memories: Array<{ content: string; confidence?: number }>,
	language: SupportedLanguage
): string {
	if (memories.length === 0) {
		return getBilingualPrompt("no_memory_found", language);
	}

	const header = getBilingualPrompt("memory_context_header", language);
	const items = memories
		.map((m) => {
			const confidence = m.confidence ? ` (${Math.round(m.confidence * 100)}%)` : "";
			return `- ${m.content}${confidence}`;
		})
		.join("\n");

	return `${header}\n${items}`;
}

/**
 * Build a goal reminder section
 */
export function buildGoalReminder(
	goals: Array<{ description: string; progress?: number }>,
	language: SupportedLanguage
): string {
	if (goals.length === 0) {
		return getBilingualPrompt("no_goals_set", language);
	}

	const header = getBilingualPrompt("goal_reminder", language);
	const items = goals
		.map((g, i) => {
			const progress = g.progress !== undefined ? ` [${Math.round(g.progress * 100)}%]` : "";
			return `${i + 1}. ${g.description}${progress}`;
		})
		.join("\n");

	return `${header}\n${items}`;
}

/**
 * Build a failure warning section
 */
export function buildFailureWarning(
	failures: Array<{ approach: string; reason: string }>,
	language: SupportedLanguage
): string {
	if (failures.length === 0) {
		return "";
	}

	const header = getBilingualPrompt("failure_warning", language);
	const items = failures.map((f) => `- ${f.approach}: ${f.reason}`).join("\n");
	const suggestion = getBilingualPrompt("consider_alternative", language);

	return `${header}\n${items}\n\n${suggestion}`;
}

/**
 * Build an error message
 */
export function buildErrorMessage(
	errorType: string,
	language: SupportedLanguage,
	details?: string
): string {
	const header = getBilingualPrompt("error_occurred", language);
	const tryAgain = getBilingualPrompt("try_again", language);

	let message = header;
	if (details) {
		message += ` ${details}`;
	}
	message += `\n${tryAgain}`;

	return message;
}

// ============================================================================
// Exports
// ============================================================================

export default {
	BILINGUAL_PROMPTS,
	getBilingualPrompt,
	getBothLanguages,
	renderBilingual,
	renderPrompt,
	createBilingualPrompt,
	mergeBilingualPrompts,
	getTextDirection,
	wrapWithDirection,
	createDirectionalDiv,
	containsHebrew,
	detectLanguage,
	isRtlText,
	buildMemoryContextHeader,
	buildGoalReminder,
	buildFailureWarning,
	buildErrorMessage,
};
