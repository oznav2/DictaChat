import type { ErrorObject, ValidateFunction } from "ajv";
import type { OpenAiTool } from "$lib/server/mcp/tools";

import Ajv from "ajv";
import JSON5 from "json5";
import { extractJsonObjectSlice } from "$lib/server/textGeneration/utils/jsonExtractor";

export type ToolCallSource = "xml" | "json";

export interface ToolCallCodecLogger {
	debug?: (message: string, meta?: Record<string, unknown>) => void;
	info?: (message: string, meta?: Record<string, unknown>) => void;
	warn?: (message: string, meta?: Record<string, unknown>) => void;
}

export interface DecodedToolCall {
	name: string;
	arguments: string;
}

export interface ToolCallDecodeResult {
	source: ToolCallSource;
	toolCalls: DecodedToolCall[];
	repaired: boolean;
	errors?: string[];
}

export interface ToolCallDecodeOptions {
	allowXml?: boolean;
	allowJson?: boolean;
	prefer?: ToolCallSource;
	toolDefinitions?: OpenAiTool[];
	logger?: ToolCallCodecLogger;
	timeoutMs?: number;
}

export interface ToolCallWorkerDecodeOptions extends ToolCallDecodeOptions {
	fallbackMode?: "inline" | "none";
}

export function stripBidiControls(payload: string): { text: string; removed: number } {
	let removed = 0;
	const text = payload.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, () => {
		removed += 1;
		return "";
	});
	return { text, removed };
}

export function normalizeUnicode(payload: string): string {
	return payload.normalize("NFKC");
}

export function repairToolJson(payload: string): { json: string; repaired: boolean } {
	let repaired = false;
	let out = "";
	let inString: "'" | '"' | null = null;
	let escapeNext = false;
	let openCurly = 0;
	let openBracket = 0;

	for (let i = 0; i < payload.length; i++) {
		const char = payload[i];

		if (escapeNext) {
			out += char;
			escapeNext = false;
			continue;
		}

		if (char === "\\") {
			out += char;
			if (inString) escapeNext = true;
			continue;
		}

		if (inString) {
			out += char;
			if (char === inString) inString = null;
			continue;
		}

		if (char === '"' || char === "'") {
			inString = char as '"' | "'";
			out += char;
			continue;
		}

		if (char === "{") openCurly += 1;
		if (char === "}") openCurly = Math.max(0, openCurly - 1);
		if (char === "[") openBracket += 1;
		if (char === "]") openBracket = Math.max(0, openBracket - 1);

		if (char === ":") {
			out += char;
			let j = i + 1;
			while (j < payload.length && /\s/.test(payload[j])) {
				out += payload[j];
				j++;
			}
			if (j >= payload.length) {
				i = j - 1;
				continue;
			}

			const next = payload[j];
			if (next === '"' || next === "'" || next === "{" || next === "[") {
				i = j - 1;
				continue;
			}
			if (next === "-" || /\d/.test(next)) {
				i = j - 1;
				continue;
			}
			const rest = payload.slice(j);
			if (/^(true|false|null)\b/.test(rest)) {
				i = j - 1;
				continue;
			}

			let end = j;
			while (end < payload.length) {
				const c = payload[end];
				if (c === "," || c === "}" || c === "]") break;
				end++;
			}

			const raw = payload.slice(j, end);
			const trimmed = raw.trimEnd();
			const trailing = raw.slice(trimmed.length);
			if (trimmed.length === 0) {
				i = end - 1;
				continue;
			}

			const escaped = trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
			out += `"${escaped}"${trailing}`;
			repaired = true;
			i = end - 1;
			continue;
		}

		out += char;
	}

	if (openCurly > 0 || openBracket > 0) {
		repaired = true;
		out += "}".repeat(openCurly) + "]".repeat(openBracket);
	}

	return { json: out, repaired };
}

export async function parseWithTimeout<T>(
	payload: string,
	ms = 30,
	parser: (input: string) => T = JSON5.parse
): Promise<{ ok: boolean; value?: T; error?: Error; timedOut: boolean }> {
	let timeoutId: NodeJS.Timeout | null = null;
	const timeoutPromise = new Promise<{ ok: boolean; timedOut: boolean }>((resolve) => {
		timeoutId = setTimeout(() => resolve({ ok: false, timedOut: true }), ms);
	});
	const parsePromise = Promise.resolve().then(() => {
		try {
			const value = parser(payload);
			return { ok: true, value, timedOut: false } as const;
		} catch (error) {
			return { ok: false, error: error as Error, timedOut: false } as const;
		}
	});

	const result = await Promise.race([parsePromise, timeoutPromise]);
	if (timeoutId) clearTimeout(timeoutId);
	if (result.ok) return result;
	if ("timedOut" in result && result.timedOut) {
		return { ok: false, timedOut: true };
	}
	return { ok: false, error: result.error, timedOut: false };
}

export async function decodeToolCallFromStream(
	text: string,
	opts: ToolCallDecodeOptions = {}
): Promise<ToolCallDecodeResult | null> {
	const allowXml = opts.allowXml ?? true;
	const allowJson = opts.allowJson ?? true;
	const prefer = opts.prefer ?? "xml";
	const timeoutMs = opts.timeoutMs ?? 30;
	const logger = opts.logger;

	const registry = opts.toolDefinitions
		? buildToolSchemaRegistry(opts.toolDefinitions, logger)
		: null;

	const formats: ToolCallSource[] = prefer === "xml" ? ["xml", "json"] : ["json", "xml"];
	const errors: string[] = [];

	logger?.debug?.("[codec] parse attempt", { allowXml, allowJson, prefer });

	for (const format of formats) {
		if (format === "xml" && allowXml) {
			const xmlPayloads = extractXmlToolCallPayloads(text);
			if (xmlPayloads.length === 0) continue;

			const parsed = await parseToolCallsFromXml(xmlPayloads, timeoutMs, registry, logger);
			if (parsed.toolCalls.length > 0) {
				return { source: "xml", toolCalls: parsed.toolCalls, repaired: parsed.repaired };
			}
			errors.push(...parsed.errors);
		}

		if (format === "json" && allowJson) {
			const jsonResult = await parseToolCallsFromJson(text, timeoutMs, registry, logger);
			if (jsonResult.toolCalls.length > 0) {
				return { source: "json", toolCalls: jsonResult.toolCalls, repaired: jsonResult.repaired };
			}
			errors.push(...jsonResult.errors);
		}
	}

	if (errors.length > 0) {
		return { source: prefer, toolCalls: [], repaired: false, errors };
	}

	return null;
}

/** Decode tool calls via worker pool when available (falls back based on mode). */
export async function decodeToolCallFromStreamViaWorker(
	text: string,
	opts: ToolCallWorkerDecodeOptions = {}
): Promise<ToolCallDecodeResult | null> {
	const { fallbackMode = "none", logger, ...workerOptions } = opts;
	try {
		const { runToolParseJob } = await import("./workerPool");
		const result = await runToolParseJob(
			{
				text,
				options: workerOptions,
				toolDefinitions: workerOptions.toolDefinitions,
			},
			workerOptions.timeoutMs ?? 30
		);
		if (
			fallbackMode === "inline" &&
			result &&
			(!result.toolCalls || result.toolCalls.length === 0) &&
			result.errors &&
			result.errors.length > 0
		) {
			const inline = await decodeToolCallFromStream(text, opts);
			if (inline && inline.toolCalls.length > 0) return inline;
		}
		return result;
	} catch (err) {
		logger?.warn?.("[worker-pool] fallback to inline parse", {
			error: err instanceof Error ? err.message : String(err),
		});
		if (fallbackMode === "inline") {
			return decodeToolCallFromStream(text, opts);
		}
		return null;
	}
}

function buildToolSchemaRegistry(
	tools: OpenAiTool[],
	logger?: ToolCallCodecLogger
): Map<string, ValidateFunction> {
	const ajv = new Ajv({ allErrors: true, strict: false });
	const registry = new Map<string, ValidateFunction>();

	for (const tool of tools) {
		const name = tool.function?.name;
		const schema = tool.function?.parameters;
		if (!name || !schema || typeof schema !== "object") continue;
		try {
			const validate = ajv.compile(schema);
			registry.set(name, validate);
		} catch (err) {
			logger?.warn?.("[codec] schema compile failed", {
				tool: name,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return registry;
}

async function parseToolCallsFromXml(
	payloads: string[],
	timeoutMs: number,
	registry: Map<string, ValidateFunction> | null,
	logger?: ToolCallCodecLogger
): Promise<{ toolCalls: DecodedToolCall[]; repaired: boolean; errors: string[] }> {
	const toolCalls: DecodedToolCall[] = [];
	let repairedAny = false;
	const errors: string[] = [];

	for (const payload of payloads) {
		const normalized = preprocessPayload(payload, logger);
		const parsed = await parseJsonWithRepair(normalized.text, timeoutMs, logger);
		if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
			errors.push("xml-parse-failed");
			continue;
		}
		repairedAny = repairedAny || parsed.repaired;
		const { calls, valid } = validateParsedCalls(parsed.value, registry, logger);
		if (!valid) {
			errors.push("xml-schema-invalid");
			continue;
		}
		toolCalls.push(...calls);
	}

	return { toolCalls, repaired: repairedAny, errors };
}

async function parseToolCallsFromJson(
	text: string,
	timeoutMs: number,
	registry: Map<string, ValidateFunction> | null,
	logger?: ToolCallCodecLogger
): Promise<{ toolCalls: DecodedToolCall[]; repaired: boolean; errors: string[] }> {
	const errors: string[] = [];
	const start = findToolCallsPayloadStartIndex(text);
	if (start === -1) return { toolCalls: [], repaired: false, errors };

	const slice = extractJsonObjectSlice(text, start);
	if (!slice.success || !slice.json) {
		errors.push("json-slice-failed");
		return { toolCalls: [], repaired: false, errors };
	}

	const normalized = preprocessPayload(slice.json, logger);
	const parsed = await parseJsonWithRepair(normalized.text, timeoutMs, logger);
	if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
		errors.push("json-parse-failed");
		return { toolCalls: [], repaired: false, errors };
	}

	const { calls, valid } = validateParsedCalls(parsed.value, registry, logger);
	if (!valid) {
		errors.push("json-schema-invalid");
		return { toolCalls: [], repaired: parsed.repaired, errors };
	}

	return { toolCalls: calls, repaired: parsed.repaired, errors };
}

function extractXmlToolCallPayloads(text: string): string[] {
	const payloads: string[] = [];
	const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
	let match: RegExpExecArray | null = null;
	while ((match = regex.exec(text)) !== null) {
		if (match[1]) payloads.push(match[1]);
	}
	return payloads;
}

function findToolCallsPayloadStartIndex(text: string): number {
	const thinkClose = text.lastIndexOf("</think>");
	const base = thinkClose === -1 ? 0 : thinkClose + "</think>".length;
	const after = text.slice(base);
	const match = after.match(/\{\s*(?:"tool_calls"|'tool_calls'|tool_calls)\s*:/);
	if (!match || match.index === undefined) return -1;
	return base + match.index;
}

function preprocessPayload(payload: string, logger?: ToolCallCodecLogger): { text: string } {
	let text = payload;
	const bidi = stripBidiControls(text);
	if (bidi.removed > 0) {
		logger?.debug?.("[codec] bidi controls removed", { count: bidi.removed });
	}
	text = normalizeUnicode(bidi.text);
	const escaped = escapeNewlinesInStrings(text);
	if (escaped.replaced > 0) {
		logger?.debug?.("[codec] escaped newlines in strings", { count: escaped.replaced });
	}
	text = escaped.text;
	const quoteEscaped = escapeUnescapedQuotesInStrings(text);
	if (quoteEscaped.replaced > 0) {
		logger?.debug?.("[codec] escaped quotes in strings", { count: quoteEscaped.replaced });
	}
	text = quoteEscaped.text;
	return { text };
}

function escapeNewlinesInStrings(payload: string): { text: string; replaced: number } {
	let out = "";
	let inString: "'" | '"' | null = null;
	let escapeNext = false;
	let replaced = 0;

	for (let i = 0; i < payload.length; i++) {
		const char = payload[i];

		if (escapeNext) {
			out += char;
			escapeNext = false;
			continue;
		}

		if (char === "\\") {
			out += char;
			if (inString) escapeNext = true;
			continue;
		}

		if (char === '"' || char === "'") {
			out += char;
			if (inString === char) {
				inString = null;
			} else if (!inString) {
				inString = char as "'" | '"';
			}
			continue;
		}

		if (inString) {
			if (char === "\n") {
				out += "\\n";
				replaced++;
				continue;
			}
			if (char === "\r") {
				out += "\\r";
				replaced++;
				continue;
			}
			if (char === "\u2028") {
				out += "\\u2028";
				replaced++;
				continue;
			}
			if (char === "\u2029") {
				out += "\\u2029";
				replaced++;
				continue;
			}
		}

		out += char;
	}

	return { text: out, replaced };
}

function escapeUnescapedQuotesInStrings(payload: string): { text: string; replaced: number } {
	let out = "";
	let inString: "'" | '"' | null = null;
	let escapeNext = false;
	let replaced = 0;

	const peekNextNonSpace = (start: number): string | null => {
		for (let i = start; i < payload.length; i++) {
			const c = payload[i];
			if (!/\s/.test(c)) return c;
		}
		return null;
	};

	for (let i = 0; i < payload.length; i++) {
		const char = payload[i];

		if (escapeNext) {
			out += char;
			escapeNext = false;
			continue;
		}

		if (char === "\\") {
			out += char;
			if (inString) escapeNext = true;
			continue;
		}

		if (char === '"' || char === "'") {
			if (!inString) {
				inString = char as "'" | '"';
				out += char;
				continue;
			}
			if (inString === char) {
				const next = peekNextNonSpace(i + 1);
				if (next === ":" || next === "," || next === "}" || next === "]" || next === null) {
					inString = null;
					out += char;
					continue;
				}
				out += `\\${char}`;
				replaced++;
				continue;
			}
		}

		out += char;
	}

	return { text: out, replaced };
}

async function parseJsonWithRepair(
	payload: string,
	timeoutMs: number,
	logger?: ToolCallCodecLogger
): Promise<{ ok: boolean; value?: unknown; repaired: boolean }>{
	const parsed = await parseWithTimeout(payload, timeoutMs, JSON5.parse);
	if (parsed.ok) return { ok: true, value: parsed.value, repaired: false };

	const repairResult = repairToolJson(payload);
	if (!repairResult.repaired) {
		logger?.debug?.("[codec] repair rejected", {});
		return { ok: false, repaired: false };
	}

	logger?.debug?.("[codec] repair attempted", {});
	const repairedParsed = await parseWithTimeout(repairResult.json, timeoutMs, JSON5.parse);
	if (repairedParsed.ok) {
		return { ok: true, value: repairedParsed.value, repaired: true };
	}

	return { ok: false, repaired: true };
}

function validateParsedCalls(
	payload: unknown,
	registry: Map<string, ValidateFunction> | null,
	logger?: ToolCallCodecLogger
): { calls: DecodedToolCall[]; valid: boolean } {
	const toolCalls = extractToolCalls(payload);
	if (toolCalls.length === 0) return { calls: [], valid: false };
	if (!registry) return { calls: toolCalls, valid: true };

	for (const call of toolCalls) {
		const validator = registry.get(call.name);
		if (!validator) continue;
		const argsValue = safeParseArguments(call.arguments, logger);
		const valid = validator(argsValue);
		if (!valid) {
			logger?.warn?.("[codec] schema validation failed", {
				tool: call.name,
				errors: formatAjvErrors(validator.errors),
			});
			return { calls: [], valid: false };
		}
	}

	return { calls: toolCalls, valid: true };
}

function safeParseArguments(value: string, logger?: ToolCallCodecLogger): unknown {
	try {
		const parsed = JSON5.parse(value) as unknown;
		return parsed;
	} catch {
		const repair = repairToolJson(value);
		if (!repair.repaired) return value;
		logger?.debug?.("[codec] repair attempted", {});
		try {
			return JSON5.parse(repair.json) as unknown;
		} catch {
			return value;
		}
	}
}

function extractToolCalls(payload: unknown): DecodedToolCall[] {
	if (!payload || typeof payload !== "object") return [];
	const payloadObj = payload as Record<string, unknown>;
	const rawCalls = Array.isArray(payloadObj.tool_calls)
		? (payloadObj.tool_calls as unknown[])
		: payloadObj.name || payloadObj.function
			? [payloadObj]
			: [];
	const calls: DecodedToolCall[] = [];

	for (const rawCall of rawCalls) {
		if (!rawCall || typeof rawCall !== "object") continue;
		const callObj = rawCall as Record<string, unknown>;
		let name: string | undefined;
		let args: unknown = undefined;

		if (callObj.function && typeof callObj.function === "object") {
			const fn = callObj.function as Record<string, unknown>;
			name = typeof fn.name === "string" ? fn.name : undefined;
			args = fn.arguments;
		} else {
			name = typeof callObj.name === "string" ? callObj.name : undefined;
			args = callObj.parameters ?? callObj.arguments;
		}

		if (!name) continue;
		const argsString = typeof args === "string" ? args : JSON.stringify(args ?? {});
		calls.push({ name, arguments: argsString });
	}

	return calls;
}

function formatAjvErrors(errors?: ErrorObject[] | null): string[] {
	if (!errors) return [];
	return errors.map((err) => `${err.instancePath || "root"} ${err.message ?? "invalid"}`);
}
