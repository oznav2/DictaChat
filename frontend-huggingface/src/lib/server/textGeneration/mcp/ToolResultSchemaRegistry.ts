import type { ErrorObject, ValidateFunction } from "ajv";
import type { OpenAiTool } from "$lib/server/mcp/tools";

import Ajv from "ajv";
import JSON5 from "json5";
import { repairToolJson } from "./ToolCallCodec";

export interface ToolResultSchemaLogger {
	debug?: (message: string, meta?: Record<string, unknown>) => void;
	info?: (message: string, meta?: Record<string, unknown>) => void;
	warn?: (message: string, meta?: Record<string, unknown>) => void;
}

export type ToolResultSchemaEntry =
	| {
			mode: "json";
			validate: ValidateFunction;
			schemaName: string;
	  }
	| {
			mode: "raw";
			reason: "raw-text-only" | "no-schema";
	  };

export interface ToolResultSchemaRegistry {
	entries: Map<string, ToolResultSchemaEntry>;
}

export interface ToolResultValidationResult {
	outputText: string;
	structured?: unknown;
	rawTextOnly: boolean;
}

const DATAGOV_RESULT_SCHEMA = {
	type: "object",
	properties: {
		success: { type: "boolean" },
		result: {
			type: "object",
			properties: {
				records: { type: "array" },
				results: { type: "array" },
				recordsTotal: { type: "number" },
				total: { type: "number" },
			},
			additionalProperties: true,
		},
		records: { type: "array" },
		results: { type: "array" },
		data: { type: "array" },
	},
	additionalProperties: true,
};

const TAVILY_RESULT_SCHEMA = {
	type: "object",
	properties: {
		answer: { type: "string" },
		query: { type: "string" },
		results: {
			type: "array",
			items: {
				type: "object",
				properties: {
					url: { type: "string" },
					title: { type: "string" },
					content: { type: "string" },
					score: { type: "number" },
				},
				additionalProperties: true,
			},
		},
	},
	additionalProperties: true,
};

const PERPLEXITY_RESULT_SCHEMA = {
	type: "object",
	properties: {
		answer: { type: "string" },
		citations: { type: "array" },
		sources: { type: "array" },
	},
	additionalProperties: true,
};

const RAW_ONLY_MATCHERS: RegExp[] = [
	/^docling/i,
	/^add_to_memory_bank$/i,
	/^search_memory$/i,
	/^recall_memory$/i,
	/^read_file$/i,
	/^write_file$/i,
	/^edit_file$/i,
	/^list_directory$/i,
	/^directory_tree$/i,
];

const JSON_SCHEMA_MATCHERS: Array<{ match: RegExp; schema: Record<string, unknown>; label: string }> = [
	{ match: /^(datagov_|datastore_|package_)/i, schema: DATAGOV_RESULT_SCHEMA, label: "datagov" },
	{ match: /^tavily_/i, schema: TAVILY_RESULT_SCHEMA, label: "tavily" },
	{ match: /^perplexity_/i, schema: PERPLEXITY_RESULT_SCHEMA, label: "perplexity" },
];

function normalizeToolName(name: string): string {
	return name.toLowerCase().replace(/-/g, "_");
}

function formatAjvErrors(errors?: ErrorObject[] | null): number {
	return Array.isArray(errors) ? errors.length : 0;
}

export function buildToolResultSchemaRegistry(
	tools: OpenAiTool[],
	logger?: ToolResultSchemaLogger
): ToolResultSchemaRegistry {
	const ajv = new Ajv({ allErrors: true, strict: false });
	const entries = new Map<string, ToolResultSchemaEntry>();
	let jsonCount = 0;
	let rawCount = 0;

	for (const tool of tools) {
		const toolName = tool.function?.name;
		if (!toolName) continue;
		const normalized = normalizeToolName(toolName);

		const rawOnly = RAW_ONLY_MATCHERS.some((pattern) => pattern.test(normalized));
		if (rawOnly) {
			entries.set(normalized, { mode: "raw", reason: "raw-text-only" });
			rawCount += 1;
			continue;
		}

		const matchedSchema = JSON_SCHEMA_MATCHERS.find((rule) => rule.match.test(normalized));
		if (matchedSchema) {
			const validate = ajv.compile(matchedSchema.schema);
			entries.set(normalized, {
				mode: "json",
				validate,
				schemaName: matchedSchema.label,
			});
			jsonCount += 1;
			continue;
		}

		entries.set(normalized, { mode: "raw", reason: "no-schema" });
		rawCount += 1;
	}

	logger?.info?.("[tool-schema] registry built", {
		count: entries.size,
		jsonCount,
		rawCount,
	});

	return { entries };
}

export function validateToolResult(
	toolName: string,
	response: { text?: string; structured?: unknown },
	registry: ToolResultSchemaRegistry,
	logger?: ToolResultSchemaLogger
): ToolResultValidationResult {
	const normalized = normalizeToolName(toolName);
	const entry = registry.entries.get(normalized);
	const rawText = typeof response.text === "string" ? response.text : "";

	const fallbackText = () => {
		if (rawText.trim().length > 0) return rawText;
		if (response.structured !== undefined) {
			try {
				return JSON.stringify(response.structured);
			} catch {
				return "";
			}
		}
		return "";
	};

	if (!entry || entry.mode === "raw") {
		logger?.info?.("[tool-schema] raw-text-only", {
			tool: toolName,
			reason: entry?.mode === "raw" ? entry.reason : "no-schema",
		});
		return { outputText: fallbackText(), rawTextOnly: true };
	}

	const validateCandidate = (candidate: unknown): boolean => {
		const valid = entry.validate(candidate) as boolean;
		if (!valid) {
			logger?.warn?.("[tool-schema] validation failed", {
				tool: toolName,
				errors: formatAjvErrors(entry.validate.errors),
			});
		} else if (entry.schemaName) {
			logger?.info?.(`[tool-schema] ${entry.schemaName} validated`, { tool: toolName });
		}
		return valid;
	};

	if (response.structured && typeof response.structured === "object") {
		if (validateCandidate(response.structured)) {
			return {
				outputText: fallbackText(),
				structured: response.structured,
				rawTextOnly: false,
			};
		}
	}

	if (rawText.trim().length === 0) {
		return { outputText: fallbackText(), rawTextOnly: true };
	}

	let parsed: unknown | null = null;
	try {
		parsed = JSON5.parse(rawText) as unknown;
	} catch {
		const repaired = repairToolJson(rawText);
		if (repaired.repaired) {
			logger?.info?.("[tool-schema] repair attempted", { tool: toolName });
			try {
				parsed = JSON5.parse(repaired.json) as unknown;
			} catch {
				logger?.warn?.("[tool-schema] repair failed", { tool: toolName });
			}
		}
	}

	if (parsed && typeof parsed === "object") {
		if (validateCandidate(parsed)) {
			return {
				outputText: rawText.trim().length > 0 ? rawText : JSON.stringify(parsed),
				structured: parsed,
				rawTextOnly: false,
			};
		}
	}

	if (entry.schemaName) {
		logger?.warn?.(`[tool-schema] ${entry.schemaName} raw-text-only`, {
			tool: toolName,
			reason: "validation-failed",
		});
	}

	return { outputText: fallbackText(), rawTextOnly: true };
}
