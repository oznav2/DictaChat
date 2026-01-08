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
