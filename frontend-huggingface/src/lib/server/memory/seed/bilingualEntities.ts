/**
 * Common Bilingual Entities - Hebrew ↔ English Mappings
 *
 * Pre-seeded entity translations for cross-lingual memory search.
 * These enable Hebrew queries to find English memories and vice versa.
 */

import type { BilingualEntitySeed } from "$lib/types/BilingualEntityMap";

export const COMMON_BILINGUAL_ENTITIES: BilingualEntitySeed[] = [
	// Technology - AI/ML
	{ he: "בינה מלאכותית", en: "artificial intelligence", category: "technology" },
	{ he: "למידת מכונה", en: "machine learning", category: "technology" },
	{ he: "למידה עמוקה", en: "deep learning", category: "technology" },
	{ he: "רשת נוירונים", en: "neural network", category: "technology" },
	{ he: "מודל שפה", en: "language model", category: "technology" },
	{ he: "עיבוד שפה טבעית", en: "natural language processing", category: "technology" },
	{ he: "ראייה ממוחשבת", en: "computer vision", category: "technology" },

	// Programming
	{ he: "תכנות", en: "programming", category: "programming" },
	{ he: "קוד", en: "code", category: "programming" },
	{ he: "פונקציה", en: "function", category: "programming" },
	{ he: "משתנה", en: "variable", category: "programming" },
	{ he: "מחלקה", en: "class", category: "programming" },
	{ he: "ממשק", en: "interface", category: "programming" },
	{ he: "מערך", en: "array", category: "programming" },
	{ he: "אובייקט", en: "object", category: "programming" },
	{ he: "לולאה", en: "loop", category: "programming" },
	{ he: "תנאי", en: "condition", category: "programming" },
	{ he: "שגיאה", en: "error", category: "programming" },
	{ he: "באג", en: "bug", category: "programming" },

	// Data
	{ he: "נתונים", en: "data", category: "data" },
	{ he: "מסד נתונים", en: "database", category: "data" },
	{ he: "שאילתה", en: "query", category: "data" },
	{ he: "חיפוש", en: "search", category: "data" },
	{ he: "אינדקס", en: "index", category: "data" },
	{ he: "טבלה", en: "table", category: "data" },
	{ he: "רשומה", en: "record", category: "data" },

	// Israeli Government Ministries
	{ he: "משרד הפנים", en: "Ministry of Interior", category: "government" },
	{ he: "משרד הבריאות", en: "Ministry of Health", category: "government" },
	{ he: "רשות המיסים", en: "Tax Authority", category: "government" },
	{ he: "ביטוח לאומי", en: "National Insurance", category: "government" },
	{ he: "משרד התחבורה", en: "Ministry of Transport", category: "government" },
	{ he: "משרד החינוך", en: "Ministry of Education", category: "government" },
	{ he: "משרד האוצר", en: "Ministry of Finance", category: "government" },
	{ he: "משרד המשפטים", en: "Ministry of Justice", category: "government" },
	{ he: "משרד הביטחון", en: "Ministry of Defense", category: "government" },

	// Transportation
	{ he: "רכב", en: "vehicle", category: "transportation" },
	{ he: "רישיון נהיגה", en: "driving license", category: "transportation" },
	{ he: "תחבורה ציבורית", en: "public transport", category: "transportation" },
	{ he: "אוטובוס", en: "bus", category: "transportation" },
	{ he: "רכבת", en: "train", category: "transportation" },
	{ he: "תאונת דרכים", en: "traffic accident", category: "transportation" },

	// Health
	{ he: "בית חולים", en: "hospital", category: "health" },
	{ he: "קופת חולים", en: "health fund", category: "health" },
	{ he: "רופא", en: "doctor", category: "health" },
	{ he: "תרופה", en: "medication", category: "health" },
	{ he: "מרפאה", en: "clinic", category: "health" },

	// Common Locations
	{ he: "ירושלים", en: "Jerusalem", category: "location" },
	{ he: "תל אביב", en: "Tel Aviv", category: "location" },
	{ he: "חיפה", en: "Haifa", category: "location" },
	{ he: "באר שבע", en: "Beer Sheva", category: "location" },
	{ he: "ישראל", en: "Israel", category: "location" },

	// Business
	{ he: "חברה", en: "company", category: "business" },
	{ he: "עסק", en: "business", category: "business" },
	{ he: "לקוח", en: "customer", category: "business" },
	{ he: "מכירות", en: "sales", category: "business" },
	{ he: "שיווק", en: "marketing", category: "business" },
	{ he: "פרויקט", en: "project", category: "business" },
	{ he: "משימה", en: "task", category: "business" },

	// Common Actions
	{ he: "חיפוש", en: "search", category: "action" },
	{ he: "שמירה", en: "save", category: "action" },
	{ he: "מחיקה", en: "delete", category: "action" },
	{ he: "עדכון", en: "update", category: "action" },
	{ he: "יצירה", en: "create", category: "action" },
	{ he: "הורדה", en: "download", category: "action" },
	{ he: "העלאה", en: "upload", category: "action" },
];

/**
 * Get all entities for a specific category
 */
export function getEntitiesByCategory(category: string): BilingualEntitySeed[] {
	return COMMON_BILINGUAL_ENTITIES.filter((e) => e.category === category);
}

/**
 * Find Hebrew translation for English term
 */
export function findHebrewTranslation(englishTerm: string): string | null {
	const normalized = englishTerm.toLowerCase().trim();
	const entity = COMMON_BILINGUAL_ENTITIES.find((e) => e.en.toLowerCase() === normalized);
	return entity?.he ?? null;
}

/**
 * Find English translation for Hebrew term
 */
export function findEnglishTranslation(hebrewTerm: string): string | null {
	const normalized = hebrewTerm.trim();
	const entity = COMMON_BILINGUAL_ENTITIES.find((e) => e.he === normalized);
	return entity?.en ?? null;
}

/**
 * Normalize Hebrew text for matching (remove diacritics)
 */
export function normalizeHebrew(text: string): string {
	return text
		.replace(/[\u0591-\u05C7]/g, "") // Remove Hebrew diacritics (nikud)
		.trim();
}

/**
 * Normalize English text for matching
 */
export function normalizeEnglish(text: string): string {
	return text.toLowerCase().trim();
}
