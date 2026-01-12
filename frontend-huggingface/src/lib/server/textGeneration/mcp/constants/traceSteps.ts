/**
 * Trace Step Constants
 *
 * Predefined bilingual (Hebrew/English) step labels for the RAG trace panel.
 * These are backend-driven steps - the frontend only displays what the backend emits.
 */

import type { TraceStepDefinition } from "../types/trace";

/**
 * All predefined trace steps with bilingual labels
 */
export const TRACE_STEPS = {
	// ============================================
	// Ingestion Phase
	// ============================================

	UNDERSTANDING_REQUEST: {
		id: "understanding",
		label: { he: "מבין את הבקשה שלך", en: "Understanding your request" },
	},

	EXTRACTING_DOCUMENT: {
		id: "extracting",
		label: { he: "מחלץ טקסט מהמסמך", en: "Extracting text from document" },
	},

	CHUNKING_CONTENT: {
		id: "chunking",
		label: { he: "מפצל לקטעים סמנטיים", en: "Splitting into semantic chunks" },
	},

	GENERATING_EMBEDDINGS: {
		id: "embedding",
		label: { he: "יוצר וקטורים סמנטיים", en: "Generating embeddings" },
	},

	EXTRACTING_METADATA: {
		id: "metadata",
		label: { he: "מזהה מטא-דאטה ומילות מפתח", en: "Extracting metadata and keywords" },
	},

	STORING_CONTEXT: {
		id: "storing",
		label: { he: "שומר בזיכרון ארוך טווח", en: "Storing in long-term memory" },
	},

	// ============================================
	// Retrieval Phase
	// ============================================

	SEARCHING_KNOWLEDGE: {
		id: "searching",
		label: { he: "מחפש בבסיס הידע", en: "Searching knowledge base" },
	},

	RANKING_RESULTS: {
		id: "ranking",
		label: { he: "מדרג תוצאות לפי רלוונטיות", en: "Ranking results by relevance" },
	},

	ASSESSING_CONTEXT: {
		id: "assessing",
		label: { he: "בודק אם ההקשר מספיק", en: "Assessing if context is sufficient" },
	},

	AUGMENTING_CONTEXT: {
		id: "augmenting",
		label: { he: "מעשיר את ההקשר במידע נוסף", en: "Augmenting context with more info" },
	},

	// ============================================
	// Tool Usage
	// ============================================

	USING_TOOL: {
		id: "tool",
		label: { he: "משתמש בכלי", en: "Using tool" },
	},

	READING_FILE: {
		id: "read_file",
		label: { he: "קורא קובץ", en: "Reading file" },
	},

	CALLING_DOCLING: {
		id: "docling",
		label: { he: "מעבד מסמך עם Docling", en: "Processing document with Docling" },
	},

	SEARCHING_WEB: {
		id: "web_search",
		label: { he: "מחפש ברשת", en: "Searching the web" },
	},

	// ============================================
	// Memory Operations
	// ============================================

	MEMORY_SEARCH: {
		id: "memory_search",
		label: { he: "מחפש בזיכרון...", en: "Searching memory..." },
	},

	MEMORY_FOUND: {
		id: "memory_found",
		label: { he: "נמצאו זיכרונות", en: "Found memories" },
	},

	MEMORY_INJECT: {
		id: "memory_inject",
		label: { he: "מזריק הקשר מהזיכרון", en: "Injecting memory context" },
	},

	MEMORY_LEARN: {
		id: "memory_learn",
		label: { he: "לומד מהתשובה", en: "Learning from response" },
	},

	MEMORY_STORE: {
		id: "memory_store",
		label: { he: "שומר בזיכרון", en: "Storing to memory" },
	},

	// ============================================
	// Completion
	// ============================================

	GENERATING_RESPONSE: {
		id: "generating",
		label: { he: "מכין תשובה", en: "Generating response" },
	},

	PROCESS_COMPLETE: {
		id: "complete",
		label: { he: "התהליך הושלם", en: "Process complete" },
	},
} as const satisfies Record<string, TraceStepDefinition>;

/**
 * Type for step keys
 */
export type TraceStepKey = keyof typeof TRACE_STEPS;

/**
 * Get step definition by key
 */
export function getStepDefinition(key: TraceStepKey): TraceStepDefinition {
	return TRACE_STEPS[key];
}

/**
 * Create a custom step definition for dynamic tool names
 */
export function createToolStep(toolName: string): TraceStepDefinition {
	return {
		id: `tool-${toolName}`,
		label: {
			he: `משתמש ב-${toolName}`,
			en: `Using ${toolName}`,
		},
	};
}

/**
 * Get localized label based on language
 */
export function getLocalizedLabel(step: TraceStepDefinition, language: "he" | "en"): string {
	return step.label[language] || step.label.en;
}
