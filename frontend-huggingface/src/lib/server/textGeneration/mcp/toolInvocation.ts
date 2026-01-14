import { randomUUID, createHash } from "crypto";
import { logger } from "../../logger";
import { existsSync } from "fs";
import { readdir } from "fs/promises";
import { join } from "path";
import type { MessageUpdate, MessageTraceUpdate } from "$lib/types/MessageUpdate";
import {
	MessageToolUpdateType,
	MessageUpdateType,
	MessageTraceUpdateType,
} from "$lib/types/MessageUpdate";
import { ToolResultStatus } from "$lib/types/Tool";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { McpToolMapping } from "$lib/server/mcp/tools";
import type { McpServerConfig } from "$lib/server/mcp/httpClient";
import { callMcpTool, type McpToolTextResponse } from "$lib/server/mcp/httpClient";
import {
	getClientEnhanced,
	releaseClientEnhanced,
	invalidateClientEnhanced,
} from "$lib/server/mcp/clientPoolEnhanced";
import { attachFileRefsToArgs, type FileRefResolver } from "./fileRefs";
import { sanitizeToolArguments } from "./toolArgumentSanitizer";
import { identifyToolMcp } from "./toolFilter";
import { normalizeWithRegistry } from "./toolParameterRegistry";
import {
	getGracefulFailureMessage,
	getQuerySuggestion,
	getProgressMessage,
	getToolIntelligence,
	getFallbackChain,
} from "./toolIntelligenceRegistry";
import type { Client } from "@modelcontextprotocol/sdk/client";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";

// ============================================
// DOCLING TOOL TRACE INTEGRATION
// ============================================

/**
 * Docling tool names that should trigger trace events
 */
const DOCLING_TOOL_NAMES = new Set([
	"docling_convert",
	"docling_ocr",
	"docling-convert",
	"docling-ocr",
]);

/**
 * Check if a tool is a docling document processing tool
 */
function isDoclingTool(toolName: string): boolean {
	const nameLower = toolName.toLowerCase();
	return DOCLING_TOOL_NAMES.has(nameLower) || nameLower.includes("docling");
}

const UPLOADS_DIR = "/app/uploads";

function extractShaCandidate(input: string): string | null {
	if (!input) return null;
	const match = input.match(/[a-f0-9]{32,64}/i);
	return match ? match[0] : null;
}

async function resolveDoclingFilePath(
	requestedPath: string,
	conversationId?: string
): Promise<string> {
	if (requestedPath && existsSync(requestedPath)) return requestedPath;

	const sha = extractShaCandidate(requestedPath);
	if (!sha || !conversationId) return requestedPath;

	const convDir = join(UPLOADS_DIR, conversationId);
	try {
		const entries = await readdir(convDir);
		const prefix = `${sha.slice(0, 8)}_`;
		const match = entries.find((e) => e.startsWith(prefix));
		return match ? join(convDir, match) : requestedPath;
	} catch {
		return requestedPath;
	}
}

/**
 * Bridge docling tool output to the memory system
 * This ensures documents processed via tool calls are stored in memory
 * for visibility in the Memory Panel and future retrieval
 * 
 * Phase 4: Now uses SHA-256 hash for document deduplication
 * - Prevents duplicate storage when same document is processed multiple times
 * - Uses hash-based documentId for consistent identification
 */
async function bridgeDoclingToMemory(
	conversationId: string,
	toolName: string,
	output: string,
	fileName?: string
): Promise<void> {
	if (!output || output.trim().length < 50) {
		logger.debug("[mcp→memory] Skipping bridge - output too short or empty");
		return;
	}

	try {
		const facade = UnifiedMemoryFacade.getInstance();
		if (!facade.isInitialized()) {
			logger.warn("[mcp→memory] Memory system not initialized, skipping bridge");
			return;
		}

		// Phase 4.1.1: Calculate content hash for deduplication
		const contentHash = createHash("sha256").update(output.trim()).digest("hex");
		const shortHash = contentHash.slice(0, 16);

		logger.info(
			{ conversationId, toolName, outputLength: output.length, contentHash: shortHash },
			"[mcp→memory] Bridging docling output to memory system"
		);

		// Phase 4.1.2: Check if document already exists via hash lookup
		// Use MemoryMongoStore directly for document existence check
		try {
			const { Database } = await import("$lib/server/database");
			const { MemoryMongoStore } = await import("$lib/server/memory/stores/MemoryMongoStore");
			
			const db = await Database.getInstance();
			const client = db.getClient();
			const mongoStore = new MemoryMongoStore({ client, dbName: "chat-ui" });
			await mongoStore.initialize();

			const exists = await mongoStore.documentExists(ADMIN_USER_ID, contentHash);
			
			if (exists) {
				// Phase 4.1.3: Skip storage if duplicate
				logger.info(
					{ contentHash: shortHash, fileName, conversationId },
					"[mcp→memory] Document already in memory, skipping duplicate storage"
				);
				return;
			}
		} catch (checkErr) {
			// If existence check fails, proceed with storage (fail-open)
			logger.warn(
				{ err: checkErr, contentHash: shortHash },
				"[mcp→memory] Document existence check failed, proceeding with storage"
			);
		}

		// Phase 4.1.4: Use hash-based documentId instead of timestamp
		const documentId = `docling:${shortHash}`;

		// Chunk with overlap (same as books endpoint)
		const chunkSize = 1000;
		const overlap = 200;
		const chunks: string[] = [];
		const text = output.trim();

		for (let i = 0; i < text.length; i += chunkSize - overlap) {
			const chunk = text.slice(i, i + chunkSize);
			if (chunk.trim().length > 20) {
				chunks.push(chunk);
			}
		}

		logger.info(
			{ conversationId, chunkCount: chunks.length },
			"[mcp→memory] Created chunks from docling output"
		);

		for (let i = 0; i < chunks.length; i++) {
			const res = await facade.store({
				userId: ADMIN_USER_ID,
				tier: "books",
				text: chunks[i],
				metadata: {
					book_id: documentId,
					chunk_index: i,
					title: fileName || `Document from ${toolName}`,
					file_type: "docling_extract",
					source: "docling_tool",
					conversation_id: conversationId,
					tool_name: toolName,
					// Phase 4.1.5: Persist document_hash for deduplication queries
					document_hash: contentHash,
				},
			});
			logger.debug(
				{ chunkIndex: i, memoryId: res.memory_id },
				"[mcp→memory] Stored docling chunk"
			);
		}

		logger.info(
			{ conversationId, chunkCount: chunks.length, documentId },
			"[mcp→memory] Successfully bridged docling output to memory"
		);
	} catch (err) {
		logger.error(
			{ err, conversationId, toolName },
			"[mcp→memory] Failed to bridge docling output to memory"
		);
		// Don't throw - memory storage is enhancement, not critical path
	}
}

/**
 * Get bilingual label for a tool
 * Returns user-friendly labels for known tools
 */
function getToolLabel(toolName: string): { he: string; en: string } {
	const nameLower = toolName.toLowerCase();

	// Docling tools
	if (nameLower.includes("docling_convert") || nameLower.includes("docling-convert")) {
		return { he: "מעבד מסמך", en: "Processing document" };
	}
	if (nameLower.includes("docling_ocr") || nameLower.includes("docling-ocr")) {
		return { he: "מזהה טקסט בתמונה", en: "Performing OCR" };
	}
	if (nameLower.includes("docling")) {
		return { he: "מעבד מסמך", en: "Processing document" };
	}

	// Search tools
	if (
		nameLower.includes("search") ||
		nameLower.includes("tavily") ||
		nameLower.includes("perplexity")
	) {
		return { he: "מחפש מידע", en: "Searching" };
	}

	// File tools
	if (nameLower.includes("read") || nameLower.includes("file")) {
		return { he: "קורא קובץ", en: "Reading file" };
	}

	// Default - use tool name
	return { he: toolName, en: toolName };
}

/**
 * Create a trace run created event for docling tool execution
 */
function createDoclingTraceRunCreated(runId: string, conversationId: string): MessageTraceUpdate {
	return {
		type: MessageUpdateType.Trace,
		subtype: MessageTraceUpdateType.RunCreated,
		runId,
		conversationId,
		timestamp: Date.now(),
	};
}

/**
 * Create a trace step created event for docling tool execution
 */
function createDoclingTraceStepCreated(
	runId: string,
	stepId: string,
	label: { he: string; en: string },
	status: "running" | "done" | "error" = "running"
): MessageTraceUpdate {
	return {
		type: MessageUpdateType.Trace,
		subtype: MessageTraceUpdateType.StepCreated,
		runId,
		step: {
			id: stepId,
			parentId: null,
			label,
			status,
			timestamp: Date.now(),
		},
	};
}

/**
 * Create a trace step status update event
 */
function createDoclingTraceStepStatus(
	runId: string,
	stepId: string,
	status: "running" | "done" | "error"
): MessageTraceUpdate {
	return {
		type: MessageUpdateType.Trace,
		subtype: MessageTraceUpdateType.StepStatus,
		runId,
		stepId,
		status,
		timestamp: Date.now(),
	};
}

/**
 * Create a trace run completed event
 */
function createDoclingTraceRunCompleted(runId: string): MessageTraceUpdate {
	return {
		type: MessageUpdateType.Trace,
		subtype: MessageTraceUpdateType.RunCompleted,
		runId,
		timestamp: Date.now(),
	};
}

export type Primitive = string | number | boolean;

export type ToolRun = {
	name: string;
	parameters: Record<string, Primitive>;
	output: string;
};

export interface NormalizedToolCall {
	id: string;
	name: string;
	arguments: string;
}

export interface ExecuteToolCallsParams {
	calls: NormalizedToolCall[];
	mapping: Record<string, McpToolMapping>;
	servers: McpServerConfig[];
	parseArgs: (raw: unknown) => { value: Record<string, unknown>; error?: string };
	resolveFileRef?: FileRefResolver;
	toPrimitive: (value: unknown) => Primitive | undefined;
	processToolOutput: (text: string) => {
		annotated: string;
		sources: { index: number; link: string }[];
	};
	abortSignal?: AbortSignal;
	toolTimeoutMs?: number;
	/** Conversation ID for trace event emission (used for docling tools) */
	conversationId?: string;
}

export interface ToolCallExecutionResult {
	toolMessages: ChatCompletionMessageParam[];
	toolRuns: ToolRun[];
	finalAnswer?: { text: string; interrupted: boolean };
}

export type ToolExecutionEvent =
	| { type: "update"; update: MessageUpdate }
	| { type: "complete"; summary: ToolCallExecutionResult };

const serverMap = (servers: McpServerConfig[]): Map<string, McpServerConfig> => {
	const map = new Map<string, McpServerConfig>();
	for (const server of servers) {
		if (server?.name) {
			map.set(server.name, server);
		}
	}
	return map;
};

/**
 * Convert raw error to user-friendly graceful message.
 * CRITICAL: Users should NEVER see raw errors, stack traces, or technical details.
 *
 * The message MUST:
 * 1. Explain WHAT happened (which service/action failed)
 * 2. Explain WHY it likely failed (possible reason)
 * 3. Explain WHAT TO DO (actionable next step)
 *
 * Otherwise users will assume the model is broken.
 */
function toGracefulError(toolName: string, rawError: string): string {
	// Get tool intelligence for display name and suggestions
	const toolInfo = getToolIntelligence(toolName);
	const displayName = toolInfo?.displayName || toolName;
	const suggestion = getQuerySuggestion(toolName);

	// Check for common error patterns and provide CONTEXTUAL guidance
	const errorLower = rawError.toLowerCase();

	// ========== TIMEOUT ERRORS ==========
	if (errorLower.includes("timeout") || errorLower.includes("timed out")) {
		if (toolName.includes("research") || toolName.includes("perplexity")) {
			return (
				`⏱️ **המחקר לקח יותר מדי זמן**\n\n` +
				`השירות ${displayName} מבצע חיפוש מעמיק שלפעמים דורש זמן רב.\n\n` +
				`**מה לעשות:**\n` +
				`• נסה שאלה קצרה ופשוטה יותר\n` +
				`• פצל את השאלה לכמה שאלות נפרדות\n` +
				`• ${suggestion}`
			);
		}
		if (toolName.includes("datagov")) {
			return (
				`⏱️ **הגישה למאגרי המידע הממשלתיים ארכה זמן רב**\n\n` +
				`המאגרים הממשלתיים מכילים מיליוני רשומות וחיפוש רחב עלול להיות איטי.\n\n` +
				`**מה לעשות:**\n` +
				`• הוסף מילות מפתח ספציפיות (שם משרד, שנה, אזור)\n` +
				`• ${suggestion}`
			);
		}
		return (
			`⏱️ **הפעולה ארכה זמן רב מדי**\n\n` +
			`${displayName} לא הספיק לסיים את הפעולה בזמן הקצוב.\n\n` +
			`**מה לעשות:**\n` +
			`• נסה שוב עם בקשה פשוטה יותר\n` +
			`• ${suggestion}`
		);
	}

	// ========== CONNECTION ERRORS ==========
	if (errorLower.includes("not connected") || errorLower.includes("connection")) {
		return (
			`🔌 **שירות ${displayName} אינו זמין כרגע**\n\n` +
			`ייתכן שיש תקלה זמנית בשירות או בחיבור לאינטרנט.\n\n` +
			`**מה לעשות:**\n` +
			`• נסה שוב בעוד מספר שניות\n` +
			`• אם הבעיה נמשכת, השתמש בניסוח אחר או שאל שאלה דומה`
		);
	}

	// ========== NOT FOUND / EMPTY RESULTS ==========
	if (
		errorLower.includes("not found") ||
		errorLower.includes("404") ||
		errorLower.includes("no results")
	) {
		if (toolName.includes("datagov")) {
			return (
				`🔍 **לא נמצא מידע במאגרים הממשלתיים**\n\n` +
				`ייתכן שהמידע המבוקש לא קיים במאגרים הרשמיים, או שהניסוח לא מדויק.\n\n` +
				`**מה לעשות:**\n` +
				`• נסה מילות מפתח רשמיות (למשל: "לשכת הסטטיסטיקה" במקום "סטטיסטיקה")\n` +
				`• ציין שם משרד ממשלתי ספציפי\n` +
				`• ${suggestion}`
			);
		}
		return (
			`🔍 **לא נמצאו תוצאות**\n\n` +
			`${displayName} לא מצא מידע התואם לבקשה.\n\n` +
			`**מה לעשות:**\n` +
			`• נסה מילות מפתח שונות\n` +
			`• ${suggestion}`
		);
	}

	// ========== VALIDATION / PARAMETER ERRORS ==========
	if (
		errorLower.includes("invalid") ||
		errorLower.includes("required") ||
		errorLower.includes("missing")
	) {
		if (toolName.includes("file") || toolName.includes("directory")) {
			return (
				`📂 **בעיה בנתיב הקובץ**\n\n` +
				`הנתיב שהוזן אינו תקין או שהקובץ/תיקייה לא נמצאו.\n\n` +
				`**מה לעשות:**\n` +
				`• ודא שהנתיב מדויק (כולל סיומת קובץ אם רלוונטי)\n` +
				`• ${suggestion}`
			);
		}
		if (toolName.includes("fetch") || toolName.includes("extract")) {
			return (
				`🌐 **בעיה בכתובת האינטרנט**\n\n` +
				`הכתובת שהוזנה אינה תקינה או שהאתר לא נגיש.\n\n` +
				`**מה לעשות:**\n` +
				`• ודא שהכתובת מתחילה ב-https://\n` +
				`• בדוק שהכתובת נכתבה נכון\n` +
				`• ${suggestion}`
			);
		}
		return (
			`📝 **חסר מידע לביצוע הפעולה**\n\n` +
			`${displayName} צריך פרטים נוספים כדי לבצע את הבקשה.\n\n` +
			`**מה לעשות:**\n` +
			`• נסח את הבקשה בצורה מפורטת יותר\n` +
			`• ${suggestion}`
		);
	}

	// ========== RATE LIMIT ERRORS ==========
	if (
		errorLower.includes("rate limit") ||
		errorLower.includes("too many") ||
		errorLower.includes("quota")
	) {
		return (
			`⚡ **הגעת למגבלת בקשות**\n\n` +
			`נשלחו יותר מדי בקשות ל-${displayName} בזמן קצר.\n\n` +
			`**מה לעשות:**\n` +
			`• המתן דקה ונסה שוב\n` +
			`• צמצם את מספר הבקשות`
		);
	}

	// ========== AUTH ERRORS ==========
	if (
		errorLower.includes("unauthorized") ||
		errorLower.includes("forbidden") ||
		errorLower.includes("auth")
	) {
		return (
			`🔐 **בעיית הרשאה**\n\n` +
			`אין הרשאה לגשת ל-${displayName}. ייתכן שחסרה הגדרת API Key.\n\n` +
			`**מה לעשות:**\n` +
			`• פנה למנהל המערכת לבדיקת ההגדרות`
		);
	}

	// ========== SERVER ERRORS ==========
	if (
		errorLower.includes("500") ||
		errorLower.includes("server error") ||
		errorLower.includes("internal")
	) {
		return (
			`⚠️ **תקלה בשירות ${displayName}**\n\n` +
			`השירות נתקל בבעיה פנימית.\n\n` +
			`**מה לעשות:**\n` +
			`• נסה שוב בעוד כמה שניות\n` +
			`• אם הבעיה נמשכת, נסה לנסח את השאלה אחרת`
		);
	}

	// ========== DEFAULT - GENERIC BUT HELPFUL ==========
	const gracefulMessage = getGracefulFailureMessage(toolName);
	return (
		`⚠️ **${displayName} נתקל בבעיה**\n\n` +
		`${gracefulMessage}\n\n` +
		`**מה לעשות:**\n` +
		`• ${suggestion}\n` +
		`• נסה לנסח את הבקשה בצורה שונה`
	);
}

/**
 * Normalize and sanitize tool arguments based on the tool type.
 * Uses the universal tool parameter registry for automatic normalization.
 *
 * Flow:
 * 1. Security sanitization (prevent injection attacks)
 * 2. Registry-based normalization (map aliases, coerce types, apply defaults)
 */
function normalizeToolArgs(
	toolName: string,
	args: Record<string, unknown>
): Record<string, unknown> {
	// Step 1: Security sanitization first
	const sanitizationResult = sanitizeToolArguments(toolName, args);
	if (!sanitizationResult.success) {
		logger.warn(
			{ toolName, error: sanitizationResult.error },
			"[mcp] Tool argument sanitization failed"
		);
		throw new Error(`Tool argument sanitization failed: ${sanitizationResult.error}`);
	}

	if (sanitizationResult.warnings && sanitizationResult.warnings.length > 0) {
		logger.debug(
			{ toolName, warnings: sanitizationResult.warnings },
			"[mcp] Tool argument sanitization warnings"
		);
	}

	// Step 2: Registry-based normalization
	// This handles all tool-specific parameter mapping automatically:
	// - Perplexity: query ↔ messages conversion
	// - Tavily: type coercion (days → number, topic → enum)
	// - Filesystem: path aliases (file, filepath, file_path → path)
	// - Git: repo aliases (path, repository, repo → repo_path)
	// - Docker: container aliases (container_id, name, id → container)
	// - And all other registered tools...
	const registryResult = normalizeWithRegistry(toolName, sanitizationResult.sanitized!);

	if (registryResult.warnings.length > 0) {
		logger.warn(
			{ toolName, warnings: registryResult.warnings },
			"[mcp] Registry normalization warnings"
		);
	}

	if (registryResult.appliedMappings.length > 0) {
		logger.debug(
			{ toolName, mappings: registryResult.appliedMappings },
			"[mcp] Applied parameter mappings from registry"
		);
	}

	return registryResult.normalized;
}

/**
 * Normalize a tool name by trying multiple variants.
 * Models often generate underscore names (tavily_search) but MCP tools use hyphens (tavily-search).
 * Returns the first matching key found in the mapping, or the original name if no match.
 */
function normalizeToolName(name: string, mapping: Record<string, McpToolMapping>): string {
	// Direct match
	if (mapping[name]) return name;

	// Try underscore to hyphen
	const hyphenVariant = name.replace(/_/g, "-");
	if (mapping[hyphenVariant]) {
		logger.debug(
			{ original: name, normalized: hyphenVariant },
			"[mcp] normalized tool name (underscore → hyphen)"
		);
		return hyphenVariant;
	}

	// Try hyphen to underscore
	const underscoreVariant = name.replace(/-/g, "_");
	if (mapping[underscoreVariant]) {
		logger.debug(
			{ original: name, normalized: underscoreVariant },
			"[mcp] normalized tool name (hyphen → underscore)"
		);
		return underscoreVariant;
	}

	// Try case-insensitive match
	const lowerName = name.toLowerCase();
	for (const key of Object.keys(mapping)) {
		if (key.toLowerCase() === lowerName) {
			logger.debug(
				{ original: name, normalized: key },
				"[mcp] normalized tool name (case-insensitive)"
			);
			return key;
		}
	}

	// No match found, return original
	return name;
}

/**
 * Cascade Fallback Result
 * Contains either a successful result or the final error after all fallbacks failed
 */
interface CascadeFallbackResult {
	success: boolean;
	output?: string;
	structured?: unknown;
	blocks?: unknown[];
	error?: string;
	/** The tool that actually succeeded (may be different from original if fallback was used) */
	usedTool?: string;
	/** List of tools that were tried and failed */
	failedTools?: string[];
}

/**
 * Check if an error is recoverable (should trigger fallback)
 * Some errors like auth failures should not trigger fallback
 */
function isRecoverableError(error: string): boolean {
	const errorLower = error.toLowerCase();

	// Non-recoverable errors - don't try fallback
	if (errorLower.includes("unauthorized") || errorLower.includes("forbidden")) {
		return false; // Auth issues won't be fixed by fallback
	}
	if (errorLower.includes("invalid") && errorLower.includes("api key")) {
		return false; // API key issues
	}
	if (
		errorLower.includes("file not found") ||
		errorLower.includes("not found on disk") ||
		errorLower.includes("no such file") ||
		errorLower.includes("enoent")
	) {
		return false;
	}

	// Recoverable errors - try fallback
	return true;
}

/**
 * Build progress message for fallback attempts
 */
function buildFallbackProgressMessage(originalTool: string, fallbackTool: string): string {
	const originalInfo = getToolIntelligence(originalTool);
	const fallbackInfo = getToolIntelligence(fallbackTool);

	const originalName = originalInfo?.displayName || originalTool;
	const fallbackName = fallbackInfo?.displayName || fallbackTool;

	return `${originalName} לא זמין כרגע, מנסה עם ${fallbackName}...`;
}

export async function* executeToolCalls({
	calls,
	mapping,
	servers,
	parseArgs,
	resolveFileRef,
	toPrimitive,
	processToolOutput,
	abortSignal,
	toolTimeoutMs = 120_000, // 2 minutes default; httpClient may override for research tools
	conversationId,
}: ExecuteToolCallsParams): AsyncGenerator<ToolExecutionEvent, void, undefined> {
	// Check abort signal at the beginning
	if (abortSignal?.aborted) {
		throw new Error("Tool execution aborted before starting");
	}
	const toolMessages: ChatCompletionMessageParam[] = [];
	const toolRuns: ToolRun[] = [];
	const serverLookup = serverMap(servers);

	// Track trace state for tool calls
	// Each REAL tool call gets its own step in the trace
	let traceRunId: string | null = null;
	const traceStepIds: Map<string, string> = new Map(); // toolCallId -> stepId
	const hasTrackedTools = calls.some((c) => isDoclingTool(c.name)); // Can extend to other tools

	// Pre-emit call + ETA updates and prepare tasks
	type TaskResult = {
		index: number;
		output?: string;
		structured?: unknown;
		blocks?: unknown[];
		error?: string;
		uuid: string;
		paramsClean: Record<string, Primitive>;
	};

	const prepared = calls.map((call) => {
		const parsedArgs = parseArgs(call.arguments);
		const argsObj = normalizeToolArgs(call.name, parsedArgs.value);
		const paramsClean: Record<string, Primitive> = {};
		for (const [k, v] of Object.entries(argsObj ?? {})) {
			const prim = toPrimitive(v);
			if (prim !== undefined) paramsClean[k] = prim;
		}
		// Attach any resolved image payloads _after_ computing paramsClean so that
		// logging / status updates continue to show only the lightweight primitive
		// arguments (e.g. "image_1") while the full data: URLs or image blobs are
		// only sent to the MCP tool server.
		attachFileRefsToArgs(argsObj, resolveFileRef);
		return { call, argsObj, paramsClean, uuid: randomUUID(), parseError: parsedArgs.error };
	});

	for (const p of prepared) {
		yield {
			type: "update",
			update: {
				type: MessageUpdateType.Tool,
				subtype: MessageToolUpdateType.Call,
				uuid: p.uuid,
				call: { name: p.call.name, parameters: p.paramsClean },
			},
		};
		yield {
			type: "update",
			update: {
				type: MessageUpdateType.Tool,
				subtype: MessageToolUpdateType.ETA,
				uuid: p.uuid,
				eta: 10,
			},
		};
	}

	// ============================================
	// EMIT TRACE EVENTS FOR REAL TOOL CALLS
	// One step per actual tool execution - NO fake/simulated steps
	// ============================================
	if (hasTrackedTools && conversationId) {
		traceRunId = randomUUID();

		// Emit run.created
		yield {
			type: "update",
			update: createDoclingTraceRunCreated(traceRunId, conversationId),
		};

		// Emit one step per tracked tool call (running state)
		for (const p of prepared) {
			if (isDoclingTool(p.call.name)) {
				const stepId = `${p.call.name}-${p.uuid}`;
				traceStepIds.set(p.uuid, stepId);

				yield {
					type: "update",
					update: createDoclingTraceStepCreated(
						traceRunId,
						stepId,
						getToolLabel(p.call.name),
						"running"
					),
				};

				logger.debug("[mcp] Emitted trace step for real tool call", {
					runId: traceRunId,
					stepId,
					toolName: p.call.name,
				});
			}
		}
	}

	// Preload clients per distinct server used in this batch
	// Use normalized names to handle underscore/hyphen mismatches
	const distinctServerNames = Array.from(
		new Set(
			prepared
				.map((p) => {
					const normalizedName = normalizeToolName(p.call.name, mapping);
					return mapping[normalizedName]?.server;
				})
				.filter(Boolean) as string[]
		)
	);
	const clientMap = new Map<string, Client>();
	await Promise.all(
		distinctServerNames.map(async (name) => {
			const cfg = serverLookup.get(name);
			if (!cfg) return;
			try {
				const client = await getClientEnhanced(cfg, abortSignal);
				clientMap.set(name, client);
			} catch (e) {
				logger.warn({ server: name, err: String(e) }, "[mcp] failed to connect client");
			}
		})
	);

	// Async queue to stream results in finish order
	function createQueue<T>() {
		const items: T[] = [];
		const waiters: Array<(v: IteratorResult<T>) => void> = [];
		let closed = false;
		return {
			push(item: T) {
				const waiter = waiters.shift();
				if (waiter) waiter({ value: item, done: false });
				else items.push(item);
			},
			close() {
				closed = true;
				let waiter: ((v: IteratorResult<T>) => void) | undefined;
				while ((waiter = waiters.shift())) {
					waiter({ value: undefined as unknown as T, done: true });
				}
			},
			async *iterator() {
				for (;;) {
					if (items.length) {
						const first = items.shift();
						if (first !== undefined) yield first as T;
						continue;
					}
					if (closed) return;
					const value: IteratorResult<T> = await new Promise((res) => waiters.push(res));
					if (value.done) return;
					yield value.value as T;
				}
			},
		};
	}

	const q = createQueue<TaskResult>();

	const tasks = prepared.map(async (p, index) => {
		// Check abort signal before processing each task
		if (abortSignal?.aborted) {
			q.push({
				index,
				error: "Tool execution aborted",
				uuid: p.uuid,
				paramsClean: p.paramsClean,
			});
			return;
		}

		if (p.parseError) {
			// Use graceful error - never expose raw parse errors to users
			q.push({
				index,
				error: toGracefulError(p.call.name, p.parseError),
				uuid: p.uuid,
				paramsClean: p.paramsClean,
			});
			return;
		}

		// Normalize tool name to handle underscore/hyphen mismatches
		const normalizedName = normalizeToolName(p.call.name, mapping);
		const mappingEntry = mapping[normalizedName];
		if (!mappingEntry) {
			// Graceful error handling: identify which MCP the tool belongs to
			const mcpInfo = identifyToolMcp(p.call.name);
			let userFriendlyError: string;

			if (mcpInfo) {
				// Tool pattern recognized but MCP not enabled
				userFriendlyError =
					`The "${mcpInfo.displayName}" MCP server is not enabled. ` +
					`Please enable the "${mcpInfo.mcpName}" MCP in your settings to use the ${p.call.name} tool.`;
				logger.warn(
					{ toolName: p.call.name, mcpName: mcpInfo.mcpName },
					"[mcp] Tool requested but MCP server not enabled"
				);
			} else {
				// Unknown tool pattern
				userFriendlyError =
					`Tool "${p.call.name}" is not available. ` +
					`Please check if the required MCP server is enabled in your settings.`;
				logger.warn({ toolName: p.call.name, normalizedName }, "[mcp] Unknown tool requested");
			}

			q.push({
				index,
				error: userFriendlyError,
				uuid: p.uuid,
				paramsClean: p.paramsClean,
			});
			return;
		}
		const serverCfg = serverLookup.get(mappingEntry.server);
		if (!serverCfg) {
			// Graceful error - never expose internal server config details
			q.push({
				index,
				error: toGracefulError(p.call.name, `Server not available: ${mappingEntry.server}`),
				uuid: p.uuid,
				paramsClean: p.paramsClean,
			});
			return;
		}
		const client = clientMap.get(mappingEntry.server);

		// Helper to execute tool call with retry logic for connection issues
		const executeCall = async (
			currentClient: Client | undefined,
			isRetry = false
		): Promise<void> => {
			if (!currentClient) {
				throw new Error(`No client available for server ${mappingEntry.server}`);
			}

			try {
				if (!isRetry) {
					logger.debug(
						{ server: mappingEntry.server, tool: mappingEntry.tool, parameters: p.paramsClean },
						"[mcp] invoking tool"
					);
				} else {
					logger.warn(
						{ server: mappingEntry.server, tool: mappingEntry.tool },
						"[mcp] retrying tool invocation after connection error"
					);
				}

				if (conversationId && isDoclingTool(p.call.name)) {
					const filePath =
						typeof (p.argsObj as { file_path?: unknown })?.file_path === "string"
							? ((p.argsObj as { file_path: string }).file_path as string)
							: undefined;
					if (filePath) {
						const resolved = await resolveDoclingFilePath(filePath, conversationId);
						if (resolved && resolved !== filePath) {
							(p.argsObj as { file_path: string }).file_path = resolved;
							p.paramsClean.file_path = resolved;
						}
						if (!existsSync((p.argsObj as { file_path: string }).file_path)) {
							throw new Error(
								`Docling file not found on disk: ${(p.argsObj as { file_path: string }).file_path}`
							);
						}
					}
				}

				const toolResponse: McpToolTextResponse = await callMcpTool(
					serverCfg,
					mappingEntry.tool,
					p.argsObj,
					{
						client: currentClient,
						signal: abortSignal,
						timeoutMs: toolTimeoutMs,
					}
				);
				const { annotated } = processToolOutput(toolResponse.text ?? "");
				logger.debug(
					{ server: mappingEntry.server, tool: mappingEntry.tool },
					"[mcp] tool call completed"
				);
				q.push({
					index,
					output: annotated,
					structured: toolResponse.structured,
					blocks: toolResponse.content,
					uuid: p.uuid,
					paramsClean: p.paramsClean,
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);

				// Check for "Not connected" error and retry once if we haven't already
				if (
					!isRetry &&
					(message.includes("Not connected") || message.includes("Connection closed"))
				) {
					logger.warn(
						{ server: mappingEntry.server, tool: mappingEntry.tool, err: message },
						"[mcp] tool call failed with connection error, invalidating client and retrying"
					);

					// Invalidate the bad client
					invalidateClientEnhanced(serverCfg, currentClient);

					// Get a new client
					try {
						const newClient = await getClientEnhanced(serverCfg, abortSignal);
						// Update the map for subsequent calls in this batch (though unlikely to share)
						clientMap.set(mappingEntry.server, newClient);
						// Retry with new client
						await executeCall(newClient, true);
						return;
					} catch (retryErr) {
						// If retry fails, fall through to normal error handling
						logger.error(
							{ server: mappingEntry.server, tool: mappingEntry.tool, err: String(retryErr) },
							"[mcp] retry failed"
						);
					}
				}

				// Log full error details for debugging (internal only)
				logger.error(
					{
						server: mappingEntry.server,
						tool: mappingEntry.tool,
						err: message,
						toolName: p.call.name,
						timestamp: new Date().toISOString(),
					},
					"[mcp] tool call failed with error"
				);

				// ============================================================
				// CASCADE FALLBACK: Try fallback tools before giving up
				// ============================================================
				if (isRecoverableError(message)) {
					const fallbackChain = getFallbackChain(p.call.name);

					if (fallbackChain.length > 0) {
						logger.info(
							{ originalTool: p.call.name, fallbackChain },
							"[mcp] attempting cascade fallback"
						);

						for (const fallbackToolName of fallbackChain) {
							// Check if fallback tool is available in mapping
							const fallbackNormalized = normalizeToolName(fallbackToolName, mapping);
							const fallbackMapping = mapping[fallbackNormalized];

							if (!fallbackMapping) {
								logger.debug(
									{ fallbackTool: fallbackToolName },
									"[mcp] fallback tool not available in mapping, skipping"
								);
								continue;
							}

							// Get server config for fallback
							const fallbackServerCfg = serverLookup.get(fallbackMapping.server);
							if (!fallbackServerCfg) {
								logger.debug(
									{ fallbackTool: fallbackToolName, server: fallbackMapping.server },
									"[mcp] fallback tool server not configured, skipping"
								);
								continue;
							}

							// Get or create client for fallback server
							let fallbackClient = clientMap.get(fallbackMapping.server);
							if (!fallbackClient) {
								try {
									fallbackClient = await getClientEnhanced(fallbackServerCfg, abortSignal);
									clientMap.set(fallbackMapping.server, fallbackClient);
								} catch (clientErr) {
									logger.warn(
										{ fallbackTool: fallbackToolName, err: String(clientErr) },
										"[mcp] failed to get client for fallback tool"
									);
									continue;
								}
							}

							// Log fallback attempt
							logger.info(
								{ originalTool: p.call.name, fallbackTool: fallbackToolName },
								"[mcp] trying fallback tool"
							);

							try {
								// Execute fallback tool with same arguments
								const fallbackResponse = await callMcpTool(
									fallbackServerCfg,
									fallbackMapping.tool,
									p.argsObj,
									{
										client: fallbackClient,
										signal: abortSignal,
										timeoutMs: toolTimeoutMs,
									}
								);

								const { annotated } = processToolOutput(fallbackResponse.text ?? "");

								// SUCCESS! Push result and return
								logger.info(
									{ originalTool: p.call.name, fallbackTool: fallbackToolName },
									"[mcp] fallback tool succeeded"
								);

								q.push({
									index,
									output: annotated,
									structured: fallbackResponse.structured,
									blocks: fallbackResponse.content,
									uuid: p.uuid,
									paramsClean: p.paramsClean,
								});
								return; // Exit - we succeeded with fallback
							} catch (fallbackErr) {
								const fallbackMessage =
									fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
								logger.warn(
									{ fallbackTool: fallbackToolName, err: fallbackMessage },
									"[mcp] fallback tool also failed, trying next"
								);
								// Continue to next fallback
							}
						}

						// All fallbacks failed - log and continue to error
						logger.warn(
							{ originalTool: p.call.name, fallbackChain },
							"[mcp] all fallback tools failed"
						);
					}
				}

				// Push GRACEFUL error to user - never expose raw error messages
				q.push({
					index,
					error: toGracefulError(p.call.name, message),
					uuid: p.uuid,
					paramsClean: p.paramsClean,
				});
			}
		};

		await executeCall(client);
	});

	// kick off and stream as they finish
	Promise.allSettled(tasks).then(() => q.close());

	const results: TaskResult[] = [];
	for await (const r of q.iterator()) {
		// Check abort signal during iteration
		if (abortSignal?.aborted) {
			logger.warn("[mcp] tool execution aborted during result processing");
			break;
		}

		results.push(r);

		// Check if this result is from a tracked tool
		const toolCallId = prepared[r.index].uuid;
		const toolName = prepared[r.index].call.name;
		const isTrackedTool = isDoclingTool(toolName);

		// ============================================
		// EMIT TOOL RESULT FIRST
		// Then trace completion AFTER, so TracePanel completes
		// when the actual output is visible to the user
		// ============================================
		if (r.error) {
			yield {
				type: "update",
				update: {
					type: MessageUpdateType.Tool,
					subtype: MessageToolUpdateType.Error,
					uuid: r.uuid,
					message: r.error,
				},
			};
		} else {
			yield {
				type: "update",
				update: {
					type: MessageUpdateType.Tool,
					subtype: MessageToolUpdateType.Result,
					uuid: r.uuid,
					result: {
						status: ToolResultStatus.Success,
						call: { name: prepared[r.index].call.name, parameters: r.paramsClean },
						outputs: [
							{
								text: r.output ?? "",
								structured: r.structured,
								content: r.blocks,
							} as unknown as Record<string, unknown>,
						],
						display: true,
					},
				},
			};
		}

		// ============================================
		// BRIDGE DOCLING OUTPUT TO MEMORY SYSTEM
		// When a docling tool successfully extracts text, store it
		// in the memory system for visibility in Memory Panel
		// ============================================
		if (isTrackedTool && !r.error && r.output && conversationId) {
			// Fire and forget - don't block tool execution
			bridgeDoclingToMemory(conversationId, toolName, r.output).catch((err) => {
				logger.warn({ err, toolName }, "[mcp] Memory bridge failed (non-blocking)");
			});
		}

		// ============================================
		// EMIT TRACE STEP COMPLETION FOR REAL TOOL CALLS
		// These appear AFTER the result update, so the trace
		// completes when the user can see the actual output
		// ============================================
		if (isTrackedTool && traceRunId) {
			const stepId = traceStepIds.get(toolCallId);
			if (stepId) {
				// Update step status to done or error
				yield {
					type: "update",
					update: createDoclingTraceStepStatus(traceRunId, stepId, r.error ? "error" : "done"),
				};

				logger.debug("[mcp] Emitted trace step completion for real tool", {
					runId: traceRunId,
					stepId,
					toolName,
					success: !r.error,
				});

				// Remove from tracking
				traceStepIds.delete(toolCallId);

				// If all tracked steps are done, complete the run
				if (traceStepIds.size === 0) {
					yield {
						type: "update",
						update: createDoclingTraceRunCompleted(traceRunId),
					};

					logger.debug("[mcp] Emitted trace run completion", {
						runId: traceRunId,
					});

					traceRunId = null;
				}
			}
		}
	}

	// Collate outputs in original call order
	results.sort((a, b) => a.index - b.index);

	// Check for critical errors that should abort the entire flow
	const criticalErrors = results.filter((r) => r.error);
	if (criticalErrors.length > 0 && criticalErrors.length === results.length) {
		// All tool calls failed - this is a critical failure
		const errorSummary = criticalErrors.map((r) => ({
			toolName: prepared[r.index].call.name,
			error: r.error,
		}));

		logger.error(
			{ errorCount: criticalErrors.length, errorSummary },
			"[mcp] all tool calls failed - critical error"
		);

		// Throw error to abort the MCP flow
		throw new Error(`All tool calls failed: ${JSON.stringify(errorSummary)}`);
	}

	for (const r of results) {
		const name = prepared[r.index].call.name;
		const id = prepared[r.index].call.id;
		if (!r.error) {
			const output = r.output ?? "";
			toolRuns.push({ name, parameters: r.paramsClean, output });
			// For the LLM follow-up call, we keep only the textual output
			toolMessages.push({ role: "tool", tool_call_id: id, content: output });
		} else {
			// Log individual tool failures but continue with successful ones
			logger.warn(
				{ toolName: name, error: r.error },
				"[mcp] individual tool call failed but continuing with successful tools"
			);
		}
	}

	yield { type: "complete", summary: { toolMessages, toolRuns } };

	// Release clients back to the pool
	const clientEntries = Array.from(clientMap.entries());
	for (const [serverName, client] of clientEntries) {
		const serverConfig = serverLookup.get(serverName);
		if (serverConfig) {
			releaseClientEnhanced(serverConfig, client);
		}
	}
}
