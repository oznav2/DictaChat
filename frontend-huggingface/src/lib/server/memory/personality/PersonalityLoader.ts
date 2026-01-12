/**
 * PersonalityLoader - YAML template loading with mtime-based caching
 *
 * Loads personality templates from disk and converts them to natural language
 * prompts for LLM injection. Uses file modification time to invalidate cache.
 *
 * Fallback chain: active.txt → default.txt → minimal default prompt
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import YAML from "yaml";
import { logger } from "$lib/server/logger";
import { collections } from "$lib/server/database";
import type { ObjectId } from "mongodb";

/**
 * Personality YAML schema
 */
export interface PersonalityIdentity {
	name: string;
	role?: string;
	expertise?: string[];
	background?: string;
}

export interface PersonalityCommunication {
	tone?: "warm" | "professional" | "direct" | "enthusiastic";
	verbosity?: "concise" | "balanced" | "detailed";
	formality?: "casual" | "professional" | "formal";
	use_analogies?: boolean;
	use_examples?: boolean;
	use_humor?: boolean;
}

export interface PersonalityResponseBehavior {
	citation_style?: "always_cite" | "cite_patterns" | "conversational";
	clarification?: "ask_questions" | "make_assumptions";
	show_reasoning?: boolean;
	step_by_step?: boolean;
	prioritize?: "accuracy" | "speed";
}

export interface PersonalityMemoryUsage {
	priority?: "when_relevant" | "always_reference";
	pattern_trust?: "balanced" | "heavily_favor";
	historical_context?: "reference_past" | "current_only";
}

export interface PersonalityFormatting {
	structure?: "mixed" | "bullets";
	code_blocks?: "separate" | "inline";
	emphasis?: "markdown" | "plain";
}

export interface PersonalityYAML {
	identity: PersonalityIdentity;
	communication?: PersonalityCommunication;
	response_behavior?: PersonalityResponseBehavior;
	memory_usage?: PersonalityMemoryUsage;
	formatting?: PersonalityFormatting;
	personality_traits?: string[];
	custom_instructions?: string;
}

/**
 * Minimal default personality when no template is available
 */
const MINIMAL_DEFAULT_PROMPT = `You are DictaChat, a helpful assistant with persistent memory.

The user is a distinct person. When they ask "my name", "my preferences", or "what I said", they mean THEIR information (search memory_bank), not yours.

Style: warm tone, balanced responses`;

/**
 * Convert YAML template to natural language prompt
 */
export function templateToPrompt(templateData: PersonalityYAML): string {
	const parts: string[] = [];

	// 1. Identity Section
	const identity = templateData.identity || ({} as PersonalityIdentity);
	const name = identity.name || "DictaChat";
	const role = identity.role || "helpful assistant";
	const expertise = identity.expertise || [];
	const background = identity.background || "";

	parts.push(`You are ${name}, a ${role}.`);
	if (expertise.length > 0) {
		parts.push(`Expertise: ${expertise.join(", ")}.`);
	}
	if (background) {
		parts.push(background);
	}

	// 2. CRITICAL: Pronoun Disambiguation (Roampal parity)
	// This prevents the LLM from confusing user identity with its own
	parts.push(
		'\nThe user is a distinct person. When they ask "my name", "my preferences", ' +
			'or "what I said", they mean THEIR information (search memory_bank), not yours.'
	);

	// 3. Custom Instructions (moved up for prominence)
	const custom = templateData.custom_instructions || "";
	if (custom.trim()) {
		parts.push(`\n${custom.trim()}`);
	}

	// 4. Communication Style (condensed)
	const comm = templateData.communication || {};
	const tone = comm.tone || "neutral";
	const verbosity = comm.verbosity || "balanced";

	const styleParts: string[] = [`${tone} tone`, `${verbosity} responses`];
	if (comm.use_analogies) styleParts.push("use analogies");
	if (comm.use_examples) styleParts.push("provide examples");
	if (comm.use_humor) styleParts.push("light humor ok");

	parts.push(`\nStyle: ${styleParts.join(", ")}`);

	// 5. Response Behavior (condensed)
	const behavior = templateData.response_behavior || {};
	if (behavior.show_reasoning) {
		parts.push("Show reasoning with <think>...</think> when helpful.");
	}
	if (behavior.step_by_step) {
		parts.push("Use step-by-step explanations for complex topics.");
	}
	if (behavior.clarification === "ask_questions") {
		parts.push("Ask clarifying questions when needed.");
	}

	// 6. Memory Usage hints
	const memoryUsage = templateData.memory_usage || {};
	if (memoryUsage.priority === "always_reference") {
		parts.push("Always check memory for relevant past context.");
	}
	if (memoryUsage.pattern_trust === "heavily_favor") {
		parts.push("Heavily favor proven patterns from memory.");
	}

	// 7. Traits
	const traits = templateData.personality_traits || [];
	if (traits.length > 0) {
		parts.push(`\nTraits: ${traits.join(", ")}`);
	}

	return parts.join("\n");
}

/**
 * PersonalityLoader with mtime-based caching
 */
export class PersonalityLoader {
	private cache: string | null = null;
	private cacheMtime: number = 0;
	private cacheRaw: PersonalityYAML | null = null;

	// Per-user personality cache (database-stored)
	private userCache = new Map<string, { content: string; loadedAt: Date }>();
	private readonly USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	private readonly templatePath: string;
	private readonly defaultPresetPath: string;

	constructor(basePath?: string) {
		// Default paths relative to the frontend app root
		const base = basePath || process.cwd();
		this.templatePath = join(base, "templates/personality/active.txt");
		this.defaultPresetPath = join(base, "templates/personality/presets/default.txt");
	}

	/**
	 * Load and cache personality template
	 * Returns rendered prompt string or minimal default
	 */
	loadTemplate(): string {
		try {
			// Determine which file to use
			let targetPath = this.templatePath;

			if (!existsSync(this.templatePath)) {
				// Fallback to default preset
				if (existsSync(this.defaultPresetPath)) {
					targetPath = this.defaultPresetPath;
					logger.debug("Using default personality preset");
				} else {
					logger.warn("No personality template found, using minimal default");
					return MINIMAL_DEFAULT_PROMPT;
				}
			}

			// Get current file modification time
			const currentMtime = statSync(targetPath).mtimeMs;

			// Reload ONLY if file changed or cache empty
			if (currentMtime > this.cacheMtime || !this.cache) {
				const content = readFileSync(targetPath, "utf-8");
				const templateData = YAML.parse(content) as PersonalityYAML;

				// Validate required fields
				if (!templateData.identity || !templateData.identity.name) {
					logger.warn("Personality template missing identity.name, using minimal default");
					return MINIMAL_DEFAULT_PROMPT;
				}

				this.cacheRaw = templateData;
				this.cache = templateToPrompt(templateData);
				this.cacheMtime = currentMtime;
				logger.info({ name: templateData.identity.name }, "Loaded personality template");
			}

			return this.cache!;
		} catch (err) {
			logger.error({ err }, "Failed to load personality template");
			return MINIMAL_DEFAULT_PROMPT;
		}
	}

	/**
	 * Get the raw parsed YAML (for UI display)
	 */
	getRawTemplate(): PersonalityYAML | null {
		// Ensure cache is populated
		this.loadTemplate();
		return this.cacheRaw;
	}

	/**
	 * Get assistant name from template
	 */
	getAssistantName(): string {
		this.loadTemplate();
		return this.cacheRaw?.identity?.name || "DictaChat";
	}

	/**
	 * Force cache invalidation
	 */
	invalidateCache(): void {
		this.cache = null;
		this.cacheRaw = null;
		this.cacheMtime = 0;
		logger.debug("Personality cache invalidated");
	}

	// ========================================
	// Database-aware methods (roampal parity)
	// ========================================

	/**
	 * Get personality for a specific user (database-first, fallback to default template)
	 */
	async getPersonality(userId: string | ObjectId): Promise<{
		name: string;
		content: string;
		isDefault: boolean;
	}> {
		const userIdStr = typeof userId === "string" ? userId : userId.toString();

		// Check cache first
		const cached = this.userCache.get(userIdStr);
		if (cached && Date.now() - cached.loadedAt.getTime() < this.USER_CACHE_TTL) {
			return { name: "custom", content: cached.content, isDefault: false };
		}

		try {
			// Try database
			const doc = await collections.userPersonality.findOne({ userId: userIdStr });

			if (doc?.yaml_content) {
				this.userCache.set(userIdStr, {
					content: doc.yaml_content,
					loadedAt: new Date(),
				});
				return {
					name: doc.preset_name || "custom",
					content: doc.yaml_content,
					isDefault: false,
				};
			}
		} catch (err) {
			logger.warn({ err, userId: userIdStr }, "Failed to load user personality from database");
		}

		// Return default template
		return {
			name: "default",
			content: this.loadTemplate(),
			isDefault: true,
		};
	}

	/**
	 * Validate YAML structure
	 */
	validateYaml(yamlContent: string): { valid: boolean; error?: string } {
		try {
			const parsed = YAML.parse(yamlContent);

			// Validate required fields based on schema
			if (!parsed || typeof parsed !== "object") {
				return { valid: false, error: "YAML must be an object" };
			}

			// Check for identity (required by our schema)
			if (!parsed.identity || typeof parsed.identity !== "object") {
				return { valid: false, error: "identity section is required" };
			}

			if (!parsed.identity.name || typeof parsed.identity.name !== "string") {
				return { valid: false, error: "identity.name is required" };
			}

			// Optional: validate known keys
			const validKeys = [
				"identity",
				"communication",
				"response_behavior",
				"memory_usage",
				"formatting",
				"personality_traits",
				"custom_instructions",
			];
			const keys = Object.keys(parsed);
			const invalidKeys = keys.filter((k) => !validKeys.includes(k));

			if (invalidKeys.length > 0) {
				return {
					valid: false,
					error: `Unknown keys: ${invalidKeys.join(", ")}`,
				};
			}

			return { valid: true };
		} catch (err) {
			return {
				valid: false,
				error: err instanceof Error ? err.message : "Invalid YAML syntax",
			};
		}
	}

	/**
	 * Reload personality cache for a user
	 */
	async reloadPersonality(userId: string | ObjectId): Promise<void> {
		const userIdStr = typeof userId === "string" ? userId : userId.toString();
		this.userCache.delete(userIdStr);
		await this.getPersonality(userIdStr); // Re-cache
		logger.debug({ userId: userIdStr }, "User personality cache reloaded");
	}

	/**
	 * Get available personality presets
	 */
	async getPresets(): Promise<
		Array<{
			name: string;
			description: string;
			preview: string;
			yaml_content?: string;
		}>
	> {
		return [
			{
				name: "default",
				description: "Standard DictaChat assistant - helpful and professional",
				preview: "Balanced, clear, efficient",
			},
			{
				name: "friendly",
				description: "Warm and conversational tone",
				preview: "Casual, encouraging, personable",
			},
			{
				name: "technical",
				description: "Precise and detail-oriented for developers",
				preview: "Technical, thorough, precise",
			},
			{
				name: "creative",
				description: "Imaginative and expressive style",
				preview: "Creative, expressive, innovative",
			},
		];
	}
}

/**
 * Singleton instance for application-wide use
 */
let _instance: PersonalityLoader | null = null;

export function getPersonalityLoader(basePath?: string): PersonalityLoader {
	if (!_instance) {
		_instance = new PersonalityLoader(basePath);
	}
	return _instance;
}

/**
 * Factory function for testing/isolation
 */
export function createPersonalityLoader(basePath?: string): PersonalityLoader {
	return new PersonalityLoader(basePath);
}
