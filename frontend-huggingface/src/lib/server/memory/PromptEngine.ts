/**
 * PromptEngine - Handlebars-based template rendering engine for memory prompts
 *
 * Provides:
 * - Template loading from files or strings
 * - Handlebars rendering with custom helpers
 * - Bilingual support (English/Hebrew)
 * - Template metadata and variable tracking
 * - Async initialization for filesystem operations
 *
 * Ported from roampal/backend/modules/prompt/prompt_engine.py
 */

import Handlebars from "handlebars";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename, extname } from "path";
import { logger } from "$lib/server/logger";

// ============================================================================
// Types
// ============================================================================

export type PromptLanguage = "en" | "he" | "bilingual";

export interface PromptTemplate {
	id: string;
	name: string;
	template: string;
	variables: string[];
	language: PromptLanguage;
	description?: string;
	category?: string;
	loadedAt: Date;
	filePath?: string;
}

export interface PromptConfig {
	templatesDir: string;
	defaultLanguage: PromptLanguage;
	enableCaching?: boolean;
	registerDefaultHelpers?: boolean;
}

export interface BilingualResult {
	en: string;
	he: string;
}

export interface RenderContext {
	[key: string]: unknown;
	language?: PromptLanguage;
	user_id?: string;
	conversation_id?: string;
	timestamp?: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Partial<PromptConfig> = {
	defaultLanguage: "en",
	enableCaching: true,
	registerDefaultHelpers: true,
};

// ============================================================================
// Custom Handlebars Helpers
// ============================================================================

function registerHelpers(handlebars: typeof Handlebars): void {
	// Conditional helper for language
	handlebars.registerHelper("ifLang", function (this: unknown, lang: string, options: Handlebars.HelperOptions) {
		const context = this as Record<string, unknown>;
		if (context.language === lang) {
			return options.fn(this);
		}
		return options.inverse(this);
	});

	// RTL wrapper for Hebrew text
	handlebars.registerHelper("rtl", function (text: string) {
		return new Handlebars.SafeString(`<div dir="rtl">${Handlebars.escapeExpression(text)}</div>`);
	});

	// Join array with separator
	handlebars.registerHelper("join", function (arr: unknown[], separator: string) {
		if (!Array.isArray(arr)) return "";
		return arr.join(typeof separator === "string" ? separator : ", ");
	});

	// Truncate text
	handlebars.registerHelper("truncate", function (text: string, length: number) {
		if (typeof text !== "string") return "";
		if (text.length <= length) return text;
		return text.slice(0, length) + "...";
	});

	// Format date
	handlebars.registerHelper("formatDate", function (date: string | Date) {
		if (!date) return "";
		const d = typeof date === "string" ? new Date(date) : date;
		return d.toLocaleDateString();
	});

	// Format number with percentage
	handlebars.registerHelper("percent", function (num: number) {
		if (typeof num !== "number") return "0%";
		return `${Math.round(num * 100)}%`;
	});

	// Default value helper
	handlebars.registerHelper("default", function (value: unknown, defaultValue: unknown) {
		return value ?? defaultValue;
	});

	// Conditional block for non-empty arrays
	handlebars.registerHelper("ifNotEmpty", function (this: unknown, arr: unknown[], options: Handlebars.HelperOptions) {
		if (Array.isArray(arr) && arr.length > 0) {
			return options.fn(this);
		}
		return options.inverse(this);
	});

	// Math helpers
	handlebars.registerHelper("add", function (a: number, b: number) {
		return (a || 0) + (b || 0);
	});

	handlebars.registerHelper("multiply", function (a: number, b: number) {
		return (a || 0) * (b || 0);
	});

	// String helpers
	handlebars.registerHelper("uppercase", function (text: string) {
		return typeof text === "string" ? text.toUpperCase() : "";
	});

	handlebars.registerHelper("lowercase", function (text: string) {
		return typeof text === "string" ? text.toLowerCase() : "";
	});

	// Comparison helpers
	handlebars.registerHelper("eq", function (a: unknown, b: unknown) {
		return a === b;
	});

	handlebars.registerHelper("gt", function (a: number, b: number) {
		return a > b;
	});

	handlebars.registerHelper("lt", function (a: number, b: number) {
		return a < b;
	});

	handlebars.registerHelper("gte", function (a: number, b: number) {
		return a >= b;
	});

	handlebars.registerHelper("lte", function (a: number, b: number) {
		return a <= b;
	});

	// Logical helpers
	handlebars.registerHelper("and", function (...args: unknown[]) {
		// Remove the options object from args
		const values = args.slice(0, -1);
		return values.every(Boolean);
	});

	handlebars.registerHelper("or", function (...args: unknown[]) {
		// Remove the options object from args
		const values = args.slice(0, -1);
		return values.some(Boolean);
	});

	handlebars.registerHelper("not", function (value: unknown) {
		return !value;
	});

	// JSON helper for debugging
	handlebars.registerHelper("json", function (obj: unknown) {
		return new Handlebars.SafeString(JSON.stringify(obj, null, 2));
	});

	// Safe HTML helper (for pre-escaped content)
	handlebars.registerHelper("safe", function (text: string) {
		return new Handlebars.SafeString(text);
	});

	// Coalesce helper (first non-null value)
	handlebars.registerHelper("coalesce", function (...args: unknown[]) {
		// Remove the options object from args
		const values = args.slice(0, -1);
		for (const value of values) {
			if (value != null && value !== "") {
				return value;
			}
		}
		return "";
	});

	// Repeat helper
	handlebars.registerHelper("repeat", function (count: number, options: Handlebars.HelperOptions) {
		let result = "";
		for (let i = 0; i < count; i++) {
			result += options.fn({ index: i, first: i === 0, last: i === count - 1 });
		}
		return result;
	});
}

// ============================================================================
// PromptEngine Class
// ============================================================================

export class PromptEngine {
	private templates: Map<string, Handlebars.TemplateDelegate>;
	private templateMetadata: Map<string, PromptTemplate>;
	private config: PromptConfig;
	private handlebars: typeof Handlebars;
	private initialized: boolean = false;

	constructor(config: Partial<PromptConfig> & { templatesDir: string }) {
		this.config = { ...DEFAULT_CONFIG, ...config } as PromptConfig;
		this.templates = new Map();
		this.templateMetadata = new Map();
		this.handlebars = Handlebars.create();

		if (this.config.registerDefaultHelpers) {
			registerHelpers(this.handlebars);
		}
	}

	// ============================================================================
	// Initialization
	// ============================================================================

	/**
	 * Initialize the engine and load templates from disk
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			// Load all templates from directory
			if (existsSync(this.config.templatesDir)) {
				await this.loadTemplatesFromDirectory(this.config.templatesDir);
			} else {
				logger.warn({ dir: this.config.templatesDir }, "Templates directory does not exist");
			}

			this.initialized = true;
			logger.info(
				{ templateCount: this.templates.size, dir: this.config.templatesDir },
				"PromptEngine initialized"
			);
		} catch (err) {
			logger.error({ err, dir: this.config.templatesDir }, "Failed to initialize PromptEngine");
			throw err;
		}
	}

	/**
	 * Load all .hbs templates from a directory
	 */
	private async loadTemplatesFromDirectory(dir: string): Promise<void> {
		const files = readdirSync(dir);

		for (const file of files) {
			const filePath = join(dir, file);
			const stat = statSync(filePath);

			if (stat.isDirectory()) {
				// Recursively load from subdirectories
				await this.loadTemplatesFromDirectory(filePath);
			} else if (file.endsWith(".hbs")) {
				const templateId = basename(file, ".hbs");
				const content = readFileSync(filePath, "utf-8");
				await this.loadTemplate(templateId, content, filePath);
			}
		}
	}

	// ============================================================================
	// Template Loading
	// ============================================================================

	/**
	 * Load a template from a string
	 */
	async loadTemplate(id: string, template: string, filePath?: string): Promise<void> {
		try {
			// Extract variables from template
			const variables = this.extractVariables(template);

			// Detect language from template content or ID
			const language = this.detectLanguage(id, template);

			// Extract metadata from template comments
			const { description, category } = this.extractMetadata(template);

			// Compile template
			const compiled = this.handlebars.compile(template, { strict: false });

			// Store template and metadata
			this.templates.set(id, compiled);
			this.templateMetadata.set(id, {
				id,
				name: this.formatTemplateName(id),
				template,
				variables,
				language,
				description,
				category,
				loadedAt: new Date(),
				filePath,
			});

			logger.debug({ id, variables: variables.length, language }, "Template loaded");
		} catch (err) {
			logger.error({ err, id }, "Failed to load template");
			throw new Error(`Failed to load template '${id}': ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Extract variable names from a Handlebars template
	 */
	private extractVariables(template: string): string[] {
		const variables = new Set<string>();

		// Match {{variable}} and {{#if variable}} patterns
		const regex = /\{\{(?:#\w+\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/g;
		let match;

		while ((match = regex.exec(template)) !== null) {
			const varName = match[1];
			// Exclude helpers and keywords
			if (!this.isHelper(varName) && !this.isKeyword(varName)) {
				variables.add(varName);
			}
		}

		return Array.from(variables);
	}

	private isHelper(name: string): boolean {
		const helpers = [
			"if",
			"unless",
			"each",
			"with",
			"lookup",
			"log",
			// Custom helpers
			"ifLang",
			"rtl",
			"join",
			"truncate",
			"formatDate",
			"percent",
			"default",
			"ifNotEmpty",
			"add",
			"multiply",
			"uppercase",
			"lowercase",
			"eq",
			"gt",
			"lt",
			"gte",
			"lte",
			"and",
			"or",
			"not",
			"json",
			"safe",
			"coalesce",
			"repeat",
		];
		return helpers.includes(name);
	}

	private isKeyword(name: string): boolean {
		const keywords = ["this", "root", "first", "last", "index", "key"];
		return keywords.includes(name);
	}

	/**
	 * Detect language from template ID or content
	 */
	private detectLanguage(id: string, template: string): PromptLanguage {
		// Check ID suffix
		if (id.endsWith("-he") || id.endsWith("_he")) return "he";
		if (id.endsWith("-en") || id.endsWith("_en")) return "en";

		// Check for Hebrew characters in template
		const hebrewRegex = /[\u0590-\u05FF]/;
		const hasHebrew = hebrewRegex.test(template);

		// Check for bilingual markers
		if (template.includes("{{#ifLang") || template.includes("{{ifLang")) {
			return "bilingual";
		}

		return hasHebrew ? "he" : "en";
	}

	/**
	 * Extract description and category from template comments
	 */
	private extractMetadata(template: string): { description?: string; category?: string } {
		const result: { description?: string; category?: string } = {};

		// Look for {{!-- @description: ... --}} comments
		const descMatch = template.match(/\{\{!--\s*@description:\s*(.+?)\s*--\}\}/);
		if (descMatch) {
			result.description = descMatch[1];
		}

		// Look for {{!-- @category: ... --}} comments
		const catMatch = template.match(/\{\{!--\s*@category:\s*(.+?)\s*--\}\}/);
		if (catMatch) {
			result.category = catMatch[1];
		}

		return result;
	}

	/**
	 * Format template ID into human-readable name
	 */
	private formatTemplateName(id: string): string {
		return id
			.replace(/[-_]/g, " ")
			.replace(/\b\w/g, (c) => c.toUpperCase())
			.trim();
	}

	// ============================================================================
	// Rendering
	// ============================================================================

	/**
	 * Render a template with the given variables
	 */
	render(templateId: string, variables: RenderContext = {}): string {
		const template = this.templates.get(templateId);
		if (!template) {
			throw new Error(`Template '${templateId}' not found`);
		}

		try {
			// Add default context
			const context: RenderContext = {
				language: this.config.defaultLanguage,
				timestamp: new Date().toISOString(),
				...variables,
			};

			return template(context).trim();
		} catch (err) {
			logger.error({ err, templateId }, "Failed to render template");
			throw new Error(
				`Failed to render template '${templateId}': ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}

	/**
	 * Render template in both languages (bilingual output)
	 */
	renderBilingual(templateId: string, variables: RenderContext = {}): BilingualResult {
		// Check if there are language-specific templates
		const enTemplateId = `${templateId}-en`;
		const heTemplateId = `${templateId}-he`;

		let enResult: string;
		let heResult: string;

		// Try language-specific templates first
		if (this.templates.has(enTemplateId) && this.templates.has(heTemplateId)) {
			enResult = this.render(enTemplateId, { ...variables, language: "en" });
			heResult = this.render(heTemplateId, { ...variables, language: "he" });
		} else if (this.templates.has(templateId)) {
			// Use bilingual template with language switch
			enResult = this.render(templateId, { ...variables, language: "en" });
			heResult = this.render(templateId, { ...variables, language: "he" });
		} else {
			throw new Error(`Template '${templateId}' not found`);
		}

		return { en: enResult, he: heResult };
	}

	/**
	 * Render template with automatic language detection from variables
	 */
	renderAuto(templateId: string, variables: RenderContext = {}): string {
		const language = variables.language ?? this.config.defaultLanguage;

		// Check for language-specific template
		const langTemplateId = `${templateId}-${language}`;
		if (this.templates.has(langTemplateId)) {
			return this.render(langTemplateId, variables);
		}

		// Fall back to base template
		return this.render(templateId, { ...variables, language });
	}

	// ============================================================================
	// Template Info
	// ============================================================================

	/**
	 * Get metadata for a template
	 */
	getTemplateInfo(templateId: string): PromptTemplate | null {
		return this.templateMetadata.get(templateId) ?? null;
	}

	/**
	 * List all loaded templates
	 */
	listTemplates(): PromptTemplate[] {
		return Array.from(this.templateMetadata.values());
	}

	/**
	 * List templates by category
	 */
	listTemplatesByCategory(category: string): PromptTemplate[] {
		return this.listTemplates().filter((t) => t.category === category);
	}

	/**
	 * List templates by language
	 */
	listTemplatesByLanguage(language: PromptLanguage): PromptTemplate[] {
		return this.listTemplates().filter((t) => t.language === language || t.language === "bilingual");
	}

	/**
	 * Check if a template exists
	 */
	hasTemplate(templateId: string): boolean {
		return this.templates.has(templateId);
	}

	// ============================================================================
	// Template Management
	// ============================================================================

	/**
	 * Reload all templates from disk
	 */
	async reload(): Promise<void> {
		this.templates.clear();
		this.templateMetadata.clear();
		this.initialized = false;
		await this.initialize();
	}

	/**
	 * Unload a specific template
	 */
	unloadTemplate(templateId: string): boolean {
		const deleted = this.templates.delete(templateId);
		this.templateMetadata.delete(templateId);
		return deleted;
	}

	/**
	 * Register a custom Handlebars helper
	 */
	registerHelper(name: string, fn: Handlebars.HelperDelegate): void {
		this.handlebars.registerHelper(name, fn);
	}

	/**
	 * Register a partial template
	 */
	registerPartial(name: string, template: string): void {
		this.handlebars.registerPartial(name, template);
	}

	// ============================================================================
	// Utility Methods
	// ============================================================================

	/**
	 * Validate variables against template requirements
	 */
	validateVariables(templateId: string, variables: Record<string, unknown>): { valid: boolean; missing: string[] } {
		const info = this.getTemplateInfo(templateId);
		if (!info) {
			return { valid: false, missing: [] };
		}

		const missing = info.variables.filter((v) => !(v in variables));
		return {
			valid: missing.length === 0,
			missing,
		};
	}

	/**
	 * Get required variables for a template
	 */
	getRequiredVariables(templateId: string): string[] {
		const info = this.getTemplateInfo(templateId);
		return info?.variables ?? [];
	}

	/**
	 * Compile a template string without storing it
	 */
	compileOnce(template: string): (context: RenderContext) => string {
		const compiled = this.handlebars.compile(template, { strict: false });
		return (context: RenderContext) => compiled(context).trim();
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

let _instance: PromptEngine | null = null;

/**
 * Get or create the singleton PromptEngine instance
 */
export function getPromptEngine(config?: Partial<PromptConfig> & { templatesDir: string }): PromptEngine {
	if (!_instance && !config) {
		throw new Error("PromptEngine not initialized. Call with config first.");
	}

	if (!_instance && config) {
		_instance = new PromptEngine(config);
	}

	return _instance!;
}

/**
 * Create a new PromptEngine instance (for testing/isolation)
 */
export function createPromptEngine(config: Partial<PromptConfig> & { templatesDir: string }): PromptEngine {
	return new PromptEngine(config);
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetPromptEngine(): void {
	_instance = null;
}

// ============================================================================
// Exports
// ============================================================================

export default PromptEngine;
