/**
 * Memory Seeders - System knowledge pre-population
 *
 * Seeds the memory system with tool capabilities, DataGov categories,
 * and knowledge graph concepts so the model can answer questions
 * about available features and the D3 visualization has data.
 */

export { seedMcpTools } from "./mcpToolSeeder";
export { seedDataGovCategories } from "./datagovSeeder";
export { seedKnowledgeGraph } from "./kgSeeder";
export {
	COMMON_BILINGUAL_ENTITIES,
	getEntitiesByCategory,
	findHebrewTranslation,
	findEnglishTranslation,
	normalizeHebrew,
	normalizeEnglish,
} from "./bilingualEntities";

import { seedMcpTools } from "./mcpToolSeeder";
import { seedDataGovCategories } from "./datagovSeeder";
import { seedKnowledgeGraph } from "./kgSeeder";
import { logger } from "$lib/server/logger";

let seeded = false;

/**
 * Run all seeders (idempotent - safe to call multiple times)
 */
export async function runAllSeeders(): Promise<void> {
	if (seeded) {
		return;
	}

	try {
		logger.info("[Seeder] Running memory system seeders...");
		await Promise.all([seedMcpTools(), seedDataGovCategories(), seedKnowledgeGraph()]);
		seeded = true;
		logger.info("[Seeder] Memory system seeding complete");
	} catch (err) {
		logger.error({ err }, "[Seeder] Failed to run seeders");
	}
}
