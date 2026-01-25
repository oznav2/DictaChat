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

	// Memory Attribution (for causal feedback)
	memory_attribution_instruction: {
		en: `IMPORTANT: When using information from the memory context above, at the END of your response,
add a hidden attribution comment in this exact format on its own line:
<!-- MEM: 1👍 2👎 3➖ -->

Where numbers correspond to memory positions from the context:
- 👍 = memory was helpful and used in your response
- 👎 = memory was unhelpful, irrelevant, or wrong
- ➖ = memory was not used in your response

Example: If memories 1 and 3 helped, memory 2 was wrong, and 4-5 weren't used:
<!-- MEM: 1👍 3👍 2👎 4➖ 5➖ -->

This helps improve memory quality for future conversations. Include ALL memory positions.`,
		he: `חשוב: כאשר אתה משתמש במידע מהקשר הזיכרון לעיל, בסוף התשובה שלך,
הוסף הערת ייחוס מוסתרת בפורמט הזה בדיוק בשורה נפרדת:
<!-- MEM: 1👍 2👎 3➖ -->

כאשר המספרים מתאימים למיקומי הזיכרונות מההקשר:
- 👍 = הזיכרון היה שימושי ונעשה בו שימוש בתשובתך
- 👎 = הזיכרון היה לא רלוונטי או שגוי
- ➖ = לא נעשה שימוש בזיכרון בתשובתך

דוגמה: אם זיכרונות 1 ו-3 עזרו, זיכרון 2 היה שגוי, ו-4-5 לא נעשה בהם שימוש:
<!-- MEM: 1👍 3👍 2👎 4➖ 5➖ -->

זה עוזר לשפר את איכות הזיכרון לשיחות עתידיות. כלול את כל מיקומי הזיכרון.`,
	},

	// Confidence Hints - MEMORY-FIRST ARCHITECTURE
	// These instructions are CRITICAL for preventing unnecessary tool calls when memory has the answer
	confidence_high: {
		en: `**⚠️ CRITICAL: MEMORY-FIRST RESPONSE REQUIRED (HIGH CONFIDENCE)**
The memory context above contains DIRECTLY RELEVANT information for this query.
YOU MUST:
1. Answer FIRST from the memory context provided above
2. Do NOT call external search tools (tavily, perplexity, web search) - the answer is already in memory
3. Only use tools if the user explicitly requests NEW/UPDATED information not in memory

The memory context may contain ingested documents, past conversations, or stored knowledge.
Your FIRST response should come from this context. Tool calls are NOT needed.`,
		he: `**⚠️ קריטי: נדרשת תשובה מבוססת זיכרון (ודאות גבוהה)**
הקשר הזיכרון למעלה מכיל מידע רלוונטי ישירות לשאילתה זו.
עליך:
1. לענות תחילה מהקשר הזיכרון שסופק למעלה
2. לא לקרוא לכלי חיפוש חיצוניים (tavily, perplexity, חיפוש אינטרנט) - התשובה כבר בזיכרון
3. להשתמש בכלים רק אם המשתמש מבקש במפורש מידע חדש/מעודכן שאינו בזיכרון

הקשר הזיכרון עשוי להכיל מסמכים שנקלטו, שיחות קודמות או ידע שנשמר.
התשובה הראשונה שלך צריכה להגיע מהקשר הזה. אין צורך בקריאות לכלים.`,
	},

	confidence_medium: {
		en: `**MEMORY CONTEXT AVAILABLE (MEDIUM CONFIDENCE)**
The memory context above contains potentially relevant information.
IMPORTANT INSTRUCTIONS:
1. Check the memory context FIRST - it may already contain the answer
2. If memory provides a partial answer, START with what you know from memory
3. You may supplement with tools AFTER providing the memory-based answer
4. Do NOT skip memory and go straight to tools - that defeats the purpose of memory`,
		he: `**הקשר זיכרון זמין (ודאות בינונית)**
הקשר הזיכרון למעלה עשוי להכיל מידע רלוונטי.
הנחיות חשובות:
1. בדוק את הקשר הזיכרון תחילה - ייתכן שכבר מכיל את התשובה
2. אם הזיכרון מספק תשובה חלקית, התחל במה שאתה יודע מהזיכרון
3. אתה יכול להשלים עם כלים אחרי שסיפקת את התשובה מבוססת הזיכרון
4. אל תדלג על הזיכרון ותעבור ישירות לכלים - זה מביס את מטרת הזיכרון`,
	},

	confidence_low: {
		en: `**MEMORY CONTEXT AVAILABLE (LOW CONFIDENCE)**
The memory context above has limited relevance to this query.
You may need to use tools to gather additional information.
However, still check if ANY part of your answer can come from memory first.`,
		he: `**הקשר זיכרון זמין (ודאות נמוכה)**
להקשר הזיכרון למעלה יש רלוונטיות מוגבלת לשאילתה זו.
ייתכן שתצטרך להשתמש בכלים כדי לאסוף מידע נוסף.
עם זאת, עדיין בדוק אם חלק כלשהו מהתשובה יכול להגיע מהזיכרון תחילה.`,
	},

	// Contextual Guidance
	contextual_guidance_header: {
		en: `**CONTEXTUAL GUIDANCE FROM MEMORY SYSTEM**
The following insights are derived from past interactions and should inform your response:`,
		he: `**הנחיות הקשריות ממערכת הזיכרון**
התובנות הבאות נגזרות מאינטראקציות קודמות ויש להתחשב בהן בתשובתך:`,
	},

	// Memory Bank Philosophy
	memory_bank_philosophy: {
		en: `**MEMORY BANK PHILOSOPHY**
When responding to questions about the user, you should weave the information naturally into your response.
You don't need to explicitly mention "according to memory bank" or similar phrases.
Just use the information as if you naturally remember it from past conversations.
The goal is to provide a seamless, personalized experience.`,
		he: `**פילוסופיית בנק הזיכרון**
כאשר אתה עונה על שאלות לגבי המשתמש, עליך לשלב את המידע באופן טבעי בתשובתך.
אינך צריך לציין במפורש "לפי בנק הזיכרון" או ביטויים דומים.
פשוט השתמש במידע כאילו אתה זוכר אותו באופן טבעי משיחות קודמות.
המטרה היא לספק חוויה חלקה ומותאמת אישית.`,
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
export function renderBilingual(key: string, vars: Record<string, unknown> = {}): BilingualPrompt {
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
