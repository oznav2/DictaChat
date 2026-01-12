import type { ObjectId } from "mongodb";

/**
 * BilingualEntityMap - Maps entities between Hebrew and English
 *
 * Pre-populated with common terms, grows from usage.
 * Used for cross-lingual memory search (Hebrew query finds English memories and vice versa).
 */
export interface BilingualEntityMap {
	_id: ObjectId;
	userId: string | null; // null = global/system mapping

	// Entity in both languages
	hebrewForm: string; // e.g., "בינה מלאכותית"
	englishForm: string; // e.g., "artificial intelligence"

	// Normalization for search
	hebrewNormalized: string;
	englishNormalized: string;

	// Metadata
	confidence: number; // How confident is this mapping (0.0-1.0)
	source: "system" | "user" | "auto_detected";
	usageCount: number;

	createdAt: Date;
	updatedAt: Date;
}

/**
 * Simplified bilingual entity for seeding
 */
export interface BilingualEntitySeed {
	he: string;
	en: string;
	category?: string;
}
